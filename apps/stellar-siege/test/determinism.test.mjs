import test from 'node:test';
import assert from 'node:assert/strict';

import { Game, GameState } from '../js/game/Game.js';
import { World } from '../js/game/World.js';
import { resetNodeIds } from '../js/game/Node.js';
import { resetSwarmIds } from '../js/game/Swarm.js';

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

test('multiplayer simulation remains deterministic for identical actions', () => {
  const gameA = createTestGame();
  const gameB = createTestGame();
  const TICK = 1 / 60;

  for (let i = 0; i < 60; i++) {
    gameA.update(TICK);
    gameB.update(TICK);
  }

  {
    const srcA = gameA.world.getNodeById(1);
    const tgtA = gameA.world.getNodeById(3);
    const srcB = gameB.world.getNodeById(1);
    const tgtB = gameB.world.getNodeById(3);
    const amount = Math.floor(srcA.energy * 0.5);
    gameA.sendEnergyExact(srcA, tgtA, amount, 0);
    gameB.sendEnergyExact(srcB, tgtB, amount, 0);
  }

  for (let i = 0; i < 120; i++) {
    gameA.update(TICK);
    gameB.update(TICK);
  }

  for (let i = 0; i < 300; i++) {
    gameA.update(TICK);
    gameB.update(TICK);
  }

  {
    const srcA = gameA.world.getNodeById(2);
    const tgtA = gameA.world.getNodeById(4);
    const srcB = gameB.world.getNodeById(2);
    const tgtB = gameB.world.getNodeById(4);
    const amount = Math.floor(srcA.energy * 0.5);
    gameA.sendEnergyExact(srcA, tgtA, amount, 1);
    gameB.sendEnergyExact(srcB, tgtB, amount, 1);
  }

  for (let i = 0; i < 600; i++) {
    gameA.update(TICK);
    gameB.update(TICK);
  }

  assert.equal(gameA.world.swarms.length, gameB.world.swarms.length);

  for (const nodeA of gameA.world.nodes) {
    const nodeB = gameB.world.getNodeById(nodeA.id);
    assert.ok(nodeB, `missing node ${nodeA.id} in gameB`);
    assert.equal(nodeA.owner, nodeB.owner, `owner mismatch for node ${nodeA.id}`);
    assert.ok(
      Math.abs(nodeA.energy - nodeB.energy) < 0.1,
      `energy drift too large for node ${nodeA.id}: ${nodeA.energy} vs ${nodeB.energy}`,
    );
  }
});
