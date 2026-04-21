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
// Swarm visual physics — local Boids: separation + alignment + cohesion + target steering
const STEER_FORCE        = 320;  // each mote steers toward swarm target
const NEIGHBOR_RADIUS    = 38;   // local interaction radius for alignment + cohesion
const SEPARATION_RADIUS  = 13;   // motes push apart within this range
const SEPARATION_FORCE   = 160;
const LOCAL_ALIGN        = 6;    // steer toward avg velocity of local neighbors
const LOCAL_COHESION     = 3;    // move toward center of local neighborhood
const BOUNDARY_RADIUS    = 48;   // soft containment: only pulls if mote strays this far from anchor
const BOUNDARY_SPRING    = 7;    // spring constant (px/s² per px outside boundary)
const TURB_STRENGTH      = 25;   // light turbulence, unique per mote via seed
const VELOCITY_DAMPING   = 0.91;
const MAX_VISUAL_SPEED   = 100;
const COMBAT_REPEL_RADIUS    = 12;
const COMBAT_EVENT_COOLDOWN  = 0.08;

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
      const seed = obj.swarmId * 997 + idx * 131;
      // Spread new motes around the center so separation has natural material to work with
      const spawnAngle = (seed * 0.23917) % (Math.PI * 2);
      const spawnR = 3 + (seed % 7) * 1.8;
      swarm.motes.push({
        alive: true,
        seed,
        phase: ((obj.swarmId * 31 + idx * 17) % 360) / 360,
        x: obj.centerX + Math.cos(spawnAngle) * spawnR,
        y: obj.centerY + Math.sin(spawnAngle) * spawnR,
        vx: Math.cos(spawnAngle) * 8,
        vy: Math.sin(spawnAngle) * 8,
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
    const time = this.renderWorld.time;
    this._combatEventTimer = Math.max(0, this._combatEventTimer - dt);

    for (const swarm of swarms) {
      if (!swarm.alive) continue;

      const motes = swarm.motes;

      // Server-authoritative anchor center (where the swarm actually is)
      let aliveCount = 0, anchorX = 0, anchorY = 0;
      for (const m of motes) {
        if (!m.alive) continue;
        aliveCount++;
        anchorX += m.anchorX ?? m.x;
        anchorY += m.anchorY ?? m.y;
      }
      if (aliveCount === 0) continue;
      anchorX /= aliveCount;
      anchorY /= aliveCount;

      // Get swarm target from first alive mote
      let tgtX = anchorX, tgtY = anchorY;
      for (const m of motes) {
        if (m.alive) { tgtX = m.targetX ?? anchorX; tgtY = m.targetY ?? anchorY; break; }
      }

      // Local Boids — O(N²) single pass: separation + alignment + cohesion
      for (let i = 0; i < motes.length; i++) {
        const a = motes[i];
        if (!a.alive) continue;

        let cnt = 0, avgVx = 0, avgVy = 0, nbrCx = 0, nbrCy = 0;
        for (let j = 0; j < motes.length; j++) {
          if (i === j) continue;
          const b = motes[j];
          if (!b.alive) continue;
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 0.01) continue;
          const d = Math.sqrt(d2);
          if (d < SEPARATION_RADIUS) {
            const push = SEPARATION_FORCE * (1 - d / SEPARATION_RADIUS) * dt;
            a.vx += (dx / d) * push;
            a.vy += (dy / d) * push;
          }
          if (d < NEIGHBOR_RADIUS) {
            cnt++;
            avgVx += b.vx; avgVy += b.vy;
            nbrCx += b.x;  nbrCy += b.y;
          }
        }
        if (cnt > 0) {
          // Alignment — steer toward neighbors' average heading
          a.vx += (avgVx / cnt - a.vx) * LOCAL_ALIGN * dt;
          a.vy += (avgVy / cnt - a.vy) * LOCAL_ALIGN * dt;
          // Local cohesion — drift toward neighborhood center (not global anchor)
          a.vx += (nbrCx / cnt - a.x) * LOCAL_COHESION * dt;
          a.vy += (nbrCy / cnt - a.y) * LOCAL_COHESION * dt;
        }
      }

      // Per-mote forces
      for (const mote of motes) {
        if (!mote.alive) continue;
        const s = mote.seed * 0.00017;

        // Target steering
        const toTX = tgtX - mote.x, toTY = tgtY - mote.y;
        const toTLen = Math.hypot(toTX, toTY) || 1;
        mote.vx += (toTX / toTLen) * STEER_FORCE * dt;
        mote.vy += (toTY / toTLen) * STEER_FORCE * dt;

        // Three-harmonic turbulence, unique per mote via seed
        mote.vx += Math.sin(time * 2.1 + s * 41)  * TURB_STRENGTH        * dt
                 + Math.sin(time * 4.9 + s * 23)  * TURB_STRENGTH * 0.55 * dt
                 + Math.sin(time * 10.3 + s * 11) * TURB_STRENGTH * 0.28 * dt;
        mote.vy += Math.cos(time * 1.7 + s * 37 + 1.7)  * TURB_STRENGTH        * dt
                 + Math.cos(time * 4.3 + s * 17 + 2.9)  * TURB_STRENGTH * 0.55 * dt
                 + Math.cos(time * 8.9 + s *  9 + 0.5)  * TURB_STRENGTH * 0.28 * dt;

        // Soft boundary spring — no pull inside radius, gentle restoring force outside
        const bDX = anchorX - mote.x, bDY = anchorY - mote.y;
        const bDist = Math.hypot(bDX, bDY);
        if (bDist > BOUNDARY_RADIUS) {
          const overshoot = bDist - BOUNDARY_RADIUS;
          mote.vx += (bDX / bDist) * BOUNDARY_SPRING * overshoot * dt;
          mote.vy += (bDY / bDist) * BOUNDARY_SPRING * overshoot * dt;
        }
      }

      swarm._visualCenter = { x: anchorX, y: anchorY };
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
