function render() {
  ctx.clearRect(0, 0, W, H);

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  if (state.overflowActive) {
    grad.addColorStop(0, '#1a0505');
    grad.addColorStop(1, '#0a0a15');
  } else {
    grad.addColorStop(0, '#0a0a1a');
    grad.addColorStop(1, '#05050f');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Background particles
  if (bgParticles.length < 30) {
    bgParticles.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.5,
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.2,
      alpha: Math.random() * 0.3 + 0.1,
    });
  }
  for (const p of bgParticles) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) {
      p.x = Math.random() * W;
      p.y = Math.random() * H;
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(100,100,200,${p.alpha})`;
    ctx.fill();
  }

  // Balls
  for (const b of balls) {
    // Trail
    if (b.trail.length > 1) {
      ctx.globalAlpha = 0.3;
      for (let j = 0; j < b.trail.length - 1; j++) {
        const t = b.trail[j];
        const alpha = (j / b.trail.length) * 0.3;
        ctx.beginPath();
        ctx.arc(t.x, t.y, b.r * 0.6 * (j / b.trail.length), 0, Math.PI * 2);
        ctx.fillStyle = b.color;
        ctx.globalAlpha = alpha;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Ball body
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);

    if (b.golden) {
      // Golden glow
      const glow = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 2);
      glow.addColorStop(0, '#ffd700');
      glow.addColorStop(0.5, '#ffaa00');
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd700';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (b.overflow) {
      // Red pulsing glow
      ctx.fillStyle = '#ff2200';
      ctx.fill();
      ctx.shadowColor = '#ff0000';
      ctx.shadowBlur = 15;
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (b.antiGrav) {
      ctx.fillStyle = '#00ffcc';
      ctx.fill();
      ctx.shadowColor = '#00ffcc';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      // Normal ball with highlight
      const g = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, 0, b.x, b.y, b.r);
      g.addColorStop(0, '#fff');
      g.addColorStop(0.2, b.color);
      g.addColorStop(1, b.color + '88');
      ctx.fillStyle = g;
      ctx.fill();
    }
  }

  // Antimatter balls visual (dark balls near others)
  if (state.upgrades.find(u => u.id === 'antimatter')?.bought) {
    for (const b of balls) {
      if (Math.random() < 0.01) {
        ctx.beginPath();
        ctx.arc(b.x + (Math.random()-0.5)*20, b.y + (Math.random()-0.5)*20, 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(100,0,150,0.5)';
        ctx.fill();
      }
    }
  }

  // Render leechers
  const now_r = Date.now();
  for (const leecher of (state.leechers || [])) {
    const age = (now_r - leecher.spawnTime) / 1000;
    leecher.phase += 0.02;
    const pulse = Math.sin(leecher.phase) * 0.2 + 1;
    const sizeBonus = Math.min(20, age / 30); // grows over time, max +20px
    const r = leecher.r + sizeBonus;

    // Dark purple pulsing glow
    ctx.save();
    ctx.shadowColor = '#9900cc';
    ctx.shadowBlur = 15 * pulse;
    ctx.beginPath();
    ctx.arc(leecher.x, leecher.y, r * pulse, 0, Math.PI * 2);

    const lg = ctx.createRadialGradient(leecher.x, leecher.y, 0, leecher.x, leecher.y, r * pulse);
    lg.addColorStop(0, '#cc00ff');
    lg.addColorStop(0.5, '#660099');
    lg.addColorStop(1, '#220033');
    ctx.fillStyle = lg;
    ctx.fill();

    // Leecher emoji
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = `${Math.floor(r * 1.2)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🦠', leecher.x, leecher.y);

    // Drain indicator
    ctx.fillStyle = '#ff44ff';
    ctx.font = '9px sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(`${formatNum(leecher.totalDrained)}`, leecher.x, leecher.y + r + 12);
    ctx.restore();
  }

  // Floating texts
  for (const ft of floatingTexts) {
    ctx.globalAlpha = ft.life;
    ctx.font = `bold ${12 + ft.life * 4}px 'Segoe UI', sans-serif`;
    ctx.fillStyle = ft.color;
    ctx.textAlign = 'center';
    ctx.fillText(ft.text, ft.x, ft.y);
  }
  ctx.globalAlpha = 1;

  // Rush visual effects
  if (rushActive) {
    ctx.fillStyle = 'rgba(255,100,0,0.05)';
    ctx.fillRect(0, 0, W, H);
    // Lightning effect
    if (Math.random() < 0.1) {
      ctx.strokeStyle = 'rgba(255,200,0,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const sx = Math.random() * W;
      ctx.moveTo(sx, 0);
      let y = 0;
      while (y < H) {
        y += 20 + Math.random() * 30;
        ctx.lineTo(sx + (Math.random()-0.5)*40, y);
      }
      ctx.stroke();
    }
  }

  // Frenzy visual
  if (frenzyActive) {
    ctx.fillStyle = 'rgba(255,215,0,0.03)';
    ctx.fillRect(0, 0, W, H);
  }
}

// ══════════════════════════════════════════════════════
