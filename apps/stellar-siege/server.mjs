import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

// Import game modules for server-side simulation
import { Game, GameState } from "./js/game/Game.js";
import { seedRng } from "./js/utils/rng.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const MIME = {
  ".html": "text/html",
  ".css":  "text/css",
  ".js":   "application/javascript",
  ".json": "application/json",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
};

// ========== HTTP Server ==========

const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, req.url === "/" ? "index.html" : req.url);
  const ext = path.extname(filePath);

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    return res.end("Not found");
  }

  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
});

// ========== WebSocket Server ==========

const wss = new WebSocketServer({ server });

/** @type {Map<string, Lobby>} code -> Lobby */
const lobbies = new Map();

/** @type {Map<WebSocket, Lobby>} ws -> Lobby they're in */
const clientLobby = new Map();

// ===== Invite code generation =====

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous I/O/0/1

function generateCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
  } while (lobbies.has(code));
  return code;
}

// ===== Lobby =====

class Lobby {
  /**
   * @param {WebSocket} hostWs
   * @param {{ mapSize: string, slots: Array<{type: string, difficulty?: string}> }} config
   */
  constructor(hostWs, config) {
    this.code = generateCode();
    this.host = hostWs;
    this.config = config;
    /** @type {Map<WebSocket, { playerId: number, name: string }>} */
    this.clients = new Map();
    this.game = null;
    this.started = false;
    this.tickInterval = null;
    this.stateTickCounter = 0;

    // Normalize slots — ensure slot 0 is always the host
    // Ensure each slot has a 'taken' flag for tracking human joins
    for (const slot of this.config.slots) {
      slot.taken = slot.taken || false;
    }
    // Host takes slot 0
    this.config.slots[0].taken = true;

    // Assign host as player 0 — name comes from config.name
    this.clients.set(hostWs, { playerId: 0, name: config.name || 'Player 1' });
    clientLobby.set(hostWs, this);
  }

  /**
   * Add a human client to the next open slot.
   * @param {WebSocket} ws
   * @param {string}    [name]  - display name for this player
   * @returns {number|null} playerId or null if no room
   */
  addClient(ws, name) {
    // Find an open (human) slot that isn't taken
    const slotIdx = this.config.slots.findIndex(s => s.type === 'open' && !s.taken);
    if (slotIdx === -1) return null;

    this.config.slots[slotIdx].taken = true;
    this.config.slots[slotIdx].wsId = ws; // track which ws is in this slot

    const playerId = slotIdx;
    this.clients.set(ws, { playerId, name: name || 'Player' });
    clientLobby.set(ws, this);
    return playerId;
  }

  /**
   * Remove a client from the lobby.
   */
  removeClient(ws) {
    const info = this.clients.get(ws);
    if (!info) return;

    // Free up the slot
    const slot = this.config.slots[info.playerId];
    if (slot) {
      slot.taken = false;
      delete slot.wsId;
    }

    this.clients.delete(ws);
    clientLobby.delete(ws);

    // If host left, destroy lobby
    if (ws === this.host) {
      this.destroy('Host left the lobby');
      return;
    }

    // If game is already running and player leaves, just disconnect them
    if (!this.started) {
      this.broadcastLobbyUpdate();
    }
  }

  /**
   * Serialize lobby state for clients.
   */
  serialize() {
    const hostInfo = this.clients.get(this.host);
    return {
      code: this.code,
      config: {
        mapSize: this.config.mapSize,
        slots: this.config.slots.map((s, i) => ({
          index: i,
          type: s.type,
          difficulty: s.difficulty || null,
          taken: s.taken || false,
        })),
      },
      players: [...this.clients.values()].map(c => ({
        playerId: c.playerId,
        isHost: hostInfo?.playerId === c.playerId,
        name: c.name || 'Player',
      })),
    };
  }

  broadcastLobbyUpdate() {
    const msg = JSON.stringify({ type: 'lobby_update', lobby: this.serialize() });
    for (const ws of this.clients.keys()) {
      safeSend(ws, msg);
    }
  }

