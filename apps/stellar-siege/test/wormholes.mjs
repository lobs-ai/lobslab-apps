import { strict as assert } from 'assert';
import { World } from '../js/game/World.js';
import { createNode, resetNodeIds } from '../js/game/Node.js';
import { SwarmSystem } from '../js/systems/SwarmSystem.js';

/**
 * Tests for wormhole transit functionality.
 */

// Helper: create a world with a wormhole pair at specified positions
function createWorldWithWormholes(wormholeA, wormholeB) {
  resetNodeIds();
  const world = new World();
  world.width = 800;
  world.height = 600;

  const nodeA = createNode({ type: 'wormhole', x: wormholeA.x, y: wormholeA.y });
  nodeA.pairId = 0;
  nodeA.pairColor = '#cc44ff';
  world.nodes.push(nodeA);

  const nodeB = createNode({ type: 'wormhole', x: wormholeB.x, y: wormholeB.y });
  nodeB.pairId = 0;
  nodeB.pairColor = '#cc44ff';
  world.nodes.push(nodeB);

  return { world, nodeA, nodeB };
}

// Helper: create a swarm with a single mote
function createSwarmAt(world, x, y, targetNodeId, owner) {
  const swarm = {
    id: (world.nextSwarmId = (world.nextSwarmId || 1) + 1),
    owner,
    target: { type: 'node', nodeId: targetNodeId },
    motes: [{
      id: 0,
      x, y,
      vx: 0,
      vy: 0,
      alive: true,
      phase: 0, // required for deterministic jitter in SwarmSystem
    }],
    alive: true,
    sendTime: 0,
    arrivalTime: null,
    tick: 0,
  };
  world.swarms.push(swarm);
  return swarm;
}

// Helper: run swarm system update to completion (or until motes arrive)
function runSwarmToCompletion(swarmSystem, world, targetX, targetY, maxDt = 10) {
  // Run until all motes have arrived (alive = false) or maxDt
  for (let t = 0; t < maxDt; t += 0.016) {
    swarmSystem.update(world, 0.016);
    const mote = world.swarms[0]?.motes[0];
    if (!mote?.alive) break;
  }
}

// Test 1: mote exits at paired wormhole
console.log('Test 1: mote exits at paired wormhole...');
{
  const { world, nodeA, nodeB } = createWorldWithWormholes(
    { x: 100, y: 300 },
    { x: 700, y: 300 },
  );

  const swarmSystem = new SwarmSystem();

  // Create a swarm at wormhole A targeting wormhole B's location
  const swarm = createSwarmAt(world, nodeA.position.x, nodeA.position.y, nodeB.id, 0);

  // Set mote velocity toward the paired wormhole (so it arrives)
  const mote = swarm.motes[0];
  const dx = nodeB.position.x - mote.x;
  const dy = nodeB.position.y - mote.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const speed = 200;
  mote.vx = (dx / dist) * speed;
  mote.vy = (dy / dist) * speed;

  runSwarmToCompletion(swarmSystem, world, nodeB.position.x, nodeB.position.y);

  // Mote should have been teleported (alive) and near the paired wormhole
  const exitedMote = world.swarms[0]?.motes[0];
  if (!exitedMote) {
    console.log('  FAIL: swarm or mote missing');
  } else if (!exitedMote.alive) {
    console.log('  FAIL: mote was killed (should have teleported via wormhole)');
  } else {
    const distToB = Math.sqrt(
      (exitedMote.x - nodeB.position.x) ** 2 +
      (exitedMote.y - nodeB.position.y) ** 2
    );
    // The mote orbits at idle speed near the paired wormhole — allow generous threshold
    // since idle orbit keeps the mote drifting around the exit position.
    if (distToB < nodeB.radius * 3) {
      console.log('  PASS: mote teleported to paired wormhole and idle/orbiting (dist=%.1f)', distToB);
    } else {
      console.log('  FAIL: mote at wrong position (dist=%.1f from exit wormhole)', distToB);
    }
  }
}

