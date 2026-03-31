let nextSwarmId = 1;

/**
 * Deterministic hash for mote placement — no RNG needed.
 * Uses the golden ratio to spread values evenly in [0,1).
 */
function moteHash(index, seed) {
  return ((index * 2654435761 + seed) >>> 0) / 4294967296;
}

/**
 * A Mote is one particle in a swarm — represents 1 unit of energy.
 * Position is deterministic based on index and swarm ID (no RNG).
 */
export function createMote(x, y, index, swarmId) {
  const spread = 12;
  return {
    x: x + (moteHash(index, swarmId) - 0.5) * spread,
    y: y + (moteHash(index, swarmId + 7919) - 0.5) * spread,
    vx: 0,
    vy: 0,
    alive: true,
    // Store a per-mote phase for deterministic jitter (replaces Math.random)
    phase: moteHash(index, swarmId + 104729),
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
  // If a forced ID was provided, advance the counter past it to avoid collisions
  if (forcedId != null && forcedId >= nextSwarmId) nextSwarmId = forcedId + 1;

  const motes = [];
  for (let i = 0; i < amount; i++) {
    motes.push(createMote(sourceNode.position.x, sourceNode.position.y, i, id));
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
