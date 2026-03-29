/**
 * CaptureSystem — resolves node ownership changes when energy drops below 0.
 *
 * StreamSystem subtracts energy from enemy nodes during delivery.
 * When a node's energy goes negative, this system captures it for the
 * stream's owner and sets the node energy to the overflow amount.
 */
export class CaptureSystem {
  update(world, dt) {
    for (const node of world.nodes) {
      if (node.energy >= 0) continue;

      // Find which stream is attacking this node (most recent hostile stream)
      // We use the last attacker recorded during stream delivery.
      // If we can't find one, just clamp to 0 (shouldn't happen in normal play).
      const attackingStream = this._findAttacker(world, node);

      if (attackingStream) {
        const overflow = Math.abs(node.energy);
        const newOwner = attackingStream.owner;

        // Capture!
        node.owner = newOwner;
        node.energy = Math.min(overflow, node.maxEnergy * 0.1); // small starting energy
        node.upgrade = null;         // upgrades are lost on capture
        node.captureFlash = 1.0;    // trigger capture flash animation
      } else {
        // No attacker found — just reset to 0 (edge case)
        node.energy = 0;
      }
    }
  }

  /**
   * Find an active hostile stream targeting this node.
   * Returns the most energetic active attacker stream.
   */
  _findAttacker(world, node) {
    let best = null;
    let bestEnergy = -1;

    for (const stream of world.streams) {
      if (!stream.alive) continue;
      if (stream.targetId !== node.id) continue;
      if (stream.owner === node.owner) continue; // friendly, not attacker

      const energy = stream.totalEnergy - stream.deliveredEnergy;
      if (energy > bestEnergy) {
        bestEnergy = energy;
        best = stream;
      }
    }

    // Also check arrived streams (that just finished delivering)
    // by looking for any stream that was targeting this node
    if (!best) {
      for (const stream of world.streams) {
        if (stream.targetId !== node.id) continue;
        if (stream.owner === node.owner) continue;
        best = stream;
        break;
      }
    }

    return best;
  }
}
