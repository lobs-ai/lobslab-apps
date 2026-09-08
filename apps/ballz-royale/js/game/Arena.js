// ── Arena ──
// Rectangular billiard table with 6 pockets (4 corners + 2 side midpoints).

export class Arena {
  constructor(canvasWidth, canvasHeight) {
    this.resize(canvasWidth, canvasHeight);
  }

  resize(canvasWidth, canvasHeight) {
    this.cx = canvasWidth / 2;
    this.cy = canvasHeight / 2 - (canvasHeight < 600 ? 12 : 0);

    // Portrait tables keep touch targets usable; leave room for HUD and controls.
    const aspect = canvasWidth < 600 && canvasHeight > canvasWidth ? 0.9 : 2;
    const maxH = Math.max(100, (canvasHeight - (canvasHeight < 600 ? 190 : 280)) / 1.2);
    const maxW = canvasWidth * (canvasWidth < 600 ? 0.84 : 0.88);

    if (maxW / aspect <= maxH) {
      this.tableW = maxW;
      this.tableH = maxW / aspect;
    } else {
      this.tableH = maxH;
      this.tableW = maxH * aspect;
    }

    this.left   = this.cx - this.tableW / 2;
    this.right  = this.cx + this.tableW / 2;
    this.top    = this.cy - this.tableH / 2;
    this.bottom = this.cy + this.tableH / 2;
    this.ballRadius = Math.max(8, Math.min(15, this.tableW * 0.025));

    // Keep a radius for storm compatibility (use half-diagonal)
    this.radius = Math.sqrt((this.tableW / 2) ** 2 + (this.tableH / 2) ** 2);

    this.buildPockets();
  }

  buildPockets() {
    const { left, right, top, bottom, cx, cy } = this;
    // Pocket offset inward from corners (pocket sits at corner cut)
    const pocketRadius = this.ballRadius * 1.6;
    const co = pocketRadius * 0.5;
    this.pockets = [
      // 4 corners
      { x: left  + co, y: top    + co, radius: pocketRadius + 2 },
      { x: right - co, y: top    + co, radius: pocketRadius + 2 },
      { x: left  + co, y: bottom - co, radius: pocketRadius + 2 },
      { x: right - co, y: bottom - co, radius: pocketRadius + 2 },
      // 2 side midpoints
      { x: cx,         y: top    - 2,  radius: pocketRadius },
      { x: cx,         y: bottom + 2,  radius: pocketRadius },
    ];
  }

  /** Returns true if a point is inside the table. */
  contains(x, y) {
    return x >= this.left && x <= this.right && y >= this.top && y <= this.bottom;
  }

  /** Distance from the safe zone's center. */
  distFromCenter(x, y) {
    const dx = x - this.cx;
    const dy = y - this.cy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Storm claims exposed balls at turn end, without disturbing aiming. */
  getStormForce(x, y, stormRadius) {
    return { fx: 0, fy: 0 };
  }
}
