import { getEffectiveProduction } from '../game/Node.js';
import { SOLAR_STORM_MULTIPLIER } from '../utils/constants.js';

/**
 * ProductionSystem — generates energy on owned nodes each tick.
 */
export class ProductionSystem {
  update(world, dt) {
    const hasSolarStorm = world.events.some(e => e.type === 'solar_storm' && e.active);

    for (const node of world.nodes) {
      // Only owned nodes produce energy
      if (node.owner === null) continue;

      let rate = getEffectiveProduction(node);

      if (hasSolarStorm) {
        rate *= SOLAR_STORM_MULTIPLIER;
      }

      node.energy = Math.min(node.energy + rate * dt, node.maxEnergy);

      // Tick down capture flash animation
      if (node.captureFlash > 0) {
        node.captureFlash = Math.max(0, node.captureFlash - dt * 2);
      }

      // Advance pulse phase for animation
      node.pulsePhase += dt * 1.5;
    }
  }
}
