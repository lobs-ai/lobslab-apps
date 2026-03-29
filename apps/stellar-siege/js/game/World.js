import { pointToSegmentDist } from '../utils/math.js';

/**
 * World — container for all game entities.
 */
export class World {
  constructor() {
    this.nodes = [];
    this.streams = [];
    this.players = [];
    this.events = [];       // active environmental events
    this.time = 0;          // elapsed game time in seconds
    this.width = 0;
    this.height = 0;
  }

  getNodeById(id) {
    return this.nodes.find(n => n.id === id) ?? null;
  }

  getNodesByOwner(ownerId) {
    return this.nodes.filter(n => n.owner === ownerId);
  }

  getNodeAt(x, y) {
    // Find the closest node within its radius
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
   * Find the closest player-owned in-flight stream within maxDist px of
   * the given point. Hit-tests against the line segment source→head.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} ownerId  - only match streams owned by this player
   * @param {number} [maxDist=15]
   * @returns {Stream|null}
   */
  getStreamAt(x, y, ownerId, maxDist = 15) {
    let closest = null;
    let closestDist = maxDist;

    for (const stream of this.streams) {
      if (!stream.alive || stream.arrived) continue;
      if (stream.owner !== ownerId) continue;

      const source = this.getNodeById(stream.sourceId);
      if (!source) continue;

      const d = pointToSegmentDist(
        x, y,
        source.position.x, source.position.y,
        stream.headX, stream.headY
      );
      if (d < closestDist) {
        closestDist = d;
        closest = stream;
      }
    }
    return closest;
  }

  addStream(stream) {
    this.streams.push(stream);
  }

  removeStream(id) {
    const idx = this.streams.findIndex(s => s.id === id);
    if (idx !== -1) this.streams.splice(idx, 1);
  }

  /**
   * Get total energy for a player.
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
   * Check if a player is eliminated (owns no nodes and has no streams).
   */
  isPlayerEliminated(playerId) {
    const hasNodes = this.nodes.some(n => n.owner === playerId);
    if (hasNodes) return false;
    const hasStreams = this.streams.some(s => s.owner === playerId && s.alive);
    return !hasStreams;
  }
}
