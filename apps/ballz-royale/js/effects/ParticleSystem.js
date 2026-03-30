// ── Particle System ──
// Manages visual particles and ball trails.

export class ParticleSystem {
  constructor() {
    this.particles = [];
    this.trails = [];
  }

  /** Spawn burst particles at a point. */
  spawn(x, y, color, count, opts = {}) {
    const { speedMin = 1, speedMax = 5, sizeMin = 2, sizeMax = 5, lifeMin = 30, lifeMax = 50 } = opts;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      const life = lifeMin + Math.random() * (lifeMax - lifeMin);
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        color,
        size: sizeMin + Math.random() * (sizeMax - sizeMin),
      });
    }
  }

  /** Spawn a ring burst (particles along a circle). */
  spawnRing(x, y, color, count, radius, speed = 2) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      this.particles.push({
        x: x + Math.cos(angle) * radius,
        y: y + Math.sin(angle) * radius,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 25,
        maxLife: 25,
        color,
        size: 2,
      });
    }
  }

  /** Add a trail dot behind a moving ball. */
  addTrail(x, y, color) {
    this.trails.push({ x, y, color, life: 20 });
  }

  /** Update all particles and trails. Remove dead ones. */
  update() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life--;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.trails.length - 1; i >= 0; i--) {
      this.trails[i].life--;
      if (this.trails[i].life <= 0) this.trails.splice(i, 1);
    }
  }

  clear() {
    this.particles = [];
    this.trails = [];
  }
}
