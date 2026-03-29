import { getOwnerColor } from '../utils/colors.js';

/**
 * SwarmRenderer — draws mote clouds as tiny glowing particles.
 *
 * Performance strategy (avoids per-mote shadow/arc):
 *   1. One soft radial gradient glow at swarm center of mass.
 *   2. All motes drawn as fillRect squares (much faster than arc).
 *   3. Two passes per swarm: color layer then bright-white core layer.
 *   4. Combat flash events drawn as small fading circles.
 */

const FLASH_DURATION = 0.3; // seconds a combat flash stays visible

export class SwarmRenderer {
  /**
   * @param {import('../render/ParticlePool.js').ParticlePool} particlePool
   */
  constructor(particlePool) {
    this.particles = particlePool;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('../game/World.js').World} world
   * @param {number} time        - elapsed simulation time (seconds)
   * @param {number} dt          - frame delta (seconds)
   * @param {number|null} highlightedSwarmId
   */
  draw(ctx, world, time, dt, highlightedSwarmId = null) {
    for (const swarm of world.swarms) {
      if (!swarm.alive) continue;
      const highlighted = highlightedSwarmId !== null && swarm.id === highlightedSwarmId;
      this._drawSwarm(ctx, swarm, time, highlighted);
    }

    this._drawCombatEvents(ctx, world, time);
  }

  // ---------------------------------------------------------------------------
  // Per-swarm draw (optimised — no per-mote shadow)
  // ---------------------------------------------------------------------------

  _drawSwarm(ctx, swarm, time, highlighted) {
    const color = getOwnerColor(swarm.owner);

    // Gather alive motes
    const aliveMotes = swarm.motes.filter(m => m.alive);
    if (aliveMotes.length === 0) return;

    // Center of mass
    let cx = 0, cy = 0;
    for (const m of aliveMotes) { cx += m.x; cy += m.y; }
    cx /= aliveMotes.length;
    cy /= aliveMotes.length;

    // --- 1. Soft glow blob at center of mass ---
    const glowRadius = Math.min(30 + aliveMotes.length * 0.5, 60);
    try {
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
      grad.addColorStop(0, color + '40');   // ~25% alpha at center
      grad.addColorStop(1, color + '00');   // transparent at edge
      ctx.fillStyle = grad;
      ctx.fillRect(cx - glowRadius, cy - glowRadius, glowRadius * 2, glowRadius * 2);
    } catch (_) {
      // createRadialGradient can fail if coordinates are degenerate — skip glow
    }

    // Highlighted swarm gets an extra bright outline ring
    if (highlighted) {
      const pulse = 0.55 + 0.45 * Math.sin(time * 6);
      ctx.save();
      ctx.globalAlpha = 0.6 * pulse;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#00ffff';
      ctx.beginPath();
      ctx.arc(cx, cy, glowRadius * 0.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // --- 2. Individual motes as fillRect (fast, no per-mote arc/shadow) ---
    ctx.save();
    ctx.shadowBlur = 0;

    // Color layer
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.75;
    for (const m of aliveMotes) {
      ctx.fillRect(m.x - 1.5, m.y - 1.5, 3, 3);
    }

    // Bright white core
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.9;
    for (const m of aliveMotes) {
      ctx.fillRect(m.x - 0.7, m.y - 0.7, 1.4, 1.4);
    }

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Combat flash events
  // ---------------------------------------------------------------------------

  _drawCombatEvents(ctx, world, time) {
    for (let i = world.events.length - 1; i >= 0; i--) {
      const ev = world.events[i];
      if (ev.type !== 'mote_combat') continue;

      const age = time - ev.time;
      if (age > FLASH_DURATION) {
        world.events.splice(i, 1);
        continue;
      }

      const t = 1 - age / FLASH_DURATION; // 1→0 as event ages

      ctx.save();
      ctx.globalAlpha = t * 0.85;
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ffaa00';
      ctx.beginPath();
      ctx.arc(ev.x, ev.y, 4 * t, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
