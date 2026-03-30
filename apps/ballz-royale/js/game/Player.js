// ── Player ──

import { ITEM_MAX_PER_PLAYER } from '../constants.js';

export class Player {
  constructor(index, name, color, isAI = false) {
    this.index = index;
    this.name = name;
    this.color = color;
    this.isAI = isAI;
    this.items = [];          // Array of item type objects
    this.stats = {
      shotsFired: 0,
      ballsPocketed: 0,       // opponent balls you knocked in
      ballsLost: 0,           // your own balls pocketed
      itemsUsed: 0,
      itemsCollected: 0,
    };
  }

  /** Get all alive balls belonging to this player. */
  getAliveBalls(allBalls) {
    return allBalls.filter(b => b.alive && b.owner === this.index);
  }

  /** Is this player eliminated? */
  isEliminated(allBalls) {
    return !allBalls.some(b => b.alive && b.owner === this.index);
  }

  /** How many alive balls does this player have? */
  aliveBallCount(allBalls) {
    return allBalls.filter(b => b.alive && b.owner === this.index).length;
  }

  /** Try to collect an item. Returns true if collected. */
  collectItem(itemType) {
    if (this.items.length >= ITEM_MAX_PER_PLAYER) return false;
    this.items.push(itemType);
    this.stats.itemsCollected++;
    return true;
  }

  /** Use an item at the given index. Returns the item type or null. */
  useItem(index) {
    if (index < 0 || index >= this.items.length) return null;
    this.stats.itemsUsed++;
    return this.items.splice(index, 1)[0];
  }
}
