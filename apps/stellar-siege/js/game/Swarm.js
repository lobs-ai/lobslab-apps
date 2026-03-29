let nextSwarmId = 1;

/**
 * A Mote is one particle in a swarm — represents 1 unit of energy.
 */
export function createMote(x, y) {
  // Slight random offset so motes spread into a cloud
  const spread = 12;
  return {
    x: x + (Math.random() - 0.5) * spread,
    y: y + (Math.random() - 0.5) * spread,
    vx: 0,
    vy: 0,
    alive: true,
  };
}

/**
 * A Swarm is a group of motes traveling together toward a target node.
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
    targetId: targetNode.id,
    motes,
    alive: true,
  };
}

export function resetSwarmIds() {
  nextSwarmId = 1;
}
