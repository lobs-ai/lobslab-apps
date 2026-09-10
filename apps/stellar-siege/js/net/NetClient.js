import { PROTOCOL_VERSION } from './protocol.js';
import { decodeMotes } from './moteCodec.js';
import { SwarmInterpolator } from './SwarmInterpolator.js';
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
const CLIENT_STEP_MS = 1000 / 60;
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

    this._predictiveSwarms = [];
    this._pendingEffects = [];
    this.clientEngine = null;
    this.gameEngine = null;
    this.renderer = null;
    this.socket = null;
    this.stepTimer = null;

    this.renderWorld = new World();
    this.renderWorld._nodeMap = new Map();
    this.renderWorld._swarmMap = new Map();
    this.renderWorld.players = [];
    this.renderWorld.events = [];
    this.worldBounds = { width: 0, height: 0 };
    this._combatEventTimer = 0;

    // Client-side prediction: fake swarms spawned immediately on send_energy,
    // handed off to the real server swarm on arrival (no jump).
    this._predictiveSwarms = []; // { fakeId, sourceId, targetId, expireAt, swarm }
    this._predictiveFakeId  = -1;
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
      const connection = this.clientEngine.connect({
        reconnection: false, timeout: 5000, auth: { protocolVersion: PROTOCOL_VERSION },
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
    this.socket.on('disconnect', () => {
      this.connected = false;
      if (this.stepTimer) {
        clearInterval(this.stepTimer);
        this.stepTimer = null;
      }
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
      this._pendingEffects ??= [];
      const now = performance.now();
      this._pendingEffects = this._pendingEffects.filter(batch => batch.at >= now - 350).slice(-11);
      this._pendingEffects.push({ at: now + 75, effects });
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

    this.stepTimer = window.setInterval(() => this._stepClient(), CLIENT_STEP_MS);
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

  sendAction(action) {
    if (!this.connected || !this.matchActive || !this.clientEngine) return;
    action = { ...action, commandId: this._nextCommandId = (this._nextCommandId || 0) + 1 };
    if (action.type === 'send_energy') this._spawnPredictiveSwarm(action);
    this.clientEngine.sendInput(action.type, action);
  }

  disconnect() {
    this.onDisconnect = null; // Leaving intentionally is not a connection failure.
    if (this.stepTimer) {
      clearInterval(this.stepTimer);
      this.stepTimer = null;
    }
    if (this.clientEngine) {
      this.clientEngine.disconnect();
    }
    this.connected = false;
    this.matchActive = false;
    this.socket = null;
    this._predictiveSwarms = [];
    this._pendingEffects = [];
    this.clientEngine = null;
    this.gameEngine = null;
    this.renderer = null;
  }

  getRenderWorld() {
    return this.renderWorld;
  }

  _stepClient() {
    if (!this.clientEngine || !this.gameEngine) return;

    // Lance drains with pop(); reverse to preserve socket arrival order.
    if (this.clientEngine.inboundMessages.length) this.lastStateAt = performance.now();
    this.clientEngine.inboundMessages.reverse();
    this.clientEngine.step(performance.now(), CLIENT_STEP_MS);
    this._rebuildRenderWorld();
    this._reconcilePredictiveSwarms();

    if (this.onStateUpdate) this.onStateUpdate(this.renderWorld);
  }

  _spawnPredictiveSwarm(action) {
    const sourceNode = this.renderWorld._nodeMap.get(action.sourceId);
    const targetNode = this.renderWorld._nodeMap.get(action.targetId);
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

  // Called after _rebuildRenderWorld — merges surviving predictive swarms into the
  // render list and expires any that were never confirmed.
  _reconcilePredictiveSwarms() {
    if (this._predictiveSwarms.length === 0) return;
    const now = performance.now();
    this._predictiveSwarms = this._predictiveSwarms.filter(ps => {
      if (now > ps.expireAt || !ps.swarm.alive) { ps.swarm.alive = false; return false; }
      return true;
    });
    for (const ps of this._predictiveSwarms) {
      this.renderWorld.swarms.push(ps.swarm);
    }
  }

  // Find and remove the oldest predictive swarm matching source→target→owner.
  // Called from _rebuildRenderWorld when a real swarm first appears.
  _consumeMatchingPredictive(commandId, ownerId) {
    const idx = this._predictiveSwarms.findIndex(
      ps => ps.commandId === commandId && ps.swarm.owner === ownerId
    );
    if (idx === -1) return null;
    return this._predictiveSwarms.splice(idx, 1)[0];
  }

  _rebuildRenderWorld() {
    const lanceWorld = this.gameEngine.world;
    const nodeMap = this.renderWorld._nodeMap;
    const swarmMap = this.renderWorld._swarmMap;

    this.renderWorld.width = this.worldBounds.width;
    this.renderWorld.height = this.worldBounds.height;
    this.renderWorld.time = Math.max(0, (lanceWorld.stepCount - (this._matchStartStep || 0)) / 60);

    const seenNodes = new Set();
    const seenSwarms = new Set();

    for (const obj of Object.values(lanceWorld.objects)) {
      if (obj instanceof StellarNodeObject) {
        seenNodes.add(obj.nodeId);
        let node = nodeMap.get(obj.nodeId);
        if (!node) {
          node = {
            id: obj.nodeId,
            type: obj.nodeType,
            owner: obj.ownerId >= 0 ? obj.ownerId : null,
            energy: obj.energy,
            maxEnergy: obj.maxEnergy,
            productionRate: obj.productionRate,
            defense: obj.defense,
            position: { x: obj.x, y: obj.y },
            radius: obj.radius,
            upgrade: obj.upgrade || null,
            pulsePhase: obj.pulsePhase,
            captureFlash: obj.captureFlash,
          };
          nodeMap.set(obj.nodeId, node);
        }

        node.type = obj.nodeType;
        node.pairId = obj.pairId;
        node.pairColor = obj.pairColor;
        node.owner = obj.ownerId >= 0 ? obj.ownerId : null;
        node.energy = obj.energy;
        node.maxEnergy = obj.maxEnergy;
        node.productionRate = obj.productionRate;
        node.defense = obj.defense;
        node.position.x = obj.x;
        node.position.y = obj.y;
        node.radius = obj.radius;
        node.upgrade = obj.upgrade || null;
        node.pulsePhase = obj.pulsePhase;
        node.captureFlash = obj.captureFlash;
      } else if (obj instanceof StellarSwarmObject) {
        seenSwarms.add(obj.swarmId);
        let swarm = swarmMap.get(obj.swarmId);
        if (!swarm) {
          swarm = {
            id: obj.swarmId,
            owner: obj.ownerId,
            sourceId: obj.sourceNodeId,
            target: obj.targetNodeId >= 0
              ? { type: 'node', nodeId: obj.targetNodeId }
              : { type: 'position', x: obj.targetX, y: obj.targetY },
            motes: [],
            alive: true,
          };
          swarmMap.set(obj.swarmId, swarm);

          // Blend the launch preview into confirmed mote positions over 120ms.
          const ps = this._consumeMatchingPredictive(obj.commandId, obj.ownerId);
          if (ps) {
            swarm._handoffMotes = ps.swarm.motes;
            swarm._handoffAt = performance.now();
            ps.swarm.alive = false;
          }
        }

        delete swarm._removedAt;
        swarm.owner = obj.ownerId;
        swarm.sourceId = obj.sourceNodeId;
        swarm.target = obj.targetNodeId >= 0
          ? { type: 'node', nodeId: obj.targetNodeId }
          : { type: 'position', x: obj.targetX, y: obj.targetY };
        swarm.alive = obj.moteCount > 0;
        if (!swarm._interpolator) swarm._interpolator = new SwarmInterpolator();
        if (swarm._sampleTick !== obj.sampleTick) {
          swarm._interpolator.push(obj.sampleTick, decodeMotes(obj.moteData), performance.now());
          swarm._sampleTick = obj.sampleTick;
        }
      }
    }

    for (const nodeId of [...nodeMap.keys()]) {
      if (!seenNodes.has(nodeId)) nodeMap.delete(nodeId);
    }
    for (const swarmId of [...swarmMap.keys()]) {
      if (!seenSwarms.has(swarmId)) {
        const swarm = swarmMap.get(swarmId);
        swarm._removedAt ??= performance.now();
        if (performance.now() - swarm._removedAt >= 75) swarmMap.delete(swarmId);
      }
    }

    this.renderWorld.nodes = [...nodeMap.values()].sort((a, b) => a.id - b.id);
    this.renderWorld.swarms = [...swarmMap.values()].filter(s => s.alive);
    if (this.renderWorld.nodes.length) {
      for (const player of this.renderWorld.players) {
        player.alive = this.renderWorld.nodes.some(n => n.owner === player.id)
          || this.renderWorld.swarms.some(s => s.owner === player.id);
      }
    }
    this._pruneVisualEvents();
  }

  updateVisuals(dt, now = performance.now()) {
    this._pendingEffects = (this._pendingEffects || []).filter(batch => {
      if (batch.at > now) return true;
      this.renderWorld.events.push(...batch.effects.map(e => ({ ...e, time: this.renderWorld.time })));
      return false;
    });
    for (const swarm of this.renderWorld.swarms) {
      if (swarm._interpolator) {
        swarm.motes = swarm._interpolator.sample(now);
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
      } else if (swarm._isPredictive) {
        for (const m of swarm.motes) {
          const dx = m.targetX - m.x, dy = m.targetY - m.y;
          const distance = Math.hypot(dx, dy) || 1;
          const speed = Math.min(95, Math.hypot(m.vx, m.vy) + 120 * dt, distance * 3);
          m.vx = dx / distance * speed; m.vy = dy / distance * speed;
          m.x += m.vx * Math.min(dt, 0.05); m.y += m.vy * Math.min(dt, 0.05);
        }
      }
    }
  }

  _pruneVisualEvents() {
    const now = this.renderWorld.time;
    this.renderWorld.events = this.renderWorld.events.filter(ev => now - ev.time < 0.35);
  }
}
