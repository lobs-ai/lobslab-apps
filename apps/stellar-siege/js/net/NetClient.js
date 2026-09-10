import { PROTOCOL_VERSION } from './protocol.js';
import { decodeMotes } from './moteCodec.js';
import { ServerClock, MoteTrack } from './ServerTimeline.js';
import { World } from '../game/World.js';
import {
  BaseTypes,
  ClientEngine,
  FrameSyncStrategy,
  GameEngine,
  GameObject,
  LanceRenderer,
} from './lance/client-runtime.js';
import { createStellarLanceClasses } from './lance/schema.js';

const { StellarNodeObject, StellarSwarmObject } = createStellarLanceClasses({ GameObject, BaseTypes });
// Apply each delta in arrival order: dropping deltas loses fields and lifecycles.
class OrderedFrameSync extends FrameSyncStrategy {
  collectSync(event) {
    if (event.stepCount <= (this.lastAppliedStep ?? -1)) return;
    super.collectSync(event);
    if (!this.lastSync) return;
    this.applySync(this.lastSync, false);
    this.lastAppliedStep = event.stepCount;
    this.lastSync = null;
    this.requiredSyncs = [];
  }
}

class StellarClientGameEngine extends GameEngine {
  constructor() {
    super({ traceLevel: 1000 });
  }

  registerClasses(serializer) {
    serializer.registerClass(StellarNodeObject);
    serializer.registerClass(StellarSwarmObject);
  }

  processInput() {}
}

class NullRenderer extends LanceRenderer {
  draw() {}
}

/**
 * NetClient — client networking built on Lance + socket.io.
 *
 * Lance owns replicated game-state sync. This wrapper keeps the existing
 * lobby/game menu API and mirrors Lance objects into the app's plain World.
 *
 * Every sync is applied the moment it arrives and recorded on a server timeline.
 * Each animation frame resolves nodes, motes and effects at one render tick that
 * trails the newest sync by an adaptive jitter buffer (see ServerTimeline.js).
 */
export class NetClient {
  constructor() {
    this.connected = false;
    this.lobby = null;
    this.playerId = null;

    this.onLobbyCreated = null;
    this.onLobbyJoined = null;
    this.onLobbyUpdate = null;
    this.onGameStart = null;
    this.onStateUpdate = null;
    this.onActionBroadcast = null;
    this.onGameOver = null;
    this.onError = null;
    this.onDisconnect = null;
    this.onMatchClosed = null;

    this.clientEngine = null;
    this.gameEngine = null;
    this.renderer = null;
    this.socket = null;

    this.renderWorld = new World();
    this.renderWorld.players = [];
    this.renderWorld.events = [];
    this.worldBounds = { width: 0, height: 0 };

    this._clock = new ServerClock();
    this._nodes = new Map();      // nodeId -> render node with a per-tick history
    this._nodesDirty = false;
    this._tracks = new Map();     // swarmId -> { track, swarm, lanceId, commandId, handedOff }
    this._effects = [];           // { tick, effect } waiting for the render cursor
    this._arrivalAt = 0;

    // Client-side prediction: fake swarms spawned immediately on send_energy,
    // handed off to the real server swarm once it becomes visible (no jump).
    this._predictiveSwarms = []; // { fakeId, commandId, sourceId, targetId, expireAt, swarm }
    this._predictiveFakeId  = -1;
    this._nextCommandId = 0;
  }

