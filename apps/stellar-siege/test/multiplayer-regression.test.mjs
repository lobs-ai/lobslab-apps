import { PROTOCOL_VERSION } from '../js/net/protocol.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';

import { getFreePort, startServer } from './helpers.mjs';

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function connectClient(baseUrl) {
  const socket = io(baseUrl, {
    auth: { protocolVersion: PROTOCOL_VERSION },
    transports: ['websocket'],
    reconnection: false,
    timeout: 5000,
  });

  const received = [];
  const worldUpdates = [];

  socket.on('worldUpdate', payload => {
    worldUpdates.push(payload);
  });

  for (const event of ['lobby_created', 'lobby_joined', 'lobby_update', 'game_start', 'game_over', 'error_message', 'playerJoined']) {
    socket.on(event, payload => {
      received.push({ event, payload });
    });
  }

  return {
    socket,
    received,
    worldUpdates,
    async waitFor(eventName, timeoutMs = 5000) {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        const idx = received.findIndex(msg => msg.event === eventName);
        if (idx !== -1) {
          const [msg] = received.splice(idx, 1);
          return msg.payload;
        }
        await wait(25);
      }
      throw new Error(`timeout waiting for ${eventName}`);
    },
    disconnect() {
      socket.disconnect();
    },
  };
}

test('multiplayer start produces Lance sync traffic and accepts an input', { timeout: 10000 }, async () => {
  const port = await getFreePort();
  const server = await startServer(port);
  const baseUrl = `http://127.0.0.1:${port}`;

  const host = connectClient(baseUrl);
  const joiner = connectClient(baseUrl);

  try {
    await Promise.all([
      new Promise((resolve, reject) => {
        host.socket.once('connect', resolve);
        host.socket.once('connect_error', reject);
      }),
      new Promise((resolve, reject) => {
        joiner.socket.once('connect', resolve);
        joiner.socket.once('connect_error', reject);
      }),
    ]);

    host.socket.emit('create_lobby', {
      mapSize: 'small',
      name: 'Host',
      slots: [{ type: 'human' }, { type: 'open' }],
    });
    const created = await host.waitFor('lobby_created');
    assert.equal(created.lobby.players.length, 1);

    joiner.socket.emit('join_lobby', { code: created.code, name: 'Guest' });
    const joined = await joiner.waitFor('lobby_joined');
    assert.equal(joined.lobby.code, created.code);
    assert.equal(joined.playerId, 1);
    await host.waitFor('lobby_update');

    host.socket.emit('start_game');
    const hostStart = await host.waitFor('game_start');
    const joinerStart = await joiner.waitFor('game_start');
    assert.equal(hostStart.playerId, 0);
    assert.equal(joinerStart.playerId, 1);
    assert.equal(hostStart.players.length, 2);

    const hostSyncBefore = host.worldUpdates.length;
    const joinerSyncBefore = joiner.worldUpdates.length;
    await wait(600);
    assert.ok(host.worldUpdates.length > hostSyncBefore, 'host should receive Lance world updates');
    assert.ok(joiner.worldUpdates.length > joinerSyncBefore, 'joiner should receive Lance world updates');

    const hostOwnedNode = hostStart.players[0].id;
    assert.equal(hostOwnedNode, 0);
    const result = new Promise(resolve => host.socket.once('action_result', resolve));
    host.socket.emit('action', { type: 'send_energy', sourceId: 1, targetId: 3, ratio: 0.5, commandId: 1 });
    assert.equal((await result).commandId, 1);

    await wait(400);
    assert.equal(server.child.exitCode, null, `server crashed\nstdout:\n${server.getStdout()}\nstderr:\n${server.getStderr()}`);
  } finally {
    host.disconnect();
    joiner.disconnect();
    await server.stop();
  }
});
