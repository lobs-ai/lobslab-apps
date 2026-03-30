// ── Renderer ──
// All canvas drawing in one place.

import { MAX_POWER, POCKET_RADIUS, ITEM_RADIUS } from '../constants.js';
import { lighten, darken } from '../utils.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  /** Main render pass. */
  draw(state) {
    const { ctx } = this;
    const { arena, storm, balls, players, particles, itemPickups,
            effects, currentPlayer, phase, selectedBall, aimInfo,
            powerBarEl, powerFillEl } = state;

    ctx.save();

    // Screen shake offset
    if (effects.shakeMag > 0) {
      ctx.translate(effects.shakeX, effects.shakeY);
    }

    // Background
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(-10, -10, this.canvas.width + 20, this.canvas.height + 20);

    this._drawArena(arena);
    this._drawStorm(arena, storm);
    this._drawPockets(arena);
    this._drawItems(itemPickups);
    this._drawTrails(particles.trails);
    this._drawBalls(balls, players, selectedBall);
    this._drawAim(phase, selectedBall, aimInfo, powerBarEl, powerFillEl);
    this._drawSelectHints(phase, balls, players, currentPlayer);
    this._drawParticles(particles.particles);

    ctx.restore();
  }

  _drawArena(arena) {
    const { ctx } = this;
    // Felt surface
    ctx.beginPath();
    ctx.arc(arena.cx, arena.cy, arena.radius, 0, Math.PI * 2);
    const feltGrad = ctx.createRadialGradient(arena.cx, arena.cy, 0, arena.cx, arena.cy, arena.radius);
    feltGrad.addColorStop(0, '#1a3d2a');
    feltGrad.addColorStop(1, '#0d2818');
    ctx.fillStyle = feltGrad;
    ctx.fill();

    // Border
    ctx.beginPath();
    ctx.arc(arena.cx, arena.cy, arena.radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#2a5a3a';
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  _drawStorm(arena, storm) {
    if (storm.currentRadius >= arena.radius) return;
    const { ctx } = this;
    const time = Date.now() / 1000;

    // Danger zone fill
    ctx.save();
    ctx.beginPath();
    ctx.arc(arena.cx, arena.cy, arena.radius, 0, Math.PI * 2);
    ctx.arc(arena.cx, arena.cy, storm.currentRadius, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(255, 50, 50, 0.15)';
    ctx.fill();

    // Animated storm ring
    const pulse = 0.5 + Math.sin(time * 3) * 0.3;
    ctx.beginPath();
    ctx.arc(arena.cx, arena.cy, storm.currentRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 80, 50, ${0.5 + pulse * 0.3})`;
    ctx.lineWidth = 3 + pulse * 2;
    ctx.stroke();

    // Energy particles on the storm ring
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2 + time * 0.5;
      const r = storm.currentRadius + Math.sin(time * 5 + i) * 4;
      ctx.beginPath();
      ctx.arc(
        arena.cx + Math.cos(a) * r,
        arena.cy + Math.sin(a) * r,
        1.5 + Math.sin(time * 3 + i) * 0.5,
        0, Math.PI * 2
      );
      ctx.fillStyle = `rgba(255, ${100 + Math.sin(i) * 60 | 0}, 50, ${0.3 + pulse * 0.3})`;
      ctx.fill();
    }
    ctx.restore();

    // Safe zone hint ring
    ctx.beginPath();
    ctx.arc(arena.cx, arena.cy, storm.currentRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(100, 200, 100, 0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  _drawPockets(arena) {
    const { ctx } = this;
    for (const pocket of arena.pockets) {
      ctx.beginPath();
      ctx.arc(pocket.x, pocket.y, POCKET_RADIUS, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(pocket.x, pocket.y, 0, pocket.x, pocket.y, POCKET_RADIUS);
      grad.addColorStop(0, '#000');
      grad.addColorStop(0.7, '#111');
      grad.addColorStop(1, '#1a3d2a');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = '#0a2a1a';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  _drawItems(pickups) {
    const { ctx } = this;
    const time = Date.now() / 1000;
    for (const item of pickups) {
      const bob = Math.sin(time * 3 + item.x) * 3;
      const glow = 0.4 + Math.sin(time * 4 + item.y) * 0.2;
      ctx.save();
      ctx.shadowColor = '#ffd93d';
      ctx.shadowBlur = 15 + Math.sin(time * 3) * 5;
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.7 + glow;
      ctx.fillText(item.type.emoji, item.x, item.y + bob);
      ctx.restore();
    }
  }

  _drawTrails(trails) {
    const { ctx } = this;
    for (const t of trails) {
      ctx.beginPath();
      ctx.arc(t.x, t.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = t.color;
      ctx.globalAlpha = (t.life / 20) * 0.3;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawBalls(balls, players, selectedBall) {
    const { ctx } = this;
    for (const ball of balls) {
      if (!ball.alive) continue;
      const pc = players[ball.owner].color;
      const isSelected = ball === selectedBall;

      // Glow
      ctx.save();
      ctx.shadowColor = pc.glow;
      ctx.shadowBlur = isSelected ? 25 : 10;

      // Body
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(
        ball.x - ball.radius * 0.3, ball.y - ball.radius * 0.3, 0,
        ball.x, ball.y, ball.radius
      );
      grad.addColorStop(0, lighten(pc.main, 40));
      grad.addColorStop(0.7, pc.main);
      grad.addColorStop(1, darken(pc.main, 30));
      ctx.fillStyle = grad;
      ctx.fill();

      // Outline
      ctx.strokeStyle = isSelected ? '#fff' : pc.glow;
      ctx.lineWidth = isSelected ? 3 : 1.5;
      ctx.stroke();
      ctx.restore();

      // Ghost ring
      if (ball.ghost) {
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(200,200,255,0.3)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Shield ring
      if (ball.shielded) {
        const time = Date.now() / 1000;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius + 5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(100,200,255,${0.4 + Math.sin(time * 4) * 0.2})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Heavy indicator
      if (ball.mass > 1) {
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText('H', ball.x, ball.y);
      }

      // Bomb indicator
      if (ball.bomb) {
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💣', ball.x, ball.y - ball.radius - 8);
      }

      // Magnet indicator
      if (ball.magnet) {
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🧲', ball.x, ball.y - ball.radius - 8);
      }
    }
  }

  _drawAim(phase, selectedBall, aimInfo, powerBarEl, powerFillEl) {
    const { ctx } = this;

    if (phase === 'aim' && selectedBall && aimInfo) {
      const { angle, power, pullX, pullY } = aimInfo;

      // Power bar
      if (powerBarEl) powerBarEl.style.display = 'block';
      if (powerFillEl) powerFillEl.style.width = `${(power / MAX_POWER) * 100}%`;

      if (power > 0.5) {
        const lineLen = 80 + power * 12;
        const endX = selectedBall.x + Math.cos(angle) * lineLen;
        const endY = selectedBall.y + Math.sin(angle) * lineLen;

        // Trajectory dotted line
        ctx.beginPath();
        ctx.setLineDash([6, 6]);
        ctx.moveTo(selectedBall.x, selectedBall.y);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);

        // Direction dot
        ctx.beginPath();
        ctx.arc(endX, endY, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fill();

        // Slingshot pull line
        ctx.beginPath();
        ctx.setLineDash([3, 5]);
        ctx.moveTo(selectedBall.x, selectedBall.y);
        ctx.lineTo(pullX, pullY);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else if (phase === 'aim' && selectedBall && !aimInfo) {
      // Hint text
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('Click & drag to aim', selectedBall.x, selectedBall.y - selectedBall.radius - 20);
    }

    // Hide power bar when not aiming
    if (phase !== 'aim' || !aimInfo) {
      if (powerBarEl) powerBarEl.style.display = 'none';
    }
  }

  _drawSelectHints(phase, balls, players, currentPlayer) {
    if (phase !== 'select') return;
    const player = players[currentPlayer];
    if (player.isAI) return;
    const { ctx } = this;

    for (const ball of balls) {
      if (!ball.alive || ball.owner !== currentPlayer) continue;
      const pulse = 0.3 + Math.sin(Date.now() / 300 + ball.id) * 0.15;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius + 6, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${pulse})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  _drawParticles(particles) {
    const { ctx } = this;
    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife), 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
