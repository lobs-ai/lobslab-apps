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
 *   7. Create wormhole pairs on opposite sides of the map
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

  // --- Step 6: Create wormhole pairs ---
  const wormholePairCount = getWormholePairCount(mapSize);
  if (wormholePairCount > 0) {
    const pairColors = generateWormholeColors(wormholePairCount);
    addWormholePairs(nodes, wormholePairCount, pairColors, width, height, playerPositions);
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

// --- Wormhole helpers ---

const WORMHOLE_COLORS = [
  '#cc44ff', // violet
  '#44ffcc', // cyan
  '#ffaa33', // amber
  '#ff44aa', // magenta
  '#44aaff', // blue
  '#aaff44', // lime
];

function getWormholePairCount(mapSize) {
  switch (mapSize) {
    case 'small':  return 1;
    case 'medium': return Math.random() < 0.5 ? 1 : 2;
    case 'large':  return 2;
    default:       return 1;
  }
}

function generateWormholeColors(pairCount) {
  const shuffled = [...WORMHOLE_COLORS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, pairCount);
}

/**
 * Place wormhole pairs roughly opposite each other, away from player starts.
 */
function addWormholePairs(nodes, pairCount, pairColors, width, height, playerPositions) {
  const cx = width / 2;
  const cy = height / 2;
  const mapRadius = Math.min(width, height) * 0.5;
  const minPlayerDist = mapRadius * 0.3;

  for (let pairIdx = 0; pairIdx < pairCount; pairIdx++) {
    const pairId = pairIdx;
    const color = pairColors[pairIdx];
    const usedPositions = nodes.map(n => n.position);

    // Place entry A and exit B roughly opposite
    const angleStep = (Math.PI * 2) / (pairCount + 1);
    const baseAngle = Math.PI * 0.5 + pairIdx * angleStep; // start from top

    // A: left-ish side
    const angleA = baseAngle + Math.PI + randRange(-0.3, 0.3);
    const distA = mapRadius * randRange(0.55, 0.8);
    const posA = findWormholePosition(nodes, cx + Math.cos(angleA) * distA, cy + Math.sin(angleA) * distA, usedPositions, playerPositions, minPlayerDist);
    if (posA) {
      usedPositions.push(posA);
    }

    // B: roughly opposite
    const angleB = baseAngle + randRange(-0.3, 0.3);
    const distB = mapRadius * randRange(0.55, 0.8);
    const posB = findWormholePosition(nodes, cx + Math.cos(angleB) * distB, cy + Math.sin(angleB) * distB, usedPositions, playerPositions, minPlayerDist);
    if (posB) {
      usedPositions.push(posB);
    }

    if (posA) {
      const nodeA = createNode('wormhole', posA.x, posA.y);
      nodeA.pairId = pairId;
      nodeA.pairColor = color;
      nodeA.pulsePhase = Math.random() * Math.PI * 2;
      nodes.push(nodeA);
    }
    if (posB) {
      const nodeB = createNode('wormhole', posB.x, posB.y);
      nodeB.pairId = pairId;
      nodeB.pairColor = color;
      nodeB.pulsePhase = Math.random() * Math.PI * 2;
      nodes.push(nodeB);
    }
  }
}

/**
 * Find a valid wormhole position, avoiding other nodes and player starts.
 */
function findWormholePosition(nodes, targetX, targetY, usedPositions, playerPositions, minPlayerDist) {
  const margin = 50;
  const attempts = 30;

  for (let i = 0; i < attempts; i++) {
    const x = Math.max(margin, Math.min(targetX + randRange(-80, 80), nodes[0]?.position.x * 2 - margin || 2000 - margin));
    const y = Math.max(margin, Math.min(targetY + randRange(-80, 80), (nodes[0]?.position.y || 1000) * 2 - margin || 2000 - margin));

    // Check distance from other nodes
    let tooClose = false;
    for (const node of nodes) {
      if (dist({ x, y }, node.position) < MAP_NODE_MIN_DISTANCE * 1.5) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    // Check distance from player starts
    for (const pp of playerPositions) {
      if (dist({ x, y }, pp) < minPlayerDist) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    return { x, y };
  }

  return null;
}
