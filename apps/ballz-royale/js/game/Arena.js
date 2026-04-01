// ── Arena ──
// Rectangular billiard table with 6 pockets (4 corners + 2 side midpoints).

import { POCKET_RADIUS } from '../constants.js';

// Table aspect ratio: standard pool table is 2:1 (length:width)
const TABLE_ASPECT = 2.0;
// Fraction of the smaller screen dimension used for table width
const TABLE_SCALE = 0.82;

export class Arena {
  constructor(canvasWidth, canvasHeight) {
    this.resize(canvasWidth, canvasHeight);
  }

  resize(canvasWidth, canvasHeight) {
    this.cx = canvasWidth / 2;
    this.cy = canvasHeight / 2;

    // Fit table to screen maintaining 2:1 aspect ratio
    const maxH = canvasHeight * TABLE_SCALE;
    const maxW = canvasWidth * TABLE_SCALE;

    if (maxW / TABLE_ASPECT <= maxH) {
      this.tableW = maxW;
      this.tableH = maxW / TABLE_ASPECT;
    } else {
      this.tableH = maxH;
      this.tableW = maxH * TABLE_ASPECT;
    }

    this.left   = this.cx - this.tableW / 2;
    this.right  = this.cx + this.tableW / 2;
    this.top    = this.cy - this.tableH / 2;
    this.bottom = this.cy + this.tableH / 2;

    // Keep a radius for storm compatibility (use half-diagonal)
    this.radius = Math.sqrt((this.tableW / 2) ** 2 + (this.tableH / 2) ** 2);

    this.buildPockets();
  }

  buildPockets() {
    const { left, right, top, bottom, cx, cy } = this;
    // Pocket offset inward from corners (pocket sits at corner cut)
    const co = POCKET_RADIUS * 0.5;
    this.pockets = [
      // 4 corners
      { x: left  + co, y: top    + co, radius: POCKET_RADIUS + 2 },
      { x: right - co, y: top    + co, radius: POCKET_RADIUS + 2 },
      { x: left  + co, y: bottom - co, radius: POCKET_RADIUS + 2 },
      { x: right - co, y: bottom - co, radius: POCKET_RADIUS + 2 },
      // 2 side midpoints
      { x: cx,         y: top    - 2,  radius: POCKET_RADIUS },
      { x: cx,         y: bottom + 2,  radius: POCKET_RADIUS },
    ];
  }

  /** Returns true if a point is inside the table. */
  contains(x, y) {
    return x >= this.left && x <= this.right && y >= this.top && y <= this.bottom;
  }

  /** Distance from center (kept for storm compat — always returns 0 since storm disabled). */
  distFromCenter(x, y) {
    const dx = x - this.cx;
    const dy = y - this.cy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Storm force — disabled on billiard table, always zero. */
  getStormForce(x, y, stormRadius) {
    return { fx: 0, fy: 0 };
  }
}
