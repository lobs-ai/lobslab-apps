import { getEffectiveDefense } from '../game/Node.js';
import { random } from '../utils/rng.js';

/**
 * SwarmSystem — moves mote clouds, handles idle/hold behavior at positions,
 * delivers energy at node targets, resolves mid-air combat.
 *
 * Swarm targets can be:
 *   { type: 'node',     nodeId }   — motes steer to node, deliver energy on contact
 *   { type: 'position', x, y  }   — motes steer to point, then idle/orbit there
 */

const MOTE_STEER_FORCE = 120;   // steering toward target (px/s²) — lowered for slower feel
const COHESION_FORCE   = 12;    // pull toward swarm center of mass
const MOTE_MAX_SPEED   = 55;    // px/s — roughly half the old speed
const MOTE_JITTER      = 12;    // organic wobble
const COMBAT_RADIUS    = 12;    // motes within this distance fight
const CENTER_SKIP_DIST = 80;    // skip combat check if swarm centers are farther apart
const IDLE_RADIUS      = 20;    // when within this dist of a position target, start idling
const IDLE_ORBIT_FORCE = 30;    // gentle tangential force when idling
const IDLE_MAX_SPEED   = 20;    // slow drift when holding position
const IDLE_SEPARATION  = 8;     // motes spread out when idle

export class SwarmSystem {
  update(world, dt) {
    for (const swarm of world.swarms) {
      if (!swarm.alive) continue;

      // Resolve target coordinates
      const tgt = this._resolveTarget(swarm, world);
      if (!tgt) { swarm.alive = false; continue; }

      const { tx, ty, node: targetNode, isPosition } = tgt;

      // Compute center of mass
      let cx = 0, cy = 0, aliveCount = 0;
      for (const m of swarm.motes) {
        if (!m.alive) continue;
        cx += m.x; cy += m.y; aliveCount++;
      }
      if (aliveCount === 0) { swarm.alive = false; continue; }
      cx /= aliveCount;
      cy /= aliveCount;

      for (const mote of swarm.motes) {
        if (!mote.alive) continue;

        const dx = tx - mote.x;
        const dy = ty - mote.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Check if mote is near the target
        const arrivalDist = targetNode ? targetNode.radius + 3 : IDLE_RADIUS;
        const isNear = dist < arrivalDist;

        if (targetNode && isNear) {
          // Node target: deliver energy and die
          mote.alive = false;
          if (swarm.owner === targetNode.owner) {
            targetNode.energy = Math.min(targetNode.energy + 1, targetNode.maxEnergy);
          } else {
            const defense = getEffectiveDefense(targetNode);
            targetNode.energy -= 1 / defense;
          }
          continue;
        }

        if (isPosition && isNear) {
          // Position target: idle — orbit gently around the hold point
          this._applyIdleBehavior(mote, tx, ty, cx, cy, aliveCount, dt);
        } else {
          // Still traveling — steer toward target
          if (dist > 0.1) {
            mote.vx += (dx / dist) * MOTE_STEER_FORCE * dt;
            mote.vy += (dy / dist) * MOTE_STEER_FORCE * dt;
          }

          // Cohesion toward swarm center
          mote.vx += (cx - mote.x) * COHESION_FORCE * dt / Math.max(aliveCount, 1);
          mote.vy += (cy - mote.y) * COHESION_FORCE * dt / Math.max(aliveCount, 1);

          // Organic jitter (seeded for determinism)
          mote.vx += (random() - 0.5) * MOTE_JITTER * dt * 60;
          mote.vy += (random() - 0.5) * MOTE_JITTER * dt * 60;

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

    // Mid-air combat
    this._resolveCombat(world);

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
  _applyIdleBehavior(mote, tx, ty, cx, cy, aliveCount, dt) {
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

    // Organic jitter (less than traveling, seeded for determinism)
    mote.vx += (random() - 0.5) * 6 * dt * 60;
    mote.vy += (random() - 0.5) * 6 * dt * 60;

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
