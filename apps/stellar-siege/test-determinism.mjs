/**
 * Determinism test — verify two independent Game instances produce
 * identical state when given the same initial state and actions.
 */
import { Game, GameState } from './js/game/Game.js';
import { World } from './js/game/World.js';
import { resetNodeIds } from './js/game/Node.js';
import { resetSwarmIds } from './js/game/Swarm.js';

function createTestGame() {
  resetNodeIds();
  resetSwarmIds();

  const world = new World();
  world.width = 800;
  world.height = 600;
  world.time = 0;

  world.nodes = [
    { id: 1, type: 'star', owner: 0, energy: 100, maxEnergy: 300, productionRate: 3, defense: 1, position: { x: 100, y: 100 }, radius: 30, upgrade: null, pulsePhase: 0, captureFlash: 0 },
    { id: 2, type: 'star', owner: 1, energy: 100, maxEnergy: 300, productionRate: 3, defense: 1, position: { x: 700, y: 500 }, radius: 30, upgrade: null, pulsePhase: 0, captureFlash: 0 },
    { id: 3, type: 'planet', owner: null, energy: 30, maxEnergy: 100, productionRate: 1, defense: 1, position: { x: 400, y: 300 }, radius: 20, upgrade: null, pulsePhase: 0, captureFlash: 0 },
    { id: 4, type: 'planet', owner: null, energy: 30, maxEnergy: 100, productionRate: 1, defense: 1, position: { x: 300, y: 400 }, radius: 20, upgrade: null, pulsePhase: 0, captureFlash: 0 },
  ];

  world.players = [
    { id: 0, color: '#00e5ff', isHuman: true, alive: true, difficulty: 'medium', name: 'P0' },
    { id: 1, color: '#ff00e5', isHuman: true, alive: true, difficulty: 'medium', name: 'P1' },
  ];

  world.swarms = [];
  world.events = [];

  const game = new Game();
  game.world = world;
  game.state = GameState.PLAYING;
  game.isMultiplayer = true;
  game.skipAI = true;

  return game;
}

// Create two independent instances
const gameA = createTestGame();
// Reset counters again for B so swarm IDs start from 1 for both
const gameB = createTestGame();

const TICK = 1 / 60;

function compareState(label) {
  let match = true;
  for (const nodeA of gameA.world.nodes) {
    const nodeB = gameB.world.getNodeById(nodeA.id);
    if (nodeA.owner !== nodeB.owner || Math.abs(nodeA.energy - nodeB.energy) > 0.001) {
      console.log(`  ✗ MISMATCH ${label} node ${nodeA.id}: A(owner=${nodeA.owner}, energy=${nodeA.energy.toFixed(3)}) vs B(owner=${nodeB.owner}, energy=${nodeB.energy.toFixed(3)})`);
      match = false;
    }
  }
  if (gameA.world.swarms.length !== gameB.world.swarms.length) {
    console.log(`  ✗ MISMATCH ${label} swarms: A=${gameA.world.swarms.length} vs B=${gameB.world.swarms.length}`);
    match = false;
  }
  if (match) console.log(`  ✓ ${label} — identical`);
  return match;
}

// Phase 1: 1 second of production
for (let i = 0; i < 60; i++) { gameA.update(TICK); gameB.update(TICK); }
console.log('Phase 1: 1s production only');
compareState('t=1s');

// Phase 2: P0 sends from node 1 to node 3
// Use sendEnergyExact (same code path as multiplayer — server computes exact amount)
{
  const srcA = gameA.world.getNodeById(1), tgtA = gameA.world.getNodeById(3);
  const srcB = gameB.world.getNodeById(1), tgtB = gameB.world.getNodeById(3);
  const amount = Math.floor(srcA.energy * 0.5); // server computes this once
  gameA.sendEnergyExact(srcA, tgtA, amount, 0);
  gameB.sendEnergyExact(srcB, tgtB, amount, 0);
}

// Run 2 seconds — swarms traveling
for (let i = 0; i < 120; i++) { gameA.update(TICK); gameB.update(TICK); }
console.log('\nPhase 2: action + 2s');
compareState('t=3s');

// Compare mote positions
if (gameA.world.swarms.length > 0 && gameB.world.swarms.length > 0) {
  const sa = gameA.world.swarms[0];
  const sb = gameB.world.swarms[0];
  let moteDiff = 0;
  for (let i = 0; i < Math.min(sa.motes.length, sb.motes.length); i++) {
    const ma = sa.motes[i], mb = sb.motes[i];
    if (ma.alive !== mb.alive) moteDiff++;
    else if (ma.alive && (Math.abs(ma.x - mb.x) > 0.001 || Math.abs(ma.y - mb.y) > 0.001)) moteDiff++;
  }
  console.log(`  Motes: ${sa.motes.length} total, ${moteDiff} differ`);
}

// Phase 3: 5 more seconds — swarms arrive, capture happens
for (let i = 0; i < 300; i++) { gameA.update(TICK); gameB.update(TICK); }
console.log('\nPhase 3: 8s total (swarms arrived)');
compareState('t=8s');

// Phase 4: P1 sends from node 2 to node 4
{
  const srcA = gameA.world.getNodeById(2), tgtA = gameA.world.getNodeById(4);
  const srcB = gameB.world.getNodeById(2), tgtB = gameB.world.getNodeById(4);
  const amount = Math.floor(srcA.energy * 0.5);
  gameA.sendEnergyExact(srcA, tgtA, amount, 1);
  gameB.sendEnergyExact(srcB, tgtB, amount, 1);
}

for (let i = 0; i < 600; i++) { gameA.update(TICK); gameB.update(TICK); }
console.log('\nPhase 4: 18s total (two actions)');
compareState('t=18s');

// Final verdict
let allMatch = true;
for (const nodeA of gameA.world.nodes) {
  const nodeB = gameB.world.getNodeById(nodeA.id);
  if (nodeA.owner !== nodeB.owner || Math.abs(nodeA.energy - nodeB.energy) > 0.001) allMatch = false;
}
console.log(`\n=== ${allMatch ? '✓ DETERMINISTIC' : '✗ NON-DETERMINISTIC'} ===`);
process.exit(allMatch ? 0 : 1);
