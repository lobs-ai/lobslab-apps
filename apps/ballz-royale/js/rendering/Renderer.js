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
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Main render pass. */
  draw(state) {
    const { ctx } = this;
    const { arena, storm, balls, players, particles, itemPickups,
            effects, currentPlayer, phase, selectedBall, aimInfo,
            powerBarEl, powerFillEl } = state;

    ctx.save();
    this.state = state;

    // Screen shake offset
    if (effects.shakeMag > 0) {
      ctx.translate(effects.shakeX, effects.shakeY);
    }

    // Background
    ctx.fillStyle = '#101d28';
    ctx.fillRect(-10, -10, this.width + 20, this.height + 20);

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
    const { left, right, top, bottom, tableW, tableH, cx, cy } = arena;
    const railW = Math.max(14, tableW * 0.028);

    // Outer wood frame
    ctx.shadowColor = '#0008';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 18;
    ctx.fillStyle = '#70503c';
    ctx.beginPath();
    ctx.roundRect(left - railW * 1.8, top - railW * 1.8, tableW + railW * 3.6, tableH + railW * 3.6, 10);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Rail cushions (dark green)
    ctx.fillStyle = '#103f52';
    ctx.beginPath();
    ctx.roundRect(left - railW, top - railW, tableW + railW * 2, tableH + railW * 2, 6);
    ctx.fill();

    // Felt surface
    const feltGrad = ctx.createLinearGradient(left, top, right, bottom);
    feltGrad.addColorStop(0,   '#1c6883');
    feltGrad.addColorStop(0.5, '#24778d');
    feltGrad.addColorStop(1,   '#15546c');
    ctx.fillStyle = feltGrad;
    ctx.fillRect(left, top, tableW, tableH);

    // Subtle felt grain lines
    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    for (let x = left + 20; x < right; x += 20) {
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Center spot
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fill();

    // Center line (baulk line)
    ctx.beginPath();
    ctx.moveTo(left + tableW * 0.25, top);
    ctx.lineTo(left + tableW * 0.25, bottom);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Table border (inner edge of rail)
    ctx.strokeStyle = '#0d394d';
    ctx.lineWidth = 2;
    ctx.strokeRect(left, top, tableW, tableH);
    ctx.font = `900 ${Math.max(15, tableW * 0.04)}px 'Arial Black', sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e1f4e412';
    ctx.fillText('BALLZ ROYALE', cx, cy + tableW * 0.014);
    // Brass rail sights, useful for lining up bank shots.
    for (const t of [0.125, 0.25, 0.375, 0.625, 0.75, 0.875]) {
      for (const y of [top - railW * 1.4, bottom + railW * 1.4]) {
        ctx.fillStyle = '#e9be70';
        ctx.beginPath();
        ctx.arc(left + tableW * t, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _drawStorm(arena, storm) {
    if (storm.percent === 100) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(arena.left, arena.top, arena.tableW, arena.tableH);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(arena.left, arena.top, arena.tableW, arena.tableH);
    ctx.arc(arena.cx, arena.cy, storm.currentRadius, 0, Math.PI * 2, true);
    ctx.fillStyle = '#d85b6c55';
    ctx.fill('evenodd');
    ctx.beginPath();
    ctx.arc(arena.cx, arena.cy, storm.currentRadius, 0, Math.PI * 2);
    ctx.strokeStyle = '#f6a78e';
    ctx.lineWidth = 2;
    ctx.setLineDash([9, 7]);
    ctx.stroke();
    ctx.restore();
  }

  _drawPockets(arena) {
    const { ctx } = this;
    for (const pocket of arena.pockets) {
      const r = pocket.radius;
      // Deep black hole
      ctx.beginPath();
      ctx.arc(pocket.x, pocket.y, r, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(pocket.x, pocket.y, 0, pocket.x, pocket.y, r);
      grad.addColorStop(0,   '#000');
      grad.addColorStop(0.6, '#0a0a0a');
      grad.addColorStop(1,   '#1a3d2a');
      ctx.fillStyle = grad;
      ctx.fill();
      // Leather rim
      ctx.strokeStyle = '#3d1f00';
      ctx.lineWidth = 3;
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
      ctx.shadowBlur = isSelected ? 18 : 3;

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
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = '#fff3df';
      ctx.fill();
      ctx.fillStyle = '#24303b';
      ctx.font = `800 ${Math.max(7, ball.radius * 0.65)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(ball.owner + 1), ball.x, ball.y + 0.5);

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
        const dx = Math.cos(angle), dy = Math.sin(angle);
        const { arena, balls } = this.state;
        let lineLen = power * 16;
        let target = null;
        const r = selectedBall.radius;
        const wallX = dx > 0 ? (arena.right - r - selectedBall.x) / dx : dx < 0 ? (arena.left + r - selectedBall.x) / dx : Infinity;
        const wallY = dy > 0 ? (arena.bottom - r - selectedBall.y) / dy : dy < 0 ? (arena.top + r - selectedBall.y) / dy : Infinity;
        lineLen = Math.min(lineLen, wallX, wallY);
        for (const ball of balls) {
          if (!ball.alive || ball === selectedBall) continue;
          const x = ball.x - selectedBall.x, y = ball.y - selectedBall.y;
          const projection = x * dx + y * dy;
          const perpendicularSq = x * x + y * y - projection * projection;
          const radius = r + ball.radius;
          if (projection <= 0 || perpendicularSq > radius * radius) continue;
          const hit = projection - Math.sqrt(radius * radius - perpendicularSq);
          if (hit >= 0 && hit < lineLen) { lineLen = hit; target = ball; }
        }
        const endX = selectedBall.x + dx * lineLen;
        const endY = selectedBall.y + dy * lineLen;

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
        ctx.beginPath();
        ctx.arc(endX, endY, r, 0, Math.PI * 2);
        ctx.strokeStyle = '#fff9';
        ctx.lineWidth = 1;
        ctx.stroke();
        if (target) {
          const normal = Math.atan2(target.y - endY, target.x - endX);
          ctx.beginPath();
          ctx.moveTo(target.x, target.y);
          ctx.lineTo(target.x + Math.cos(normal) * 70, target.y + Math.sin(normal) * 70);
          ctx.strokeStyle = '#e9be70';
          ctx.lineWidth = 3;
          ctx.stroke();
        }

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
