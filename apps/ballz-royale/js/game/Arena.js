// ── Arena ──
// Manages the circular play area, pockets, and storm zone.

import { POCKET_COUNT, POCKET_RADIUS, ARENA_SCALE, STORM_FORCE } from '../constants.js';

export class Arena {
  constructor(canvasWidth, canvasHeight) {
    this.resize(canvasWidth, canvasHeight);
  }

  resize(canvasWidth, canvasHeight) {
    this.radius = Math.min(canvasWidth, canvasHeight) * ARENA_SCALE;
    this.cx = canvasWidth / 2;
    this.cy = canvasHeight / 2;
    this.buildPockets();
  }

  buildPockets() {
    this.pockets = [];
    for (let i = 0; i < POCKET_COUNT; i++) {
      const angle = (i / POCKET_COUNT) * Math.PI * 2 - Math.PI / 2;
      this.pockets.push({
        x: this.cx + Math.cos(angle) * this.radius,
        y: this.cy + Math.sin(angle) * this.radius,
        angle,
        radius: POCKET_RADIUS,
      });
    }
  }

  /** Returns true if a point is inside the arena. */
  contains(x, y) {
    const dx = x - this.cx;
    const dy = y - this.cy;
    return dx * dx + dy * dy <= this.radius * this.radius;
  }

  /** Distance from center to point. */
  distFromCenter(x, y) {
    const dx = x - this.cx;
    const dy = y - this.cy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Get storm push force vector for a position outside the safe zone. */
  getStormForce(x, y, stormRadius) {
    const dx = x - this.cx;
    const dy = y - this.cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= stormRadius || d === 0) return { fx: 0, fy: 0 };

    const strength = STORM_FORCE * ((d - stormRadius) / this.radius);
    return {
      fx: -(dx / d) * strength,
      fy: -(dy / d) * strength,
    };
  }
}
