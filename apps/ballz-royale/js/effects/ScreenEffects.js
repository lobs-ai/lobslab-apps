// ── Screen Effects ──
// Manages screen shake, slow motion, and announcements.

export class ScreenEffects {
  constructor() {
    this.shakeMag = 0;
    this.shakeX = 0;
    this.shakeY = 0;

    this._slowFactor = 1;
    this._slowTimer = 0;

    this.announcementText = '';
    this.announcementTimer = 0;
    this.announcementAlpha = 0;
  }

  /** Current slow-motion factor (1 = normal speed). */
  get slowFactor() { return this._slowFactor; }

  /** Trigger screen shake with a given magnitude. */
  shake(magnitude) {
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    this.shakeMag = Math.max(this.shakeMag, magnitude);
  }

  /** Enter slow motion for a duration (seconds). */
  slowMo(factor = 0.3, durationMs = 400) {
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    this._slowFactor = factor;
    this._slowTimer = durationMs / 1000;
  }

  /** Show a text announcement. */
  announce(text, durationSec = 1.5) {
    this.announcementText = text;
    this.announcementTimer = durationSec;
    this.announcementAlpha = 1;
  }

  /** Update effects per frame. dt in seconds. */
  update(dt) {
    // Shake decay
    if (this.shakeMag > 0) {
      this.shakeX = (Math.random() - 0.5) * this.shakeMag;
      this.shakeY = (Math.random() - 0.5) * this.shakeMag;
      this.shakeMag *= 0.9;
      if (this.shakeMag < 0.5) {
        this.shakeMag = 0;
        this.shakeX = 0;
        this.shakeY = 0;
      }
    }

    // Slow mo timer
    if (this._slowTimer > 0) {
      this._slowTimer -= dt;
      if (this._slowTimer <= 0) {
        this._slowFactor = 1;
      }
    }

    // Announcement timer
    if (this.announcementTimer > 0) {
      this.announcementTimer -= dt;
      if (this.announcementTimer <= 0) {
        this.announcementAlpha = 0;
      } else if (this.announcementTimer < 0.3) {
        this.announcementAlpha = this.announcementTimer / 0.3;
      }
    }
  }

  /** Draw announcement text on canvas. */
  drawAnnouncement(ctx, W, H) {
    if (this.announcementAlpha <= 0 || !this.announcementText) return;

    ctx.save();
    ctx.globalAlpha = this.announcementAlpha;
    ctx.font = 'bold 36px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(this.announcementText, W / 2 + 2, H / 2 + 2);

    // Text
    ctx.fillStyle = '#ffd93d';
    ctx.fillText(this.announcementText, W / 2, H / 2);

    ctx.restore();
  }
}
