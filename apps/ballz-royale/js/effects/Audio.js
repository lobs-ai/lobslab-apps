// Small synthesized pool sounds; no downloads and no autoplay.
class PoolAudio {
  enabled = true;
  context = null;
  unlock() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext || !this.enabled) return;
    this.context ||= new AudioContext();
    this.context.resume().catch(() => {});
  }
  play(kind, strength = 1) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const ctx = this.context;
    const now = ctx.currentTime;
    if (kind === 'hit' && now - (this.lastHit || 0) < 0.045) return;
    if (kind === 'hit') this.lastHit = now;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const frequency = kind === 'pocket' ? 540 : kind === 'shot' ? 150 : 900;
    oscillator.type = kind === 'pocket' ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(kind === 'pocket' ? 180 : 70, now + 0.12);
    gain.gain.setValueAtTime(Math.min(0.18, 0.035 + strength * 0.008), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.18);
  }
}
export const audio = new PoolAudio();
