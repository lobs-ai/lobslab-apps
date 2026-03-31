// ── Ballz Royale Server ──
// HTTP static file serving + WebSocket game server

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

// Import shared game logic
import {
  BALL_RADIUS, POCKET_RADIUS, FRICTION, MIN_SPEED, MAX_POWER,
  PHYSICS_STEPS, WALL_RESTITUTION, BALL_RESTITUTION,
  EXPLOSION_RADIUS, EXPLOSION_FORCE,
  STORM_SHRINK_INTERVAL, STORM_SHRINK_AMOUNT, STORM_MIN_PERCENT,
  ITEM_SPAWN_INTERVAL, ITEM_MAX_PER_PLAYER, ITEM_RADIUS,
  ARENA_SCALE, POCKET_COUNT, BALL_SPAWN_DISTANCE,
  CANONICAL_SIZE, TURN_TIMER,
  PLAYER_COLORS, ITEM_TYPES,
  AI_ACCURACY_SPREAD,
} from './js/constants.js';
import { dist, distSq, pick, randRange } from './js/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ?? 3000;

// ════════════════════════════════════════════════════════════════
//  HTTP Static File Server
// ════════════════════════════════════════════════════════════════

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
};

const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  filePath = path.join(__dirname, filePath);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME[ext] ?? 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, must-revalidate',
    });
    res.end(data);
  });
});

// ════════════════════════════════════════════════════════════════
//  WebSocket Server
// ════════════════════════════════════════════════════════════════

const wss = new WebSocketServer({ server: httpServer });
const rooms = new Map(); // code → Room

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I, O to avoid confusion
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

wss.on('connection', (ws) => {
  ws._roomCode = null;
  ws._playerIndex = -1;
  ws._alive = true;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    handleMessage(ws, msg);
  });

  ws.on('close', () => {
    ws._alive = false;
    if (ws._roomCode && rooms.has(ws._roomCode)) {
      const room = rooms.get(ws._roomCode);
      room.handleDisconnect(ws._playerIndex);
    }
  });

  ws.on('pong', () => { ws._alive = true; });
});

// Heartbeat — detect dead connections
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws._alive) return ws.terminate();
    ws._alive = false;
    ws.ping();
  });
}, 30000);
wss.on('close', () => clearInterval(heartbeat));

function handleMessage(ws, msg) {
  switch (msg.type) {
    case 'create': {
      const code = generateCode();
      const room = new Room(code);
      rooms.set(code, room);
      room.addPlayer(ws, msg.name || 'Player 1');
      break;
    }

    case 'join': {
      const code = (msg.code || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) {
        sendTo(ws, { type: 'error', message: 'Room not found' });
        return;
      }
      if (room.phase !== 'lobby') {
        sendTo(ws, { type: 'error', message: 'Game already in progress' });
        return;
      }
      if (room.players.length >= 4) {
        sendTo(ws, { type: 'error', message: 'Room is full' });
        return;
      }
      room.addPlayer(ws, msg.name || `Player ${room.players.length + 1}`);
      break;
    }

    case 'start': {
      const room = rooms.get(ws._roomCode);
      if (!room || ws._playerIndex !== 0) return; // host only
      if (room.players.length < 1) return;
      room.startGame();
      break;
    }

    case 'select': {
      const room = rooms.get(ws._roomCode);
      if (!room) return;
      room.handleSelect(ws._playerIndex, msg.ballId);
      break;
    }

    case 'shoot': {
      const room = rooms.get(ws._roomCode);
      if (!room) return;
      room.handleShoot(ws._playerIndex, msg.ballId, msg.angle, msg.power, msg.itemIndex ?? -1);
      break;
    }

    case 'chat': {
      const room = rooms.get(ws._roomCode);
      if (!room) return;
      room.broadcast({
        type: 'chat',
        playerIndex: ws._playerIndex,
        text: (msg.text || '').slice(0, 200),
      });
      break;
    }
  }
}