  /**
   * Count total active players (humans + AIs).
   */
  countPlayers() {
    let count = 0;
    for (const slot of this.config.slots) {
      if (slot.type === 'human' && slot.taken) count++;
      else if (slot.type === 'open' && slot.taken) count++;
      else if (slot.type === 'ai') count++;
    }
    return count;
  }

  /**
   * Start the game.
   */
  start() {
    if (this.started) return;
    if (this.countPlayers() < 2) return;

    this.started = true;
    this.actionSeq = 0;

    // Build game slots — map lobby slots to game slots
    // Filter out closed and untaken open slots
    const gameSlots = [];
    for (const slot of this.config.slots) {
      if (slot.type === 'human' && slot.taken) {
        gameSlots.push({ type: 'human' });
      } else if (slot.type === 'open' && slot.taken) {
        gameSlots.push({ type: 'human' });
      } else if (slot.type === 'open' && !slot.taken) {
        // Skip untaken open slots
        gameSlots.push({ type: 'closed' });
      } else if (slot.type === 'ai') {
        gameSlots.push({ type: 'ai', difficulty: slot.difficulty || 'medium' });
      } else {
        // closed
        gameSlots.push({ type: 'closed' });
      }
    }

    // Create game
    this.game = new Game();
    this.game.startMultiplayerGame({
      mapSize: this.config.mapSize,
      slots: gameSlots,
    });

    // Build slot -> compactId mapping from game
    this.slotToPlayer = this.game._slotToPlayer || {};

    // Seed the deterministic RNG — same seed goes to all clients so
    // mote positions, jitter, and swarm behavior are identical everywhere.
    this.gameSeed = Date.now() & 0x7FFFFFFF;
    seedRng(this.gameSeed);

    // Send initial state to all clients
    const fullState = this.serializeFullState();
    for (const [ws, info] of this.clients) {
      const compactId = this.slotToPlayer[info.playerId] ?? info.playerId;
      safeSend(ws, JSON.stringify({
        type: 'game_start',
        initialState: fullState,
        playerId: compactId,
        seed: this.gameSeed,
      }));
    }

    // Server simulation runs at the same tick rate as clients (1/60s).
    // This makes the server an exact copy of the client simulation —
    // it's the authoritative state that all clients sync to.
    const SIM_TICK = 1 / 60;
    const SIM_TICK_MS = Math.round(SIM_TICK * 1000); // ~16ms
    const SYNC_INTERVAL = 30; // send sync every 30 ticks (~0.5s) — client relies on server for state
    this.stateTickCounter = 0;

    this.tickInterval = setInterval(() => {
      if (!this.game) return;

      if (this.game.state === GameState.GAME_OVER) {
        const winnerId = this.game.winner?.id ?? null;
        const msg = JSON.stringify({ type: 'game_over', winnerId });
        for (const ws of this.clients.keys()) safeSend(ws, msg);
        clearInterval(this.tickInterval);
        this.tickInterval = null;
        setTimeout(() => this.destroy(), 5000);
        return;
      }

      if (this.game.state !== GameState.PLAYING) return;

      // Snapshot swarm count before update so we can detect new AI swarms
      const swarmCountBefore = this.game.world.swarms.length;

      // Single tick — same dt as every client frame
      this.game.update(SIM_TICK);

      // Broadcast any swarms that AI created during this tick
      const newSwarms = this.game.world.swarms.slice(swarmCountBefore);
      for (const swarm of newSwarms) {
        const player = this.game.world.players.find(p => p.id === swarm.owner);
        if (player && !player.isHuman) {
          const targetNodeId = swarm.target.type === 'node' ? swarm.target.nodeId : null;
          if (targetNodeId == null) continue;
          const broadcastAction = {
            type: 'action_broadcast',
            action: {
              type: 'send_energy',
              sourceId: swarm.sourceId,
              targetId: targetNodeId,
              playerId: swarm.owner,
              amount: swarm.motes.filter(m => m.alive).length,
              swarmId: swarm.id,
            },
            seq: this.actionSeq++,
          };
          const aiMsg = JSON.stringify(broadcastAction);
          for (const ws of this.clients.keys()) safeSend(ws, aiMsg);
        }
      }

      // Send authoritative sync every SYNC_INTERVAL ticks (~2s)
      this.stateTickCounter++;
      if (this.stateTickCounter >= SYNC_INTERVAL) {
        this.stateTickCounter = 0;
        const state = this.serializeState();
        const msg = JSON.stringify({ type: 'sync', state });
        for (const ws of this.clients.keys()) safeSend(ws, msg);
      }
    }, SIM_TICK_MS);
  }