  async connect() {
    const protocol = location.protocol === 'https:' ? 'https:' : 'http:';
    const serverURL = `${protocol}//${location.host}`;

    this.gameEngine = new StellarClientGameEngine();
    this.renderer = new NullRenderer(this.gameEngine);
    this.clientEngine = new ClientEngine(
      this.gameEngine,
      new OrderedFrameSync({}),
      {
        autoConnect: false,
        scheduler: 'fixed',
        serverURL,
        verbose: false,
      },
      this.renderer,
    );

    await this.renderer.init();
    this.gameEngine.start();
    let connectionTimeout;
    try {
      // WebSocket only: the polling handshake takes over a second through the CDN and a
      // client that never upgrades would play at 300ms+ per round trip.
      const connection = this.clientEngine.connect({
        transports: ['websocket'], reconnection: false, timeout: 5000, auth: { protocolVersion: PROTOCOL_VERSION },
      });
      // Lance creates the socket in a resolved-promise callback and only listens
      // for "error". Socket.IO uses "connect_error" for rejected handshakes.
      await Promise.resolve();
      await Promise.race([
        connection,
        new Promise((_, reject) => {
          this.clientEngine.socket.once('connect_error', reject);
          connectionTimeout = setTimeout(() => reject(new Error('Connection timed out')), 6000);
        }),
      ]);
    } catch (error) {
      this.disconnect();
      throw error;
    } finally {
      clearTimeout(connectionTimeout);
    }

    this.socket = this.clientEngine.socket;
    // A disconnected match is closed by the server; reconnect through a fresh lobby.
    this.socket.io.reconnection(false);
    // Handle each world update on arrival, stamped with its arrival time. Lance's own
    // handler only queues it for a timer-driven step, adding up to a frame of jitter.
    this.socket.off('worldUpdate');
    this.socket.on('worldUpdate', data => this._onWorldUpdate(data));
    this.gameEngine.on('client__syncReceived', event => this._onSyncApplied(event));

    this.socket.on('disconnect', () => {
      this.connected = false;
      if (this.onDisconnect) this.onDisconnect();
    });

    this.socket.on('lobby_created', ({ code, lobby }) => {
      this.lobby = lobby;
      if (this.onLobbyCreated) this.onLobbyCreated(code, lobby);
    });

    this.socket.on('lobby_joined', ({ lobby, playerId }) => {
      this.playerId = playerId;
      this.lobby = lobby;
      if (this.onLobbyJoined) this.onLobbyJoined(lobby, playerId);
    });

    this.socket.on('lobby_update', ({ lobby }) => {
      this.lobby = lobby;
      if (this.onLobbyUpdate) this.onLobbyUpdate(lobby);
    });

    this.socket.on('game_start', (payload) => {
      this.matchActive = true;
      this.playerId = payload.playerId;
      this._matchStartStep = payload.startStep || 0;
      this.worldBounds = payload.world ?? { width: 0, height: 0 };
      this.renderWorld.width = this.worldBounds.width;
      this.renderWorld.height = this.worldBounds.height;
      this.renderWorld.players = (payload.players ?? []).map(p => ({ ...p }));
      if (this.onGameStart) this.onGameStart(payload, payload.playerId);
    });

    this.socket.on('game_effects', effects => {
      for (const effect of effects) this._effects.push({ tick: effect.tick ?? 0, effect });
      if (this._effects.length > 4000) this._effects.splice(0, this._effects.length - 4000);
    });

    this.socket.on('action_result', ({ commandId, accepted }) => {
      if (!accepted) this._predictiveSwarms = this._predictiveSwarms.filter(ps => ps.commandId !== commandId);
    });

    this.socket.on('match_closed', ({ message }) => {
      this.matchActive = false;
      this._predictiveSwarms = [];
      if (this.onMatchClosed) this.onMatchClosed(message);
    });

    this.socket.on('game_over', ({ winnerId }) => {
      this.matchActive = false;
      if (this.onGameOver) this.onGameOver(winnerId);
    });

    this.socket.on('error_message', ({ message }) => {
      if (this.onError) this.onError(message);
    });

    this.connected = true;
  }

  send(msg) {
    if (!this.socket) return;

    switch (msg.type) {
      case 'create_lobby':
        this.socket.emit('create_lobby', msg.config);
        break;
      case 'join_lobby':
        this.socket.emit('join_lobby', { code: msg.code, name: msg.name });
        break;
      case 'start_game':
        this.socket.emit('start_game');
        break;
      case 'leave':
        this.socket.emit('leave');
        break;
    }
  }

