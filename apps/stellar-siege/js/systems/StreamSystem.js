import { STREAM_SPEED } from '../utils/constants.js';
import { getEffectiveDefense } from '../game/Node.js';

/**
 * StreamSystem — moves stream heads, delivers energy, resolves combat.
 *
 * Energy delivery model:
 *   - Stream head travels from source to target at STREAM_SPEED px/s.
 *   - Once arrived, energy is delivered at a fixed rate (drain rate).
 *   - Friendly delivery: add to node energy (capped at maxEnergy).
 *   - Enemy/neutral delivery: subtract (divided by node defense).
 *   - When all energy delivered, stream dies.
 */

// Energy delivery rate — units per second once stream arrives
const DELIVERY_RATE = 30;

export class StreamSystem {
  update(world, dt) {
    for (const stream of world.streams) {
      if (!stream.alive) continue;

      const target = world.getNodeById(stream.targetId);
      if (!target) {
        stream.alive = false;
        continue;
      }

      if (!stream.arrived) {
        // Move head toward target
        const dx = target.position.x - stream.headX;
        const dy = target.position.y - stream.headY;
        const d = Math.sqrt(dx * dx + dy * dy);
        const step = STREAM_SPEED * dt;

        if (step >= d) {
          // Arrived this tick
          stream.headX = target.position.x;
          stream.headY = target.position.y;
          stream.arrived = true;
        } else {
          stream.headX += (dx / d) * step;
          stream.headY += (dy / d) * step;
        }
      } else {
        // Deliver energy to target
        const remaining = stream.totalEnergy - stream.deliveredEnergy;
        const chunk = Math.min(DELIVERY_RATE * dt, remaining);

        stream.deliveredEnergy += chunk;

        if (stream.owner === target.owner) {
          // Friendly: reinforce
          target.energy = Math.min(target.energy + chunk, target.maxEnergy);
        } else {
          // Hostile: damage divided by defense
          const defense = getEffectiveDefense(target);
          target.energy -= chunk / defense;
          // Flag for capture check (handled by CaptureSystem)
        }

        if (stream.deliveredEnergy >= stream.totalEnergy) {
          stream.alive = false;
        }
      }
    }

    // Remove dead streams
    world.streams = world.streams.filter(s => s.alive);
  }
}