function sendTo(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

// ════════════════════════════════════════════════════════════════
//  Room
// ════════════════════════════════════════════════════════════════

class Room {
  constructor(code) {
    this.code = code;
    this.players = [];     // { ws, name, index, connected, isAI }
    this.phase = 'lobby';  // lobby, select, aim, simulate, gameover
    this.game = null;      // ServerGame instance
    this.lastActivity = Date.now();
    this.turnTimerId = null;
    this.turnTimeLeft = TURN_TIMER;
    this.timerBroadcastId = null;

    // Auto-destroy after 30 min of inactivity
    this.destroyTimer = setTimeout(() => this.destroy(), 30 * 60 * 1000);
  }

  addPlayer(ws, name) {
    const index = this.players.length;
    ws._roomCode = this.code;
    ws._playerIndex = index;

    this.players.push({
      ws,
      name: name.slice(0, 16),
      index,
      connected: true,
      isAI: false,
    });

    this.touch();

    // Tell the new player their index
    sendTo(ws, {
      type: 'joined',
      playerIndex: index,
      yourIndex: index,
    });

    // Broadcast updated room info to all
    this.broadcastRoomInfo();
  }

  broadcastRoomInfo() {
    const info = {
      type: 'room',
      code: this.code,
      players: this.players.map(p => ({
        name: p.name,
        index: p.index,
        connected: p.connected,
        isAI: p.isAI,
      })),
      hostIndex: 0,
    };
    this.broadcast(info);
  }

  startGame() {
    if (this.phase !== 'lobby') return;

    // Fill remaining slots with AI (up to 4)
    while (this.players.length < 2) {
      const idx = this.players.length;
      this.players.push({
        ws: null,
        name: `Bot ${idx}`,
        index: idx,
        connected: true,
        isAI: true,
      });
    }

    this.touch();
    this.game = new ServerGame(this);
    this.game.start();
  }

  handleSelect(playerIndex, ballId) {
    if (!this.game) return;
    this.touch();
    this.game.handleSelect(playerIndex, ballId);
  }

  handleShoot(playerIndex, ballId, angle, power, itemIndex) {
    if (!this.game) return;
    this.touch();
    this.game.handleShoot(playerIndex, ballId, angle, power, itemIndex);
  }

  handleDisconnect(playerIndex) {
    const player = this.players[playerIndex];
    if (!player) return;
    player.connected = false;

    if (this.phase === 'lobby') {
      // Broadcast updated player list
      this.broadcastRoomInfo();
      // If all disconnected, destroy
      if (this.players.every(p => !p.connected || p.isAI)) {
        this.destroy();
      }
    } else {
      // Mark player as AI so the game continues
      player.isAI = true;
      this.broadcast({
        type: 'playerLeft',
        playerIndex,
        name: player.name,
      });
      // If it was this player's turn, do AI turn
      if (this.game && this.game.currentPlayer === playerIndex) {
        this.clearTurnTimer();
        setTimeout(() => this.game.doAITurn(), 500);
      }
      // If all human players gone, destroy
      if (this.players.every(p => !p.connected || p.isAI)) {
        setTimeout(() => this.destroy(), 5000);
      }
    }
  }

  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const p of this.players) {
      if (p.ws && p.connected && !p.isAI) {
        sendTo(p.ws, msg);
      }
    }
  }

  startTurnTimer() {
    this.clearTurnTimer();
    this.turnTimeLeft = TURN_TIMER;

    // Broadcast timer every second
    this.timerBroadcastId = setInterval(() => {
      this.turnTimeLeft--;
      this.broadcast({ type: 'timer', timeLeft: this.turnTimeLeft });
      if (this.turnTimeLeft <= 0) {
        this.clearTurnTimer();
        // Force AI turn
        if (this.game) {
          this.game.doAITurn();
        }
      }
    }, 1000);
  }

  clearTurnTimer() {
    if (this.timerBroadcastId) {
      clearInterval(this.timerBroadcastId);
      this.timerBroadcastId = null;
    }
  }

  touch() {
    this.lastActivity = Date.now();
    clearTimeout(this.destroyTimer);
    this.destroyTimer = setTimeout(() => this.destroy(), 30 * 60 * 1000);
  }

  destroy() {
    this.clearTurnTimer();
    clearTimeout(this.destroyTimer);
    for (const p of this.players) {
      if (p.ws && p.connected) {
        p.ws.close();
      }
    }
    rooms.delete(this.code);
  }
}

