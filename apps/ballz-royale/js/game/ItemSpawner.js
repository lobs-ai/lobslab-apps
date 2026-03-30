// ── Item Spawner ──
// Manages item pickups on the field.

import { ITEM_TYPES, ITEM_RADIUS } from '../constants.js';
import { pick, randRange } from '../utils.js';
import { distSq } from '../utils.js';

export class ItemSpawner {
  constructor() {
    this.pickups = [];   // { x, y, type, spawnTime }
  }

  /** Spawn 1-2 items within the safe zone. */
  spawnItems(arenaCX, arenaCY, safeRadius) {
    const count = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * safeRadius * 0.7;
      this.pickups.push({
        x: arenaCX + Math.cos(angle) * dist,
        y: arenaCY + Math.sin(angle) * dist,
        type: pick(ITEM_TYPES),
        spawnTime: Date.now(),
      });
    }
  }

  /** Check if a ball overlaps any pickup. Returns collected items. */
  checkCollection(ball) {
    const collected = [];
    const threshold = (ball.radius + ITEM_RADIUS) ** 2;

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const item = this.pickups[i];
      if (distSq(ball.x, ball.y, item.x, item.y) < threshold) {
        collected.push(item);
        this.pickups.splice(i, 1);
      }
    }
    return collected;
  }

  /** Remove items outside the safe zone. */
  pruneOutsideStorm(arenaCX, arenaCY, stormRadius) {
    this.pickups = this.pickups.filter(item => {
      return distSq(item.x, item.y, arenaCX, arenaCY) < stormRadius * stormRadius;
    });
  }

  clear() {
    this.pickups = [];
  }
}
