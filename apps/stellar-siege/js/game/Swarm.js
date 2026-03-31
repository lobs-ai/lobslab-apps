import { random } from '../utils/rng.js';

let nextSwarmId = 1;

/**
 * A Mote is one particle in a swarm — represents 1 unit of energy.
 */
export function createMote(x, y) {
  const spread = 12;
  return {
    x: x + (random() - 0.5) * spread,
    y: y + (random() - 0.5) * spread,
    vx: 0,
    vy: 0,
    alive: true,
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
export function createSwarm(sourceNode, targetNode, amount, owner) {
  const motes = [];
  for (let i = 0; i < amount; i++) {
    motes.push(createMote(sourceNode.position.x, sourceNode.position.y));
  }

  return {
    id: nextSwarmId++,
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
