// Tiny synthesized effects: no audio downloads, and no sound before a gesture.
export class SoundSystem {
  constructor() {
    this.enabled = true;
    try { this.enabled = localStorage.getItem('stellar-sound') !== 'off'; } catch {}
    this.previousOwners = new Map();
    this.seenEvents = new WeakSet();
    this.lastCombat = 0;
    document.addEventListener('pointerdown', () => this.unlock(), { once: true });
  }
  unlock() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    this.context ??= new Context();
    this.context.resume().catch(() => {});
  }
  toggle() {
    this.enabled = !this.enabled;
    try { localStorage.setItem('stellar-sound', this.enabled ? 'on' : 'off'); } catch {}
    if (this.enabled) this.unlock();
    return this.enabled;
  }
  tone(from, to, duration, volume = 0.035, delay = 0) {
    if (!this.enabled || this.context?.state !== 'running') return;
    const at = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.frequency.setValueAtTime(from, at);
    oscillator.frequency.exponentialRampToValueAtTime(to, at + duration);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain); gain.connect(this.context.destination);
    oscillator.start(at); oscillator.stop(at + duration + 0.01);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  launch() { this.tone(260, 65, 0.18); }
  update(world, playerId) {
    if (this.world !== world) {
      this.world = world;
      this.previousOwners.clear();
    }
    for (const node of world.nodes) {
      if (this.previousOwners.has(node.id) && this.previousOwners.get(node.id) !== node.owner) {
        if (node.owner === playerId) {
          [523, 659, 784].forEach((note, i) => this.tone(note, note, 0.22, 0.025, i * 0.07));
        } else if (this.previousOwners.get(node.id) === playerId) this.tone(220, 110, 0.3);
      }
      this.previousOwners.set(node.id, node.owner);
    }
    for (const event of world.events) {
      if (this.seenEvents.has(event)) continue;
      this.seenEvents.add(event);
      if (event.type === 'mote_combat' && performance.now() - this.lastCombat > 80) {
        this.lastCombat = performance.now();
        this.tone(900, 90, 0.07, 0.015);
      }
      if (event.type === 'wormhole_transit' && performance.now() - (this.lastTransit || 0) > 120) {
        this.lastTransit = performance.now();
        this.tone(150, 900, 0.24, 0.02);
      }
    }
  }
}
