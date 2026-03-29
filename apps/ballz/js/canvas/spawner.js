//  CANVAS & PHYSICS
// ══════════════════════════════════════════════════════

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let W, H;

// balls, floatingTexts, timers etc. declared in EARLY DECLARATIONS

function resize() {
  W = canvas.width = canvas.clientWidth;
  H = canvas.height = canvas.clientHeight;
}
window.addEventListener('resize', resize);

function spawnBall(x, y, opts = {}) {
  const baseR = (state.upgrades.find(u => u.id === 'bigBalls')?.bought) ? 14 : 8;
  const r = opts.r || baseR + Math.random() * 4;
  const isGolden = opts.golden || false;
  const isOverflow = opts.overflow || false;
  const isAntiGrav = opts.antiGrav || false;
  const isRush = opts.rush || false;

  // Color
  let color;
  if (isGolden) color = '#ffd700';
  else if (isOverflow) color = '#ff0000';
  else if (isAntiGrav) color = '#00ffcc';
  else if (state.upgrades.find(u => u.id === 'rainbow')?.bought) {
    color = `hsl(${Math.random() * 360}, 80%, 60%)`;
  } else {
    const colors = ['#4d96ff', '#ff6b6b', '#ffd93d', '#6bcb77', '#cc65fe', '#ff9f43'];
    color = colors[Math.floor(Math.random() * colors.length)];
  }

  const gravity = (state.upgrades.find(u => u.id === 'gravity')?.bought) ? 0.04 : 0.12;
  const bounce = hasResearch('elasticBalls') ? -0.85 : -0.6;

  balls.push({
    x: x || Math.random() * W,
    y: y || -10,
    vx: (Math.random() - 0.5) * 3,
    vy: opts.vy || Math.random() * 2,
    r,
    color,
    gravity: isAntiGrav ? -0.04 : gravity,
    bounce,
    golden: isGolden,
    overflow: isOverflow,
    antiGrav: isAntiGrav,
    rush: isRush,
    trail: [],
    life: 0,
  });

  // Cap balls for performance
  const maxBalls = 200;
  if (balls.length > maxBalls) balls.splice(0, balls.length - maxBalls);
}

function spawnFloatingText(x, y, text, color = '#ffd93d') {
  floatingTexts.push({ x, y, text, color, life: 1.0 });
}

function spawnLeecher() {
  const side = Math.random() < 0.5 ? 'left' : 'right';
  state.leechers.push({
    id: Date.now(),
    spawnTime: Date.now(),
    totalDrained: 0,
    x: side === 'left' ? 30 : W - 30,
    y: 100 + Math.random() * (H - 200),
    r: 12,
    phase: Math.random() * Math.PI * 2,
  });
  showToast('🦠 A Leecher appeared! Click it to pop it for a ball burst!', 'event', '🦠');
}

// ── Click handling ──
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  // Check challenge: no click
