/**
 * Distance between two points.
 */
export function dist(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Squared distance (cheaper, good for comparisons).
 */
export function distSq(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

/**
 * Normalized direction vector from a to b.
 */
export function direction(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d === 0) return { x: 0, y: 0 };
  return { x: dx / d, y: dy / d };
}

/**
 * Linear interpolation.
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Clamp value between min and max.
 */
export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Random float in [min, max).
 */
export function randRange(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Random integer in [min, max].
 */
export function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

/**
 * Point inside circle test.
 */
export function pointInCircle(point, center, radius) {
  return distSq(point, center) <= radius * radius;
}

/**
 * Angle from a to b in radians.
 */
export function angle(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/**
 * Distance from point (px, py) to the line segment (ax, ay)→(bx, by).
 * Returns 0 if the point projects onto the segment, otherwise the
 * distance to the nearest endpoint.
 */
export function pointToSegmentDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

/**
 * Poisson disk sampling — returns array of {x, y} positions.
 * Fills a rectangle [0, width] x [0, height] with points
 * that are at least `minDist` apart.
 */
export function poissonDisk(width, height, minDist, maxAttempts = 30) {
  const cellSize = minDist / Math.SQRT2;
  const gridW = Math.ceil(width / cellSize);
  const gridH = Math.ceil(height / cellSize);
  const grid = new Array(gridW * gridH).fill(-1);
  const points = [];
  const active = [];

  function gridIndex(x, y) {
    return Math.floor(x / cellSize) + Math.floor(y / cellSize) * gridW;
  }

  // Seed point
  const seed = { x: width / 2, y: height / 2 };
  points.push(seed);
  active.push(0);
  grid[gridIndex(seed.x, seed.y)] = 0;

  while (active.length > 0) {
    const idx = randInt(0, active.length - 1);
    const point = points[active[idx]];
    let found = false;

    for (let i = 0; i < maxAttempts; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = minDist + Math.random() * minDist;
      const nx = point.x + Math.cos(a) * r;
      const ny = point.y + Math.sin(a) * r;

      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

      const gi = Math.floor(nx / cellSize);
      const gj = Math.floor(ny / cellSize);
      let tooClose = false;

      for (let di = -2; di <= 2 && !tooClose; di++) {
        for (let dj = -2; dj <= 2 && !tooClose; dj++) {
          const ni = gi + di;
          const nj = gj + dj;
          if (ni < 0 || ni >= gridW || nj < 0 || nj >= gridH) continue;
          const pidx = grid[ni + nj * gridW];
          if (pidx === -1) continue;
          if (distSq({ x: nx, y: ny }, points[pidx]) < minDist * minDist) {
            tooClose = true;
          }
        }
      }

      if (!tooClose) {
        const newIdx = points.length;
        points.push({ x: nx, y: ny });
        active.push(newIdx);
        grid[gi + gj * gridW] = newIdx;
        found = true;
        break;
      }
    }

    if (!found) {
      active.splice(idx, 1);
    }
  }

  return points;
}
