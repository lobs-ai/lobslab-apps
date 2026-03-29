//  PHYSICS & RENDERING
// ══════════════════════════════════════════════════════

function updatePhysics(dt) {
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];
    b.vy += b.gravity;
    b.x += b.vx;
    b.y += b.vy;
    b.life += dt;

    // Trail
    if (state.upgrades.find(u => u.id === 'ballTrails')?.bought) {
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 8) b.trail.shift();
    }

    // Bounce off walls
    if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.8; }
    if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.8; }

    // Bounce off floor
    if (b.y > H - b.r) {
      b.y = H - b.r;
      b.vy *= b.bounce;
      b.vx *= 0.95;
      if (Math.abs(b.vy) < 0.5) b.vy = 0;
    }

    // Anti-gravity: remove at top
    if (b.antiGrav && b.y < -20) {
      balls.splice(i, 1);
      continue;
    }

    // Remove old balls
    if (b.life > 20 || b.y > H + 50) {
      balls.splice(i, 1);
    }
  }

  // Floating texts
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.y -= 40 * dt;
    ft.life -= dt * 0.8;
    if (ft.life <= 0) floatingTexts.splice(i, 1);
  }
}

