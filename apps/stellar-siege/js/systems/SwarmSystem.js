import { getEffectiveDefense } from '../game/Node.js';

/**
 * SwarmSystem — moves mote clouds, handles idle/hold behavior at positions,
 * delivers energy at node targets, resolves mid-air combat.
 *
 * Swarm targets can be:
 *   { type: 'node',     nodeId }   — motes steer to node, deliver energy on contact
 *   { type: 'position', x, y  }   — motes steer to point, then idle/orbit there
 */

const MOTE_STEER_FORCE  = 120;  // steering toward target (px/s²)
const MOTE_MAX_SPEED    = 95;   // px/s
const MOTE_JITTER       = 16;   // per-mote turbulence amplitude
const ALIGN_FORCE       = 5;    // steer toward swarm average velocity
const SEPARATION_RADIUS = 13;   // motes push apart within this distance
const SEPARATION_FORCE  = 70;   // separation strength
const BOUNDARY_RADIUS   = 28;   // motes roam freely within this radius of swarm center
const BOUNDARY_SPRING   = 9;    // spring constant (px/s² per px outside boundary)
const COMBAT_RADIUS    = 14;    // motes within this distance fight
const CENTER_SKIP_DIST = 150;   // skip combat check if swarm centers are farther apart
const IDLE_RADIUS      = 20;    // when within this dist of a position target, start idling
const IDLE_ORBIT_FORCE = 30;    // gentle tangential force when idling
const IDLE_MAX_SPEED   = 20;    // slow drift when holding position
const IDLE_SEPARATION  = 8;     // motes spread out when idle

