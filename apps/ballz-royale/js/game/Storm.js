// ── Storm System ──
// Manages the shrinking danger zone.

import { STORM_SHRINK_AMOUNT, STORM_MIN_PERCENT } from '../constants.js';

export class Storm {
  constructor(arenaRadius) {
    this.arenaRadius = arenaRadius;
    this.percent = 100;
    this.currentRadius = arenaRadius;
    this.targetRadius = arenaRadius;
    this.lerpSpeed = 0.02;
    this.warningActive = false;
    this.warningTimer = 0;
  }

  /** Trigger a shrink. Returns true if the storm actually shrank. */
  shrink() {
    if (this.percent <= STORM_MIN_PERCENT) return false;
    this.percent = Math.max(STORM_MIN_PERCENT, this.percent - STORM_SHRINK_AMOUNT);
    this.targetRadius = this.arenaRadius * (this.percent / 100);
    this.warningActive = true;
    this.warningTimer = 3000;
    return true;
  }

  /** Update the storm radius (smooth lerp toward target). */
  update(dt) {
    if (this.currentRadius > this.targetRadius + 1) {
      this.currentRadius -= (this.currentRadius - this.targetRadius) * this.lerpSpeed;
    } else {
      this.currentRadius = this.targetRadius;
    }

    if (this.warningTimer > 0) {
      this.warningTimer -= dt * 1000;
      if (this.warningTimer <= 0) {
        this.warningActive = false;
      }
    }
  }

  /** Handle arena resize — scale everything proportionally. */
  resize(newArenaRadius) {
    const ratio = newArenaRadius / this.arenaRadius;
    this.arenaRadius = newArenaRadius;
    this.currentRadius *= ratio;
    this.targetRadius *= ratio;
  }

  /** Is a point inside the safe zone? */
  isSafe(x, y, cx, cy) {
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= this.currentRadius * this.currentRadius;
  }
}
