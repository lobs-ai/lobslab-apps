// Rendering follows actual server motes, with 75ms of jitter buffering and at
// most 100ms of extrapolation. No client combat or independent flock simulation.
export class SwarmInterpolator {
  constructor() {
    this.samples = [];
    this.motes = new Map();
  }

  push(tick, rows, now) {
    const last = this.samples.at(-1);
    if (last && tick <= last.tick) return false;
    // Use server tick spacing, so uneven packet arrival never changes flight speed.
    // A stalled tab starts a fresh timeline instead of slowly replaying its backlog.
    if (this.lastReceivedAt != null && now - this.lastReceivedAt > 250) {
      this.samples = [];
      this.clockOffset = undefined;
    }
    const offset = now - tick * (1000 / 60);
    if (this.clockOffset == null) this.clockOffset = offset;
    else if (offset < this.clockOffset) {
      const correction = offset - this.clockOffset;
      for (const sample of this.samples) sample.time += correction;
      this.clockOffset = offset;
    }
    this.lastReceivedAt = now;
    this.samples.push({ tick, time: tick * (1000 / 60) + this.clockOffset, rows: new Map(rows.map(r => [r[0], r])) });
    if (this.samples.length > 12) this.samples.shift();
    return true;
  }

  sample(now) {
    if (!this.samples.length) return [];
    const time = now - 75;
    while (this.samples.length > 2 && this.samples[1].time <= time) this.samples.shift();
    const a = this.samples[0];
    const b = this.samples[1] || a;
    const mix = Math.max(0, Math.min(1, (time - a.time) / Math.max(1, b.time - a.time)));
    const active = time >= b.time ? b : a;
    const extra = Math.max(0, Math.min(100, time - b.time)) / 1000;
    const result = [];
    for (const [id, row] of active.rows) {
      const start = a.rows.get(id) || row;
      const end = b.rows.get(id) || start;
      let mote = this.motes.get(id);
      if (!mote) {
        mote = { id, alive: true, phase: (id * 0.618034) % 1 };
        this.motes.set(id, mote);
      }
      // Wormholes are discontinuities: never streak across the map.
      const teleport = Math.hypot(end[1] - start[1], end[2] - start[2]) > 100;
      const t = teleport ? (time >= b.time ? 1 : 0) : mix;
      mote.x = start[1] + (end[1] - start[1]) * t + end[3] * extra;
      mote.y = start[2] + (end[2] - start[2]) * t + end[4] * extra;
      mote.vx = end[3]; mote.vy = end[4];
      result.push(mote);
    }
    for (const id of this.motes.keys()) if (!active.rows.has(id)) this.motes.delete(id);
    return result;
  }
}
