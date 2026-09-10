import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright-chromium');
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const host = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const guest = await browser.newPage({ viewport: { width: 900, height: 700 } });
  for (const page of [host, guest]) {
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.GAME_URL || 'http://localhost:47104');
    await page.evaluate(async () => {
      const { NetClient } = await import('/js/net/NetClient.js');
      const connect = NetClient.prototype.connect;
      NetClient.prototype.connect = async function () { window.testClient = this; await connect.call(this); };
    });
    await page.click('#menu-multiplayer');
  }
  await host.click('#mp-create');
  await host.selectOption('#mp-mapsize', 'large');
  await host.selectOption('[data-slot="1"]', 'open');
  await host.click('#mp-create-go');
  await host.waitForFunction(() => document.querySelector('#mp-code').textContent !== '------');
  const code = await host.locator('#mp-code').textContent();
  await guest.click('#mp-join');
  await guest.fill('#mp-join-code', code);
  await guest.click('#mp-join-go');
  await guest.waitForSelector('#mp-lobby:not(.hidden)');
  await host.click('#mp-start');
  for (const page of [host, guest]) await page.waitForFunction(() => window.testClient?.renderWorld.nodes.length > 5);
  await host.evaluate(() => {
    // Simulate ~180ms RTT plus receive jitter, preserving reliable packet order.
    const c = window.testClient, receive = c._onWorldUpdate.bind(c);
    let delivery = 0;
    c._onWorldUpdate = data => {
      delivery = Math.max(delivery + 1, performance.now() + 90 + Math.random() * 20);
      setTimeout(() => receive(data), delivery - performance.now());
    };
    const emit = c.socket.emit.bind(c.socket);
    c.socket.emit = (name, ...args) => {
      if (name === 'action') { setTimeout(() => emit(name, ...args), 90); return c.socket; }
      return emit(name, ...args);
    };
    window.bytesReceived = 0;
    c.socket.on('worldUpdate', payload => { window.bytesReceived += payload.dataBuffer.byteLength; });
  });
  const launch = await host.evaluate(() => {
    const c = window.testClient;
    const source = c.renderWorld.nodes.find(n => n.owner === c.playerId && n.type === 'star');
    const target = c.renderWorld.nodes.find(n => n.owner !== c.playerId && n.type !== 'wormhole');
    const view = document.querySelector('canvas')._worldView;
    return { source: source.id, target: target.id, sx: source.position.x * view.scale + view.x,
      sy: source.position.y * view.scale + view.y, tx: target.position.x * view.scale + view.x,
      ty: target.position.y * view.scale + view.y };
  });
  // Exercise the actual transformed pointer controls.
  await host.mouse.move(launch.sx, launch.sy);
  await host.mouse.down();
  await host.mouse.move(launch.tx, launch.ty, { steps: 8 });
  await host.mouse.up();
  // The launch preview gathers at the source; flying early would jump back when the real swarm appears.
  await host.waitForTimeout(120);
  const preview = await host.evaluate(() => {
    const c = window.testClient, ps = c._predictiveSwarms[0];
    if (!ps) return null;
    const source = c.renderWorld.nodes.find(n => n.id === ps.sourceId);
    return { drift: Math.max(...ps.swarm.motes.map(m => Math.hypot(m.x - source.position.x, m.y - source.position.y))),
      energy: source.energy, serverEnergy: source._serverEnergy, motes: ps.swarm.motes.length };
  });
  assert.ok(preview, 'preview should still be pending under 180ms RTT');
  assert.ok(preview.drift < 20, `preview drifted ${preview.drift}px from its source`);
  assert.ok(preview.energy <= preview.serverEnergy - preview.motes, JSON.stringify(preview));
  for (const page of [host, guest]) await page.waitForFunction(() => window.testClient.renderWorld.swarms.some(s => s.owner === 0 && s.id > 0 && s.motes.length));
  // Hold the guest's world updates for 400ms, then deliver the backlog in order.
  await guest.evaluate(() => {
    const c = window.testClient, receive = c._onWorldUpdate.bind(c), until = performance.now() + 400, held = [];
    c._onWorldUpdate = data => {
      if (performance.now() < until) { held.push(data); return; }
      for (const pending of held.splice(0)) receive(pending);
      receive(data);
    };
  });
  await host.waitForTimeout(800);
  const stats = [];
  for (const page of [host, guest]) {
    stats.push(await page.evaluate(() => {
      const c = window.testClient;
      const swarm = c.renderWorld.swarms.find(s => s.owner === 0 && s.id > 0);
      const sample = c._tracks.get(swarm.id).track.samples.at(-1);
      const error = Math.max(...swarm.motes.map(m => {
        const row = sample.rows.get(m.id);
        return row ? Math.hypot(row[1] - m.x, row[2] - m.y) : 0;
      }));
      return { id: swarm.id, count: swarm.motes.length, error, tick: sample.tick, delayMs: Math.round(c._clock.delay), predictive: c._predictiveSwarms.length };
    }));
  }
  assert.equal(stats[0].id, stats[1].id);
  assert.equal(stats[0].predictive, 0);
  // Rendering trails the newest sample by at most the jitter buffer plus one sync interval
  // (motes fly at 95px/s); a frozen render would fall far outside that bound within 800ms.
  assert.ok(stats.every(s => s.error < 95 * (s.delayMs + 50) / 1000 + 15), JSON.stringify(stats));
  // Redirect a confirmed swarm and verify both clients receive the same hold point.
  const swarmId = stats[0].id;
  await host.evaluate(id => window.testClient.sendAction({ type: 'redirect_swarm', swarmId: id,
    targetPos: { x: 1000, y: 600 } }), swarmId);
  for (const page of [host, guest]) await page.waitForFunction(id => {
    const s = window.testClient.renderWorld.swarms.find(s => s.id === id);
    return s?.target.type === 'position' && s.target.x === 1000 && s.target.y === 600;
  }, swarmId);
  const rejected = await host.evaluate(({ source, target }) => new Promise(resolve => {
    const c = window.testClient;
    c.socket.once('action_result', resolve);
    c.sendAction({ type: 'send_energy', sourceId: source, targetId: target, ratio: 2 });
  }), launch);
  assert.equal(rejected.accepted, false);
  await host.evaluate(() => {
    const engine = window.testClient.gameEngine;
    const nodes = new Set(Object.values(engine.world.objects).filter(o => o.nodeType).map(o => o.id));
    window.foreignNodes = [];
    engine.on('client__syncReceived', packet => {
      for (const event of packet.syncEvents) {
        const obj = event.objectInstance;
        if (obj?.nodeType && !nodes.has(obj.id)) window.foreignNodes.push(obj.id);
      }
    });
  });
  // Start an independent AI room while this match has live swarms.
  await host.evaluate(async () => {
    const { NetClient } = await import('/js/net/NetClient.js');
    const original = window.testClient;
    const other = new NetClient();
    await other.connect();
    window.testClient = original;
    window.otherRoom = other;
    await new Promise(resolve => {
      other.onLobbyCreated = () => other.startGame();
      other.onGameStart = resolve;
      other.createLobby({ mapSize: 'small', slots: [{ type: 'human' }, { type: 'ai' }] });
    });
  });
  await host.waitForTimeout(300);
  await host.evaluate(({ source, target }) => window.testClient.sendAction({ type: 'send_energy',
    sourceId: source, targetId: target, ratio: 0.5 }), launch);
  await host.waitForFunction(() => window.testClient.renderWorld.swarms.filter(s => s.owner === 0 && s.id > 0).length === 2);
  assert.equal(await host.evaluate(() => new Set(window.testClient.renderWorld.swarms.map(s => s.id)).size), 2);
  await host.evaluate(() => window.otherRoom.disconnect());
  // Collect a short active-flight frame sample rather than judging the FPS label.
  const frames = await host.evaluate(() => new Promise(resolve => {
    const deltas = []; let previous = performance.now();
    function frame(now) { deltas.push(now - previous); previous = now;
      if (deltas.length === 120) resolve(deltas.sort((a, b) => a - b)); else requestAnimationFrame(frame); }
    requestAnimationFrame(frame);
  }));
  console.log('Frame p95 ms:', frames[Math.floor(frames.length * 0.95)]);
  await host.mouse.move(30, 760);
  await host.screenshot({ path: '/tmp/stellar-siege-multiplayer.png' });
  await guest.screenshot({ path: '/tmp/stellar-siege-compact.png' });
  // Finish an actual attack: ownership and the disappearing attack fleet must agree.
  const capture = await host.evaluate(() => {
    const c = window.testClient;
    const sources = c.renderWorld.nodes.filter(n => n.owner === 0 && n.energy >= 30);
    const targets = c.renderWorld.nodes.filter(n => n.owner === null && n.type === 'planet' && n.energy <= 25);
    const choices = sources.flatMap(source => targets.map(target => ({ source, target,
      distance: Math.hypot(source.position.x - target.position.x, source.position.y - target.position.y) })));
    choices.sort((a, b) => a.distance - b.distance);
    const { source, target } = choices[0];
    c.sendAction({ type: 'send_energy', sourceId: source.id, targetId: target.id, ratio: 1 });
    return { targetId: target.id, commandId: c._nextCommandId };
  });
  for (const page of [host, guest]) await page.waitForFunction(id => window.testClient.renderWorld.nodes.find(n => n.id === id)?.owner === 0,
    capture.targetId, { timeout: 15000 });
  await host.waitForTimeout(500);
  assert.equal(await host.evaluate(() => window.testClient._predictiveSwarms.length), 0);
  // Solo restart and wormhole rendering share the same production path.
  await host.click('#hud-menu');
  await guest.waitForFunction(() => document.querySelector('#game-over-title').textContent === 'MATCH ENDED');
  await host.selectOption('#menu-mapsize', 'large');
  await host.click('#menu-start');
  await host.waitForSelector('#hud:not(.hidden)');
  await host.waitForTimeout(500);
  await host.mouse.move(640, 400);
  await host.mouse.wheel(0, -350);
  await host.waitForFunction(() => document.querySelector('canvas')._camera.zoom > 1.2);
  await host.screenshot({ path: '/tmp/stellar-siege-zoom.png' });
  await host.keyboard.press('f');
  await host.waitForFunction(() => document.querySelector('canvas')._worldView.scale === Math.min(innerWidth / window.game.world.width, (innerHeight - 130) / window.game.world.height));
  const combined = await host.evaluate(() => {
    const world = window.game.world, view = document.querySelector('canvas')._worldView;
    const nodes = world.nodes.filter(n => n.owner === 0).slice(0, 2);
    const target = world.nodes.find(n => n.owner === null && n.type === 'planet');
    const screen = n => ({ x: n.position.x * view.scale + view.x, y: n.position.y * view.scale + view.y });
    return { sources: nodes.map(screen), ids: nodes.map(n => n.id), target: screen(target) };
  });
  await host.mouse.click(combined.sources[0].x, combined.sources[0].y);
  await host.keyboard.down('Shift');
  await host.mouse.click(combined.sources[1].x, combined.sources[1].y);
  await host.keyboard.up('Shift');
  await host.mouse.move(combined.sources[0].x, combined.sources[0].y);
  await host.mouse.down();
  await host.mouse.move(combined.target.x, combined.target.y, { steps: 8 });
  await host.mouse.up();
  assert.equal(await host.evaluate(ids => window.game.world.swarms.filter(s => s.owner === 0 && ids.includes(s.sourceId)).length, combined.ids), 2);
  await host.click('#pause-btn');
  assert.equal(await host.locator('#pause-btn').textContent(), '▶');
  await host.click('#sound-toggle');
  assert.equal(await host.locator('#sound-toggle').getAttribute('aria-pressed'), 'false');
  await host.screenshot({ path: '/tmp/stellar-siege-solo.png' });
  const offline = await browser.newPage();
  offline.on('pageerror', error => errors.push(error.message));
  await offline.goto(process.env.GAME_URL || 'http://localhost:47104');
  // The client is WebSocket-only and route interception cannot block WebSockets: emulate a dead network.
  await offline.context().setOffline(true);
  await offline.click('#menu-multiplayer');
  await offline.click('#mp-create');
  await offline.click('#mp-create-go');
  await offline.waitForSelector('.mp-error-toast', { timeout: 9000 });
  assert.equal(await offline.locator('#mp-create-go').isEnabled(), true);
  assert.deepEqual(await host.evaluate(() => window.foreignNodes), []);
  assert.deepEqual(errors, []);
  console.log('Browser multiplayer, pointer launch, prediction handoff, delayed updates:', stats);
} catch (error) {
  await browser.contexts()[0]?.pages()[0]?.screenshot({ path: '/tmp/stellar-siege-failure.png' });
  throw error;
} finally { await browser.close(); }
