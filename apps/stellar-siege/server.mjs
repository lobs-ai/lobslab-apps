import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server as SocketIOServer } from "socket.io";
import {
  BaseTypes,
  GameEngine as LanceGameEngine,
  GameObject,
  ServerEngine,
} from "lance-gg";

import { Game, GameState } from "./js/game/Game.js";
import { createStellarLanceClasses } from "./js/net/lance/schema.js";

const { StellarNodeObject, StellarSwarmObject } = createStellarLanceClasses({ GameObject, BaseTypes });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;

  const normalized = pathname.replace(/^\//, "");
  const filePath = path.join(__dirname, normalized);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  const ext = path.extname(filePath).toLowerCase();
  if (!MIME[ext]) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache, must-revalidate",
    });
    res.end(data);
  });
});

const io = new SocketIOServer(server, {
  serveClient: false,
  cors: { origin: true, credentials: true },
});

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const lobbies = new Map();
const clientLobby = new Map();

function generateCode() {
  let code = "";
  do {
    code = "";
    for (let i = 0; i < 6; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
  } while (lobbies.has(code));
  return code;
}

function emitSafe(socket, event, payload) {
  try {
    if (socket?.connected) socket.emit(event, payload);
  } catch {
    // ignore closing socket failures
  }
}

class StellarServerGameEngine extends LanceGameEngine {
  constructor() {
    super({ traceLevel: 0 });
    this.matches = new Map();
    this.playerToMatch = new Map();
    this.serverEngineRef = null;
    this.io = null;

    this.on("postStep", () => {
      this._updateMatches(1 / 60);
    });
  }

  attachNetworking(serverEngineRef, ioRef) {
    this.serverEngineRef = serverEngineRef;
    this.io = ioRef;
  }

  registerClasses(serializer) {
    serializer.registerClass(StellarNodeObject);
    serializer.registerClass(StellarSwarmObject);
  }

  processInput(inputDesc, socketPlayerId, isServer) {
    if (!isServer) return;

    const code = this.playerToMatch.get(socketPlayerId);
    if (!code) return;

    const match = this.matches.get(code);
    if (!match || !match.game || match.game.state !== GameState.PLAYING) return;

    const compactPlayerId = match.socketToCompact.get(socketPlayerId);
    if (compactPlayerId == null) return;

    const action = inputDesc.options || {};
    const world = match.game.world;

    if (inputDesc.input === "send_energy") {
      const source = world.getNodeById(action.sourceId);
      const target = world.getNodeById(action.targetId);
      if (!source || !target) return;
      if (source.owner !== compactPlayerId) return;
      match.game.sendEnergy(source, target, action.ratio ?? 0.5);
      return;
    }

    if (inputDesc.input === "redirect_swarm") {
      const swarm = world.swarms.find(s => s.id === action.swarmId && s.alive);
      if (!swarm || swarm.owner !== compactPlayerId) return;

      const targetNode = action.targetNodeId != null ? world.getNodeById(action.targetNodeId) : null;
      match.game.redirectSwarm(swarm, targetNode, action.targetPos ?? null, compactPlayerId);
    }
  }

  startMatch(lobby) {
    if (this.matches.has(lobby.code)) return;

    const gameSlots = lobby.config.slots.map(slot => {
      if (slot.type === "human" && slot.taken) return { type: "human" };
      if (slot.type === "open" && slot.taken) return { type: "human" };
      if (slot.type === "ai") return { type: "ai", difficulty: slot.difficulty || "medium" };
      return { type: "closed" };
    });

    const game = new Game();
    game.startMultiplayerGame({
      mapSize: lobby.config.mapSize || "medium",
      slots: gameSlots,
    });

    const roomName = `match:${lobby.code}`;
    this.serverEngineRef.createRoom(roomName);

    const match = {
      code: lobby.code,
      roomName,
      lobby,
      game,
      socketToCompact: new Map(),
      nodeObjects: new Map(),
      swarmObjects: new Map(),
    };
    this.matches.set(lobby.code, match);

    const roster = game.world.players.map(player => {
      let name = `Player ${player.id + 1}`;

      for (const [, info] of lobby.clients) {
        const compactId = game._slotToPlayer?.[info.playerId];
        if (compactId === player.id) {
          name = info.name || name;
          break;
        }
      }

      if (!player.isHuman) {
        name = `AI (${player.difficulty || "medium"})`;
      }

      return {
        id: player.id,
        color: player.color,
        isHuman: player.isHuman,
        alive: player.alive,
        difficulty: player.difficulty,
        name,
      };
    });

    for (const [socket, info] of lobby.clients) {
      const compactId = game._slotToPlayer?.[info.playerId];
      if (compactId == null) continue;

      match.socketToCompact.set(socket.playerId, compactId);
      this.playerToMatch.set(socket.playerId, lobby.code);
      this.serverEngineRef.assignPlayerToRoom(socket.playerId, roomName);

      emitSafe(socket, "game_start", {
        playerId: compactId,
        world: { width: game.world.width, height: game.world.height },
        players: roster,
      });
    }

    for (const node of game.world.nodes) {
      const obj = this._createNodeObject(node);
      this.addObjectToWorld(obj);
      this.serverEngineRef.assignObjectToRoom(obj, roomName);
      match.nodeObjects.set(node.id, obj);
    }
  }

  removePlayer(socketPlayerId) {
    const code = this.playerToMatch.get(socketPlayerId);
    if (!code) return;
    this.destroyMatch(code, "Player disconnected");
  }

  destroyMatch(code, reason = "Match closed", notifyClients = true) {
    const match = this.matches.get(code);
    if (!match) return;

    for (const obj of match.nodeObjects.values()) {
      if (this.world.objects[obj.id]) this.removeObjectFromWorld(obj.id);
    }
    for (const obj of match.swarmObjects.values()) {
      if (this.world.objects[obj.id]) this.removeObjectFromWorld(obj.id);
    }

    for (const socketPlayerId of match.socketToCompact.keys()) {
      this.playerToMatch.delete(socketPlayerId);
    }
    for (const socket of match.lobby.clients.keys()) {
      clientLobby.delete(socket.id);
    }
    lobbies.delete(code);

    if (notifyClients) {
      for (const socket of match.lobby.clients.keys()) {
        emitSafe(socket, "error_message", { message: reason });
      }
    }

    match.nodeObjects.clear();
    match.swarmObjects.clear();
    this.matches.delete(code);
  }

  _updateMatches(dt) {
    for (const match of this.matches.values()) {
      if (match.game.state !== GameState.PLAYING) continue;

      match.game.update(dt);
      this._syncNodes(match);
      this._syncSwarms(match);

      if (match.game.state === GameState.GAME_OVER) {
        const winnerId = match.game.winner?.id ?? null;
        for (const socket of match.lobby.clients.keys()) {
          emitSafe(socket, "game_over", { winnerId });
        }
        this.destroyMatch(match.code, "Match complete", false);
      }
    }
  }

  _createNodeObject(node) {
    return new StellarNodeObject(this, { id: this.world.getNewId() }, {
      playerId: node.owner ?? 0,
      nodeId: node.id,
      nodeType: node.type,
      ownerId: node.owner ?? -1,
      energy: node.energy,
      maxEnergy: node.maxEnergy,
      productionRate: node.productionRate,
      defense: node.defense,
      radius: node.radius,
      x: node.position.x,
      y: node.position.y,
      upgrade: node.upgrade || "",
      pulsePhase: node.pulsePhase || 0,
      captureFlash: node.captureFlash || 0,
    });
  }

  _syncNodes(match) {
    for (const node of match.game.world.nodes) {
      const obj = match.nodeObjects.get(node.id);
      if (!obj) continue;

      obj.playerId = node.owner ?? 0;
      obj.nodeType = node.type;
      obj.ownerId = node.owner ?? -1;
      obj.energy = node.energy;
      obj.maxEnergy = node.maxEnergy;
      obj.productionRate = node.productionRate;
      obj.defense = node.defense;
      obj.radius = node.radius;
      obj.x = node.position.x;
      obj.y = node.position.y;
      obj.upgrade = node.upgrade || "";
      obj.pulsePhase = node.pulsePhase || 0;
      obj.captureFlash = node.captureFlash || 0;
    }
  }

  _syncSwarms(match) {
    const liveSwarmIds = new Set();

    for (const swarm of match.game.world.swarms) {
      if (!swarm.alive) continue;

      const aliveMotes = swarm.motes.filter(m => m.alive);
      if (aliveMotes.length === 0) continue;

      liveSwarmIds.add(swarm.id);

      let centerX = 0;
      let centerY = 0;
      for (const mote of aliveMotes) {
        centerX += mote.x;
        centerY += mote.y;
      }
      centerX /= aliveMotes.length;
      centerY /= aliveMotes.length;

      let targetX = centerX;
      let targetY = centerY;
      let targetNodeId = -1;
      if (swarm.target.type === "node") {
        targetNodeId = swarm.target.nodeId;
        const node = match.game.world.getNodeById(targetNodeId);
        if (node) {
          targetX = node.position.x;
          targetY = node.position.y;
        }
      } else {
        targetX = swarm.target.x;
        targetY = swarm.target.y;
      }

      let obj = match.swarmObjects.get(swarm.id);
      if (!obj) {
        obj = new StellarSwarmObject(this, { id: this.world.getNewId() }, {
          playerId: swarm.owner,
          swarmId: swarm.id,
          ownerId: swarm.owner,
          sourceNodeId: swarm.sourceId,
          targetNodeId,
          moteCount: aliveMotes.length,
          centerX,
          centerY,
          targetX,
          targetY,
        });
        this.addObjectToWorld(obj);
        this.serverEngineRef.assignObjectToRoom(obj, match.roomName);
        match.swarmObjects.set(swarm.id, obj);
      }

      obj.playerId = swarm.owner;
      obj.ownerId = swarm.owner;
      obj.sourceNodeId = swarm.sourceId;
      obj.targetNodeId = targetNodeId;
      obj.moteCount = aliveMotes.length;
      obj.centerX = centerX;
      obj.centerY = centerY;
      obj.targetX = targetX;
      obj.targetY = targetY;
    }

    for (const [swarmId, obj] of [...match.swarmObjects.entries()]) {
      if (liveSwarmIds.has(swarmId)) continue;
      if (this.world.objects[obj.id]) this.removeObjectFromWorld(obj.id);
      match.swarmObjects.delete(swarmId);
    }
  }
}

class Lobby {
  constructor(hostSocket, config, gameEngine) {
    this.code = generateCode();
    this.host = hostSocket;
    this.config = config;
    this.clients = new Map();
    this.started = false;
    this.gameEngine = gameEngine;

    for (const slot of this.config.slots) {
      slot.taken = slot.taken || false;
    }
    this.config.slots[0].taken = true;

    this.clients.set(hostSocket, {
      playerId: 0,
      name: config.name || "Player 1",
    });
    clientLobby.set(hostSocket.id, this);
  }

  addClient(socket, name) {
    const slotIdx = this.config.slots.findIndex(slot => slot.type === "open" && !slot.taken);
    if (slotIdx === -1) return null;

    this.config.slots[slotIdx].taken = true;
    this.clients.set(socket, {
      playerId: slotIdx,
      name: name || "Player",
    });
    clientLobby.set(socket.id, this);
    return slotIdx;
  }

  removeClient(socket) {
    const info = this.clients.get(socket);
    if (!info) return;

    const slot = this.config.slots[info.playerId];
    if (slot) slot.taken = false;

    this.clients.delete(socket);
    clientLobby.delete(socket.id);

    if (this.started) {
      this.destroy("Player disconnected");
      return;
    }

    if (socket === this.host) {
      this.destroy("Host left the lobby");
      return;
    }

    this.broadcastLobbyUpdate();
  }

  countPlayers() {
    return this.config.slots.filter(slot =>
      (slot.type === "human" && slot.taken) ||
      (slot.type === "open" && slot.taken) ||
      slot.type === "ai",
    ).length;
  }

  serialize() {
    const hostInfo = this.clients.get(this.host);
    return {
      code: this.code,
      config: {
        mapSize: this.config.mapSize,
        slots: this.config.slots.map((slot, index) => ({
          index,
          type: slot.type,
          difficulty: slot.difficulty || null,
          taken: slot.taken || false,
        })),
      },
      players: [...this.clients.values()].map(info => ({
        playerId: info.playerId,
        isHost: hostInfo?.playerId === info.playerId,
        name: info.name || "Player",
      })),
    };
  }

  broadcastLobbyUpdate() {
    const lobby = this.serialize();
    for (const socket of this.clients.keys()) {
      emitSafe(socket, "lobby_update", { lobby });
    }
  }

  start() {
    if (this.started) return;
    if (this.countPlayers() < 2) return;

    this.started = true;
    this.gameEngine.startMatch(this);
  }

  destroy(reason = "Lobby closed") {
    if (this.started) {
      this.gameEngine.destroyMatch(this.code, reason);
    }

    for (const socket of this.clients.keys()) {
      emitSafe(socket, "error_message", { message: reason });
      clientLobby.delete(socket.id);
    }
    this.clients.clear();
    lobbies.delete(this.code);
  }
}

const gameEngine = new StellarServerGameEngine();
const serverEngine = new ServerEngine(io, gameEngine, {
  stepRate: 60,
  updateRate: 2,
  fullSyncRate: 30,
  timeoutInterval: 120,
});
gameEngine.attachNetworking(serverEngine, io);
serverEngine.start();

io.on("connection", socket => {
  socket.on("create_lobby", config => {
    const existing = clientLobby.get(socket.id);
    if (existing) existing.removeClient(socket);

    const slots = (config?.slots || []).map((slot, index) => {
      if (index === 0) return { type: "human", taken: false };
      if (slot.type === "open") return { type: "open", taken: false };
      if (slot.type === "ai") return { type: "ai", difficulty: slot.difficulty || "medium", taken: false };
      return { type: "closed", taken: false };
    });
    if (slots.length < 2) slots.push({ type: "ai", difficulty: "medium", taken: false });

    const lobby = new Lobby(socket, {
      mapSize: config?.mapSize || "medium",
      slots,
      name: config?.name || "Player 1",
    }, gameEngine);
    lobbies.set(lobby.code, lobby);

    emitSafe(socket, "lobby_created", {
      code: lobby.code,
      lobby: lobby.serialize(),
    });
  });

  socket.on("join_lobby", ({ code, name }) => {
    const lobby = lobbies.get((code || "").toUpperCase());
    if (!lobby) {
      emitSafe(socket, "error_message", { message: "Lobby not found" });
      return;
    }
    if (lobby.started) {
      emitSafe(socket, "error_message", { message: "Game already started" });
      return;
    }

    const playerId = lobby.addClient(socket, name || "Player");
    if (playerId == null) {
      emitSafe(socket, "error_message", { message: "Lobby is full" });
      return;
    }

    const serialized = lobby.serialize();
    emitSafe(socket, "lobby_joined", { lobby: serialized, playerId });
    lobby.broadcastLobbyUpdate();
  });

  socket.on("start_game", () => {
    const lobby = clientLobby.get(socket.id);
    if (!lobby) return;
    if (socket !== lobby.host) return;
    lobby.start();
  });

  socket.on("leave", () => {
    const lobby = clientLobby.get(socket.id);
    if (lobby) lobby.removeClient(socket);
  });

  socket.on("disconnect", () => {
    const lobby = clientLobby.get(socket.id);
    if (lobby) lobby.removeClient(socket);
  });
});

server.listen(PORT, () => {
  console.log(`Stellar Siege running at http://localhost:${PORT}`);
});
