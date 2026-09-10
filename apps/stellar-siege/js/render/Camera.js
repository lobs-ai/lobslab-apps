export class Camera {
  constructor() { this.reset(); }
  reset() { this.zoom = 1; this.panX = 0; this.panY = 0; }
  update(width, height, world) {
    if (this.world !== world) { this.reset(); this.world = world; }
    this.width = width; this.height = height;
    this.usableHeight = Math.max(100, height - 130);
    const base = Math.min(width / Math.max(1, world.width), this.usableHeight / Math.max(1, world.height));
    const scale = Math.max(0.05, base) * this.zoom;
    const maxX = Math.max(0, (world.width * scale - width) / 2);
    const maxY = Math.max(0, (world.height * scale - this.usableHeight) / 2);
    this.panX = Math.max(-maxX, Math.min(maxX, this.panX));
    this.panY = Math.max(-maxY, Math.min(maxY, this.panY));
    return this.view = { scale, x: (width - world.width * scale) / 2 + this.panX,
      y: 70 + (this.usableHeight - world.height * scale) / 2 + this.panY };
  }
  zoomAt(x, y, delta) {
    if (!this.view) return;
    const wx = (x - this.view.x) / this.view.scale, wy = (y - this.view.y) / this.view.scale;
    this.zoom = Math.max(1, Math.min(3.5, this.zoom * Math.exp(-delta * 0.0015)));
    const next = this.update(this.width, this.height, this.world);
    this.panX += x - (wx * next.scale + next.x);
    this.panY += y - (wy * next.scale + next.y);
    this.update(this.width, this.height, this.world);
  }
}
