/**
 * World — container for all game entities.
 */
export class World {
  constructor() {
    this.nodes   = [];
    this.swarms  = [];
    this.players = [];
    this.events  = [];       // active environmental/visual events
    this.time    = 0;        // elapsed game time in seconds
    this.width   = 0;
    this.height  = 0;
  }

  getNodeById(id) {
    return this.nodes.find(n => n.id === id) ?? null;
  }

  getNodesByOwner(ownerId) {
    return this.nodes.filter(n => n.owner === ownerId);
  }

  getNodeAt(x, y) {
    // Find the closest node within its hit radius
    for (const node of this.nodes) {
      const dx = x - node.position.x;
      const dy = y - node.position.y;
      if (dx * dx + dy * dy <= (node.radius + 8) * (node.radius + 8)) {
        return node;
      }
    }
    return null;
  }

  /**
   * Find the closest player-owned swarm whose center of mass is within
   * maxDist pixels of the given point. Used for the redirect gesture.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} ownerId   - only match swarms owned by this player
   * @param {number} [maxDist=30]
   * @returns {Swarm|null}
   */
  getSwarmAt(x, y, ownerId, maxDist = 30) {
    let closest = null;
    let closestDist = maxDist;

    for (const swarm of this.swarms) {
      if (!swarm.alive) continue;
      if (swarm.owner !== ownerId) continue;

      // Compute center of mass of alive motes
      let cx = 0, cy = 0, count = 0;
      for (const m of swarm.motes) {
        if (!m.alive) continue;
        cx += m.x; cy += m.y; count++;
      }
      if (count === 0) continue;
      cx /= count; cy /= count;

      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (d < closestDist) {
        closestDist = d;
        closest = swarm;
      }
    }
    return closest;
  }

  addSwarm(swarm) {
    this.swarms.push(swarm);
  }

  removeSwarm(id) {
    const idx = this.swarms.findIndex(s => s.id === id);
    if (idx !== -1) this.swarms.splice(idx, 1);
  }

  /**
   * Get total energy for a player (owned nodes only).
   */
  getPlayerEnergy(playerId) {
    let total = 0;
    for (const node of this.nodes) {
      if (node.owner === playerId) total += node.energy;
    }
    return total;
  }

  /**
   * Get total production rate for a player.
   */
  getPlayerProduction(playerId) {
    let total = 0;
    for (const node of this.nodes) {
      if (node.owner === playerId) total += node.productionRate;
    }
    return total;
  }

  /**
   * Check if a player is eliminated — owns no nodes and has no swarms in flight.
   */
  isPlayerEliminated(playerId) {
    const hasNodes = this.nodes.some(n => n.owner === playerId);
    if (hasNodes) return false;
    const hasSwarms = this.swarms.some(s => s.owner === playerId && s.alive);
    return !hasSwarms;
  }
}
