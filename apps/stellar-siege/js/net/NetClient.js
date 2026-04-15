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
const CLIENT_DT = CLIENT_STEP_MS / 1000;
const FORMATION_WIDTH = 5;
const LANE_SPACING = 5.5;
const ROW_SPACING = 4.2;
const ANCHOR_PULL = 18;
const PATH_PULL = 11;
const VELOCITY_DAMPING = 0.9;
const WOBBLE_STRENGTH = 10;
const MAX_VISUAL_SPEED = 85;
const COMBAT_REPEL_RADIUS = 12;
const COMBAT_EVENT_COOLDOWN = 0.08;

class StellarClientGameEngine extends GameEngine {
  constructor() {
    super({ traceLevel: 0 });
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
  }

  async connect() {
    const protocol = location.protocol === 'https:' ? 'https:' : 'http:';
    const serverURL = `${protocol}//${location.host}`;

    this.gameEngine = new StellarClientGameEngine();
    this.renderer = new NullRenderer(this.gameEngine);
    this.clientEngine = new ClientEngine(
      this.gameEngine,
      new FrameSyncStrategy({}),
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
    await this.clientEngine.connect();

    this.socket = this.clientEngine.socket;
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
      this.playerId = payload.playerId;
      this.worldBounds = payload.world ?? { width: 0, height: 0 };
      this.renderWorld.width = this.worldBounds.width;
      this.renderWorld.height = this.worldBounds.height;
      this.renderWorld.players = (payload.players ?? []).map(p => ({ ...p }));
      if (this.onGameStart) this.onGameStart(payload, payload.playerId);
    });

