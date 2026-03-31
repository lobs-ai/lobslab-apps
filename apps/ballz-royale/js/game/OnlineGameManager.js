// ── Online Game Manager ──
// Manages online multiplayer: lobby, networking, and replay playback.
// Uses the existing Renderer, HUD, ParticleSystem, ScreenEffects, and InputHandler.

import {
  PLAYER_COLORS, BALL_RADIUS, CANONICAL_SIZE, MAX_POWER,
  ITEM_RADIUS, POCKET_RADIUS,
} from '../constants.js';
import { darken, lighten, dist } from '../utils.js';
import { Connection } from '../net/Connection.js';
import { ReplayPlayer } from './ReplayPlayer.js';
import { ParticleSystem } from '../effects/ParticleSystem.js';
import { ScreenEffects } from '../effects/ScreenEffects.js';
import { InputHandler } from '../input/InputHandler.js';

export class OnlineGameManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Networking
    this.conn = new Connection();
    this.roomCode = null;
    this.myIndex = -1;
    this.isHost = false;
    this.sessionToken = null;

    // Lobby state
    this.lobbyPlayers = [];
    this.inLobby = true;

    // Game state (from server)
    this.players = [];       // { name, index, isAI, color: { main, glow, dark } }
    this.balls = [];         // { id, x, y, vx, vy, owner, alive, radius, mass, ghost, bomb, magnet, shielded }
    this.arena = null;       // { cx, cy, radius, pockets }
    this.stormPercent = 100;
    this.stormRadius = 0;
    this.stormTargetRadius = 0;
    this.items = [];         // pickups on field
    this.playerItems = [];   // my items (array of { id, emoji, name, desc })
    this.currentPlayer = -1;
    this.round = 1;
    this.phase = 'lobby';
    this.ballsPerPlayer = 4;

    // Scaling (canonical → screen)
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    // Local aim state
    this.selectedBallId = null;
    this.selectedItemIndex = -1;

    // Replay
    this.replay = new ReplayPlayer();
    this.replay.onEvent = (e) => this._handleReplayEvent(e);
    this.replay.onComplete = () => this._onReplayComplete();

    // Subsystems (client-only cosmetic effects)
    this.particles = new ParticleSystem();
    this.effects = new ScreenEffects();
    this.input = new InputHandler(canvas);

    // Turn timer
    this.turnTimeLeft = 0;

    // Animation loop
    this._rafId = null;
    this._lastTime = 0;
    this._gameOverSent = false;

    this._setupNetworkHandlers();
    this._setupInputCallbacks();
  }

  // ════════════════════════════════════════════════════════════
  //  Networking
  // ════════════════════════════════════════════════════════════

  connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}`;
    this.conn.connect(url);

    // Attempt rejoin from saved session
    this.conn.onOpen = () => {
      try {
        const saved = JSON.parse(localStorage.getItem('ballz_session'));
        if (saved && saved.roomCode && saved.sessionToken) {
          this.conn.send({ type: 'rejoin', code: saved.roomCode, sessionToken: saved.sessionToken });
        }
      } catch (e) { /* no saved session */ }
    };

    this.conn.onStatusChange = (connected) => {
      const el = document.getElementById('connectionStatus');
      if (el) {
        el.textContent = connected ? '🟢 Connected' : '🔴 Reconnecting…';
        el.className = 'conn-status ' + (connected ? 'conn-ok' : 'conn-err');
      }
    };
  }

  createRoom(name) {
    this.conn.send({ type: 'create', name });
  }

  joinRoom(code, name) {
    this.conn.send({ type: 'join', code: code.toUpperCase().trim(), name });
  }

  startGame() {
    if (this.isHost) this.conn.send({ type: 'start' });
  }

  _setupNetworkHandlers() {
    this.conn.on('joined', (msg) => {
      this.myIndex = msg.yourIndex;
      this.isHost = (msg.yourIndex === 0);
      this.sessionToken = msg.sessionToken;
      this.roomCode = msg.roomCode;
      // Save session for rejoin
      try {
        localStorage.setItem('ballz_session', JSON.stringify({
          roomCode: msg.roomCode,
          sessionToken: msg.sessionToken,
        }));
      } catch (e) { /* localStorage unavailable */ }
    });

    this.conn.on('room', (msg) => {
      this.roomCode = msg.code;
      this.lobbyPlayers = msg.players;
      this.isHost = (this.myIndex === msg.hostIndex);
      this._updateLobbyUI();
    });

    this.conn.on('error', (msg) => {
      this._showLobbyError(msg.message);
    });

    this.conn.on('gameStart', (msg) => this._onGameStart(msg));
    this.conn.on('turn', (msg) => this._onTurn(msg));
    this.conn.on('ballSelected', (msg) => {
      if (msg.playerIndex !== this.myIndex) {
        this.selectedBallId = msg.ballId;
      }
    });
    this.conn.on('replay', (msg) => this._onReplay(msg));
    this.conn.on('turnEnd', (msg) => this._onTurnEnd(msg));
    this.conn.on('elimination', (msg) => {
      this.effects.announce(`☠️ ${msg.playerName} eliminated!`);
    });
    this.conn.on('gameOver', (msg) => this._onGameOver(msg));
    this.conn.on('playerLeft', (msg) => {
      this.effects.announce(`${msg.name} left the game`);
    });
    this.conn.on('timer', (msg) => {
      this.turnTimeLeft = msg.timeLeft;
    });
    this.conn.on('chat', (msg) => {
      console.log(`[Chat] P${msg.playerIndex}: ${msg.text}`);
    });

    this.conn.on('fullState', (msg) => this._onFullState(msg));

    this.conn.on('playerRejoined', (msg) => {
      this.effects.announce(`${msg.name} reconnected`);
    });
  }

  // ════════════════════════════════════════════════════════════
  //  Input
  // ════════════════════════════════════════════════════════════

  _setupInputCallbacks() {
    this.input.onBallSelected = (ball) => {
      if (this.currentPlayer !== this.myIndex || this.phase !== 'select') return;
      if (ball.owner !== this.myIndex || !ball.alive) return;

      this.selectedBallId = ball.id;
      this.conn.send({ type: 'select', ballId: ball.id });
      // Don't change phase locally — wait for server 'turn' message
    };

    this.input.onShot = (angle, power) => {
      if (this.currentPlayer !== this.myIndex) return;
      if (this.selectedBallId == null) return;
      if (power < 1) return;

      this.conn.send({
        type: 'shoot',
        ballId: this.selectedBallId,
        angle,
        power: Math.min(power, MAX_POWER),
        itemIndex: this.selectedItemIndex,
      });

      // Disable input immediately
      this.input.setPhase('wait');
    };

    this.input.onCancel = () => {
      // Go back to select phase if we had selected a ball
      if (this.phase === 'aim' && this.currentPlayer === this.myIndex) {
        this.selectedBallId = null;
        this.conn.send({ type: 'select', ballId: -1 }); // deselect (server ignores invalid)
        this._syncInputPhase();
      }
    };

    // Item bar clicks
    const itemBar = document.getElementById('itemBar');
    if (itemBar) {
      itemBar.addEventListener('click', (e) => {
        if (this.currentPlayer !== this.myIndex) return;
        const slot = e.target.closest('.item-slot');
        if (!slot) return;
        const idx = parseInt(slot.dataset.index, 10);
        if (isNaN(idx)) return;
        this.selectedItemIndex = this.selectedItemIndex === idx ? -1 : idx;
        this._updateItemBar();
      });
    }
  }

  /** Sync InputHandler phase with current game state. */
  _syncInputPhase() {
    const isMyTurn = this.currentPlayer === this.myIndex;

    if (!isMyTurn || this.phase === 'simulate' || this.phase === 'gameover') {
      this.input.setPhase('wait');
      return;
    }

    if (this.phase === 'select') {
      // Provide selectable balls in SCREEN coordinates
      const myBalls = this.balls
        .filter(b => b.alive && b.owner === this.myIndex)
        .map(b => this._toScreen(b));
      this.input.setPhase('select', null, myBalls);
    } else if (this.phase === 'aim' && this.selectedBallId != null) {
      const ball = this.balls.find(b => b.id === this.selectedBallId);
      if (ball) {
        this.input.setPhase('aim', this._toScreen(ball));
      }
    }
  }

  /** Convert a ball from canonical coords to screen coords for the InputHandler. */
  _toScreen(ball) {
    return {
      ...ball,
      x: ball.x * this.scale + this.offsetX,
      y: ball.y * this.scale + this.offsetY,
      radius: ball.radius * this.scale,
    };
  }

  // ════════════════════════════════════════════════════════════
  //  Game Events from Server
  // ════════════════════════════════════════════════════════════

  _onGameStart(msg) {
    this.players = msg.players.map(p => ({
      ...p,
      color: p.color, // { main, glow, dark } from PLAYER_COLORS
    }));
    this.ballsPerPlayer = msg.ballsPerPlayer;
    this.arena = msg.arena;
    this.stormPercent = msg.storm.percent;
    this.stormRadius = msg.storm.radius;
    this.stormTargetRadius = msg.storm.radius;
    this.items = [];
    this.playerItems = [];
    this.round = 1;
    this.phase = 'select';
    this.inLobby = false;
    this._gameOverSent = false;

    this.balls = msg.balls.map(b => this._makeBall(b));

    this._updateScale();
    this._hideLobby();
    this._showGame();
    this._startLoop();
  }

  _onTurn(msg) {
    this.currentPlayer = msg.currentPlayer;
    this.round = msg.round;
    this.phase = msg.phase;

    if (msg.phase === 'select') {
      this.selectedBallId = null;
      this.selectedItemIndex = -1;
    }

    this.turnTimeLeft = (msg.phase === 'select' || msg.phase === 'aim') ? 30 : 0;

    this._updateHUD();
    this._syncInputPhase();
  }

  _onReplay(msg) {
    this.phase = 'simulate';
    this.selectedBallId = msg.ballId;
    this.replay.start(msg.snapshots, msg.events, 1.0);
    this._syncInputPhase();
  }

  _handleReplayEvent(event) {
    const sx = (x) => x * this.scale + this.offsetX;
    const sy = (y) => y * this.scale + this.offsetY;

    switch (event.type) {
      case 'ballCollision': {
        const strength = Math.min(event.speed / 20, 1);
        if (strength > 0.2) {
          this.particles.burst(sx(event.cx), sy(event.cy), '#ffffff', Math.floor(4 * strength), strength * 3);
          this.effects.shake(strength * 4);
        }
        break;
      }
      case 'wallHit': {
        const strength = Math.min(event.speed / 15, 1);
        if (strength > 0.15) {
          this.particles.burst(sx(event.x), sy(event.y), '#88ccff', Math.floor(3 * strength), strength * 2);
          this.effects.shake(strength * 3);
        }
        break;
      }
      case 'pocketed': {
        const color = this.players[event.owner]?.color?.main || '#ffffff';
        this.particles.burst(sx(event.pocketX), sy(event.pocketY), color, 20, 5);
        this.effects.shake(6);
        this.effects.slowMo(0.3, 600);
        break;
      }
      case 'explosion': {
        this.particles.burst(sx(event.x), sy(event.y), '#ff4400', 30, 8);
        this.particles.burst(sx(event.x), sy(event.y), '#ffaa00', 20, 6);
        this.effects.shake(12);
        this.effects.slowMo(0.15, 800);
        break;
      }
      case 'magnetPull': {
        this.particles.burst(sx(event.x), sy(event.y), '#aa44ff', 15, 4);
        break;
      }
      case 'shieldBlock': {
        this.particles.burst(sx(event.pocketX), sy(event.pocketY), '#00ffff', 12, 4);
        this.effects.shake(4);
        break;
      }
      case 'itemCollected': {
        const name = this.players[event.owner]?.name || 'Player';
        this.effects.announce(`${event.itemEmoji} ${name} got ${event.itemName}!`);
        break;
      }
    }
  }

  _onReplayComplete() {
    // turnEnd message from server will update final state
  }

  _onTurnEnd(msg) {
    this.currentPlayer = msg.nextPlayer;
    this.round = msg.round;
    this.phase = 'select';
    this.selectedBallId = null;
    this.selectedItemIndex = -1;

    // Storm
    this.stormPercent = msg.storm.percent;
    this.stormTargetRadius = msg.storm.radius;

    // Items on field
    this.items = (msg.items || []).map(it => ({
      x: it.x, y: it.y,
      type: { id: it.typeId, emoji: it.emoji, name: it.name },
    }));

    // My items
    if (msg.playerItems && msg.playerItems[this.myIndex]) {
      this.playerItems = msg.playerItems[this.myIndex];
    }

    // Authoritative ball state
    if (msg.balls) {
      this.balls = msg.balls.map(b => this._makeBall(b));
    }

    this.replay.stop();

    this._updateHUD();
    this._updateItemBar();
    this._syncInputPhase();
  }

  _onFullState(msg) {
    // Received after rejoin — full game state sync
    this.players = msg.players.map(p => ({
      ...p,
      color: p.color,
    }));
    this.ballsPerPlayer = msg.ballsPerPlayer;
    this.arena = msg.arena;
    this.stormPercent = msg.storm.percent;
    this.stormRadius = msg.storm.radius;
    this.stormTargetRadius = msg.storm.radius;
    this.round = msg.round;
    this.currentPlayer = msg.currentPlayer;
    this.phase = msg.phase;
    this.inLobby = false;
    this._gameOverSent = false;

    this.balls = msg.balls.map(b => this._makeBall(b));

    this.items = (msg.items || []).map(it => ({
      x: it.x, y: it.y,
      type: { id: it.typeId, emoji: it.emoji, name: it.name },
    }));
    if (msg.playerItems && msg.playerItems[this.myIndex]) {
      this.playerItems = msg.playerItems[this.myIndex];
    }

    this.selectedBallId = null;
    this.selectedItemIndex = -1;

    this._updateScale();
    this._hideLobby();
    this._showGame();
    this._startLoop();
    this._updateHUD();
    this._updateItemBar();
    this._syncInputPhase();
  }

  _onGameOver(msg) {
    this.phase = 'gameover';
    this.replay.stop();
    this._syncInputPhase();

    if (!this._gameOverSent) {
      this._gameOverSent = true;
      const isMe = msg.winnerIndex === this.myIndex;
      this.effects.announce(isMe ? '🏆 YOU WIN!' : `🏆 ${msg.winnerName} wins!`);

      setTimeout(() => {
        this._showGameOver(msg.winnerName, msg.winnerIndex, msg.stats);
      }, 2000);
    }
  }

  // ════════════════════════════════════════════════════════════
  //  Rendering
  // ════════════════════════════════════════════════════════════

  _makeBall(data) {
    return {
      id: data.id,
      x: data.x,
      y: data.y,
      vx: data.vx || 0,
      vy: data.vy || 0,
      radius: data.radius || BALL_RADIUS,
      mass: data.mass || 1,
      owner: data.owner,
      alive: data.alive,
      ghost: data.ghost || false,
      bomb: data.bomb || false,
      magnet: data.magnet || false,
      shielded: data.shielded || false,
    };
  }

  _updateScale() {
    const W = this.canvas.width;
    const H = this.canvas.height;
    this.scale = Math.min(W, H) / CANONICAL_SIZE;
    this.offsetX = (W - CANONICAL_SIZE * this.scale) / 2;
    this.offsetY = (H - CANONICAL_SIZE * this.scale) / 2;
  }

  _startLoop() {
    this._lastTime = performance.now();
    const loop = (now) => {
      this._rafId = requestAnimationFrame(loop);
      const rawDt = Math.min((now - this._lastTime) / 1000, 0.05);
      this._lastTime = now;

      const slowFactor = this.effects.slowFactor ?? 1;
      const dt = rawDt * slowFactor;

      this._update(dt);
      this._render();
    };
    this._rafId = requestAnimationFrame(loop);
  }

  _update(dt) {
    // Storm lerp
    if (Math.abs(this.stormRadius - this.stormTargetRadius) > 0.5) {
      this.stormRadius += (this.stormTargetRadius - this.stormRadius) * Math.min(1, dt * 2);
    } else {
      this.stormRadius = this.stormTargetRadius;
    }

    // Replay
    if (this.replay.playing) {
      const ballStates = this.replay.update();
      if (ballStates) {
        for (const bs of ballStates) {
          const ball = this.balls.find(b => b.id === bs.id);
          if (ball) {
            ball.x = bs.x; ball.y = bs.y;
            ball.vx = bs.vx; ball.vy = bs.vy;
            ball.alive = bs.alive;
            ball.ghost = bs.ghost;
            ball.bomb = bs.bomb;
            ball.magnet = bs.magnet;
            ball.shielded = bs.shielded;
            ball.mass = bs.mass;
          }
        }

        // Ball trails
        for (const ball of this.balls) {
          if (ball.alive && (Math.abs(ball.vx) > 0.3 || Math.abs(ball.vy) > 0.3)) {
            const color = this.players[ball.owner]?.color?.main || '#888';
            this.particles.addTrail(
              ball.x * this.scale + this.offsetX,
              ball.y * this.scale + this.offsetY,
              color,
              ball.radius * this.scale * 0.3,
            );
          }
        }
      }
    }

    // Effects
    this.effects.update(dt);
    this.particles.update();
  }

  _render() {
    const ctx = this.ctx;
    let W = this.canvas.width;
    let H = this.canvas.height;

    // Resize check
    if (W !== window.innerWidth || H !== window.innerHeight) {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      W = this.canvas.width;
      H = this.canvas.height;
      this._updateScale();
    }

    ctx.save();
    ctx.translate(this.effects.shakeX, this.effects.shakeY);

    // Clear
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(-20, -20, W + 40, H + 40);

    if (this.arena) {
      this._drawArena(ctx);
      this._drawStorm(ctx);
      this._drawItems(ctx);
      this._drawBalls(ctx);

      // Aim line
      const aim = this.input.getAimInfo();
      if (aim && this.currentPlayer === this.myIndex && this.phase === 'aim') {
        this._drawAimLine(ctx, aim);
      }
    }

    // Particles
    this.particles.draw(ctx);

    ctx.restore();

    // Announcement
    this.effects.drawAnnouncement(ctx, W, H);
  }

  _drawArena(ctx) {
    const { cx, cy, radius, pockets } = this.arena;
    const sx = cx * this.scale + this.offsetX;
    const sy = cy * this.scale + this.offsetY;
    const sr = radius * this.scale;

    // Arena fill
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fillStyle = '#111128';
    ctx.fill();

    // Border
    ctx.strokeStyle = '#334';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Pockets
    for (const p of pockets) {
      const px = p.x * this.scale + this.offsetX;
      const py = p.y * this.scale + this.offsetY;
      const pr = (p.radius || POCKET_RADIUS) * this.scale;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  _drawStorm(ctx) {
    const { cx, cy, radius } = this.arena;
    const sx = cx * this.scale + this.offsetX;
    const sy = cy * this.scale + this.offsetY;
    const arenaR = radius * this.scale;
    const stormR = this.stormRadius * this.scale;

    if (stormR < arenaR - 1) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(sx, sy, arenaR, 0, Math.PI * 2);
      ctx.arc(sx, sy, stormR, 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(180, 30, 60, 0.18)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(sx, sy, stormR, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 60, 100, 0.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  _drawItems(ctx) {
    for (const item of this.items) {
      const sx = item.x * this.scale + this.offsetX;
      const sy = item.y * this.scale + this.offsetY;
      const r = ITEM_RADIUS * this.scale;

      ctx.save();
      // Glow
      ctx.beginPath();
      ctx.arc(sx, sy, r * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 100, 0.15)';
      ctx.fill();

      // Circle
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#2a2a40';
      ctx.fill();
      ctx.strokeStyle = '#ffcc00';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Emoji
      ctx.font = `${r * 1.2}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.type.emoji, sx, sy);
      ctx.restore();
    }
  }

  _drawBalls(ctx) {
    for (const ball of this.balls) {
      if (!ball.alive) continue;

      const sx = ball.x * this.scale + this.offsetX;
      const sy = ball.y * this.scale + this.offsetY;
      const sr = ball.radius * this.scale;
      const pc = this.players[ball.owner]?.color || { main: '#888', dark: '#444', glow: '#aaa' };

      // Ghost
      if (ball.ghost) ctx.globalAlpha = 0.4;

      // Selection ring
      if (ball.id === this.selectedBallId) {
        ctx.beginPath();
        ctx.arc(sx, sy, sr + 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Ball body
      const grad = ctx.createRadialGradient(
        sx - sr * 0.3, sy - sr * 0.3, sr * 0.1,
        sx, sy, sr,
      );
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.3, pc.main);
      grad.addColorStop(1, pc.dark);

      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Item indicators
      const emojiSize = `${sr}px sans-serif`;
      if (ball.bomb) {
        ctx.font = emojiSize;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💣', sx, sy - sr * 1.5);
      }
      if (ball.shielded) {
        ctx.beginPath();
        ctx.arc(sx, sy, sr + 3, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (ball.mass > 1) {
        ctx.beginPath();
        ctx.arc(sx, sy, sr + 2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 200, 0, 0.5)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      if (ball.magnet) {
        ctx.font = `${sr * 0.8}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🧲', sx, sy - sr * 1.5);
      }

      ctx.globalAlpha = 1;
    }

    // Selectable highlight (pulse glow on my alive balls during select phase)
    if (this.phase === 'select' && this.currentPlayer === this.myIndex) {
      const t = performance.now() / 600;
      const pulse = 0.4 + Math.sin(t) * 0.2;
      for (const ball of this.balls) {
        if (!ball.alive || ball.owner !== this.myIndex) continue;
        const sx = ball.x * this.scale + this.offsetX;
        const sy = ball.y * this.scale + this.offsetY;
        const sr = ball.radius * this.scale;
        const pc = this.players[ball.owner]?.color || { glow: '#aaa' };
        ctx.beginPath();
        ctx.arc(sx, sy, sr + 6, 0, Math.PI * 2);
        ctx.strokeStyle = pc.glow;
        ctx.globalAlpha = pulse;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  _drawAimLine(ctx, aim) {
    const { ball, angle, power, pullX, pullY } = aim;
    // ball coords are already in screen space (from InputHandler)
    const bx = ball.x;
    const by = ball.y;
    const length = power * 4;
    const endX = bx + Math.cos(angle) * length;
    const endY = by + Math.sin(angle) * length;

    // Dotted line
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);

    // Power dot
    const pct = power / MAX_POWER;
    const r = Math.floor(255 * pct);
    const g = Math.floor(255 * (1 - pct));
    ctx.beginPath();
    ctx.arc(endX, endY, 5, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${r},${g},80)`;
    ctx.fill();

    // Power text
    ctx.font = '14px monospace';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(power)}`, endX, endY - 12);

    // Pull line (from ball to cursor)
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(pullX, pullY);
    ctx.strokeStyle = 'rgba(255,100,100,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ════════════════════════════════════════════════════════════
  //  HUD / UI
  // ════════════════════════════════════════════════════════════

  _updateHUD() {
    const player = this.players[this.currentPlayer];
    if (!player) return;

    const isMe = this.currentPlayer === this.myIndex;
    const color = player.color?.main || '#888';

    // Turn indicator
    const ti = document.getElementById('turnIndicator');
    if (ti) {
      ti.textContent = isMe ? '🎯 Your turn!' : `⏳ ${player.name}'s turn`;
      ti.style.color = color;
      ti.style.borderColor = color;
    }

    // Round
    const ri = document.getElementById('roundInfo');
    if (ri) ri.textContent = `Round ${this.round}`;

    // Storm
    const si = document.getElementById('stormInfo');
    if (si) si.textContent = `Storm: ${Math.round(this.stormPercent)}%`;

    // Timer
    const timer = document.getElementById('turnTimer');
    if (timer) {
      if ((this.phase === 'select' || this.phase === 'aim') && this.turnTimeLeft > 0) {
        timer.textContent = `${this.turnTimeLeft}s`;
        timer.style.display = 'block';
        timer.style.color = this.turnTimeLeft <= 5 ? '#ff4444' : '#aaa';
      } else {
        timer.style.display = 'none';
      }
    }

    // Scores
    const scores = document.getElementById('playerScores');
    if (scores) {
      scores.innerHTML = this.players.map(p => {
        const alive = this.balls.filter(b => b.alive && b.owner === p.index).length;
        const c = p.color?.main || '#888';
        const arrow = p.index === this.currentPlayer ? '► ' : '';
        const you = p.index === this.myIndex ? ' (you)' : '';
        return `<div class="score-row" style="color:${c}">${arrow}${p.name}${you}: ${alive}🔴</div>`;
      }).join('');
    }
  }

  _updateItemBar() {
    const bar = document.getElementById('itemBar');
    if (!bar) return;

    const items = this.playerItems || [];
    if (items.length === 0 || this.currentPlayer !== this.myIndex) {
      bar.style.display = 'none';
      return;
    }

    bar.style.display = 'flex';
    bar.innerHTML = items.map((item, i) => {
      const sel = i === this.selectedItemIndex ? 'item-selected' : '';
      return `<div class="item-slot ${sel}" data-index="${i}" title="${item.name}: ${item.desc || ''}">${item.emoji}</div>`;
    }).join('');
  }

  _updateLobbyUI() {
    const list = document.getElementById('lobbyPlayerList');
    if (list) {
      list.innerHTML = this.lobbyPlayers.map(p => {
        const status = p.connected ? '🟢' : '🔴';
        const host = p.index === 0 ? ' 👑' : '';
        const you = p.index === this.myIndex ? ' (you)' : '';
        return `<div class="lobby-player">${status} ${p.name}${host}${you}</div>`;
      }).join('');
    }

    const codeEl = document.getElementById('roomCodeDisplay');
    if (codeEl) codeEl.textContent = this.roomCode || '----';

    const startBtn = document.getElementById('lobbyStartBtn');
    if (startBtn) {
      startBtn.style.display = this.isHost ? 'block' : 'none';
      startBtn.disabled = this.lobbyPlayers.length < 1;
    }

    const waiting = document.getElementById('lobbyWaiting');
    if (waiting) waiting.style.display = this.isHost ? 'none' : 'block';

    // Show room section, hide join/create
    const room = document.getElementById('lobbyRoom');
    if (room) room.style.display = 'block';
    const jc = document.getElementById('lobbyJoinCreate');
    if (jc) jc.style.display = 'none';
  }

  _showLobbyError(msg) {
    const el = document.getElementById('lobbyError');
    if (el) {
      el.textContent = msg;
      el.style.display = 'block';
      setTimeout(() => { el.style.display = 'none'; }, 3000);
    }
  }

  _hideLobby() {
    const lobby = document.getElementById('lobbyOverlay');
    if (lobby) lobby.style.display = 'none';
  }

  _showGame() {
    const hud = document.getElementById('hud');
    if (hud) hud.style.display = 'flex';
    this.canvas.style.display = 'block';
  }

  _showGameOver(winnerName, winnerIndex, stats) {
    const overlay = document.getElementById('gameOverOverlay');
    if (!overlay) return;

    const color = this.players[winnerIndex]?.color?.main || '#fff';
    document.getElementById('gameOverTitle').textContent = '🏆 Game Over';
    const winEl = document.getElementById('gameOverWinner');
    winEl.textContent = `${winnerName} wins!`;
    winEl.style.color = color;

    const statsEl = document.getElementById('gameOverStats');
    if (statsEl && stats) {
      statsEl.innerHTML = this.players.map((p, i) => {
        const s = stats[i] || {};
        const c = p.color?.main || '#888';
        return `<div style="color:${c}; margin:4px 0;">
          ${p.name}: ${s.shotsFired || 0} shots, ${s.ballsPocketed || 0} pocketed, ${s.itemsUsed || 0} items
        </div>`;
      }).join('');
    }

    overlay.style.display = 'flex';

    const btn = document.getElementById('gameOverPlayAgain');
    if (btn) {
      btn.onclick = () => {
        overlay.style.display = 'none';
        this.destroy();
        location.reload();
      };
    }
  }

  // ════════════════════════════════════════════════════════════
  //  Cleanup
  // ════════════════════════════════════════════════════════════

  destroy() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this.conn.disconnect();
    this.replay.stop();
    try { localStorage.removeItem('ballz_session'); } catch (e) {}
  }
}