export class SwarmSystem {
  /**
   * @param {boolean} visualOnly — if true, motes move and die on arrival but
   *   don't modify node energy/ownership. Used in multiplayer where the server
   *   is the sole authority on game state.
   */
  update(world, dt, visualOnly = false) {
    for (const swarm of world.swarms) {
      if (!swarm.alive) continue;

      // Resolve target coordinates
      const tgt = this._resolveTarget(swarm, world);
      if (!tgt) { swarm.alive = false; continue; }

      const { tx, ty, node: targetNode, isPosition } = tgt;

      // Compute center of mass and average velocity for alignment
      let cx = 0, cy = 0, avgVx = 0, avgVy = 0, aliveCount = 0;
      for (const m of swarm.motes) {
        if (!m.alive) continue;
        cx += m.x; cy += m.y;
        avgVx += m.vx; avgVy += m.vy;
        aliveCount++;
      }
      if (aliveCount === 0) { swarm.alive = false; continue; }
      cx /= aliveCount;
      cy /= aliveCount;
      avgVx /= aliveCount;
      avgVy /= aliveCount;

      // Separation pass — push apart motes that are too close
      this._applyMoteSeparation(swarm, dt);

      for (const mote of swarm.motes) {
        if (!mote.alive) continue;

        const dx = tx - mote.x;
        const dy = ty - mote.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Check if mote is near the target
        const arrivalDist = targetNode ? targetNode.radius + 3 : IDLE_RADIUS;
        const isNear = dist < arrivalDist;

        if (targetNode && isNear) {
          // Node target: mote arrives — check for wormhole transit
          if (targetNode.type === 'wormhole') {
            // Wormhole transit — find paired wormhole and teleport
            const paired = world.nodes.find(
              n => n.type === 'wormhole' && n.pairId === targetNode.pairId && n.id !== targetNode.id
            );
            if (paired) {
              // Transit the fleet together. Moving only the first arrival changes
              // the swarm target and strands the rest on the wrong side of the map.
              for (const traveler of swarm.motes) {
                if (!traveler.alive) continue;
                const angle = traveler.phase * Math.PI * 2;
                const radius = paired.radius * (0.15 + traveler.phase * 0.35);
                traveler.x = paired.position.x + Math.cos(angle) * radius;
                traveler.y = paired.position.y + Math.sin(angle) * radius;
                traveler.vx *= 0.2;
                traveler.vy *= 0.2;
              }
              swarm.target = { type: 'position', x: paired.position.x, y: paired.position.y };
              world.events.push({
                type: 'wormhole_transit', x: paired.position.x, y: paired.position.y,
                pairColor: paired.pairColor || '#cc44ff', time: world.time,
              });
              break;
            } else {
              // No paired wormhole found — destroy mote
              mote.alive = false;
              continue;
            }
          }

          // Normal node arrival
          mote.alive = false;
          if (!visualOnly) {
            // Only modify energy when running authoritatively (server / solo)
            if (swarm.owner === targetNode.owner) {
              targetNode.energy = Math.min(targetNode.energy + 1, targetNode.maxEnergy);
            } else {
              const defense = getEffectiveDefense(targetNode);
              targetNode.energy -= 1 / defense;
              // Resolve the actual arriving attack before removing its last mote.
              if (targetNode.energy < 0) {
                targetNode.owner = swarm.owner;
                targetNode.energy = Math.min(-targetNode.energy, targetNode.maxEnergy * 0.1);
                targetNode.upgrade = null;
                targetNode.captureFlash = 1;
              }
            }
          }
          continue;
        }

        if (isPosition && isNear) {
          // Position target: idle — orbit gently around the hold point
          this._applyIdleBehavior(mote, tx, ty, cx, cy, aliveCount, dt, world);
        } else {
          // Still traveling — steer toward target
          if (dist > 0.1) {
            mote.vx += (dx / dist) * MOTE_STEER_FORCE * dt;
            mote.vy += (dy / dist) * MOTE_STEER_FORCE * dt;
          }

          // Alignment — nudge toward swarm average velocity so they move together
          mote.vx += (avgVx - mote.vx) * ALIGN_FORCE * dt;
          mote.vy += (avgVy - mote.vy) * ALIGN_FORCE * dt;

          // Boundary spring — no force inside radius, gentle pull if too far
          const toCX = cx - mote.x, toCY = cy - mote.y;
          const toCenter = Math.hypot(toCX, toCY);
          if (toCenter > BOUNDARY_RADIUS) {
            const overshoot = toCenter - BOUNDARY_RADIUS;
            mote.vx += (toCX / toCenter) * BOUNDARY_SPRING * overshoot * dt;
            mote.vy += (toCY / toCenter) * BOUNDARY_SPRING * overshoot * dt;
          }

          // Per-mote turbulence — unique frequency per mote via phase
          const freq = 1.5 + mote.phase * 5.5;
          const jx = world.time * freq       + mote.phase * 83.7;
          const jy = world.time * (freq * 1.37) + mote.phase * 61.2;
          mote.vx += Math.sin(jx) * MOTE_JITTER * dt;
          mote.vy += Math.cos(jy) * MOTE_JITTER * dt;

          // Clamp speed
          const speed = Math.sqrt(mote.vx * mote.vx + mote.vy * mote.vy);
          if (speed > MOTE_MAX_SPEED) {
            mote.vx = (mote.vx / speed) * MOTE_MAX_SPEED;
            mote.vy = (mote.vy / speed) * MOTE_MAX_SPEED;
          }
        }

        // Integrate position
        mote.x += mote.vx * dt;
        mote.y += mote.vy * dt;
      }
    }

    // Mid-air combat (skip in visualOnly — server handles it)
    if (!visualOnly) this._resolveCombat(world);

    // Remove dead/empty swarms
    world.swarms = world.swarms.filter(s => {
      if (!s.alive) return false;
      return s.motes.some(m => m.alive);
    });
  }

  /**
   * Resolve a swarm's target into concrete coordinates.
   * Returns { tx, ty, node: Node|null, isPosition: bool } or null if invalid.
   */
  _resolveTarget(swarm, world) {
    const t = swarm.target;
    if (t.type === 'node') {
      const node = world.getNodeById(t.nodeId);
      if (!node) return null;
      return { tx: node.position.x, ty: node.position.y, node, isPosition: false };
    }
    if (t.type === 'position') {
      return { tx: t.x, ty: t.y, node: null, isPosition: true };
    }
    return null;
  }

