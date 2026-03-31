// ── Replay Player ──
// Interpolates through server-provided snapshots to animate physics results.

export class ReplayPlayer {
  constructor() {
    this.snapshots = [];
    this.events = [];
    this.playing = false;
    this.startTime = 0;
    this.playbackSpeed = 1.0;
    this.onEvent = null;      // (event) => void — called when event time is reached
    this.onComplete = null;   // () => void — called when replay finishes
    this._firedEvents = new Set();
    this._snapshotIndex = 0;
  }

  /**
   * Start playing a replay.
   * @param {Object[]} snapshots — array of { t, balls: [{id,x,y,vx,vy,alive,...}] }
   * @param {Object[]} events — array of { t, type, ... }
   * @param {number} speed — playback speed multiplier (default 1.0)
   */
  start(snapshots, events, speed = 1.0) {
    this.snapshots = snapshots;
    this.events = events || [];
    this.playbackSpeed = speed;
    this.playing = true;
    this.startTime = performance.now();
    this._firedEvents = new Set();
    this._snapshotIndex = 0;
  }

  /** Get the total replay duration in seconds (sim-time). */
  get duration() {
    if (this.snapshots.length === 0) return 0;
    return this.snapshots[this.snapshots.length - 1].t;
  }

  /** Get current sim-time. */
  get currentTime() {
    if (!this.playing) return this.duration;
    const elapsed = (performance.now() - this.startTime) / 1000 * this.playbackSpeed;
    return Math.min(elapsed, this.duration);
  }

  /**
   * Update — call each frame.
   * Returns the interpolated ball states for this instant, or null if not playing.
   */
  update() {
    if (!this.playing || this.snapshots.length < 2) {
      if (this.playing) {
        this.playing = false;
        this.onComplete?.();
      }
      return null;
    }

    const t = this.currentTime;

    // Fire events whose time has been reached
    for (let i = 0; i < this.events.length; i++) {
      if (!this._firedEvents.has(i) && this.events[i].t <= t) {
        this._firedEvents.add(i);
        this.onEvent?.(this.events[i]);
      }
    }

    // Find the two surrounding snapshots
    let a = this.snapshots[0];
    let b = this.snapshots[1];

    for (let i = this._snapshotIndex; i < this.snapshots.length - 1; i++) {
      if (this.snapshots[i + 1].t >= t) {
        a = this.snapshots[i];
        b = this.snapshots[i + 1];
        this._snapshotIndex = i;
        break;
      }
    }
    // Past the end
    if (t >= this.snapshots[this.snapshots.length - 1].t) {
      a = this.snapshots[this.snapshots.length - 1];
      b = a;
    }

    // Interpolate
    const dt = b.t - a.t;
    const frac = dt > 0 ? Math.min(1, (t - a.t) / dt) : 1;

    const balls = a.balls.map((aBall, idx) => {
      const bBall = b.balls[idx] || aBall;
      return {
        id: aBall.id,
        x: aBall.x + (bBall.x - aBall.x) * frac,
        y: aBall.y + (bBall.y - aBall.y) * frac,
        vx: aBall.vx + (bBall.vx - aBall.vx) * frac,
        vy: aBall.vy + (bBall.vy - aBall.vy) * frac,
        owner: aBall.owner,
        alive: frac < 1 ? aBall.alive : bBall.alive,
        radius: aBall.radius,
        mass: aBall.mass ?? 1,
        ghost: aBall.ghost ?? false,
        bomb: aBall.bomb ?? false,
        magnet: aBall.magnet ?? false,
        shielded: aBall.shielded ?? false,
      };
    });

    // Check if replay is done
    if (t >= this.duration) {
      this.playing = false;
      this.onComplete?.();
    }

    return balls;
  }

  stop() {
    this.playing = false;
    this._firedEvents.clear();
  }
}
