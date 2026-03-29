/**
 * ParticlePool — object pool for particle effects.
 *
 * Pre-allocates a fixed number of particle objects and recycles them
 * to avoid GC pressure during gameplay.
 *
 * Usage:
 *   pool.spawn(x, y, vx, vy, color, lifetime, size?)
 *   pool.update(dt)
 *   pool.draw(ctx)
 */
export class ParticlePool {
  constructor(maxParticles = 2000) {
    this.maxParticles = maxParticles;
    this.pool = [];
    this.active = []; // indices of active particles

    // Pre-allocate
    for (let i = 0; i < maxParticles; i++) {
      this.pool.push({
        x: 0, y: 0,
        vx: 0, vy: 0,
        color: '#ffffff',
        lifetime: 0,
        maxLifetime: 1,
        size: 2,
        alive: false,
      });
    }
  }

  /**
   * Spawn a new particle. Returns the particle object or null if pool is full.
   */
  spawn(x, y, vx, vy, color, lifetime, size = 2) {
    // Find a dead particle to recycle
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.alive) {
        p.x = x;
        p.y = y;
        p.vx = vx;
        p.vy = vy;
        p.color = color;
        p.lifetime = lifetime;
        p.maxLifetime = lifetime;
        p.size = size;
        p.alive = true;
        return p;
      }
    }
    return null; // pool full
  }

  /**
   * Spawn a burst of particles at a position (for capture explosions, etc.)
   */
  spawnBurst(x, y, color, count = 12, speed = 80, lifetime = 0.6) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const s = speed * (0.5 + Math.random() * 0.5);
      this.spawn(
        x + randRange(-4, 4),
        y + randRange(-4, 4),
        Math.cos(angle) * s,
        Math.sin(angle) * s,
        color,
        lifetime * (0.7 + Math.random() * 0.3),
        1.5 + Math.random() * 2
      );
    }
  }

  /**
   * Update all active particles.
   */
  update(dt) {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.lifetime -= dt;
      if (p.lifetime <= 0) {
        p.alive = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // Slight drag
      p.vx *= 0.98;
      p.vy *= 0.98;
    }
  }

  /**
   * Draw all active particles.
   */
  draw(ctx) {
    ctx.save();

    for (const p of this.pool) {
      if (!p.alive) continue;

      const t = p.lifetime / p.maxLifetime; // 1 = fresh, 0 = dead
      const alpha = t * t; // fade out quadratically

      ctx.globalAlpha = alpha;
      ctx.shadowBlur = p.size * 3;
      ctx.shadowColor = p.color;
      ctx.fillStyle = p.color;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  /**
   * Count of currently active particles.
   */
  get activeCount() {
    let n = 0;
    for (const p of this.pool) {
      if (p.alive) n++;
    }
    return n;
  }
}

function randRange(min, max) {
  return min + Math.random() * (max - min);
}
