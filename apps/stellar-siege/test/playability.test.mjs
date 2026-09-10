import test from 'node:test';
import assert from 'node:assert/strict';
import { MoteTrack, ServerClock, NOMINAL_PERIOD } from '../js/net/ServerTimeline.js';
import { Game } from '../js/game/Game.js';
import { World } from '../js/game/World.js';
import { createNode } from '../js/game/Node.js';
import { SwarmSystem } from '../js/systems/SwarmSystem.js';
import { generateMap } from '../js/map/MapGenerator.js';

test('motes interpolate between snapshots and stop extrapolating during a stall', () => {
  const track = new MoteTrack();
  track.push(3, [[0, 0, 0, 70, 0]]);
  track.push(6, [[0, 3.5, 0, 70, 0]]);
  assert.equal(track.sample(4.5)[0].x, 1.75);
  assert.equal(track.sample(6 + 6)[0].x, 10.5);   // 100ms past the newest sample: 3.5 + 70 * 0.1
  assert.equal(track.sample(6 + 120)[0].x, 10.5); // extrapolation stops there
  assert.equal(track.push(3, [[0, 900, 0, 0, 0]]), false);
});

test('casualties preserve surviving mote identity and wormholes never interpolate across the map', () => {
  const track = new MoteTrack();
  track.push(3, [[0, 0, 0, 0, 0], [1, 10, 0, 0, 0]]);
  const mote = track.sample(3)[1];
  track.push(6, [[1, 900, 500, 0, 0]]);
  assert.equal(track.sample(4.5)[1].x, 10);
  const result = track.sample(6);
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
  const clock = new ServerClock();
  clock.observe(3, 0);
  clock.observe(6, 75); // 25ms of arrival jitter
  clock.observe(9, 100);
  clock.observe(12, 150);
  clock.observe(15, 200);
  clock.observe(18, 250);
  const a = clock.renderTick(210);
  const b = clock.renderTick(260);
  assert.ok(Math.abs((b - a) - 50 / NOMINAL_PERIOD) < 1e-9, `rendered ${b - a} ticks over 50ms`);
  assert.ok(a < 18, 'the render cursor trails the newest sample');
});

test('a server stepping slower than nominal keeps the render cursor behind its data', () => {
  const clock = new ServerClock();
  const period = 1000 / 52; // the deployed server before the scheduler fix
  let newest = 0;
  for (let i = 0; i < 400; i++) { newest = 3 * i; clock.observe(newest, newest * period); }
  const renderTick = clock.renderTick(newest * period);
  assert.ok(renderTick < newest, `cursor ${renderTick.toFixed(1)} must trail newest sample ${newest}`);
  assert.ok(newest - renderTick < 30, `cursor trails by ${(newest - renderTick).toFixed(1)} ticks`);
  assert.ok(Math.abs(clock.period - period) < 0.05, `estimated period ${clock.period.toFixed(3)}`);
});

test('a burst of held-back syncs widens the buffer without snapping the cursor backwards', () => {
  const clock = new ServerClock();
  let at = 0;
  for (let i = 0; i < 40; i++) { clock.observe(3 * i, at); at += 50; }
  const before = clock.renderTick(at);
  for (let i = 40; i < 48; i++) clock.observe(3 * i, at + 400); // eight syncs arrive together after a 400ms stall
  const after = clock.renderTick(at + 401);
  assert.ok(after >= before, 'render cursor never runs backwards');
  assert.ok(clock.delay < 250, `delay ${clock.delay.toFixed(0)}ms stays proportionate to typical jitter`);
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