    this.socket.on('game_over', ({ winnerId }) => {
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
    if (!this.clientEngine) return;
    this.clientEngine.sendInput(action.type, action);
  }

  disconnect() {
    if (this.stepTimer) {
      clearInterval(this.stepTimer);
      this.stepTimer = null;
    }
    if (this.clientEngine) {
      this.clientEngine.disconnect();
    }
    this.connected = false;
    this.socket = null;
    this.clientEngine = null;
    this.gameEngine = null;
    this.renderer = null;
  }

  getRenderWorld() {
    return this.renderWorld;
  }

  _stepClient() {
    if (!this.clientEngine || !this.gameEngine) return;

    this.clientEngine.step(performance.now(), CLIENT_STEP_MS);
    this._rebuildRenderWorld();
    this._simulateVisualSwarms(CLIENT_DT);
    if (this.onStateUpdate) this.onStateUpdate(this.renderWorld);
  }

  _rebuildRenderWorld() {
    const lanceWorld = this.gameEngine.world;
    const nodeMap = this.renderWorld._nodeMap;
    const swarmMap = this.renderWorld._swarmMap;

    this.renderWorld.width = this.worldBounds.width;
    this.renderWorld.height = this.worldBounds.height;
    this.renderWorld.time = lanceWorld.stepCount / 60;

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
        }

        swarm.owner = obj.ownerId;
        swarm.sourceId = obj.sourceNodeId;
        swarm.target = obj.targetNodeId >= 0
          ? { type: 'node', nodeId: obj.targetNodeId }
          : { type: 'position', x: obj.targetX, y: obj.targetY };
        swarm.alive = obj.moteCount > 0;
        this._syncFakeMotes(swarm, obj);
      }
    }

    for (const nodeId of [...nodeMap.keys()]) {
      if (!seenNodes.has(nodeId)) nodeMap.delete(nodeId);
    }
    for (const swarmId of [...swarmMap.keys()]) {
      if (!seenSwarms.has(swarmId)) swarmMap.delete(swarmId);
    }

    this.renderWorld.nodes = [...nodeMap.values()].sort((a, b) => a.id - b.id);
    this.renderWorld.swarms = [...swarmMap.values()].filter(s => s.alive);
    this._pruneVisualEvents();
  }

  _syncFakeMotes(swarm, obj) {
    const wanted = Math.max(0, obj.moteCount | 0);
    while (swarm.motes.length < wanted) {
      const idx = swarm.motes.length;
      swarm.motes.push({
        alive: true,
        phase: ((obj.swarmId * 31 + idx * 17) % 360) / 360,
        lane: (idx % FORMATION_WIDTH) - (FORMATION_WIDTH - 1) / 2,
        row: Math.floor(idx / FORMATION_WIDTH),
        seed: obj.swarmId * 997 + idx * 131,
        x: obj.centerX,
        y: obj.centerY,
        vx: 0,
        vy: 0,
      });
    }
    if (swarm.motes.length > wanted) {
      swarm.motes.length = wanted;
    }

    for (let i = 0; i < swarm.motes.length; i++) {
      const mote = swarm.motes[i];
      mote.alive = true;
      mote.anchorX = obj.centerX;
      mote.anchorY = obj.centerY;
      mote.targetX = obj.targetX;
      mote.targetY = obj.targetY;
      if (!Number.isFinite(mote.x) || !Number.isFinite(mote.y)) {
        mote.x = obj.centerX;
        mote.y = obj.centerY;
      }
    }
  }

  _simulateVisualSwarms(dt) {
    const swarms = this.renderWorld.swarms;
    this._combatEventTimer = Math.max(0, this._combatEventTimer - dt);

    for (const swarm of swarms) {
      if (!swarm.alive) continue;

      const targetNode = swarm.target?.type === 'node'
        ? this.renderWorld.getNodeById(swarm.target.nodeId)
        : null;
      const center = this._getSwarmCenter(swarm);
      const targetX = targetNode?.position.x ?? swarm.target?.x ?? center.x;
      const targetY = targetNode?.position.y ?? swarm.target?.y ?? center.y;
      const dirXRaw = targetX - center.x;
      const dirYRaw = targetY - center.y;
      const dirLen = Math.hypot(dirXRaw, dirYRaw) || 1;
      const dirX = dirXRaw / dirLen;
      const dirY = dirYRaw / dirLen;
      const perpX = -dirY;
      const perpY = dirX;

      swarm._visualCenter = center;

      for (let i = 0; i < swarm.motes.length; i++) {
        const mote = swarm.motes[i];
        if (!mote.alive) continue;

        const wave = this.renderWorld.time * 4 + mote.phase * Math.PI * 2;
        const laneOffset = mote.lane * LANE_SPACING + Math.sin(wave * 1.7) * 1.8;
        const rowOffset = mote.row * ROW_SPACING;
        const desiredX =
          center.x
          - dirX * rowOffset
          + perpX * laneOffset
          + Math.sin(wave + mote.seed * 0.001) * 1.3;
        const desiredY =
          center.y
          - dirY * rowOffset
          + perpY * laneOffset
          + Math.cos(wave * 1.2 + mote.seed * 0.001) * 1.3;

        mote.vx += (desiredX - mote.x) * ANCHOR_PULL * dt;
        mote.vy += (desiredY - mote.y) * ANCHOR_PULL * dt;
        mote.vx += dirX * PATH_PULL * dt;
        mote.vy += dirY * PATH_PULL * dt;
        mote.vx += Math.sin(wave * 2.1 + mote.seed * 0.004) * WOBBLE_STRENGTH * dt;
        mote.vy += Math.cos(wave * 1.9 + mote.seed * 0.003) * WOBBLE_STRENGTH * dt;
      }

      this._applyFriendlySpacing(swarm, dt);
    }

    this._applyEnemyCombatRepulsion(swarms, dt);

    for (const swarm of swarms) {
      for (const mote of swarm.motes) {
        if (!mote.alive) continue;
        mote.vx *= VELOCITY_DAMPING;
        mote.vy *= VELOCITY_DAMPING;

        const speed = Math.hypot(mote.vx, mote.vy);
        if (speed > MAX_VISUAL_SPEED) {
          mote.vx = (mote.vx / speed) * MAX_VISUAL_SPEED;
          mote.vy = (mote.vy / speed) * MAX_VISUAL_SPEED;
        }

        mote.x += mote.vx * dt;
        mote.y += mote.vy * dt;
      }
    }
  }

  _applyFriendlySpacing(swarm, dt) {
    const motes = swarm.motes;
    for (let i = 0; i < motes.length; i++) {
      const a = motes[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < motes.length; j++) {
        const b = motes[j];
        if (!b.alive) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= 0.01 || d2 > 36) continue;
        const dist = Math.sqrt(d2);
        const push = ((6 - dist) / 6) * 10 * dt;
        const nx = dx / dist;
        const ny = dy / dist;
        a.vx += nx * push;
        a.vy += ny * push;
        b.vx -= nx * push;
        b.vy -= ny * push;
      }
    }
  }

  _applyEnemyCombatRepulsion(swarms, dt) {
    for (let i = 0; i < swarms.length; i++) {
      const a = swarms[i];
      if (!a.alive) continue;
      const ac = a._visualCenter || this._getSwarmCenter(a);

      for (let j = i + 1; j < swarms.length; j++) {
        const b = swarms[j];
        if (!b.alive || a.owner === b.owner) continue;
        const bc = b._visualCenter || this._getSwarmCenter(b);
        const centerDist = Math.hypot(ac.x - bc.x, ac.y - bc.y);
        if (centerDist > 90) continue;

        let spawnedFlash = false;
        for (const ma of a.motes) {
          if (!ma.alive) continue;
          for (const mb of b.motes) {
            if (!mb.alive) continue;
            const dx = ma.x - mb.x;
            const dy = ma.y - mb.y;
            const d2 = dx * dx + dy * dy;
            if (d2 <= 0.001 || d2 > COMBAT_REPEL_RADIUS * COMBAT_REPEL_RADIUS) continue;
            const dist = Math.sqrt(d2);
            const repel = ((COMBAT_REPEL_RADIUS - dist) / COMBAT_REPEL_RADIUS) * 26 * dt;
            const nx = dx / dist;
            const ny = dy / dist;
            ma.vx += nx * repel;
            ma.vy += ny * repel;
            mb.vx -= nx * repel;
            mb.vy -= ny * repel;

            if (!spawnedFlash && this._combatEventTimer <= 0) {
              spawnedFlash = true;
              this._combatEventTimer = COMBAT_EVENT_COOLDOWN;
              this.renderWorld.events.push({
                type: 'mote_combat',
                x: (ma.x + mb.x) * 0.5,
                y: (ma.y + mb.y) * 0.5,
                time: this.renderWorld.time,
              });
            }
          }
        }
      }
    }
  }

  _getSwarmCenter(swarm) {
    let cx = 0;
    let cy = 0;
    let count = 0;
    for (const mote of swarm.motes) {
      if (!mote.alive) continue;
      cx += mote.anchorX ?? mote.x;
      cy += mote.anchorY ?? mote.y;
      count++;
    }
    if (count === 0) return { x: 0, y: 0 };
    return { x: cx / count, y: cy / count };
  }

  _pruneVisualEvents() {
    const now = this.renderWorld.time;
    this.renderWorld.events = this.renderWorld.events.filter(ev => now - ev.time < 0.35);
  }
}
