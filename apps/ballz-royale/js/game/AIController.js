import { MAX_POWER } from '../constants.js';

// Aim at the ghost-ball contact point that sends an opponent into a pocket.
export class AIController {
  computeShot(player, balls, arena) {
    const mine = player.getAliveBalls(balls);
    const enemies = balls.filter(b => b.alive && b.owner !== player.index);
    if (!mine.length || !enemies.length) return null;
    let best = null;
    for (const ball of mine) for (const target of enemies) for (const pocket of arena.pockets) {
      const toPocket = Math.hypot(pocket.x - target.x, pocket.y - target.y);
      if (toPocket < 1) continue;
      const nx = (pocket.x - target.x) / toPocket;
      const ny = (pocket.y - target.y) / toPocket;
      const x = target.x - nx * (ball.radius + target.radius);
      const y = target.y - ny * (ball.radius + target.radius);
      const distance = Math.hypot(x - ball.x, y - ball.y);
      const alignment = ((x - ball.x) * nx + (y - ball.y) * ny) / Math.max(1, distance);
      if (alignment < 0.25 || !arena.contains(x, y)) continue;
      const blocked = balls.some(other => {
        if (!other.alive || other === ball || other === target) return false;
        const t = ((other.x - ball.x) * (x - ball.x) + (other.y - ball.y) * (y - ball.y)) / (distance * distance);
        return t > 0 && t < 1 && Math.hypot(other.x - ball.x - t * (x - ball.x), other.y - ball.y - t * (y - ball.y)) < ball.radius + other.radius;
      });
      if (blocked) continue;
      const score = alignment * 600 - distance * 0.35 - toPocket * 0.8;
      if (!best || score > best.score) best = { ball, x, y, distance, toPocket, alignment, score };
    }
    if (!best) {
      const ball = mine[Math.floor(Math.random() * mine.length)];
      const target = enemies.reduce((a, b) => Math.hypot(a.x-ball.x,a.y-ball.y) < Math.hypot(b.x-ball.x,b.y-ball.y) ? a : b);
      best = { ball, x: target.x, y: target.y, distance: Math.hypot(target.x-ball.x,target.y-ball.y), toPocket: 100, alignment: 1 };
    }
    return {
      ball: best.ball,
      angle: Math.atan2(best.y - best.ball.y, best.x - best.ball.x) + (Math.random() - 0.5) * 0.025,
      power: Math.min(MAX_POWER, Math.max(8, (best.distance + best.toPocket / best.alignment) * 0.075 + 3)),
      itemIndex: player.items.length && Math.random() < 0.55 ? 0 : -1,
    };
  }
}
