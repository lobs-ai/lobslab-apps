import { getEffectiveDefense } from '../game/Node.js';

/**
 * SwarmSystem — moves mote clouds, delivers energy on arrival, resolves
 * mid-air combat between opposing swarms.
 *
 * Each mote steers toward the swarm's target node using simple flocking:
 *   - Seek target (main steering force)
 *   - Cohesion toward swarm center of mass
 *   - Random jitter for organic, microorganism-like movement
 *   - Speed clamped to MOTE_MAX_SPEED
 *
 * When a mote reaches the target node it delivers 1 unit of energy and dies.
 * When two opposing motes come within COMBAT_RADIUS they annihilate 1:1.
 */

const MOTE_STEER_FORCE = 200;   // steering acceleration toward target (px/s²)
const COHESION_FORCE   = 15;    // pull toward swarm center of mass
const MOTE_MAX_SPEED   = 110;   // px/s
const MOTE_JITTER      = 15;    // random wobble force for organic look (scaled by dt*60)
const COMBAT_RADIUS    = 12;    // motes within this distance fight
const CENTER_SKIP_DIST = 80;    // skip detailed combat if swarm centers are farther apart

export class SwarmSystem {
  update(world, dt) {
    // 1. Move all motes and deliver energy on arrival
    for (const swarm of world.swarms) {
      if (!swarm.alive) continue;

      const target = world.getNodeById(swarm.targetId);
      if (!target) { swarm.alive = false; continue; }

      const tx = target.position.x;
      const ty = target.position.y;

      // Compute swarm center of mass (for cohesion)
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

        // --- Seek target ---
        let dx = tx - mote.x;
        let dy = ty - mote.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0.1) {
          mote.vx += (dx / dist) * MOTE_STEER_FORCE * dt;
          mote.vy += (dy / dist) * MOTE_STEER_FORCE * dt;
        }

        // --- Cohesion toward swarm center ---
        mote.vx += (cx - mote.x) * COHESION_FORCE * dt / Math.max(aliveCount, 1);
        mote.vy += (cy - mote.y) * COHESION_FORCE * dt / Math.max(aliveCount, 1);

        // --- Random jitter (organic movement) ---
        mote.vx += (Math.random() - 0.5) * MOTE_JITTER * dt * 60;
        mote.vy += (Math.random() - 0.5) * MOTE_JITTER * dt * 60;

        // --- Clamp speed ---
        const speed = Math.sqrt(mote.vx * mote.vx + mote.vy * mote.vy);
        if (speed > MOTE_MAX_SPEED) {
          mote.vx = (mote.vx / speed) * MOTE_MAX_SPEED;
          mote.vy = (mote.vy / speed) * MOTE_MAX_SPEED;
        }

        // --- Integrate position ---
        mote.x += mote.vx * dt;
        mote.y += mote.vy * dt;

        // --- Check arrival ---
        const distToTarget = Math.sqrt((mote.x - tx) ** 2 + (mote.y - ty) ** 2);
        if (distToTarget < target.radius + 3) {
          mote.alive = false;

          if (swarm.owner === target.owner) {
            // Friendly reinforcement
            target.energy = Math.min(target.energy + 1, target.maxEnergy);
          } else {
            // Hostile: damage reduced by node defense
            const defense = getEffectiveDefense(target);
            target.energy -= 1 / defense;
          }
        }
      }
    }

    // 2. Mid-air combat between opposing swarms
    this._resolveCombat(world);

    // 3. Remove dead / empty swarms
    world.swarms = world.swarms.filter(s => {
      if (!s.alive) return false;
      return s.motes.some(m => m.alive);
    });
  }

  _resolveCombat(world) {
    for (let i = 0; i < world.swarms.length; i++) {
      const a = world.swarms[i];
      if (!a.alive) continue;

      for (let j = i + 1; j < world.swarms.length; j++) {
        const b = world.swarms[j];
        if (!b.alive) continue;
        if (a.owner === b.owner) continue; // same team — no fighting

        // Quick center-of-mass distance check to skip far-apart swarms
        let axc = 0, ayc = 0, ac = 0;
        for (const m of a.motes) { if (m.alive) { axc += m.x; ayc += m.y; ac++; } }
        let bxc = 0, byc = 0, bc = 0;
        for (const m of b.motes) { if (m.alive) { bxc += m.x; byc += m.y; bc++; } }
        if (ac === 0 || bc === 0) continue;
        axc /= ac; ayc /= ac;
        bxc /= bc; byc /= bc;

        const centerDist = Math.sqrt((axc - bxc) ** 2 + (ayc - byc) ** 2);
        if (centerDist > CENTER_SKIP_DIST) continue;

        // Detailed mote-vs-mote annihilation
        for (const ma of a.motes) {
          if (!ma.alive) continue;
          for (const mb of b.motes) {
            if (!mb.alive) continue;
            const d2 = (ma.x - mb.x) ** 2 + (ma.y - mb.y) ** 2;
            if (d2 < COMBAT_RADIUS * COMBAT_RADIUS) {
              ma.alive = false;
              mb.alive = false;
              // Emit a combat flash event for the renderer
              world.events.push({
                type: 'mote_combat',
                x: (ma.x + mb.x) / 2,
                y: (ma.y + mb.y) / 2,
                time: world.time,
              });
              break; // ma is dead — move on to next mote in a
            }
          }
        }
      }
    }
  }
}