  /**
   * Handle a player action — broadcast to all clients, then apply to server state.
   */
  handleAction(ws, action) {
    if (!this.game || this.game.state !== GameState.PLAYING) return;

    const info = this.clients.get(ws);
    if (!info) return;

    // Map slot index to compact player ID
    const slotId = info.playerId;
    const playerId = this.slotToPlayer?.[slotId] ?? slotId;
    const world = this.game.world;

    // Validate the action before broadcasting
    let valid = false;
    switch (action.type) {
      case 'send_energy': {
        const source = world.getNodeById(action.sourceId);
        const target = world.getNodeById(action.targetId);
        if (source && target && source.owner === playerId) valid = true;
        break;
      }
      case 'redirect_swarm': {
        // Swarms are client-local — just trust the playerId ownership claim
        // (server doesn't track mote positions anyway)
        valid = true;
        break;
      }
    }

    if (!valid) return;

    // Apply to server state FIRST, computing exact amounts.
    // Then broadcast with exact amounts so all clients produce identical results.
    const broadcastAction = { type: 'action_broadcast', action: { ...action, playerId }, seq: this.actionSeq++ };

    switch (action.type) {
      case 'send_energy': {
        const source = world.getNodeById(action.sourceId);
        const target = world.getNodeById(action.targetId);
        if (source && target) {
          // Compute exact mote count from server's current energy
          const amount = Math.floor(source.energy * (action.ratio ?? 0.5));
          if (amount < 5) return; // not enough energy — don't broadcast
          const swarm = this.game.sendEnergyExact(source, target, amount, playerId);
          // Include exact amount and swarm ID so clients create identical swarms
          broadcastAction.action.amount = amount;
          if (swarm) broadcastAction.action.swarmId = swarm.id;
        } else {
          return; // invalid — don't broadcast
        }
        break;
      }
      case 'redirect_swarm': {
        // Server doesn't track client swarms — just pass through
        break;
      }
    }

    // Broadcast to ALL clients (including sender)
    const broadcastMsg = JSON.stringify(broadcastAction);
    for (const ws of this.clients.keys()) safeSend(ws, broadcastMsg);
  }

  /**
   * Serialize full state (initial — includes positions, etc.).
   */
  serializeFullState() {
    const w = this.game.world;
    return {
      width: w.width,
      height: w.height,
      time: w.time,
      nodes: w.nodes.map(n => ({
        id: n.id,
        type: n.type,
        owner: n.owner,
        energy: n.energy,
        maxEnergy: n.maxEnergy,
        productionRate: n.productionRate,
        defense: n.defense,
        radius: n.radius,
        position: { x: n.position.x, y: n.position.y },
        upgrade: n.upgrade,
        pulsePhase: n.pulsePhase,
        captureFlash: 0,
      })),
      players: w.players.map(p => {
        // Build a reverse map from compact playerId -> name via slotToPlayer
        // slotToPlayer maps slotIdx -> compactId; clients maps ws -> {playerId:slotIdx, name}
        let name = `Player ${p.id + 1}`;
        for (const [, info] of this.clients) {
          const compactId = this.slotToPlayer?.[info.playerId] ?? info.playerId;
          if (compactId === p.id) { name = info.name || name; break; }
        }
        return {
          id: p.id,
          color: p.color,
          isHuman: p.isHuman,
          alive: p.alive,
          difficulty: p.difficulty,
          name,
        };
      }),
      swarms: [],
      events: [],
    };
  }

  /**
   * Serialize lightweight sync state — node ownership/energy only, no mote positions.
   * Clients run their own simulation; this is just for drift correction.
   */
  serializeState() {
    const w = this.game.world;
    return {
      time: w.time,
      nodes: w.nodes.map(n => ({
        id: n.id,
        owner: n.owner,
        energy: Math.round(n.energy),
      })),
      players: w.players.map(p => ({ id: p.id, alive: p.alive })),
    };
  }

