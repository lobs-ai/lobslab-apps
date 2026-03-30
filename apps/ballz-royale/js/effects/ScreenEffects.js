// ── Screen Effects ──
// Manages screen shake, slow motion, and announcements.

export class ScreenEffects {
  constructor() {
    this.shakeMag = 0;
    this.shakeX = 0;
    this.shakeY = 0;

    this.slowMo = 1;
    this.slowMoTimer = 0;

    this.announcementText = '';
    this.announcementTimer = 0;
    this.announcementEl = null;
  }

  /** Bind the announcement DOM element. */
  bindUI(announcementEl) {
    this.announcementEl = announcementEl;
  }

  /** Trigger screen shake with a given magnitude. */
  shake(magnitude) {
    this.shakeMag = Math.max(this.shakeMag, magnitude);
  }

  /** Enter slow motion for a duration (ms). */
  enterSlowMo(factor = 0.3, durationMs = 400) {
    this.slowMo = factor;
    this.slowMoTimer = durationMs;
  }

  /** Show a text announcement. */
  announce(text, durationMs = 1500) {
    this.announcementText = text;
    this.announcementTimer = durationMs;
    if (this.announcementEl) {
      this.announcementEl.textContent = text;
      this.announcementEl.style.opacity = '1';
    }
  }

  /** Update effects per frame. Returns the current slow-mo multiplier. */
  update(realDtMs) {
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
    if (this.slowMoTimer > 0) {
      this.slowMoTimer -= realDtMs;
      if (this.slowMoTimer <= 0) {
        this.slowMo = 1;
      }
    }

    // Announcement timer
    if (this.announcementTimer > 0) {
      this.announcementTimer -= realDtMs;
      if (this.announcementTimer <= 0 && this.announcementEl) {
        this.announcementEl.style.opacity = '0';
      }
    }

    return this.slowMo;
  }
}