  createLobby(config) {
    this.send({ type: 'create_lobby', config });
  }

  joinLobby(code, name) {
    this.send({ type: 'join_lobby', code: code.toUpperCase(), name: name || 'Player' });
  }

  startGame() {
    this.send({ type: 'start_game' });
  }

  leave() {
    this.send({ type: 'leave' });
    this.disconnect();
  }

  // Commands go straight to the server and are applied on arrival. Lance's input path
  // queues them by client step, which turned any tick-rate drift into growing input lag.
  sendAction(action) {
    if (!this.connected || !this.matchActive || !this.socket) return;
    action = { ...action, commandId: ++this._nextCommandId };
    if (action.type === 'send_energy') this._spawnPredictiveSwarm(action);
    this.socket.emit('action', action);
  }

  disconnect() {
    this.onDisconnect = null; // Leaving intentionally is not a connection failure.
    if (this.clientEngine) {
      this.clientEngine.disconnect();
    }
    this.connected = false;
    this.matchActive = false;
    this.socket = null;
    this._predictiveSwarms = [];
    this._effects = [];
    this._nodes.clear();
    this._tracks.clear();
    this._clock = new ServerClock();
    this.clientEngine = null;
    this.gameEngine = null;
    this.renderer = null;
  }

  getRenderWorld() {
    return this.renderWorld;
  }

  _onWorldUpdate(data) {
    if (!this.clientEngine) return;
    this._arrivalAt = this.lastStateAt = performance.now();
    this.clientEngine.handleInboundMessage(data);
  }

  // Runs after OrderedFrameSync has applied the sync to the Lance world.
  _onSyncApplied(event) {
    if (this.clientEngine?.syncStrategy.lastAppliedStep !== event.stepCount) return;
    const tick = event.stepCount;
    this._clock.observe(tick, this._arrivalAt);
    const lanceObjects = this.gameEngine.world.objects;

    for (const syncEvent of event.syncEvents) {
      const obj = syncEvent.objectInstance;
      if (obj instanceof StellarNodeObject) this._ingestNode(obj, tick);
      else if (obj instanceof StellarSwarmObject) this._ingestSwarm(obj, tick, !!lanceObjects[obj.id]);
    }
    if (event.fullUpdate) {
      for (const entry of this._tracks.values()) {
        if (entry.track.removedTick == null && !lanceObjects[entry.lanceId]) entry.track.removedTick = tick;
      }
    }
    if (this.onStateUpdate) this.onStateUpdate(this.renderWorld);
  }

  _ingestNode(obj, tick) {
    let node = this._nodes.get(obj.nodeId);
    if (!node) {
      node = {
        id: obj.nodeId,
        type: obj.nodeType,
        owner: null,
        energy: obj.energy,
        maxEnergy: obj.maxEnergy,
        productionRate: obj.productionRate,
        defense: obj.defense,
        position: { x: obj.x, y: obj.y },
        radius: obj.radius,
        upgrade: null,
        pairId: obj.pairId,
        pairColor: obj.pairColor,
        pulsePhase: (obj.nodeId * 0.7) % (Math.PI * 2),
        captureFlash: 0,
        _history: [],
        _resolved: false,
      };
      this._nodes.set(obj.nodeId, node);
      this._nodesDirty = true;
    }
    node.type = obj.nodeType;
    node.maxEnergy = obj.maxEnergy;
    node.productionRate = obj.productionRate;
    node.defense = obj.defense;
    node.radius = obj.radius;
    node.position.x = obj.x;
    node.position.y = obj.y;
    node.pairId = obj.pairId;
    node.pairColor = obj.pairColor;

    const owner = obj.ownerId >= 0 ? obj.ownerId : null;
    const upgrade = obj.upgrade || null;
    const history = node._history;
    const last = history.at(-1);
    if (last && last.tick === tick) {
      Object.assign(last, { owner, energy: obj.energy, upgrade });
      return;
    }
    if (last && last.owner === owner && last.energy === obj.energy && last.upgrade === upgrade) return;
    history.push({ tick, owner, energy: obj.energy, upgrade });
    if (history.length > 64) history.shift();
  }

