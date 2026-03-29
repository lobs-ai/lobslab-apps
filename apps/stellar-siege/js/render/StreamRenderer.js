import { getOwnerColor, hexAlpha } from '../utils/colors.js';

/**
 * StreamRenderer — draws energy streams as glowing particle trails.
 *
 * Visual:
 *   - A glowing line from source to stream head position
 *   - Animated "energy packets" (dots) moving along the trail
 *   - Color matches stream owner
 *   - Thicker / brighter near head
 */
export class StreamRenderer {
  constructor(particlePool) {
    this.particles = particlePool;
    this._particleTimers = new Map(); // streamId -> lastParticleTime
  }

  draw(ctx, world, time, dt) {
    for (const stream of world.streams) {
      if (!stream.alive) continue;
      this._drawStream(ctx, stream, world, time, dt);
    }
  }

  _drawStream(ctx, stream, world, time, dt) {
    const source = world.getNodeById(stream.sourceId);
    const target = world.getNodeById(stream.targetId);
    if (!source || !target) return;

    const color = getOwnerColor(stream.owner);
    const sx = source.position.x;
    const sy = source.position.y;
    const hx = stream.headX;
    const hy = stream.headY;

    // Only draw if head has moved a bit
    const dx = hx - sx;
    const dy = hy - sy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 2) return;

    ctx.save();

    // --- Trail line ---
    // Outer glow (wide, very transparent)
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(hx, hy);
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.globalAlpha = 0.12;
    ctx.shadowBlur = 0;
    ctx.stroke();

    // Inner glow (medium)
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(hx, hy);
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.30;
    ctx.shadowBlur = 8;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.stroke();

    // Core line (thin, bright)
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(hx, hy);
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.85;
    ctx.shadowBlur = 12;
    ctx.shadowColor = color;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.restore();

    // --- Animated energy packets along the trail ---
    this._drawPackets(ctx, sx, sy, hx, hy, color, time, stream.id);

    // --- Bright head dot ---
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.shadowBlur = 20;
    ctx.shadowColor = color;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(hx, hy, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(hx, hy, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // --- Spawn trail particles ---
    if (this.particles && !stream.arrived) {
      this._spawnTrailParticles(stream, sx, sy, hx, hy, color, time, dt);
    }
  }

  /**
   * Draw animated "energy packet" dots moving along the stream trail.
   * These are purely cosmetic — no physics, just lerp along the line.
   */
  _drawPackets(ctx, sx, sy, hx, hy, color, time, streamId) {
    const PACKET_COUNT = 4;
    const PACKET_SPEED = 1.2; // full trail traversal per second

    ctx.save();
    ctx.shadowBlur = 10;
    ctx.shadowColor = color;
    ctx.fillStyle = color;

    for (let i = 0; i < PACKET_COUNT; i++) {
      // Each packet is offset in phase so they're evenly spaced
      const phase = (time * PACKET_SPEED + i / PACKET_COUNT) % 1;
      const px = sx + (hx - sx) * phase;
      const py = sy + (hy - sy) * phase;

      // Size pulses slightly
      const size = 2 + Math.sin(time * 4 + i) * 0.5;

      ctx.globalAlpha = 0.4 + 0.4 * Math.sin(time * 3 + i * 1.5);
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /**
   * Spawn small particles along the trail for sparkle/exhaust effect.
   */
  _spawnTrailParticles(stream, sx, sy, hx, hy, color, time, dt) {
    // Rate-limit particle spawning per stream
    const lastTime = this._particleTimers.get(stream.id) || 0;
    if (time - lastTime < 0.06) return; // ~16 particles/sec per stream
    this._particleTimers.set(stream.id, time);

    // Spawn near the head
    const jitter = 3;
    this.particles.spawn(
      hx + (Math.random() - 0.5) * jitter,
      hy + (Math.random() - 0.5) * jitter,
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 20,
      color,
      0.4 + Math.random() * 0.3,
      1.5
    );
  }
}
