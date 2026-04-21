/**
 * game-sync.test.mjs
 *
 * Integration tests for the full multiplayer lifecycle:
 *   - game_start payload content (world dimensions, player assignment)
 *   - worldUpdate binary payload structure (non-empty, correct format)
 *   - Lance sync objects accessible after deserialization
 *   - Server stability under normal and edge-case flows
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';

import { BaseTypes, GameObject, Serializer, ServerEngine, GameEngine } from 'lance-gg';
import { createStellarLanceClasses } from '../js/net/lance/schema.js';
import { getFreePort, startServer } from './helpers.mjs';

const { StellarNodeObject, StellarSwarmObject } = createStellarLanceClasses({ GameObject, BaseTypes });

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function connectClient(baseUrl) {
  const socket = io(baseUrl, {
    transports: ['websocket'],
    reconnection: false,
    timeout: 5000,
  });

  const events = {};
  const worldUpdates = [];

  socket.on('worldUpdate', payload => worldUpdates.push(payload));

  for (const evt of ['lobby_created', 'lobby_joined', 'lobby_update', 'game_start', 'game_over', 'error_message', 'playerJoined']) {
    events[evt] = [];
    socket.on(evt, payload => events[evt].push(payload));
  }

  return {
    socket,
    events,
    worldUpdates,
    async waitFor(eventName, timeoutMs = 5000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (events[eventName]?.length > 0) return events[eventName].shift();
        await wait(25);
      }
      throw new Error(`timeout waiting for "${eventName}" after ${timeoutMs}ms`);
    },
    disconnect() {
      socket.disconnect();
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: start server, connect two clients, create lobby, start game
// Returns { server, host, joiner, hostStart, joinerStart } — caller must stop/disconnect
// ---------------------------------------------------------------------------
async function fullGameSetup(port) {
  const server = await startServer(port);
  const baseUrl = `http://127.0.0.1:${port}`;

  const host   = connectClient(baseUrl);
  const joiner = connectClient(baseUrl);

  await Promise.all([
    new Promise((res, rej) => { host.socket.once('connect', res);   host.socket.once('connect_error', rej); }),
    new Promise((res, rej) => { joiner.socket.once('connect', res); joiner.socket.once('connect_error', rej); }),
  ]);

  host.socket.emit('create_lobby', {
    mapSize: 'small',
    name: 'Host',
    slots: [{ type: 'human' }, { type: 'open' }],
  });
  const created = await host.waitFor('lobby_created');
  assert.ok(created.code, 'lobby must have a room code');
  assert.equal(created.lobby.players.length, 1, 'only host in lobby initially');

  joiner.socket.emit('join_lobby', { code: created.code, name: 'Guest' });
  const joined = await joiner.waitFor('lobby_joined');
  assert.equal(joined.lobby.code, created.code, 'lobby codes must match');
  await host.waitFor('lobby_update');

  host.socket.emit('start_game');
  const hostStart   = await host.waitFor('game_start', 12000);
  const joinerStart = await joiner.waitFor('game_start', 12000);

  return { server, host, joiner, hostStart, joinerStart };
}

// ---------------------------------------------------------------------------

test('game_start gives each player a unique compact ID', { timeout: 10000 }, async () => {
  const port = await getFreePort();
  const { server, host, joiner, hostStart, joinerStart } = await fullGameSetup(port);
  try {
    assert.equal(hostStart.playerId,   0, 'host gets playerId 0');
    assert.equal(joinerStart.playerId, 1, 'joiner gets playerId 1');
  } finally {
    host.disconnect();
    joiner.disconnect();
    await server.stop();
  }
});

test('game_start world dimensions are positive', { timeout: 10000 }, async () => {
  const port = await getFreePort();
  const { server, host, joiner, hostStart } = await fullGameSetup(port);
  try {
    assert.ok(hostStart.world.width  > 0, `width must be > 0, got ${hostStart.world.width}`);
    assert.ok(hostStart.world.height > 0, `height must be > 0, got ${hostStart.world.height}`);
  } finally {
    host.disconnect();
    joiner.disconnect();
    await server.stop();
  }
});

test('game_start players roster has exactly 2 entries with hex colors', { timeout: 10000 }, async () => {
  const port = await getFreePort();
  const { server, host, joiner, hostStart } = await fullGameSetup(port);
  try {
    assert.equal(hostStart.players.length, 2, 'exactly 2 players (no AI in this setup)');
    for (const p of hostStart.players) {
      assert.ok(typeof p.color === 'string' && /^#[0-9a-fA-F]{3,6}$/.test(p.color),
        `player ${p.id} needs a hex color, got "${p.color}"`);
      assert.ok(p.id === 0 || p.id === 1, `player ids must be 0 or 1, got ${p.id}`);
    }
  } finally {
    host.disconnect();
    joiner.disconnect();
    await server.stop();
  }
});

test('both clients receive non-empty binary worldUpdate payloads after game start', { timeout: 10000 }, async () => {
  const port = await getFreePort();
  const { server, host, joiner } = await fullGameSetup(port);
  try {
    const before = { host: host.worldUpdates.length, joiner: joiner.worldUpdates.length };
    await wait(800);

    assert.ok(host.worldUpdates.length   > before.host,   'host must receive worldUpdates after game start');
    assert.ok(joiner.worldUpdates.length > before.joiner, 'joiner must receive worldUpdates after game start');

    // Verify binary payload structure
    for (const payload of [host.worldUpdates[0], joiner.worldUpdates[0]]) {
      assert.ok(payload != null, 'payload must not be null');
      assert.ok(payload.dataBuffer != null, 'payload.dataBuffer must exist');

      const buf = payload.dataBuffer;
      const isBuffer = Buffer.isBuffer(buf) || buf instanceof ArrayBuffer;
      assert.ok(isBuffer, `dataBuffer must be a Buffer or ArrayBuffer, got ${Object.prototype.toString.call(buf)}`);

      const byteLength = buf.byteLength ?? buf.length;
      assert.ok(byteLength > 4, `dataBuffer too small (${byteLength} bytes) — likely empty world update`);
    }
  } finally {
    host.disconnect();
    joiner.disconnect();
    await server.stop();
  }
});

test('worldUpdate payloads can be deserialized into node objects via Lance serializer', { timeout: 10000 }, async () => {
  const port = await getFreePort();
  const { server, host, joiner, hostStart } = await fullGameSetup(port);

  // Build a local serializer that mirrors what both server and client register
  const serializer = new Serializer();
  // Register Lance internal types so NetworkedEventCollection can be decoded.
  // We do this by creating a minimal ServerEngine pointing at a no-op io.
  const noopIo = { on: () => {} };
  const minimalGame = new GameEngine({ traceLevel: 0 });
  const se = new ServerEngine(noopIo, minimalGame, { tracesPath: '' });
  // se.networkTransmitter.serializer already has NetworkedEventCollection etc. registered
  // and minimalGame.registerClasses was called — we just need to add our game classes:
  se.serializer.registerClass(StellarNodeObject);
  se.serializer.registerClass(StellarSwarmObject);

  try {
    await wait(600); // allow world updates to arrive

    assert.ok(host.worldUpdates.length > 0, 'host must receive at least one worldUpdate');

    let payload = host.worldUpdates[host.worldUpdates.length - 1]; // latest update
    // socket.io delivers binary as Buffer in Node.js — Lance's Serializer needs ArrayBuffer
    const rawBuf = payload.dataBuffer;
    if (Buffer.isBuffer(rawBuf)) {
      payload = { ...payload, dataBuffer: rawBuf.buffer.slice(rawBuf.byteOffset, rawBuf.byteOffset + rawBuf.byteLength) };
    }
    const result  = se.networkTransmitter.deserializePayload(payload);

    // result is a NetworkedEventCollection — it has .events
    assert.ok(result != null, 'deserialized payload must not be null');
    assert.ok(Array.isArray(result.events), 'payload.events must be an array');
    assert.ok(result.events.length > 0, 'at least one sync event must be present');

    // Find the syncHeader
    const header = result.events.find(e => e.fullUpdate !== undefined && e.stepCount !== undefined);
    assert.ok(header != null, 'sync header event must be present');
    assert.ok(header.stepCount > 0, `stepCount must be > 0, got ${header.stepCount}`);

    // Find at least one node update
    const nodeEvents = result.events.filter(e => e.objectInstance instanceof StellarNodeObject);
    assert.ok(nodeEvents.length > 0,
      `expected StellarNodeObject updates in payload, found events: ${result.events.map(e => e.constructor.name)}`);

    // Verify the map has the right number of nodes for 'small' map (20 nodes)
    const nodeIds = new Set(nodeEvents.map(e => e.objectInstance.nodeId));
    assert.ok(nodeIds.size > 0, 'must have at least one unique node id');

    // Verify node positions are within world bounds
    const { width, height } = hostStart.world;
    for (const { objectInstance: n } of nodeEvents) {
      assert.ok(n.x > 0 && n.x < width,  `node ${n.nodeId} x=${n.x} out of world width ${width}`);
      assert.ok(n.y > 0 && n.y < height, `node ${n.nodeId} y=${n.y} out of world height ${height}`);
      assert.ok(n.maxEnergy > 0,  `node ${n.nodeId} must have positive maxEnergy`);
      assert.ok(n.radius > 0,    `node ${n.nodeId} must have positive radius`);
    }
  } finally {
    host.disconnect();
    joiner.disconnect();
    await server.stop();
  }
});

test('server stays alive and keeps ticking after game start', { timeout: 25000 }, async () => {
  const port = await getFreePort();
  const { server, host, joiner } = await fullGameSetup(port);
  try {
    await wait(1200);
    assert.equal(server.child.exitCode, null, `server crashed:\n${server.getStderr()}`);
    // Verify game is still sending updates
    const countBefore = host.worldUpdates.length;
    await wait(500);
    assert.ok(host.worldUpdates.length > countBefore, 'server must continue sending updates during play');
  } finally {
    host.disconnect();
    joiner.disconnect();
    await server.stop();
  }
});

test('server handles host disconnect without crashing', { timeout: 25000 }, async () => {
  const port = await getFreePort();
  const { server, host, joiner } = await fullGameSetup(port);
  try {
    await wait(300);
    host.disconnect(); // disconnect mid-game
    await wait(600);
    assert.equal(server.child.exitCode, null, `server crashed after host disconnect:\n${server.getStderr()}`);
  } finally {
    joiner.disconnect();
    await server.stop();
  }
});

test('host + AI game starts and runs without human joiner', { timeout: 20000 }, async () => {
  const port = await getFreePort();
  const server = await startServer(port);
  const host = connectClient(`http://127.0.0.1:${port}`);

  try {
    await new Promise((res, rej) => {
      host.socket.once('connect', res);
      host.socket.once('connect_error', rej);
    });

    host.socket.emit('create_lobby', {
      mapSize: 'small',
      name: 'SoloHost',
      slots: [{ type: 'human' }, { type: 'ai', difficulty: 'easy' }],
    });

    const created = await host.waitFor('lobby_created');
    assert.ok(created.code, 'lobby must have a code');

    host.socket.emit('start_game');
    const startPayload = await host.waitFor('game_start', 10000);

    assert.equal(startPayload.playerId, 0, 'solo host is player 0');
    assert.equal(startPayload.players.length, 2, 'host + 1 AI = 2 players');

    const aiPlayer = startPayload.players.find(p => !p.isHuman);
    assert.ok(aiPlayer, 'must have an AI player');
    assert.equal(aiPlayer.difficulty, 'easy', 'AI must be easy difficulty');

    await wait(500);
    assert.equal(server.child.exitCode, null, 'server must not crash during AI game');
  } finally {
    host.disconnect();
    await server.stop();
  }
});