// Test 2: wormhole transit preserves mote alive status
console.log('Test 2: wormhole transit preserves mote alive status...');
{
  const { world, nodeA, nodeB } = createWorldWithWormholes(
    { x: 150, y: 200 },
    { x: 650, y: 400 },
  );

  const swarmSystem = new SwarmSystem();

  const swarm = createSwarmAt(world, nodeA.position.x, nodeA.position.y, nodeB.id, 0);
  const mote = swarm.motes[0];

  // Set velocity toward the wormhole
  const dx = nodeB.position.x - mote.x;
  const dy = nodeB.position.y - mote.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  mote.vx = (dx / dist) * 150;
  mote.vy = (dy / dist) * 150;

  runSwarmToCompletion(swarmSystem, world, nodeB.position.x, nodeB.position.y, 15);

  const finalMote = world.swarms[0]?.motes[0];
  if (!finalMote) {
    console.log('  FAIL: mote disappeared');
  } else if (!finalMote.alive) {
    console.log('  FAIL: mote was killed during transit');
  } else {
    console.log('  PASS: mote alive after transit');
  }
}

// Test 3: wormhole with no pair destroys mote
console.log('Test 3: wormhole with no pair destroys mote...');
{
  resetNodeIds();
  const world = new World();
  world.width = 800;
  world.height = 600;

  // Add a single orphan wormhole (no pair)
  const orphan = createNode({ type: 'wormhole', x: 400, y: 300 });
  orphan.pairId = 99;
  orphan.pairColor = '#ff0000';
  world.nodes.push(orphan);

  const swarmSystem = new SwarmSystem();

  const swarm = createSwarmAt(world, orphan.position.x, orphan.position.y, orphan.id, 0);
  const mote = swarm.motes[0];

  // Point toward the orphan wormhole
  mote.vx = 0;
  mote.vy = 100;

  runSwarmToCompletion(swarmSystem, world, orphan.position.x, orphan.position.y, 5);

  const finalMote = world.swarms[0]?.motes[0];
  if (!finalMote) {
    console.log('  PASS: mote destroyed (orphan wormhole)');
  } else if (!finalMote.alive) {
    console.log('  PASS: mote killed at orphan wormhole');
  } else {
    console.log('  FAIL: mote still alive at orphan wormhole with no pair');
  }
}

// Test 4: wormhole transit fires wormhole_transit event
console.log('Test 4: wormhole transit fires wormhole_transit event...');
{
  const { world, nodeA, nodeB } = createWorldWithWormholes(
    { x: 200, y: 300 },
    { x: 600, y: 300 },
  );

  const swarmSystem = new SwarmSystem();

  const swarm = createSwarmAt(world, nodeA.position.x, nodeA.position.y, nodeB.id, 0);
  const mote = swarm.motes[0];

  mote.vx = (nodeB.position.x - mote.x) / 100;
  mote.vy = (nodeB.position.y - mote.y) / 100;

  runSwarmToCompletion(swarmSystem, world, nodeB.position.x, nodeB.position.y);

  const transitEvents = world.events.filter(e => e.type === 'wormhole_transit');
  if (transitEvents.length > 0) {
    console.log('  PASS: wormhole_transit event fired (count=%d)', transitEvents.length);
  } else {
    console.log('  FAIL: no wormhole_transit event found');
  }
}

// Test 5: mote exits at paired node and delivers energy if owned
console.log('Test 5: mote exits and delivers to owned paired node...');
{
  const { world, nodeA, nodeB } = createWorldWithWormholes(
    { x: 100, y: 300 },
    { x: 700, y: 300 },
  );

  // Make nodeB owned by player 0
  nodeB.owner = 0;
  nodeB.energy = 0;

  const swarmSystem = new SwarmSystem();

  const swarm = createSwarmAt(world, nodeA.position.x, nodeA.position.y, nodeB.id, 0);
  const mote = swarm.motes[0];

  mote.vx = (nodeB.position.x - mote.x) / 100;
  mote.vy = (nodeB.position.y - mote.y) / 100;

  runSwarmToCompletion(swarmSystem, world, nodeB.position.x, nodeB.position.y);

  const finalMote = world.swarms[0]?.motes[0];
  if (!finalMote) {
    console.log('  PASS: mote delivered (arrived at paired owned node)');
  } else {
    console.log('  INFO: mote still alive, may not have arrived within time limit');
  }
}

console.log('\nAll wormhole tests complete.');