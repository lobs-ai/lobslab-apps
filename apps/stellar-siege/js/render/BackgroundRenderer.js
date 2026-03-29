/**
 * BackgroundRenderer — renders a static deep-space starfield.
 *
 * Stars are generated once onto an offscreen canvas and composited
 * each frame — O(1) per frame regardless of star count.
 *
 * Star layers:
 *   - Faint distant stars (tiny, gray/blue)
 *   - Mid stars (small, slightly colored)
 *   - Bright foreground stars (few, twinkle)
 *   - Occasional nebula blobs (large, very faint colored clouds)
 */
export class BackgroundRenderer {
  constructor() {
    this.offscreen = null;
    this.offscreenCtx = null;
    this.width = 0;
    this.height = 0;

    // Twinkle stars for animation
    this.twinkleStars = [];
  }

  /**
   * Generate the static starfield onto an offscreen canvas.
   * Called once when canvas size changes.
   */
  generate(width, height) {
    this.width = width;
    this.height = height;

    this.offscreen = document.createElement('canvas');
    this.offscreen.width = width;
    this.offscreen.height = height;
    this.offscreenCtx = this.offscreen.getContext('2d');

    const ctx = this.offscreenCtx;
    ctx.clearRect(0, 0, width, height);

    // Deep space background gradient
    const bg = ctx.createRadialGradient(
      width * 0.5, height * 0.5, 0,
      width * 0.5, height * 0.5, Math.max(width, height) * 0.7
    );
    bg.addColorStop(0, '#0d0d1a');
    bg.addColorStop(0.5, '#080810');
    bg.addColorStop(1, '#050508');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Layer 1: Nebula clouds (drawn first, very subtle)
    this._drawNebulae(ctx, width, height);

    // Layer 2: Faint distant stars (tiny, many)
    this._drawStarLayer(ctx, width, height, 600, 0.3, 0.7, 0.5, '#aabbee');

    // Layer 3: Medium stars
    this._drawStarLayer(ctx, width, height, 200, 0.6, 1.2, 0.7, '#cce8ff');

    // Layer 4: Bright stars (few, larger)
    this._drawStarLayer(ctx, width, height, 40, 1.0, 2.5, 0.9, '#ffffff');

    // Store positions of bright stars for twinkle animation
    this.twinkleStars = this._genTwinkleStars(width, height, 25);
  }

  _drawNebulae(ctx, width, height) {
    const nebulas = [
      { color: '#1a0044', x: 0.25, y: 0.35, rx: 0.20, ry: 0.14 },
      { color: '#002244', x: 0.70, y: 0.60, rx: 0.18, ry: 0.22 },
      { color: '#0a2200', x: 0.50, y: 0.20, rx: 0.15, ry: 0.12 },
    ];

    for (const neb of nebulas) {
      const grd = ctx.createRadialGradient(
        neb.x * width, neb.y * height, 0,
        neb.x * width, neb.y * height, Math.max(neb.rx * width, neb.ry * height)
      );
      grd.addColorStop(0, neb.color + '33'); // 20% opacity
      grd.addColorStop(0.5, neb.color + '18');
      grd.addColorStop(1, 'transparent');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(neb.x * width, neb.y * height, neb.rx * width, neb.ry * height, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawStarLayer(ctx, width, height, count, minR, maxR, maxAlpha, tint) {
    for (let i = 0; i < count; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const r = minR + Math.random() * (maxR - minR);
      const alpha = 0.2 + Math.random() * (maxAlpha - 0.2);

      // Slight color variation
      const hue = Math.floor(Math.random() * 40 - 20); // ±20 hue
      ctx.globalAlpha = alpha;

      if (r > 1.5) {
        // Glow effect for larger stars
        const grd = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
        grd.addColorStop(0, '#ffffff');
        grd.addColorStop(0.3, tint);
        grd.addColorStop(1, 'transparent');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(x, y, r * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Core dot
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _genTwinkleStars(width, height, count) {
    const stars = [];
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 1.2 + Math.random() * 1.5,
        phase: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 1.5,
      });
    }
    return stars;
  }

  /**
   * Draw the background — offscreen composite + animated twinkle stars.
   */
  draw(ctx, time) {
    if (!this.offscreen) return;

    ctx.drawImage(this.offscreen, 0, 0);

    // Animate twinkle stars on top
    for (const star of this.twinkleStars) {
      const brightness = 0.4 + 0.6 * Math.abs(Math.sin(time * star.speed + star.phase));
      ctx.globalAlpha = brightness;
      ctx.shadowBlur = 6 * brightness;
      ctx.shadowColor = '#88aaff';
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r * brightness, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
}