  /**
   * Destroy the lobby and disconnect all clients.
   */
  destroy(reason) {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    const msg = JSON.stringify({ type: 'error', message: reason || 'Lobby closed' });
    for (const ws of this.clients.keys()) {
      safeSend(ws, msg);
      clientLobby.delete(ws);
    }
    this.clients.clear();
    lobbies.delete(this.code);
    this.game = null;
  }
}

// ===== Helpers =====

function safeSend(ws, msg) {
  try {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(msg);
    }
  } catch (e) {
    // Ignore send errors on closing connections
  }
}

// ===== WebSocket connection handler =====

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      // ---- Lobby creation ----
      case 'create_lobby': {
        // If client is already in a lobby, leave it first
        const existing = clientLobby.get(ws);
        if (existing) existing.removeClient(ws);

        const config = msg.config || {};
        // Normalize slots
        const slots = (config.slots || []).map((s, i) => {
          if (i === 0) return { type: 'human', taken: false }; // host slot, taken in constructor
          if (s.type === 'open') return { type: 'open', taken: false };
          if (s.type === 'ai') return { type: 'ai', difficulty: s.difficulty || 'medium', taken: false };
          return { type: 'closed', taken: false };
        });

        // Ensure at least 2 slots
        if (slots.length < 2) {
          slots.push({ type: 'ai', difficulty: 'medium', taken: false });
        }

        const lobby = new Lobby(ws, {
          mapSize: config.mapSize || 'medium',
          slots,
        });
        lobbies.set(lobby.code, lobby);

        safeSend(ws, JSON.stringify({
          type: 'lobby_created',
          code: lobby.code,
          lobby: lobby.serialize(),
        }));
        break;
      }

      // ---- Joining ----
      case 'join_lobby': {
        const existing = clientLobby.get(ws);
        if (existing) existing.removeClient(ws);

        const code = (msg.code || '').toUpperCase();
        const lobby = lobbies.get(code);

        if (!lobby) {
          safeSend(ws, JSON.stringify({ type: 'error', message: 'Lobby not found' }));
          break;
        }
        if (lobby.started) {
          safeSend(ws, JSON.stringify({ type: 'error', message: 'Game already started' }));
          break;
        }

        const playerId = lobby.addClient(ws, msg.name || 'Player');
        if (playerId === null) {
          safeSend(ws, JSON.stringify({ type: 'error', message: 'Lobby is full' }));
          break;
        }

        safeSend(ws, JSON.stringify({
          type: 'lobby_joined',
          lobby: lobby.serialize(),
          playerId,
        }));

        // Notify other clients
        lobby.broadcastLobbyUpdate();
        break;
      }

      // ---- Start game (host only) ----
      case 'start_game': {
        const lobby = clientLobby.get(ws);
        if (!lobby) {
          safeSend(ws, JSON.stringify({ type: 'error', message: 'Not in a lobby' }));
          break;
        }
        if (lobby.host !== ws) {
          safeSend(ws, JSON.stringify({ type: 'error', message: 'Only host can start' }));
          break;
        }
        if (lobby.countPlayers() < 2) {
          safeSend(ws, JSON.stringify({ type: 'error', message: 'Need at least 2 players' }));
          break;
        }
        lobby.start();
        break;
      }

      // ---- In-game action ----
      case 'action': {
        const lobby = clientLobby.get(ws);
        if (!lobby || !lobby.started) break;
        lobby.handleAction(ws, msg.action);
        break;
      }

      // ---- Leave ----
      case 'leave': {
        const lobby = clientLobby.get(ws);
        if (lobby) lobby.removeClient(ws);
        break;
      }
    }
  });

  ws.on('close', () => {
    const lobby = clientLobby.get(ws);
    if (lobby) lobby.removeClient(ws);
  });

  ws.on('error', () => {
    const lobby = clientLobby.get(ws);
    if (lobby) lobby.removeClient(ws);
  });
});

// ========== Start ==========

server.listen(PORT, () => {
  console.log(`Stellar Siege running on http://localhost:${PORT}`);
});