  _ingestSwarm(obj, tick, present) {
    let entry = this._tracks.get(obj.swarmId);
    if (!entry) {
      entry = {
        track: new MoteTrack(),
        swarm: { id: obj.swarmId, owner: obj.ownerId, sourceId: obj.sourceNodeId, target: null, motes: [], alive: true },
        lanceId: obj.id,
        commandId: obj.commandId,
        handedOff: false,
      };
      this._tracks.set(obj.swarmId, entry);
    }
    entry.swarm.owner = obj.ownerId;
    entry.swarm.sourceId = obj.sourceNodeId;
    entry.swarm.target = obj.targetNodeId >= 0
      ? { type: 'node', nodeId: obj.targetNodeId }
      : { type: 'position', x: obj.targetX, y: obj.targetY };
    if (obj.sampleTick > (entry.track.samples.at(-1)?.tick ?? -1)) {
      entry.track.push(obj.sampleTick, decodeMotes(obj.moteData));
    }
    if (!present) entry.track.removedTick ??= tick;
  }

  updateVisuals(dt, now = performance.now()) {
    const renderTick = this._clock.renderTick(now);
    if (renderTick == null) return;
    const period = this._clock.period;
    const world = this.renderWorld;
    world.width = this.worldBounds.width;
    world.height = this.worldBounds.height;
    world.time = Math.max(0, (renderTick - (this._matchStartStep || 0)) / 60);

    for (const node of this._nodes.values()) this._resolveNode(node, renderTick, dt);
    if (this._nodesDirty) {
      world.nodes = [...this._nodes.values()].sort((a, b) => a.id - b.id);
      this._nodesDirty = false;
    }

    const swarms = [];
    for (const [swarmId, entry] of this._tracks) {
      const { track, swarm } = entry;
      if (track.removedTick != null && renderTick >= track.removedTick) {
        swarm.alive = false;
        this._tracks.delete(swarmId);
        continue;
      }
      if (renderTick < track.createdTick) continue; // launched after the render cursor
      swarm.motes = track.sample(renderTick, period);
      swarm.alive = swarm.motes.length > 0;
      if (!swarm.alive) continue;
      if (!entry.handedOff) {
        entry.handedOff = true;
        // Blend the launch preview into confirmed mote positions over 120ms.
        const ps = this._consumeMatchingPredictive(entry.commandId, swarm.owner);
        if (ps) {
          swarm._handoffMotes = ps.swarm.motes;
          swarm._handoffAt = now;
          ps.swarm.alive = false;
        }
      }
      if (swarm._handoffMotes) {
        const blend = Math.max(0, 1 - (now - swarm._handoffAt) / 120);
        for (let i = 0; i < swarm.motes.length; i++) {
          const m = swarm.motes[i], preview = swarm._handoffMotes[i];
          if (!preview) continue;
          m.x += (preview.x - m.x) * blend;
          m.y += (preview.y - m.y) * blend;
        }
        if (!blend) swarm._handoffMotes = null;
      }
      swarms.push(swarm);
    }

    this._predictiveSwarms = this._predictiveSwarms.filter(ps => {
      if (now > ps.expireAt || !ps.swarm.alive) { ps.swarm.alive = false; return false; }
      return true;
    });
    for (const ps of this._predictiveSwarms) {
      for (const m of ps.swarm.motes) {
        const dx = m.targetX - m.x, dy = m.targetY - m.y;
        const distance = Math.hypot(dx, dy) || 1;
        const speed = Math.min(95, Math.hypot(m.vx, m.vy) + 120 * dt, distance * 3);
        m.vx = dx / distance * speed; m.vy = dy / distance * speed;
        m.x += m.vx * Math.min(dt, 0.05); m.y += m.vy * Math.min(dt, 0.05);
      }
      swarms.push(ps.swarm);
    }
    world.swarms = swarms;

    this._effects = this._effects.filter(({ tick, effect }) => {
      if (tick > renderTick) return true;
      world.events.push({ ...effect, time: world.time });
      return false;
    });
    this._pruneVisualEvents();

    if (world.nodes.length) {
      for (const player of world.players) {
        player.alive = world.nodes.some(n => n.owner === player.id)
          || world.swarms.some(s => s.owner === player.id);
      }
    }
  }

