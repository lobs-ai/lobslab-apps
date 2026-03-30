// ── Physics Engine ──
// Handles ball movement, friction, collisions, wall bouncing, and pocket detection.

import {
  FRICTION, MIN_SPEED, PHYSICS_STEPS,
  WALL_RESTITUTION, BALL_RESTITUTION,
  EXPLOSION_RADIUS, EXPLOSION_FORCE,
} from '../constants.js';
import { dist } from '../utils.js';

/** Single physics frame. Returns an array of events that happened. */
export function simulateStep(balls, arena, stormRadius, dt) {
  const events = [];
  const subDt = dt / PHYSICS_STEPS;

  for (let s = 0; s < PHYSICS_STEPS; s++) {
    // Move & apply friction
    for (const ball of balls) {
      if (!ball.alive) continue;
      integrateBall(ball, subDt);
      applyStormForce(ball, arena, stormRadius);
      const wallEvt = resolveWallCollision(ball, arena);
      if (wallEvt) events.push(wallEvt);
      const pocketEvt = checkPockets(ball, arena);
      if (pocketEvt) events.push(pocketEvt);
    }

    // Ball-ball collisions
    const collisionEvts = resolveBallCollisions(balls);
    events.push(...collisionEvts);
  }

  return events;
}

function integrateBall(ball, dt) {
  ball.x += ball.vx * dt * 60;
  ball.y += ball.vy * dt * 60;
  ball.vx *= FRICTION;
  ball.vy *= FRICTION;
  if (Math.abs(ball.vx) < MIN_SPEED * 0.1) ball.vx = 0;
  if (Math.abs(ball.vy) < MIN_SPEED * 0.1) ball.vy = 0;
}

function applyStormForce(ball, arena, stormRadius) {
  const force = arena.getStormForce(ball.x, ball.y, stormRadius);
  ball.vx += force.fx;
  ball.vy += force.fy;
}

function resolveWallCollision(ball, arena) {
  const dx = ball.x - arena.cx;
  const dy = ball.y - arena.cy;
  const d = Math.sqrt(dx * dx + dy * dy);

  if (d + ball.radius > arena.radius) {
    const nx = dx / d;
    const ny = dy / d;
    ball.x = arena.cx + nx * (arena.radius - ball.radius);
    ball.y = arena.cy + ny * (arena.radius - ball.radius);

    const dot = ball.vx * nx + ball.vy * ny;
    if (dot > 0) {
      ball.vx -= 2 * dot * nx * WALL_RESTITUTION;
      ball.vy -= 2 * dot * ny * WALL_RESTITUTION;
      return {
        type: 'wallHit',
        ball,
        x: ball.x + nx * ball.radius,
        y: ball.y + ny * ball.radius,
        speed: Math.abs(dot),
      };
    }
  }
  return null;
}

function checkPockets(ball, arena) {
  if (!ball.alive) return null;
  for (const pocket of arena.pockets) {
    if (dist(ball.x, ball.y, pocket.x, pocket.y) < pocket.radius) {
      if (ball.shielded) {
        // Shield consumes the pocket event — bounce ball away from pocket
        ball.shielded = false;
        const dx = ball.x - pocket.x;
        const dy = ball.y - pocket.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        ball.vx += (dx / d) * 6;
        ball.vy += (dy / d) * 6;
        return { type: 'shieldBlock', ball, pocket };
      }
      ball.kill();
      return { type: 'pocketed', ball, pocket };
    }
  }
  return null;
}

function resolveBallCollisions(balls) {
  const events = [];

  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i];
      const b = balls[j];
      if (!a.alive || !b.alive) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const minDist = a.radius + b.radius;

      if (d >= minDist || d === 0) continue;

      // Ghost: phase through on first collision
      if (a.ghost && !a.ghostUsed) { a.ghostUsed = true; a.ghost = false; continue; }
      if (b.ghost && !b.ghostUsed) { b.ghostUsed = true; b.ghost = false; continue; }

      const nx = dx / d;
      const ny = dy / d;

      // Separate overlapping balls
      const overlap = minDist - d;
      const totalMass = a.mass + b.mass;
      a.x -= nx * overlap * (b.mass / totalMass);
      a.y -= ny * overlap * (b.mass / totalMass);
      b.x += nx * overlap * (a.mass / totalMass);
      b.y += ny * overlap * (a.mass / totalMass);

      // Elastic collision impulse
      const dvx = a.vx - b.vx;
      const dvy = a.vy - b.vy;
      const dvDotN = dvx * nx + dvy * ny;

      if (dvDotN <= 0) continue;

      const impulse = (2 * dvDotN * BALL_RESTITUTION) / totalMass;
      a.vx -= impulse * b.mass * nx;
      a.vy -= impulse * b.mass * ny;
      b.vx += impulse * a.mass * nx;
      b.vy += impulse * a.mass * ny;

      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const speed = Math.sqrt(dvx * dvx + dvy * dvy);

      events.push({ type: 'ballCollision', a, b, cx, cy, speed });

      // Bomb: explode on contact
      if (a.bomb) {
        a.bomb = false;
        events.push({ type: 'explosion', x: a.x, y: a.y, source: a });
      }
      if (b.bomb) {
        b.bomb = false;
        events.push({ type: 'explosion', x: b.x, y: b.y, source: b });
      }

      // Magnet: pull nearby balls toward impact point
      if (a.magnet || b.magnet) {
        const magnetBall = a.magnet ? a : b;
        magnetBall.magnet = false;
        events.push({ type: 'magnetPull', x: cx, y: cy, source: magnetBall });
      }
    }
  }

  return events;
}

/** Apply an explosion at (ex, ey), pushing all balls away. */
export function applyExplosion(balls, ex, ey, source) {
  for (const ball of balls) {
    if (!ball.alive || ball === source) continue;
    const dx = ball.x - ex;
    const dy = ball.y - ey;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < EXPLOSION_RADIUS && d > 0) {
      const strength = (1 - d / EXPLOSION_RADIUS) * EXPLOSION_FORCE;
      ball.vx += (dx / d) * strength;
      ball.vy += (dy / d) * strength;
    }
  }
}

/** Apply magnet pull — nearby balls get drawn toward point. */
export function applyMagnetPull(balls, mx, my, source) {
  const MAGNET_RADIUS = 200;
  const MAGNET_FORCE = 10;
  for (const ball of balls) {
    if (!ball.alive || ball === source) continue;
    const dx = mx - ball.x;
    const dy = my - ball.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < MAGNET_RADIUS && d > 0) {
      const strength = (1 - d / MAGNET_RADIUS) * MAGNET_FORCE;
      ball.vx += (dx / d) * strength;
      ball.vy += (dy / d) * strength;
    }
  }
}

/** Check if all alive balls are stopped. */
export function allBallsStopped(balls) {
  return balls.every(b => !b.alive || !b.isMoving);
}