// ════════════════════════════════════════════════════════════════
//  Server-Side Game Logic
// ════════════════════════════════════════════════════════════════

class ServerGame {
  constructor(room) {
    this.room = room;
    this.balls = [];
    this.arena = null;       // { cx, cy, radius, pockets }
    this.storm = null;       // { percent, currentRadius, targetRadius, arenaRadius }
    this.itemSpawner = null;  // { pickups: [] }
    this.playerItems = [];   // items per player: [[item, ...], ...]
    this.playerStats = [];
    this.currentPlayer = 0;
    this.round = 1;
    this.turnInRound = 0;
    this.selectedBallId = null;
    this.ballsPerPlayer = 4;
  }

  start() {
    const numPlayers = this.room.players.length;
    this.ballsPerPlayer = numPlayers <= 2 ? 5 : 4;

    // Build canonical arena
    const W = CANONICAL_SIZE;
    const H = CANONICAL_SIZE;
    const arenaRadius = Math.min(W, H) * ARENA_SCALE;
    const cx = W / 2;
    const cy = H / 2;

    // Build pockets
    const pockets = [];
    for (let i = 0; i < POCKET_COUNT; i++) {
      const angle = (i / POCKET_COUNT) * Math.PI * 2 - Math.PI / 2;
      pockets.push({
        x: cx + Math.cos(angle) * arenaRadius,
        y: cy + Math.sin(angle) * arenaRadius,
        angle,
        radius: POCKET_RADIUS,
      });
    }

    this.arena = { cx, cy, radius: arenaRadius, pockets };

    // Storm
    this.storm = {
      percent: 100,
      currentRadius: arenaRadius,
      targetRadius: arenaRadius,
      arenaRadius,
    };

    // Spawn balls
    this.balls = [];
    let nextId = 0;
    const total = numPlayers * this.ballsPerPlayer;
    for (let p = 0; p < numPlayers; p++) {
      for (let b = 0; b < this.ballsPerPlayer; b++) {
        const angle = (nextId / total) * Math.PI * 2 - Math.PI / 2;
        const d = arenaRadius * BALL_SPAWN_DISTANCE;
        this.balls.push({
          id: nextId++,
          x: cx + Math.cos(angle) * d,
          y: cy + Math.sin(angle) * d,
          vx: 0, vy: 0,
          radius: BALL_RADIUS,
          mass: 1,
          owner: p,
          alive: true,
          ghost: false, ghostUsed: false,
          bomb: false, magnet: false, shielded: false,
        });
      }
    }

    // Items
    this.pickups = [];
    this.playerItems = this.room.players.map(() => []);
    this.playerStats = this.room.players.map(() => ({
      shotsFired: 0, ballsPocketed: 0, ballsLost: 0, itemsUsed: 0, itemsCollected: 0,
    }));

    this.currentPlayer = 0;
    this.round = 1;
    this.turnInRound = 0;

    // Broadcast game start
    this.room.phase = 'select';
    this.room.broadcast({
      type: 'gameStart',
      players: this.room.players.map(p => ({
        name: p.name,
        index: p.index,
        isAI: p.isAI,
        color: PLAYER_COLORS[p.index],
      })),
      balls: this.serializeBalls(),
      arena: { cx, cy, radius: arenaRadius, pockets },
      storm: { percent: 100, radius: arenaRadius },
      ballsPerPlayer: this.ballsPerPlayer,
    });

    this.broadcastTurn('select');

    // If first player is AI, trigger AI turn
    if (this.room.players[0].isAI) {
      setTimeout(() => this.doAITurn(), 800);
    } else {
      this.room.startTurnTimer();
    }
  }

