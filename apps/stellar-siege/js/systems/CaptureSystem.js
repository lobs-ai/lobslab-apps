/**
 * CaptureSystem — resolves node ownership changes when energy drops below 0.
 *
 * SwarmSystem subtracts energy from enemy nodes as motes arrive.
 * When a node's energy goes negative this system captures it for the
 * attacker and sets the starting energy to the overflow amount.
 */
export class CaptureSystem {
  update(world, dt) {
    for (const node of world.nodes) {
      if (node.energy >= 0) continue;

      // Find which swarm is attacking this node
      const attackingSwarm = this._findAttacker(world, node);

      if (attackingSwarm) {
        const overflow = Math.abs(node.energy);
        const newOwner = attackingSwarm.owner;

        // Capture!
        node.owner    = newOwner;
        node.energy   = Math.min(overflow, node.maxEnergy * 0.1); // small starting energy
        node.upgrade  = null;        // upgrades lost on capture
        node.captureFlash = 1.0;    // trigger capture flash animation
      } else {
        // No attacker found — clamp to 0 (edge case)
        node.energy = 0;
      }
    }
  }

  /**
   * Find the active hostile swarm that has the most motes still heading for
   * this node. Falls back to any swarm targeting the node.
   *
   * @param {import('../game/World.js').World} world
   * @param {import('../game/Node.js').Node}   node
   * @returns {import('../game/Swarm.js').Swarm|null}
   */
  _findAttacker(world, node) {
    let best = null;
    let bestAlive = -1;

    for (const swarm of world.swarms) {
      if (!swarm.alive) continue;
      if (swarm.target.type !== 'node' || swarm.target.nodeId !== node.id) continue;
      if (swarm.owner === node.owner) continue; // friendly — not an attacker

      const aliveCount = swarm.motes.filter(m => m.alive).length;
      if (aliveCount > bestAlive) {
        bestAlive = aliveCount;
        best = swarm;
      }
    }

    // Fallback: any swarm targeting this node (even if all motes just delivered)
    if (!best) {
      for (const swarm of world.swarms) {
        if (swarm.target.type !== 'node' || swarm.target.nodeId !== node.id) continue;
        if (swarm.owner === node.owner) continue;
        best = swarm;
        break;
      }
    }

    return best;
  }
}
