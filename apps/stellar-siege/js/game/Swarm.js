let nextSwarmId = 1;

// Seeded PRNG — Linear Congruential Generator
// Must be reset via seedSwarmRng() at the start of each game/level for determinism.
let _rngState = 1;
const _rngA = 1664525;
const _rngC = 1013904223;
const _rngM = 4294967296;

/**
 * Seed the swarm RNG. Call this at the start of each game/level so that
 * identical actions produce identical mote positions across clients.
 * @param {number} seed — integer seed
 */
export function seedSwarmRng(seed) {
  _rngState = (seed >>> 0) || 1;
}

/** Returns a float in [0, 1). */
function rng() {
  _rngState = ((_rngA * _rngState + _rngC) >>> 0) % _rngM;
  return _rngState / _rngM;
}

/**
 * A Mote is one particle in a swarm — represents 1 unit of energy.
 */
export function createMote(x, y) {
  const spread = 14;
  return {
    x: x + (rng() - 0.5) * spread,
    y: y + (rng() - 0.5) * spread,
    vx: (rng() - 0.5) * 28,  // random kick so motes don't start identically
    vy: (rng() - 0.5) * 28,
    alive: true,
    phase: rng(),
  };
}

/**
 * Target descriptor — either a node or a free position on the map.
 *   { type: 'node',     nodeId }
 *   { type: 'position', x, y  }
 */
export function nodeTarget(nodeId)  { return { type: 'node', nodeId }; }
export function posTarget(x, y)    { return { type: 'position', x, y }; }

/**
 * A Swarm is a group of motes traveling together.
 * `target` is a target descriptor (node or position).
 */
export function createSwarm(sourceNode, targetNode, amount, owner, forcedId) {
  const id = forcedId ?? nextSwarmId++;
  if (forcedId != null && forcedId >= nextSwarmId) nextSwarmId = forcedId + 1;

  const motes = [];
  for (let i = 0; i < amount; i++) {
    motes.push(createMote(sourceNode.position.x, sourceNode.position.y));
  }

  return {
    id,
    owner,
    sourceId: sourceNode.id,
    target: nodeTarget(targetNode.id),
    motes,
    alive: true,
  };
}

export function resetSwarmIds() {
  nextSwarmId = 1;
}