  handleSelect(playerIndex, ballId) {
    if (this.room.phase !== 'select') return;
    if (playerIndex !== this.currentPlayer) return;

    const ball = this.balls.find(b => b.id === ballId);
    if (!ball || !ball.alive || ball.owner !== playerIndex) return;

    this.selectedBallId = ballId;
    this.room.phase = 'aim';

    this.room.broadcast({
      type: 'ballSelected',
      playerIndex,
      ballId,
    });

    this.broadcastTurn('aim');
  }

  handleShoot(playerIndex, ballId, angle, power, itemIndex) {
    if (this.room.phase !== 'aim' && this.room.phase !== 'select') return;
    if (playerIndex !== this.currentPlayer) return;

    // If they haven't selected yet (shot directly), validate
    const ball = this.balls.find(b => b.id === ballId);
    if (!ball || !ball.alive || ball.owner !== playerIndex) return;

    // Clamp power
    power = Math.max(0, Math.min(MAX_POWER, power));
    if (power < 1) return;

    this.room.clearTurnTimer();
    this.room.phase = 'simulate';

    // Apply item
    if (itemIndex >= 0 && itemIndex < this.playerItems[playerIndex].length) {
      const item = this.playerItems[playerIndex].splice(itemIndex, 1)[0];
      if (item) {
        this.applyItemToBall(ball, item.id);
        this.playerStats[playerIndex].itemsUsed++;
      }
    }

    // Apply shot
    ball.vx = Math.cos(angle) * power;
    ball.vy = Math.sin(angle) * power;
    this.playerStats[playerIndex].shotsFired++;

    // Run physics simulation synchronously and capture replay
    const { snapshots, events } = this.simulateToCompletion();

    // Check item pickups during simulation has already been handled
    // Check eliminations
    const eliminations = this.checkEliminations();

    // Send replay to all clients
    this.room.broadcast({
      type: 'replay',
      shooterIndex: playerIndex,
      ballId: ball.id,
      angle,
      power,
      itemIndex: itemIndex >= 0 ? itemIndex : -1,
      snapshots,
      events,
    });

    // Send eliminations
    for (const elim of eliminations) {
      this.room.broadcast({
        type: 'elimination',
        playerIndex: elim.index,
        playerName: elim.name,
      });
    }

    // End turn after a delay (let client play the replay)
    const replayDuration = snapshots.length > 0
      ? (snapshots[snapshots.length - 1].t * 1000) + 500
      : 500;

    setTimeout(() => this.endTurn(), Math.min(replayDuration, 12000));
  }

