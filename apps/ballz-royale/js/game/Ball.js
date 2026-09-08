// ── Ball Entity ──

import { BALL_RADIUS, MIN_SPEED } from '../constants.js';

let nextBallId = 0;

export class Ball {
  constructor(x, y, owner) {
    this.id = nextBallId++;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.radius = BALL_RADIUS;
    this.mass = 1;
    this.owner = owner;       // player index
    this.alive = true;

    // Item effects (reset each turn)
    this.ghost = false;
    this.ghostUsed = false;
    this.ghostPassId = null;
    this.bomb = false;
    this.magnet = false;
    this.shielded = false;
  }

  get speed() {
    return Math.sqrt(this.vx * this.vx + this.vy * this.vy);
  }

  get isMoving() {
    return Math.abs(this.vx) > MIN_SPEED || Math.abs(this.vy) > MIN_SPEED;
  }

  /** Apply velocity from a shot at given angle and power. */
  shoot(angle, power) {
    this.vx = Math.cos(angle) * power;
    this.vy = Math.sin(angle) * power;
  }

  /** Reset per-turn item effects to defaults. */
  resetEffects() {
    this.ghostPassId = null;
    this.mass = 1;
    this.ghost = false;
    this.ghostUsed = false;
    this.bomb = false;
    this.magnet = false;
    // shielded persists until consumed
  }

  /** Apply an item effect to this ball. */
  applyItem(itemId) {
    switch (itemId) {
      case 'bomb':   this.bomb = true; break;
      case 'heavy':  this.mass = 3; break;
      case 'ghost':  this.ghost = true; this.ghostUsed = false; break;
      case 'magnet': this.magnet = true; break;
      case 'shield': this.shielded = true; break;
    }
  }

  kill() {
    this.alive = false;
    this.vx = 0;
    this.vy = 0;
  }
}

/** Reset the ID counter (for new games). */
export function resetBallIds() {
  nextBallId = 0;
}
