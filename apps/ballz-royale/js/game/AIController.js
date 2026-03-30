// ── AI Controller ──
// Simple AI that picks a ball, aims at an enemy, and shoots.

import { MAX_POWER, AI_ACCURACY_SPREAD } from '../constants.js';
import { dist, randRange } from '../utils.js';

export class AIController {
  /**
   * Compute an AI shot.
   * @param {Player} player - the AI player
   * @param {Ball[]} allBalls - all game balls
   * @param {Arena} arena - game arena
   * @returns {{ ball, angle, power, itemIndex }} or null if no shot possible
   */
  computeShot(player, allBalls, arena) {
    const myBalls = player.getAliveBalls(allBalls);
    const enemyBalls = allBalls.filter(b => b.alive && b.owner !== player.index);

    if (myBalls.length === 0 || enemyBalls.length === 0) return null;

    // Pick the ball closest to an enemy
    let bestBall = null;
    let bestTarget = null;
    let bestDist = Infinity;

    for (const ball of myBalls) {
      for (const enemy of enemyBalls) {
        const d = dist(ball.x, ball.y, enemy.x, enemy.y);
        if (d < bestDist) {
          bestDist = d;
          bestBall = ball;
          bestTarget = enemy;
        }
      }
    }

    if (!bestBall) {
      bestBall = myBalls[0];
    }

    let angle;
    if (bestTarget && Math.random() > 0.2) {
      // Aim at the target with some inaccuracy
      angle = Math.atan2(bestTarget.y - bestBall.y, bestTarget.x - bestBall.x);
      angle += (Math.random() - 0.5) * AI_ACCURACY_SPREAD;

      // Smarter: if target is near a pocket, aim to push toward pocket
      const nearestPocket = findNearestPocket(bestTarget, arena);
      if (nearestPocket && dist(bestTarget.x, bestTarget.y, nearestPocket.x, nearestPocket.y) < 120) {
        // Aim to push target toward pocket
        const pocketAngle = Math.atan2(nearestPocket.y - bestTarget.y, nearestPocket.x - bestTarget.x);
        const pushAngle = pocketAngle; // We want to hit the target on the opposite side
        const hitAngle = Math.atan2(bestTarget.y - bestBall.y, bestTarget.x - bestBall.x);
        // Blend between direct and pocket-push angles
        angle = hitAngle * 0.6 + pushAngle * 0.4;
        angle += (Math.random() - 0.5) * AI_ACCURACY_SPREAD * 0.5;
      }
    } else {
      // Random direction
      angle = Math.random() * Math.PI * 2;
    }

    // Power based on distance
    const idealPower = Math.min(MAX_POWER, bestDist / 15 + 3);
    const power = Math.max(5, idealPower + randRange(-3, 3));

    // Item use: use bomb if available and target is clustered
    let itemIndex = -1;
    if (player.items.length > 0 && Math.random() > 0.4) {
      // Prefer bomb if enemies are clustered near target
      const bombIdx = player.items.findIndex(i => i.id === 'bomb');
      if (bombIdx >= 0 && countNearby(bestTarget, enemyBalls, 100) >= 2) {
        itemIndex = bombIdx;
      } else {
        // Use first available item
        itemIndex = 0;
      }
    }

    return { ball: bestBall, angle, power, itemIndex };
  }
}

function findNearestPocket(ball, arena) {
  let nearest = null;
  let nearestDist = Infinity;
  for (const pocket of arena.pockets) {
    const d = dist(ball.x, ball.y, pocket.x, pocket.y);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = pocket;
    }
  }
  return nearest;
}

function countNearby(target, balls, radius) {
  return balls.filter(b => b !== target && dist(b.x, b.y, target.x, target.y) < radius).length;
}
