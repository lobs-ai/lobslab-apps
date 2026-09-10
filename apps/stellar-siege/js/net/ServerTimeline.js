// The client renders the server's timeline at a fractional server tick that trails the
// newest data by a jitter-sized buffer. Every replicated thing (motes, node ownership and
// energy, combat effects) is resolved at that same tick, so nothing on screen leads or lags
// anything else.

export const NOMINAL_PERIOD = 1000 / 60;
const MAX_EXTRAPOLATION_MS = 100;
const TELEPORT_DISTANCE = 100;

/**
 * Maps local time to server ticks from observed (tick, arrival time) pairs.
 *
 * - The fastest-arriving samples in a sliding window define the offset, so ordinary jitter
 *   never speeds motes up or slows them down.
 * - The render delay is sized from the observed jitter spread (p90) plus one sync interval.
 * - The server's real step period is estimated from long-lived anchors, so a server that
 *   steps slower than nominal keeps the cursor behind its data instead of ahead of it.
 * - The cursor glides toward changes at 5% of real time; only a stall over 250ms snaps it.
 */
export class ServerClock {
  constructor({ period = NOMINAL_PERIOD, syncSteps = 3, minDelay = 90, maxDelay = 400, window = 64 } = {}) {
    this.nominalPeriod = period;
    this.period = period;
    this.syncSteps = syncSteps;
    this.minDelay = minDelay;
    this.maxDelay = maxDelay;
    this.windowSize = window;
    this.window = [];
    this.anchors = [];
    this.baseOffset = null;
    this.delay = minDelay;
    this.tick = null;
    this.lastNow = null;
  }

  observe(tick, at) {
    const last = this.window.at(-1);
    if (last && tick <= last.tick) return false;
    this.window.push({ tick, at });
    if (this.window.length > this.windowSize) this.window.shift();
    this._anchor(tick, at);
    const offsets = this.window.map(o => o.at - o.tick * this.period).sort((a, b) => a - b);
    this.baseOffset = offsets[0];
    const spread = offsets[Math.floor((offsets.length - 1) * 0.9)] - offsets[0];
    this.delay = Math.min(this.maxDelay, Math.max(this.minDelay, spread + this.syncSteps * this.period + 20));
    return true;
  }

  // One fastest-arrival anchor per second, kept for 40s, gives a jitter-resistant period fit.
  _anchor(tick, at) {
    const offset = at - tick * this.nominalPeriod;
    const bucket = this.anchors.at(-1);
    if (!bucket || at - bucket.start >= 1000) this.anchors.push({ start: at, tick, at, offset });
    else if (offset < bucket.offset) Object.assign(bucket, { tick, at, offset });
    if (this.anchors.length > 40) this.anchors.shift();
    const first = this.anchors[0];
    const recent = this.anchors.at(-2);
    if (this.anchors.length < 6 || recent.at - first.at < 5000) return;
    const estimate = (recent.at - first.at) / (recent.tick - first.tick);
    if (estimate >= this.nominalPeriod * 0.8 && estimate <= this.nominalPeriod * 1.5) this.period = estimate;
  }

  /** Fractional server tick to render at local time `now`, or null before the first sample. */
  renderTick(now) {
    if (this.baseOffset == null) return null;
    const target = (now - this.baseOffset - this.delay) / this.period;
    const elapsed = this.lastNow == null ? 0 : Math.max(0, Math.min(250, now - this.lastNow)) / this.period;
    this.lastNow = now;
    if (this.tick == null) return this.tick = target;
    const predicted = this.tick + elapsed;
    const error = target - predicted;
    if (Math.abs(error) > 250 / this.period) return this.tick = target;
    const limit = elapsed * 0.05;
    return this.tick = predicted + Math.max(-limit, Math.min(limit, error));
  }
}

/**
 * Mote positions for one swarm, sampled at any server tick. Stable mote indices survive
 * casualties, wormholes are discontinuities, and extrapolation stops after 100ms.
 */
export class MoteTrack {
  constructor() {
    this.samples = [];
    this.motes = new Map();
    this.createdTick = null;
    this.removedTick = null;
  }

  push(tick, rows) {
    const last = this.samples.at(-1);
    if (last && tick <= last.tick) return false;
    this.createdTick ??= tick;
    this.samples.push({ tick, rows: new Map(rows.map(r => [r[0], r])) });
    if (this.samples.length > 24) this.samples.shift();
    return true;
  }

  sample(renderTick, period = NOMINAL_PERIOD) {
    const samples = this.samples;
    if (!samples.length) return [];
    while (samples.length > 2 && samples[1].tick <= renderTick) samples.shift();
    const a = samples[0];
    const b = samples[1] || a;
    const mix = Math.max(0, Math.min(1, (renderTick - a.tick) / Math.max(1e-6, b.tick - a.tick)));
    const active = renderTick >= b.tick ? b : a;
    const extra = Math.max(0, Math.min(MAX_EXTRAPOLATION_MS, (renderTick - b.tick) * period)) / 1000;
    const result = [];
    for (const [id, row] of active.rows) {
      const start = a.rows.get(id) || row;
      const end = b.rows.get(id) || start;
      let mote = this.motes.get(id);
      if (!mote) {
        mote = { id, alive: true, phase: (id * 0.618034) % 1 };
        this.motes.set(id, mote);
      }
      const teleport = Math.hypot(end[1] - start[1], end[2] - start[2]) > TELEPORT_DISTANCE;
      const t = teleport ? (renderTick >= b.tick ? 1 : 0) : mix;
      mote.x = start[1] + (end[1] - start[1]) * t + end[3] * extra;
      mote.y = start[2] + (end[2] - start[2]) * t + end[4] * extra;
      mote.vx = end[3];
      mote.vy = end[4];
      result.push(mote);
    }
    for (const id of this.motes.keys()) if (!active.rows.has(id)) this.motes.delete(id);
    return result;
  }
}
