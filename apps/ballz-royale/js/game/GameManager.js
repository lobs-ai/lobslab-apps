// ── Game Manager ──
// Top-level game state machine. Coordinates all subsystems.

import {
  BALL_SPAWN_DISTANCE, STORM_SHRINK_INTERVAL,
  ITEM_SPAWN_INTERVAL, AI_TURN_DELAY, MIN_SPEED,
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

    this._bindInput();
    this._bindUI();
  }

  _bindInput() {
    this.input.onBallSelected = (ball) => this._selectBall(ball);
    this.input.onShot = (angle, power) => this._shoot(angle, power);
    this.input.onCancel = () => this._cancelAim();

    // Prevent scroll
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
  }

  _bindUI() {
    this.hud.onItemClick = (index) => {
      if (this.phase === 'select' || this.phase === 'aim') {
        this.activeItemIndex = this.activeItemIndex === index ? null : index;
        this._updateHUD();
      }
    };

    document.getElementById('playAgainBtn').addEventListener('click', () => {
      this.hud.hideWin();
      document.getElementById('setup').style.display = 'flex';
      this.phase = 'menu';
    });
  }

  // ── Lifecycle ──

  resize() {
    this.renderer.resize();
    if (this.arena) {
      this.arena.resize(this.canvas.width, this.canvas.height);
      if (this.storm) this.storm.resize(this.arena.radius);
    }
  }

  /** Start a new game with the given player configs. */
  start(playerConfigs) {
    resetBallIds();
    this.arena = new Arena(this.canvas.width, this.canvas.height);
    // Vary pocket positions slightly each game for map variety
    this.arena.buildPockets(
      Array.from({ length: 6 }, () => (Math.random() - 0.5) * 0.3)
    );
    this.storm = new Storm(this.arena.radius);
    this.itemSpawner.clear();
    this.particles.clear();
    this.effects = new ScreenEffects();
    this.effects.bindUI(document.getElementById('announcement'));

    this.players = playerConfigs.map((cfg, i) =>
      new Player(i, cfg.name, cfg.color, cfg.isAI)
    );

    this.ballsPerPlayer = this.players.length <= 2 ? 5 : 4;
    this.balls = this._spawnBalls();
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
      setTimeout(() => this._doAITurn(), AI_TURN_DELAY);
    }

    requestAnimationFrame((t) => this._loop(t));
  }

  _spawnBalls() {
    const balls = [];
    const total = this.players.length * this.ballsPerPlayer;
    let idx = 0;
    for (let p = 0; p < this.players.length; p++) {
      for (let b = 0; b < this.ballsPerPlayer; b++) {
        const angle = (idx / total) * Math.PI * 2 - Math.PI / 2;
        const dist = this.arena.radius * BALL_SPAWN_DISTANCE;
        const ball = new Ball(
          this.arena.cx + Math.cos(angle) * dist,
          this.arena.cy + Math.sin(angle) * dist,
          p
        );
        balls.push(ball);
        idx++;
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
    this.players[this.currentPlayer].stats.shotsFired++;
    this.phase = 'simulate';
    this._updateInputPhase();
  }

  _cancelAim() {
    this.selectedBall = null;
    this.activeItemIndex = null;
    this.phase = 'select';
    this._updateInputPhase();
    this._updateHUD();
  }

  // ── Turn Flow ──

  _endTurn() {
    // Reset ball effects
    for (const ball of this.balls) {
      ball.resetEffects();
    }
    this.selectedBall = null;
    this.activeItemIndex = null;

    // ── Storm damage: eliminate any ball outside the storm radius ──
    if (this.storm) {
      const sr = this.storm.currentRadius;
      const cx = this.arena.cx;
      const cy = this.arena.cy;
      for (const ball of this.balls) {
        if (!ball.alive) continue;
        const dx = ball.x - cx;
        const dy = ball.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > sr) {
          ball.alive = false;
          const owner = this.players[ball.owner];
          this.particles.spawn(ball.x, ball.y, '#ff4444', 20);
          this.effects.announce(`⚡ ${owner.name}'s ball destroyed by storm!`, 2000);
        }
      }
    }

    // Check for winner
    const activePlayers = this.players.filter(p => !p.isEliminated(this.balls));
    if (activePlayers.length <= 1) {
      this.phase = 'gameover';
      const winner = activePlayers.length === 1
        ? activePlayers[0]
        : { name: 'Nobody', color: { main: '#888' } };
      this.hud.showWin(winner.name, winner.color.main);
      return;
    }

    // Advance to next alive player
    let next = (this.currentPlayer + 1) % this.players.length;
    let safety = 0;
    while (this.players[next].isEliminated(this.balls) && safety < this.players.length) {
      next = (next + 1) % this.players.length;
      safety++;
    }

    this.turnInRound++;
    if (this.turnInRound >= activePlayers.length) {
      this.turnInRound = 0;
      this.round++;

      // Storm shrink check
      if (this.round % STORM_SHRINK_INTERVAL === 1 && this.round > 1) {
        if (this.storm.shrink()) {
          this.effects.announce(`⚡ STORM CLOSING — ${this.storm.percent}%`, 2000);
          this.effects.shake(10);
          this.itemSpawner.pruneOutsideStorm(this.arena.cx, this.arena.cy, this.storm.currentRadius);
        }
      }

      // Item spawn check
      if (this.round % ITEM_SPAWN_INTERVAL === 0) {
        this.itemSpawner.spawnItems(this.arena.cx, this.arena.cy, this.storm.currentRadius);
      }
    }

    this.currentPlayer = next;
    this.phase = 'select';
    this._updateHUD();
    this._updateInputPhase();

    if (this.players[this.currentPlayer].isAI) {
      setTimeout(() => this._doAITurn(), AI_TURN_DELAY);
    }
  }

  // ── AI ──

  _doAITurn() {
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
    player.stats.shotsFired++;
    this.phase = 'simulate';
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
    const selectableBalls = this.phase === 'select'
      ? this.players[this.currentPlayer].getAliveBalls(this.balls)
      : null;
    this.input.setPhase(this.phase, this.selectedBall, selectableBalls);
  }

  // ── Main Loop ──

  _loop(timestamp) {
    if (!this.lastTime) this.lastTime = timestamp;
    const realDtMs = Math.min(timestamp - this.lastTime, 50);
    this.lastTime = timestamp;

    // Update effects (returns slow-mo multiplier)
    const slowMo = this.effects.update(realDtMs);
    const dt = (realDtMs / 1000) * slowMo;

    // Storm lerp
    this.storm.update(dt);

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

      if (allBallsStopped(this.balls)) {
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
      requestAnimationFrame((t) => this._loop(t));
    }
  }

  _processEvents(events) {
    for (const evt of events) {
      switch (evt.type) {
        case 'wallHit':
          this.particles.spawn(evt.x, evt.y, '#888', 3);
          break;

        case 'pocketed': {
          const ownerPlayer = this.players[evt.ball.owner];
          ownerPlayer.stats.ballsLost++;

          // Credit the shooter if they pocketed an opponent's ball
          if (evt.ball.owner !== this.currentPlayer) {
            this.players[this.currentPlayer].stats.ballsPocketed++;
          }

          this.particles.spawn(evt.pocket.x, evt.pocket.y, ownerPlayer.color.main, 15);
          this.effects.shake(8);
          this.effects.enterSlowMo(0.3, 400);
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
}