  doAITurn() {
    if (this.room.phase !== 'select' && this.room.phase !== 'aim') return;
    this.room.clearTurnTimer();

    const playerIndex = this.currentPlayer;
    const myBalls = this.balls.filter(b => b.alive && b.owner === playerIndex);
    const enemyBalls = this.balls.filter(b => b.alive && b.owner !== playerIndex);

    if (myBalls.length === 0 || enemyBalls.length === 0) {
      this.endTurn();
      return;
    }

    // Simple AI: find closest ball pair
    let bestBall = null, bestTarget = null, bestDist = Infinity;
    for (const ball of myBalls) {
      for (const enemy of enemyBalls) {
        const d = dist(ball.x, ball.y, enemy.x, enemy.y);
        if (d < bestDist) {
          bestDist = d;
          bestBall = ball;
          bestTarget = enemy;
        }
      }
    }
    if (!bestBall) bestBall = myBalls[0];

    let angle;
    if (bestTarget && Math.random() > 0.2) {
      angle = Math.atan2(bestTarget.y - bestBall.y, bestTarget.x - bestBall.x);
      angle += (Math.random() - 0.5) * AI_ACCURACY_SPREAD;

      // Try to push toward nearest pocket
      const nearestPocket = this.findNearestPocket(bestTarget);
      if (nearestPocket && dist(bestTarget.x, bestTarget.y, nearestPocket.x, nearestPocket.y) < 120) {
        const pocketAngle = Math.atan2(nearestPocket.y - bestTarget.y, nearestPocket.x - bestTarget.x);
        const hitAngle = Math.atan2(bestTarget.y - bestBall.y, bestTarget.x - bestBall.x);
        angle = hitAngle * 0.6 + pocketAngle * 0.4;
        angle += (Math.random() - 0.5) * AI_ACCURACY_SPREAD * 0.5;
      }
    } else {
      angle = Math.random() * Math.PI * 2;
    }

    const idealPower = Math.min(MAX_POWER, bestDist / 15 + 3);
    const power = Math.max(5, idealPower + randRange(-3, 3));

    // Item use
    let itemIndex = -1;
    const items = this.playerItems[playerIndex];
    if (items.length > 0 && Math.random() > 0.4) {
      const bombIdx = items.findIndex(i => i.id === 'bomb');
      if (bombIdx >= 0) {
        const nearby = enemyBalls.filter(
          b => b !== bestTarget && dist(b.x, b.y, bestTarget.x, bestTarget.y) < 100
        ).length;
        if (nearby >= 1) itemIndex = bombIdx;
      }
      if (itemIndex < 0) itemIndex = 0;
    }

    this.handleShoot(playerIndex, bestBall.id, angle, power, itemIndex);
  }

  findNearestPocket(ball) {
    let nearest = null, nearestDist = Infinity;
    for (const pocket of this.arena.pockets) {
      const d = dist(ball.x, ball.y, pocket.x, pocket.y);
      if (d < nearestDist) { nearestDist = d; nearest = pocket; }
    }
    return nearest;
  }

  simulateToCompletion() {
    const snapshots = [];
    const events = [];
    const DT = 1 / 60;
    const SNAPSHOT_INTERVAL = 3;
    const MAX_FRAMES = 600; // 10 seconds max
    let frame = 0;
    let simTime = 0;

    // Initial snapshot
    snapshots.push({ t: 0, balls: this.serializeBalls() });

    while (frame < MAX_FRAMES) {
      const frameEvents = this.physicsStep(DT);

      for (const evt of frameEvents) {
        events.push({ ...evt, t: simTime });
      }

      // Check item pickups
      this.checkItemPickups(events, simTime);

      frame++;
      simTime += DT;

      if (frame % SNAPSHOT_INTERVAL === 0) {
        snapshots.push({ t: simTime, balls: this.serializeBalls() });
      }

      // Check if all balls stopped
      if (this.allStopped()) break;
    }

    // Stop all remaining velocity
    for (const b of this.balls) {
      if (b.alive) { b.vx = 0; b.vy = 0; }
    }

    // Final snapshot
    snapshots.push({ t: simTime, balls: this.serializeBalls() });

    // Reset ball effects
    for (const b of this.balls) {
      b.mass = 1;
      b.ghost = false;
      b.ghostUsed = false;
      b.bomb = false;
      b.magnet = false;
    }

    return { snapshots, events };
  }

  physicsStep(dt) {
    const events = [];
    const subDt = dt / PHYSICS_STEPS;

    for (let s = 0; s < PHYSICS_STEPS; s++) {
      for (const ball of this.balls) {
        if (!ball.alive) continue;

        // Integrate
        ball.x += ball.vx * subDt * 60;
        ball.y += ball.vy * subDt * 60;
        ball.vx *= FRICTION;
        ball.vy *= FRICTION;
        if (Math.abs(ball.vx) < MIN_SPEED * 0.1) ball.vx = 0;
        if (Math.abs(ball.vy) < MIN_SPEED * 0.1) ball.vy = 0;

        // Storm force
        const sf = this.getStormForce(ball.x, ball.y);
        ball.vx += sf.fx;
        ball.vy += sf.fy;

        // Wall collision
        const wallEvt = this.resolveWall(ball);
        if (wallEvt) events.push(wallEvt);

        // Pocket check
        const pocketEvt = this.checkPocket(ball);
        if (pocketEvt) events.push(pocketEvt);
      }

      // Ball-ball collisions
      const collEvts = this.resolveBallCollisions();
      events.push(...collEvts);
    }

    return events;
  }

