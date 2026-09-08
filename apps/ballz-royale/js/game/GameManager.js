// ── Game Manager ──
// Top-level game state machine. Coordinates all subsystems.

import {
  STORM_SHRINK_INTERVAL, ITEM_TYPES,
  ITEM_SPAWN_INTERVAL, AI_TURN_DELAY,
} from '../constants.js';
import { Ball, resetBallIds } from './Ball.js';
import { Player } from './Player.js';
import { Arena } from './Arena.js';
import { Storm } from './Storm.js';
import { ItemSpawner } from './ItemSpawner.js';
import { AIController } from './AIController.js';
import { simulateStep, allBallsStopped, applyExplosion, applyMagnetPull } from '../physics/PhysicsEngine.js';
import { ParticleSystem } from '../effects/ParticleSystem.js';
import { ScreenEffects } from '../effects/ScreenEffects.js';
import { Renderer } from '../rendering/Renderer.js';
import { HUD } from '../rendering/HUD.js';
import { InputHandler } from '../input/InputHandler.js';
import { audio } from '../effects/Audio.js';

/**
 * Game phases:
 *   'menu'     — setup screen visible
 *   'select'   — current player picks a ball
 *   'aim'      — current player aims and shoots
 *   'simulate' — physics running, wait for balls to stop
 *   'gameover' — winner screen
 */
