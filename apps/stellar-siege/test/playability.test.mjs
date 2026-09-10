import test from 'node:test';
import assert from 'node:assert/strict';
import { SwarmInterpolator } from '../js/net/SwarmInterpolator.js';
import { Game } from '../js/game/Game.js';
import { World } from '../js/game/World.js';
import { createNode } from '../js/game/Node.js';
import { SwarmSystem } from '../js/systems/SwarmSystem.js';
import { generateMap } from '../js/map/MapGenerator.js';

test('motes interpolate between snapshots and stop extrapolating during a stall', () => {
  const s = new SwarmInterpolator();
  s.push(3, [[0, 0, 0, 70, 0]], 0);
  s.push(6, [[0, 3.5, 0, 70, 0]], 50);
  assert.equal(s.sample(100)[0].x, 1.75);
  assert.equal(s.sample(2000)[0].x, 10.5);
  assert.equal(s.sample(4000)[0].x, 10.5);
  assert.equal(s.push(3, [[0, 900, 0, 0, 0]], 4100), false);
});

test('casualties preserve surviving mote identity and wormholes never interpolate across the map', () => {
  const s = new SwarmInterpolator();
  s.push(3, [[0, 0, 0, 0, 0], [1, 10, 0, 0, 0]], 0);
  const mote = s.sample(75)[1];
  s.push(6, [[1, 900, 500, 0, 0]], 50);
  assert.equal(s.sample(100)[1].x, 10);
  const result = s.sample(125);
  assert.equal(result.length, 1);
  assert.equal(result[0], mote);
  assert.equal(result[0].x, 900);
});

test('the last attacking mote captures a node before the empty swarm is removed', () => {
  const world = new World();
  const node = createNode({ type: 'planet', x: 100, y: 100, owner: 1, energy: 0.5 });
  world.nodes = [node];
  world.swarms = [{ id: 1, owner: 0, alive: true, target: { type: 'node', nodeId: node.id },
    motes: [{ x: 100, y: 100, vx: 0, vy: 0, phase: 0, alive: true }] }];
  new SwarmSystem().update(world, 1 / 60);
  assert.equal(node.owner, 0);
  assert.equal(node.captureFlash, 1);
  assert.equal(world.swarms.length, 0);
});

test('invalid launch ratios cannot create energy or unbounded swarms', () => {
  const game = new Game(); game.world = new World();
  const source = createNode({ type: 'star', x: 0, y: 0, owner: 0, energy: 100 });
  const target = createNode({ type: 'planet', x: 100, y: 100, owner: 1 });
  for (const ratio of [NaN, Infinity, -1, 0, 1.01, '1']) game.sendEnergy(source, target, ratio);
  assert.equal(source.energy, 100);
  assert.equal(game.world.swarms.length, 0);
  assert.equal(game.sendEnergy(source, target, 0.5).motes.length, 50);
});

test('random maps generate valid paired wormholes without crashing', () => {
  for (const mapSize of ['small', 'medium', 'large']) {
    for (let i = 0; i < 15; i++) {
      const map = generateMap({ playerCount: 2, mapSize });
      for (const node of map.nodes) {
        assert.ok(Number.isFinite(node.position.x));
        if (node.type === 'wormhole') assert.equal(map.nodes.filter(n => n.type === 'wormhole' && n.pairId === node.pairId).length, 2);
      }
    }
  }
});

test('new games do not reuse a live match swarm ID', () => {
  const first = new Game();
  first.startMultiplayerGame({ mapSize: 'small', slots: [{ type: 'human' }, { type: 'human' }] });
  const source = first.world.nodes.find(n => n.owner === 0 && n.type === 'star');
  const target = first.world.nodes.find(n => n.owner === 1);
  const a = first.sendEnergy(source, target);
  const other = new Game();
  other.startMultiplayerGame({ mapSize: 'small', slots: [{ type: 'human' }, { type: 'human' }] });
  const b = first.sendEnergy(source, target);
  assert.notEqual(a.id, b.id);
});

test('network jitter does not change server flight speed', () => {
  const s = new SwarmInterpolator();
  s.push(3, [[0, 0, 0, 70, 0]], 0);
  s.push(6, [[0, 3.5, 0, 70, 0]], 75); // 25ms of arrival jitter
  assert.equal(s.sample(100)[0].x, 1.75);
  s.push(9, [[0, 7, 0, 70, 0]], 100);
  assert.equal(s.sample(150)[0].x, 5.25);
});

test('wormholes carry the whole fleet instead of stranding trailing motes', () => {
  const world = new World();
  const entry = createNode({ type: 'wormhole', x: 100, y: 100, owner: null });
  const exit = createNode({ type: 'wormhole', x: 900, y: 600, owner: null });
  entry.pairId = exit.pairId = 0;
  world.nodes = [entry, exit];
  const swarm = { id: 1, owner: 0, alive: true, target: { type: 'node', nodeId: entry.id },
    motes: [100, 40].map((x, i) => ({ x, y: 100, vx: 0, vy: 0, alive: true, phase: i * 0.3 })) };
  world.addSwarm(swarm);
  new SwarmSystem().update(world, 1 / 60);
  assert.ok(swarm.motes.every(m => m.alive && Math.hypot(m.x - 900, m.y - 600) < 30));
  assert.equal(swarm.target.type, 'position');
  assert.equal(world.events.length, 1);
});

test('four AI factions remain valid through three minutes of combat', { timeout: 30000 }, () => {
  const game = new Game();
  game.startMultiplayerGame({ mapSize: 'large', slots: Array.from({ length: 4 }, () => ({ type: 'ai', difficulty: 'hard' })) });
  const originalNeutralCount = game.world.nodes.filter(n => n.owner === null).length;
  for (let tick = 0; tick < 60 * 180; tick++) {
    game.update(1 / 60);
    if (tick % 60 !== 0) continue;
    assert.equal(new Set(game.world.swarms.map(s => s.id)).size, game.world.swarms.length);
    for (const node of game.world.nodes) assert.ok(Number.isFinite(node.energy) && node.energy >= 0 && node.energy <= node.maxEnergy);
    for (const swarm of game.world.swarms) for (const mote of swarm.motes) {
      assert.ok(Number.isFinite(mote.x) && Number.isFinite(mote.y));
    }
    game.world.events = [];
  }
  assert.ok(game.world.nodes.filter(n => n.owner === null).length < originalNeutralCount);
});