  getStormForce(x, y) {
    const { cx, cy } = this.arena;
    const stormRadius = this.storm.currentRadius;
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= stormRadius || d === 0) return { fx: 0, fy: 0 };
    const STORM_FORCE = 0.06;
    const strength = STORM_FORCE * ((d - stormRadius) / this.arena.radius);
    return { fx: -(dx / d) * strength, fy: -(dy / d) * strength };
  }

  resolveWall(ball) {
    const { cx, cy, radius } = this.arena;
    const dx = ball.x - cx;
    const dy = ball.y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);

    if (d + ball.radius > radius) {
      const nx = dx / d;
      const ny = dy / d;
      ball.x = cx + nx * (radius - ball.radius);
      ball.y = cy + ny * (radius - ball.radius);

      const dot = ball.vx * nx + ball.vy * ny;
      if (dot > 0) {
        ball.vx -= 2 * dot * nx * WALL_RESTITUTION;
        ball.vy -= 2 * dot * ny * WALL_RESTITUTION;
        return {
          type: 'wallHit',
          ballId: ball.id,
          x: ball.x + nx * ball.radius,
          y: ball.y + ny * ball.radius,
          speed: Math.abs(dot),
        };
      }
    }
    return null;
  }

  checkPocket(ball) {
    if (!ball.alive) return null;
    for (const pocket of this.arena.pockets) {
      if (dist(ball.x, ball.y, pocket.x, pocket.y) < pocket.radius) {
        if (ball.shielded) {
          ball.shielded = false;
          const dx = ball.x - pocket.x;
          const dy = ball.y - pocket.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          ball.vx += (dx / d) * 6;
          ball.vy += (dy / d) * 6;
          return { type: 'shieldBlock', ballId: ball.id, pocketX: pocket.x, pocketY: pocket.y };
        }
        ball.alive = false;
        ball.vx = 0;
        ball.vy = 0;
        this.playerStats[ball.owner].ballsLost++;
        return {
          type: 'pocketed',
          ballId: ball.id,
          owner: ball.owner,
          pocketX: pocket.x,
          pocketY: pocket.y,
        };
      }
    }
    return null;
  }

  resolveBallCollisions() {
    const events = [];
    for (let i = 0; i < this.balls.length; i++) {
      for (let j = i + 1; j < this.balls.length; j++) {
        const a = this.balls[i];
        const b = this.balls[j];
        if (!a.alive || !b.alive) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const minDist = a.radius + b.radius;
        if (d >= minDist || d === 0) continue;

        // Ghost
        if (a.ghost && !a.ghostUsed) { a.ghostUsed = true; a.ghost = false; continue; }
        if (b.ghost && !b.ghostUsed) { b.ghostUsed = true; b.ghost = false; continue; }

        const nx = dx / d;
        const ny = dy / d;

        const overlap = minDist - d;
        const totalMass = a.mass + b.mass;
        a.x -= nx * overlap * (b.mass / totalMass);
        a.y -= ny * overlap * (b.mass / totalMass);
        b.x += nx * overlap * (a.mass / totalMass);
        b.y += ny * overlap * (a.mass / totalMass);

        const dvx = a.vx - b.vx;
        const dvy = a.vy - b.vy;
        const dvDotN = dvx * nx + dvy * ny;
        if (dvDotN <= 0) continue;

        const impulse = (2 * dvDotN * BALL_RESTITUTION) / totalMass;
        a.vx -= impulse * b.mass * nx;
        a.vy -= impulse * b.mass * ny;
        b.vx += impulse * a.mass * nx;
        b.vy += impulse * a.mass * ny;

        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        const speed = Math.sqrt(dvx * dvx + dvy * dvy);

        events.push({ type: 'ballCollision', aId: a.id, bId: b.id, cx, cy, speed });

        // Bomb
        if (a.bomb) {
          a.bomb = false;
          this.applyExplosionPhysics(a.x, a.y, a);
          events.push({ type: 'explosion', x: a.x, y: a.y, sourceId: a.id });
        }
        if (b.bomb) {
          b.bomb = false;
          this.applyExplosionPhysics(b.x, b.y, b);
          events.push({ type: 'explosion', x: b.x, y: b.y, sourceId: b.id });
        }

        // Magnet
        if (a.magnet || b.magnet) {
          const magnetBall = a.magnet ? a : b;
          magnetBall.magnet = false;
          this.applyMagnetPhysics(cx, cy, magnetBall);
          events.push({ type: 'magnetPull', x: cx, y: cy, sourceId: magnetBall.id });
        }
      }
    }
    return events;
  }

  applyExplosionPhysics(ex, ey, source) {
    for (const ball of this.balls) {
      if (!ball.alive || ball === source) continue;
      const dx = ball.x - ex;
      const dy = ball.y - ey;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < EXPLOSION_RADIUS && d > 0) {
        const strength = (1 - d / EXPLOSION_RADIUS) * EXPLOSION_FORCE;
        ball.vx += (dx / d) * strength;
        ball.vy += (dy / d) * strength;
      }
    }
  }

  applyMagnetPhysics(mx, my, source) {
    const MAGNET_RADIUS = 200;
    const MAGNET_FORCE = 10;
    for (const ball of this.balls) {
      if (!ball.alive || ball === source) continue;
      const dx = mx - ball.x;
      const dy = my - ball.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < MAGNET_RADIUS && d > 0) {
        const strength = (1 - d / MAGNET_RADIUS) * MAGNET_FORCE;
        ball.vx += (dx / d) * strength;
        ball.vy += (dy / d) * strength;
      }
    }
  }

  checkItemPickups(events, simTime) {
    for (const ball of this.balls) {
      if (!ball.alive) continue;
      const threshold = (ball.radius + ITEM_RADIUS) ** 2;
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const item = this.pickups[i];
        if (distSq(ball.x, ball.y, item.x, item.y) < threshold) {
          // Try to give item to player
          const items = this.playerItems[ball.owner];
          if (items.length < ITEM_MAX_PER_PLAYER) {
            items.push(item.type);
            this.playerStats[ball.owner].itemsCollected++;
            events.push({
              type: 'itemCollected',
              t: simTime,
              ballId: ball.id,
              owner: ball.owner,
              itemId: item.type.id,
              itemEmoji: item.type.emoji,
              itemName: item.type.name,
              x: item.x,
              y: item.y,
            });
          }
          this.pickups.splice(i, 1);
        }
      }
    }
  }

  applyItemToBall(ball, itemId) {
    switch (itemId) {
      case 'bomb':   ball.bomb = true; break;
      case 'heavy':  ball.mass = 3; break;
      case 'ghost':  ball.ghost = true; ball.ghostUsed = false; break;
      case 'magnet': ball.magnet = true; break;
      case 'shield': ball.shielded = true; break;
    }
  }

  allStopped() {
    return this.balls.every(b =>
      !b.alive || (Math.abs(b.vx) <= MIN_SPEED && Math.abs(b.vy) <= MIN_SPEED)
    );
  }

  checkEliminations() {
    const eliminations = [];
    for (const player of this.room.players) {
      const alive = this.balls.some(b => b.alive && b.owner === player.index);
      if (!alive && !player._eliminated) {
        player._eliminated = true;
        eliminations.push({ index: player.index, name: player.name });
      }
    }
    return eliminations;
  }

  endTurn() {
    // Reset ball effects (already done in simulateToCompletion but be safe)
    for (const b of this.balls) {
      b.mass = 1;
      b.ghost = false;
      b.ghostUsed = false;
      b.bomb = false;
      b.magnet = false;
    }
    this.selectedBallId = null;

    // Check winner
    const activePlayers = this.room.players.filter(p =>
      this.balls.some(b => b.alive && b.owner === p.index)
    );

    if (activePlayers.length <= 1) {
      this.room.phase = 'gameover';
      const winner = activePlayers[0] || { name: 'Nobody', index: -1 };
      this.room.broadcast({
        type: 'gameOver',
        winnerIndex: winner.index,
        winnerName: winner.name,
        stats: this.playerStats,
      });
      return;
    }

    // Next alive player
    let next = (this.currentPlayer + 1) % this.room.players.length;
    let safety = 0;
    while (!this.balls.some(b => b.alive && b.owner === next) && safety < this.room.players.length) {
      next = (next + 1) % this.room.players.length;
      safety++;
    }

    this.turnInRound++;
    if (this.turnInRound >= activePlayers.length) {
      this.turnInRound = 0;
      this.round++;

      // Storm shrink
      if (this.round % STORM_SHRINK_INTERVAL === 1 && this.round > 1) {
        if (this.storm.percent > STORM_MIN_PERCENT) {
          this.storm.percent = Math.max(STORM_MIN_PERCENT, this.storm.percent - STORM_SHRINK_AMOUNT);
          this.storm.targetRadius = this.storm.arenaRadius * (this.storm.percent / 100);
          this.storm.currentRadius = this.storm.targetRadius; // server snaps immediately
          // Prune items outside storm
          this.pickups = this.pickups.filter(item =>
            distSq(item.x, item.y, this.arena.cx, this.arena.cy) < this.storm.currentRadius * this.storm.currentRadius
          );
        }
      }

      // Item spawn
      if (this.round % ITEM_SPAWN_INTERVAL === 0) {
        const count = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const d = Math.random() * this.storm.currentRadius * 0.7;
          this.pickups.push({
            x: this.arena.cx + Math.cos(angle) * d,
            y: this.arena.cy + Math.sin(angle) * d,
            type: pick(ITEM_TYPES),
          });
        }
      }
    }

    this.currentPlayer = next;
    this.room.phase = 'select';

    // Broadcast turn end with full state sync
    this.room.broadcast({
      type: 'turnEnd',
      nextPlayer: next,
      round: this.round,
      storm: { percent: this.storm.percent, radius: this.storm.currentRadius },
      items: this.pickups.map(p => ({
        x: p.x, y: p.y, typeId: p.type.id, emoji: p.type.emoji, name: p.type.name,
      })),
      playerItems: this.playerItems.map(items =>
        items.map(it => ({ id: it.id, emoji: it.emoji, name: it.name, desc: it.desc }))
      ),
      balls: this.serializeBalls(),
    });

    this.broadcastTurn('select');

    // AI turn
    if (this.room.players[next].isAI) {
      setTimeout(() => this.doAITurn(), 800);
    } else {
      this.room.startTurnTimer();
    }
  }

  broadcastTurn(phase) {
    this.room.broadcast({
      type: 'turn',
      currentPlayer: this.currentPlayer,
      round: this.round,
      phase,
    });
  }

  serializeBalls() {
    return this.balls.map(b => ({
      id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy,
      owner: b.owner, alive: b.alive, radius: b.radius,
      mass: b.mass, ghost: b.ghost, bomb: b.bomb, magnet: b.magnet, shielded: b.shielded,
    }));
  }
}

// ════════════════════════════════════════════════════════════════
//  Start
// ════════════════════════════════════════════════════════════════

httpServer.listen(PORT, () => {
  console.log(`Ballz Royale server listening on :${PORT}`);
  console.log(`  HTTP: http://localhost:${PORT}`);
  console.log(`  WebSocket: ws://localhost:${PORT}`);
});