export class GameManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.hud = new HUD();
    this.input = new InputHandler(canvas);
    this.particles = new ParticleSystem();
    this.effects = new ScreenEffects();
    this.ai = new AIController();
    this.itemSpawner = new ItemSpawner();

    this.phase = 'menu';
    this.players = [];
    this.balls = [];
    this.arena = null;
    this.storm = null;
    this.currentPlayer = 0;
    this.round = 1;
    this.turnInRound = 0;
    this.selectedBall = null;
    this.activeItemIndex = null;
    this.ballsPerPlayer = 4;
    this.lastTime = 0;
    this._raf = null;
    this._aiTimer = null;
    this.configs = null;

    this._bindInput();
    this._bindUI();
  }

  _bindInput() {
    this.input.onBallSelected = (ball) => this._selectBall(ball);
    this.input.onShot = (angle, power) => this._shoot(angle, power);
    this.input.onCancel = () => this._cancelAim();
  }

  _bindUI() {
    this.hud.onItemClick = (index) => {
      if (!this.players[this.currentPlayer]?.isAI && (this.phase === 'select' || this.phase === 'aim')) {
        this.activeItemIndex = this.activeItemIndex === index ? null : index;
        this._updateHUD();
      }
    };

    document.getElementById('playAgainBtn').onclick = () => {
      this.hud.hideWin();
      this.start(this.configs);
    };
  }

  // ── Lifecycle ──

  resize() {
    const old = this.arena && { cx: this.arena.cx, cy: this.arena.cy, w: this.arena.tableW, h: this.arena.tableH };
    this.renderer.resize();
    if (this.arena) {
      this.arena.resize(this.renderer.width, this.renderer.height);
      if (this.storm) this.storm.resize(this.arena.radius);
      const scale = this.arena.tableW / old.w;
      for (const object of [...this.balls, ...this.itemSpawner.pickups]) {
        object.x = this.arena.cx + (object.x - old.cx) * scale;
        object.y = this.arena.cy + (object.y - old.cy) * this.arena.tableH / old.h;
        if ('radius' in object) object.radius = this.arena.ballRadius;
      }
      if (this.phase === 'aim') this._cancelAim();
    }
  }

  /** Start a new game with the given player configs. */
  start(playerConfigs) {
    cancelAnimationFrame(this._raf);
    clearTimeout(this._aiTimer);
    this.configs = playerConfigs;
    resetBallIds();
    this.arena = new Arena(this.renderer.width, this.renderer.height);
    this.storm = new Storm(this.arena.radius);
    this.itemSpawner.clear();
    this.particles.clear();
    this.effects = new ScreenEffects();

    this.players = playerConfigs.map((cfg, i) =>
      new Player(i, cfg.name, cfg.color, cfg.isAI)
    );

    this.ballsPerPlayer = this.players.length <= 2 ? 5 : 4;
    this.balls = this._spawnBalls();
    this.players.forEach(p => p.collectItem(ITEM_TYPES[0]));
    this.itemSpawner.spawnItems(this.arena.cx, this.arena.cy, this.arena.tableH * 0.42);
    this.currentPlayer = 0;
    this.round = 1;
    this.turnInRound = 0;
    this.selectedBall = null;
    this.activeItemIndex = null;
    this.phase = 'select';
    this.lastTime = 0;

    this.hud.show();
    this._updateHUD();
    this._updateInputPhase();

    // Start AI if first player is AI
    if (this.players[0].isAI) {
      this._aiTimer = setTimeout(() => this._doAITurn(), AI_TURN_DELAY);
    }

    this._raf = requestAnimationFrame((t) => this._loop(t));
  }

  _spawnBalls() {
    const balls = [];
    for (let p = 0; p < this.players.length; p++) {
      for (let b = 0; b < this.ballsPerPlayer; b++) {
        // Equal-distance starting positions safely inside any table shape.
        const angle = (p * this.ballsPerPlayer + b) / (this.players.length * this.ballsPerPlayer) * Math.PI * 2 - Math.PI / 2;
        const radius = Math.min(this.arena.tableW, this.arena.tableH) * 0.34;
        const ball = new Ball(
          this.arena.cx + Math.cos(angle) * radius,
          this.arena.cy + Math.sin(angle) * radius,
          p
        );
        ball.radius = this.arena.ballRadius;
        balls.push(ball);
      }
    }
    return balls;
  }

  // ── Input Callbacks ──

  _selectBall(ball) {
    if (this.phase !== 'select') return;
    if (!ball.alive) return;
    if (ball.owner !== this.currentPlayer) return;
    this.selectedBall = ball;
    this.phase = 'aim';
    this._updateInputPhase();
    this._updateHUD();
  }

  _shoot(angle, power) {
    if (this.phase !== 'aim' || !this.selectedBall) return;

    // Apply item if active
    if (this.activeItemIndex !== null) {
      const player = this.players[this.currentPlayer];
      const item = player.useItem(this.activeItemIndex);
      if (item) {
        this.selectedBall.applyItem(item.id);
      }
      this.activeItemIndex = null;
    }

    this.selectedBall.shoot(angle, power);
    audio.play('shot', power / 5);
    this.players[this.currentPlayer].stats.shotsFired++;
    this.phase = 'simulate';
    this.simulationTime = 0;
    this._updateHUD();
    this._updateInputPhase();
  }

  _cancelAim() {
    if (this.phase !== 'aim') return;
    this.selectedBall = null;
    this.activeItemIndex = null;
    this.phase = 'select';
    this._updateInputPhase();
    this._updateHUD();
  }

  // ── Turn Flow ──

  _endTurn() {
    // Give each player their turn to rescue balls before the storm takes them.
    for (const ball of this.balls) {
      if (ball.alive && ball.owner === this.currentPlayer &&
          !this.storm.isSafe(ball.x, ball.y, this.arena.cx, this.arena.cy)) {
        ball.kill();
        this.players[ball.owner].stats.ballsLost++;
        this.particles.spawn(ball.x, ball.y, '#ee977c', 18);
        this.effects.announce('The storm claimed a ball');
      }
      ball.vx = 0;
      ball.vy = 0;
    }
    // Reset ball effects
    for (const ball of this.balls) {
      ball.resetEffects();
    }
    this.selectedBall = null;
    this.activeItemIndex = null;

    // Check for winner
    const activePlayers = this.players.filter(p => !p.isEliminated(this.balls));
    if (activePlayers.length <= 1) {
      this.phase = 'gameover';
      const winner = activePlayers.length === 1
        ? activePlayers[0]
        : { name: 'Nobody', color: { main: '#888' } };
      this.hud.showWin(winner.name, winner.color.main);
      document.getElementById('winStats').textContent = this.players.map(p =>
        `${p.name}: ${p.stats.ballsPocketed} pocketed / ${p.stats.shotsFired} shots`).join(' · ');
      this._updateInputPhase();
      return;
    }

    // Advance to next alive player
    let next = (this.currentPlayer + 1) % this.players.length;
    let safety = 0;
    while (this.players[next].isEliminated(this.balls) && safety < this.players.length) {
      next = (next + 1) % this.players.length;
      safety++;
    }

    if (next <= this.currentPlayer) {
      this.turnInRound = 0;
      this.round++;
      if (this.round % STORM_SHRINK_INTERVAL === 1 && this.storm.shrink()) {
        this.effects.announce('Storm closing. Bring your balls inside!');
      }

      // Item spawn check
      if (this.round % ITEM_SPAWN_INTERVAL === 0) {
        this.itemSpawner.spawnItems(this.arena.cx, this.arena.cy, Math.min(this.arena.tableH * 0.42, this.storm.targetRadius * 0.8));
      }
    }

    this.currentPlayer = next;
    this.phase = 'select';
    this._updateHUD();
    this._updateInputPhase();

    if (this.players[this.currentPlayer].isAI) {
      this._aiTimer = setTimeout(() => this._doAITurn(), AI_TURN_DELAY);
    }
  }

  // ── AI ──

  _doAITurn() {
    if (this.phase !== 'select' || !this.players[this.currentPlayer]?.isAI) return;
    const player = this.players[this.currentPlayer];
    const shot = this.ai.computeShot(player, this.balls, this.arena);

    if (!shot) {
      this._endTurn();
      return;
    }

    this.selectedBall = shot.ball;

    // Use item
    if (shot.itemIndex >= 0) {
      const item = player.useItem(shot.itemIndex);
      if (item) shot.ball.applyItem(item.id);
    }

    shot.ball.shoot(shot.angle, shot.power);
    audio.play('shot', shot.power / 5);
    player.stats.shotsFired++;
    this.phase = 'simulate';
    this.simulationTime = 0;
    this._updateHUD();
    this._updateInputPhase();
  }

  // ── State Sync ──

  _updateHUD() {
    this.hud.update({
      players: this.players,
      currentPlayer: this.currentPlayer,
      round: this.round,
      storm: this.storm,
      balls: this.balls,
      activeItemIndex: this.activeItemIndex,
      phase: this.phase,
      ballsPerPlayer: this.ballsPerPlayer,
    });
  }

  _updateInputPhase() {
    const selectableBalls = this.phase === 'select' && !this.players[this.currentPlayer].isAI
      ? this.players[this.currentPlayer].getAliveBalls(this.balls)
      : null;
    this.input.setPhase(this.players[this.currentPlayer]?.isAI ? 'wait' : this.phase, this.selectedBall, selectableBalls);
  }

  // ── Main Loop ──

  _loop(timestamp) {
    if (this.phase === 'menu') return;
    if (!this.lastTime) this.lastTime = timestamp;
    const realDtMs = Math.min(timestamp - this.lastTime, 50);
    this.lastTime = timestamp;

    // Effects use seconds, like the physics simulation.
    this.effects.update(realDtMs / 1000);
    const dt = (realDtMs / 1000) * this.effects.slowFactor;
    this.storm.update(dt);
    const announcement = document.getElementById('announcement');
    announcement.textContent = this.effects.announcementText;
    announcement.style.opacity = this.effects.announcementAlpha;

    // Physics simulation
    if (this.phase === 'simulate') {
      const events = simulateStep(this.balls, this.arena, this.storm.currentRadius, dt);
      this._processEvents(events);

      // Add trails for moving balls
      for (const ball of this.balls) {
        if (ball.alive && ball.isMoving) {
          this.particles.addTrail(ball.x, ball.y, this.players[ball.owner].color.main);
        }
      }

      this.simulationTime += dt;
      if (allBallsStopped(this.balls) || this.simulationTime > 8) {
        this._endTurn();
      }
    }

    // Update particles
    this.particles.update();

    // Render
    this.renderer.draw({
      arena: this.arena,
      storm: this.storm,
      balls: this.balls,
      players: this.players,
      particles: this.particles,
      itemPickups: this.itemSpawner.pickups,
      effects: this.effects,
      currentPlayer: this.currentPlayer,
      phase: this.phase,
      selectedBall: this.selectedBall,
      aimInfo: this.input.getAimInfo(),
      powerBarEl: this.hud.powerBar,
      powerFillEl: this.hud.powerFill,
    });

    if (this.phase !== 'gameover') {
      this._raf = requestAnimationFrame((t) => this._loop(t));
    }
  }

  _processEvents(events) {
    for (const evt of events) {
      switch (evt.type) {
        case 'wallHit':
          audio.play('hit', evt.speed);
          this.particles.spawn(evt.x, evt.y, '#888', 3);
          break;

        case 'pocketed': {
          audio.play('pocket', 10);
          const ownerPlayer = this.players[evt.ball.owner];
          ownerPlayer.stats.ballsLost++;

          // Credit the shooter if they pocketed an opponent's ball
          if (evt.ball.owner !== this.currentPlayer) {
            this.players[this.currentPlayer].stats.ballsPocketed++;
          }

          this.particles.spawn(evt.pocket.x, evt.pocket.y, ownerPlayer.color.main, 15);
          this.effects.shake(8);
          this.effects.slowMo(0.3, 250);
          this.effects.announce(`${ownerPlayer.name} lost a ball!`);
          break;
        }

        case 'shieldBlock': {
          const player = this.players[evt.ball.owner];
          this.particles.spawnRing(evt.ball.x, evt.ball.y, '#66ccff', 12, 20, 3);
          this.effects.announce(`🛡️ ${player.name}'s shield blocked!`);
          this.effects.shake(4);
          break;
        }

        case 'ballCollision':
          audio.play('hit', evt.speed);
          this.particles.spawn(evt.cx, evt.cy, '#fff', Math.min(8, Math.floor(evt.speed)));
          if (evt.speed > 5) this.effects.shake(Math.min(evt.speed * 0.8, 6));
          break;

        case 'explosion':
          applyExplosion(this.balls, evt.x, evt.y, evt.source);
          this.particles.spawn(evt.x, evt.y, '#ff6b6b', 25, { speedMax: 8, sizeMax: 6 });
          this.particles.spawn(evt.x, evt.y, '#ffd93d', 20, { speedMax: 6 });
          this.effects.shake(15);
          this.effects.announce('💥 BOOM!');
          break;

        case 'magnetPull':
          applyMagnetPull(this.balls, evt.x, evt.y, evt.source);
          this.particles.spawnRing(evt.x, evt.y, '#9966ff', 16, 60, -2);
          this.effects.announce('🧲 MAGNET PULL!');
          this.effects.shake(6);
          break;
      }
    }

    // Check item pickups during simulation
    for (const ball of this.balls) {
      if (!ball.alive) continue;
      const collected = this.itemSpawner.checkCollection(ball);
      for (const pickup of collected) {
        const player = this.players[ball.owner];
        if (player.collectItem(pickup.type)) {
          this.particles.spawn(pickup.x, pickup.y, '#ffd93d', 8);
          this.effects.announce(`${player.name} picked up ${pickup.type.emoji} ${pickup.type.name}!`);
        }
      }
    }
  }

  destroy() {
    this.phase = 'menu';
    cancelAnimationFrame(this._raf);
    clearTimeout(this._aiTimer);
    this.input.destroy();
    this.hud.hide();
    this.hud.hideWin();
    document.getElementById('itemsBar').replaceChildren();
    document.getElementById('announcement').style.opacity = 0;
  }
}