  // Node state at the render tick. Ownership steps; energy interpolates between syncs.
  // Capture flash and pulse are derived locally so they line up with what is on screen.
  _resolveNode(node, renderTick, dt) {
    const history = node._history;
    if (!history.length) return;
    let i = 0;
    while (i + 1 < history.length && history[i + 1].tick <= renderTick) i++;
    if (i > 0) history.splice(0, i);
    const current = history[0];
    const next = history[1];
    const previousOwner = node.owner;
    node.owner = current.owner;
    node.upgrade = current.upgrade;
    node.energy = next && next.owner === current.owner && next.tick > current.tick
      ? current.energy + (next.energy - current.energy) * Math.min(1, (renderTick - current.tick) / (next.tick - current.tick))
      : current.energy;
    node.captureFlash = Math.max(0, node.captureFlash - dt * 2);
    if (node._resolved && previousOwner !== node.owner) node.captureFlash = 1;
    node._resolved = true;
    if (node.owner !== null) node.pulsePhase += dt * 1.5;
  }

  _spawnPredictiveSwarm(action) {
    const sourceNode = this._nodes.get(action.sourceId);
    const targetNode = this._nodes.get(action.targetId);
    if (!sourceNode || !targetNode || sourceNode.owner !== this.playerId || sourceNode.id === targetNode.id) return;
    const ratio = action.ratio ?? 0.5;
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 1) return;

    const reserved = this._predictiveSwarms.filter(ps => ps.sourceId === action.sourceId)
      .reduce((sum, ps) => sum + ps.swarm.motes.length, 0);
    const moteCount = Math.floor(Math.max(0, sourceNode.energy - reserved) * ratio);
    if (moteCount < 5) return;
    const sx = sourceNode.position.x, sy = sourceNode.position.y;
    const fakeId = this._predictiveFakeId--;

    const motes = [];
    for (let i = 0; i < moteCount; i++) {
      const seed = Math.abs(fakeId) * 997 + i * 131;
      const angle = (seed * 0.23917) % (Math.PI * 2);
      const r = 3 + (seed % 7) * 1.8;
      motes.push({
        alive: true, seed,
        phase: ((Math.abs(fakeId) * 31 + i * 17) % 360) / 360,
        x: sx + Math.cos(angle) * r,
        y: sy + Math.sin(angle) * r,
        vx: Math.cos(angle) * 8,
        vy: Math.sin(angle) * 8,
        anchorX: sx, anchorY: sy,
        targetX: targetNode.position.x,
        targetY: targetNode.position.y,
      });
    }

    const fakeSwarm = {
      id: fakeId,
      owner: this.playerId,
      sourceId: action.sourceId,
      target: { type: 'node', nodeId: action.targetId },
      motes,
      alive: true,
      _isPredictive: true,
    };

    this._predictiveSwarms.push({
      fakeId,
      commandId: action.commandId,
      sourceId: action.sourceId,
      targetId: action.targetId,
      expireAt: performance.now() + 4000,
      swarm: fakeSwarm,
    });
  }

  // Find and remove the predictive swarm for a confirmed command.
  _consumeMatchingPredictive(commandId, ownerId) {
    const idx = this._predictiveSwarms.findIndex(
      ps => ps.commandId === commandId && ps.swarm.owner === ownerId
    );
    if (idx === -1) return null;
    return this._predictiveSwarms.splice(idx, 1)[0];
  }

  _pruneVisualEvents() {
    const now = this.renderWorld.time;
    this.renderWorld.events = this.renderWorld.events.filter(ev => now - ev.time < 0.35);
  }
}
