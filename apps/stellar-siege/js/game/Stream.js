let nextStreamId = 1;

/**
 * Create a new energy stream between two nodes.
 */
export function createStream(sourceNode, targetNode, amount, owner) {
  return {
    id: nextStreamId++,
    owner,
    sourceId: sourceNode.id,
    targetId: targetNode.id,
    totalEnergy: amount,
    deliveredEnergy: 0,
    // Head position starts at source
    headX: sourceNode.position.x,
    headY: sourceNode.position.y,
    // Whether the head has reached the target
    arrived: false,
    alive: true,
  };
}

export function resetStreamIds() {
  nextStreamId = 1;
}
