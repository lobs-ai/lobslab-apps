import { createNode, resetNodeIds } from '../game/Node.js';
import { MAP_SIZES, MAP_NODE_MIN_DISTANCE } from '../utils/constants.js';
import { poissonDisk, dist, randRange, randInt } from '../utils/math.js';

/**
 * Generate a procedural star system map.
 *
 * Steps:
 *   1. Determine map dimensions from mapSize config
 *   2. Place player starting positions evenly on a circle around center
 *   3. Fill remaining positions with Poisson disk sampling
 *   4. Assign node types based on proximity to center / clusters
 *   5. Give each player a star + 2 nearby planets to start
 *   6. Remaining nodes are neutral planets/asteroids
 */
export function generateMap({ playerCount, mapSize }) {
  resetNodeIds();

  const sizeConfig = MAP_SIZES[mapSize] || MAP_SIZES.medium;
  const { width, height, nodeCount } = sizeConfig;
  const cx = width / 2;
  const cy = height / 2;

  const nodes = [];

  // --- Step 1: Player start positions ---
  // Place starting stars evenly on a circle around center
  const startRadius = Math.min(width, height) * 0.32;
  const playerPositions = [];

  for (let i = 0; i < playerCount; i++) {
    const angle = (i / playerCount) * Math.PI * 2 - Math.PI / 2;
    // Add slight jitter so it doesn't look too rigid
    const jitter = startRadius * 0.08;
    playerPositions.push({
      x: cx + Math.cos(angle) * startRadius + randRange(-jitter, jitter),
      y: cy + Math.sin(angle) * startRadius + randRange(-jitter, jitter),
    });
  }

  // --- Step 2: Generate all map positions with Poisson disk ---
  const margin = MAP_NODE_MIN_DISTANCE;
  const allPositions = poissonDisk(
    width - margin * 2,
    height - margin * 2,
    MAP_NODE_MIN_DISTANCE,
    30
  ).map(p => ({ x: p.x + margin, y: p.y + margin }));

  // Remove positions too close to player starts (we'll manually place those)
  const usedPositions = [];
  for (const pp of playerPositions) {
    usedPositions.push(pp);
  }

  // Filter out positions too close to player starting positions
  const freePositions = allPositions.filter(p => {
    for (const used of usedPositions) {
      if (dist(p, used) < MAP_NODE_MIN_DISTANCE * 1.2) return false;
    }
    return true;
  });

  // --- Step 3: Determine how many extra nodes we need ---
  // Each player gets: 1 star + 2 planets = 3 nodes
  const ownedCount = playerCount * 3;
  const neutralCount = Math.max(0, nodeCount - ownedCount);

  // --- Step 4: Create player-owned starting nodes ---
  for (let pid = 0; pid < playerCount; pid++) {
    const startPos = playerPositions[pid];

    // Home star
    nodes.push(createNode({
      type: 'star',
      owner: pid,
      energy: 100,
      x: startPos.x,
      y: startPos.y,
    }));

    // 2 nearby planets — find closest free positions
    const nearby = freePositions
      .filter(p => !isUsed(p, usedPositions))
      .sort((a, b) => dist(a, startPos) - dist(b, startPos));

    let planetsPlaced = 0;
    for (const pos of nearby) {
      if (planetsPlaced >= 2) break;
      if (!isUsed(pos, usedPositions)) {
        nodes.push(createNode({
          type: 'planet',
          owner: pid,
          energy: 30,
          x: pos.x,
          y: pos.y,
        }));
        usedPositions.push(pos);
        planetsPlaced++;
      }
    }
  }

  // --- Step 5: Fill neutral nodes ---
  // Categorize remaining positions by distance from center
  const remainingPositions = freePositions
    .filter(p => !isUsed(p, usedPositions))
    .slice(0, neutralCount);

  const centerDist = Math.min(width, height) * 0.25;

  for (const pos of remainingPositions) {
    const d = dist(pos, { x: cx, y: cy });
    const type = pickNeutralType(d, centerDist, width, height);
    nodes.push(createNode({
      type,
      owner: null,
      x: pos.x,
      y: pos.y,
    }));
  }

  return { nodes, width, height };
}

/**
 * Pick a node type for a neutral node based on its position.
 * - Center area: higher chance of black holes / stars
 * - Mid range: planets (most common)
 * - Outer edge: asteroids
 */
function pickNeutralType(distFromCenter, centerThreshold, width, height) {
  const mapRadius = Math.min(width, height) * 0.5;
  const outerThreshold = mapRadius * 0.65;

  const r = Math.random();

  if (distFromCenter < centerThreshold) {
    // Center zone: mix of valuable nodes
    if (r < 0.12) return 'blackhole';
    if (r < 0.30) return 'star';
    if (r < 0.70) return 'planet';
    return 'nebula';
  } else if (distFromCenter < outerThreshold) {
    // Mid zone: mostly planets
    if (r < 0.08) return 'star';
    if (r < 0.20) return 'asteroid';
    if (r < 0.28) return 'nebula';
    return 'planet';
  } else {
    // Outer zone: asteroids belt
    if (r < 0.55) return 'asteroid';
    if (r < 0.80) return 'planet';
    return 'nebula';
  }
}

/**
 * Check if a position is already used (within min distance of any used position).
 */
function isUsed(pos, usedList) {
  for (const used of usedList) {
    if (used === pos) return true;
    if (dist(pos, used) < MAP_NODE_MIN_DISTANCE * 0.9) return true;
  }
  return false;
}