  /**
   * Idle behavior — motes mill around the hold point with gentle orbiting.
   */
  _applyIdleBehavior(mote, tx, ty, cx, cy, aliveCount, dt, world) {
    const dx = tx - mote.x;
    const dy = ty - mote.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Gentle pull toward hold point
    if (dist > 2) {
      mote.vx += (dx / dist) * 15 * dt;
      mote.vy += (dy / dist) * 15 * dt;
    }

    // Tangential orbit force (perpendicular to direction to center)
    if (dist > 3) {
      const nx = -dy / dist;
      const ny =  dx / dist;
      mote.vx += nx * IDLE_ORBIT_FORCE * dt;
      mote.vy += ny * IDLE_ORBIT_FORCE * dt;
    }

    // Separation from siblings — spread out when idle
    // (simplified: push away from swarm center if too close)
    const toCenterDist = Math.sqrt((cx - mote.x) ** 2 + (cy - mote.y) ** 2);
    if (toCenterDist < IDLE_SEPARATION && toCenterDist > 0.1) {
      const pushX = (mote.x - cx) / toCenterDist;
      const pushY = (mote.y - cy) / toCenterDist;
      mote.vx += pushX * 20 * dt;
      mote.vy += pushY * 20 * dt;
    }

    // Per-mote turbulence at reduced strength (idle mode)
    const freq = 1.2 + mote.phase * 3.8;
    const jx = world.time * freq + mote.phase * 83.7;
    const jy = world.time * (freq * 1.37) + mote.phase * 61.2;
    mote.vx += Math.sin(jx) * 3 * dt;
    mote.vy += Math.cos(jy) * 3 * dt;

    // Dampen velocity so they don't fly away
    mote.vx *= (1 - 2.0 * dt);
    mote.vy *= (1 - 2.0 * dt);

    // Clamp to idle speed
    const speed = Math.sqrt(mote.vx * mote.vx + mote.vy * mote.vy);
    if (speed > IDLE_MAX_SPEED) {
      mote.vx = (mote.vx / speed) * IDLE_MAX_SPEED;
      mote.vy = (mote.vy / speed) * IDLE_MAX_SPEED;
    }
  }

  _applyMoteSeparation(swarm, dt) {
    const motes = swarm.motes;
    for (let i = 0; i < motes.length; i++) {
      const a = motes[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < motes.length; j++) {
        const b = motes[j];
        if (!b.alive) continue;
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 0.01 || d2 > SEPARATION_RADIUS * SEPARATION_RADIUS) continue;
        const d = Math.sqrt(d2);
        const push = SEPARATION_FORCE * (1 - d / SEPARATION_RADIUS) * dt;
        const nx = dx / d, ny = dy / d;
        a.vx += nx * push; a.vy += ny * push;
        b.vx -= nx * push; b.vy -= ny * push;
      }
    }
  }

  _resolveCombat(world) {
    for (let i = 0; i < world.swarms.length; i++) {
      const a = world.swarms[i];
      if (!a.alive) continue;

      for (let j = i + 1; j < world.swarms.length; j++) {
        const b = world.swarms[j];
        if (!b.alive) continue;
        if (a.owner === b.owner) continue;

        // Quick center-of-mass distance check
        let axc = 0, ayc = 0, ac = 0;
        for (const m of a.motes) { if (m.alive) { axc += m.x; ayc += m.y; ac++; } }
        let bxc = 0, byc = 0, bc = 0;
        for (const m of b.motes) { if (m.alive) { bxc += m.x; byc += m.y; bc++; } }
        if (ac === 0 || bc === 0) continue;
        axc /= ac; ayc /= ac;
        bxc /= bc; byc /= bc;

        if (Math.sqrt((axc - bxc) ** 2 + (ayc - byc) ** 2) > CENTER_SKIP_DIST) continue;

        // Mote-vs-mote annihilation
        for (const ma of a.motes) {
          if (!ma.alive) continue;
          for (const mb of b.motes) {
            if (!mb.alive) continue;
            const d2 = (ma.x - mb.x) ** 2 + (ma.y - mb.y) ** 2;
            if (d2 < COMBAT_RADIUS * COMBAT_RADIUS) {
              ma.alive = false;
              mb.alive = false;
              world.events.push({
                type: 'mote_combat',
                x: (ma.x + mb.x) / 2,
                y: (ma.y + mb.y) / 2,
                time: world.time,
              });
              break;
            }
          }
        }
      }
    }
  }
}
