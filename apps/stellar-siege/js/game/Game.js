import { World } from './World.js';
import { createPlayer } from './Player.js';
import { resetNodeIds } from './Node.js';
import { generateMap } from '../map/MapGenerator.js';
import { ProductionSystem } from '../systems/ProductionSystem.js';
import { SwarmSystem } from '../systems/SwarmSystem.js';
import { CaptureSystem } from '../systems/CaptureSystem.js';
import { AISystem } from '../systems/AISystem.js';
import { createSwarm, resetSwarmIds, nodeTarget, posTarget } from './Swarm.js';

/**
 * Game states.
 */
export const GameState = {
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAME_OVER: 'game_over',
};

/**
 * Top-level game manager.
 */
export class Game {
  constructor() {
    this.state = GameState.MENU;
    this.world = null;
    this.winner = null;

    /** Simulation speed multiplier — 0.5, 1, or 2 */
    this.gameSpeed = 1.0;

    // Systems
    this.productionSystem = new ProductionSystem();
    this.swarmSystem = new SwarmSystem();
    this.captureSystem = new CaptureSystem();
    this.aiSystem = new AISystem();
  }

  /**
   * Start a new game with given config.
   */
  startGame(config) {
    resetNodeIds();
    resetSwarmIds();

    this.world = new World();
    this.winner = null;

    // Create players
    const humanPlayer = createPlayer(0, true);
    this.world.players.push(humanPlayer);

    for (let i = 0; i < config.opponents; i++) {
      const aiPlayer = createPlayer(i + 1, false, config.difficulty);
      this.world.players.push(aiPlayer);
    }

    // Generate map
    const mapData = generateMap({
      playerCount: this.world.players.length,
      mapSize: config.mapSize,
    });

    this.world.nodes = mapData.nodes;
    this.world.width = mapData.width;
    this.world.height = mapData.height;

    // Init AI
    this.aiSystem.init(this.world);

    this.state = GameState.PLAYING;
    this.gameSpeed = 1.0;
  }

  /** Pause the game (stops simulation ticks). */
  pause() {
    if (this.state === GameState.PLAYING) {
      this.state = GameState.PAUSED;
    }
  }

  /** Resume from pause. */
  unpause() {
    if (this.state === GameState.PAUSED) {
      this.state = GameState.PLAYING;
    }
  }

  /**
   * Set simulation speed.
   * @param {number} speed  e.g. 0.5, 1, 2
   */
  setSpeed(speed) {
    this.gameSpeed = speed;
  }

  /**
   * Update game simulation by dt seconds.
   */
  update(dt) {
    if (this.state !== GameState.PLAYING) return;

    this.world.time += dt;

    // Run systems
    this.productionSystem.update(this.world, dt);
    this.swarmSystem.update(this.world, dt);
    this.captureSystem.update(this.world, dt);
    this.aiSystem.update(this.world, dt);

    // Check win/lose
    this.checkGameOver();
  }

  /**
   * Check if the game is over.
   */
  checkGameOver() {
    // Mark eliminated players
    for (const player of this.world.players) {
      if (player.alive && this.world.isPlayerEliminated(player.id)) {
        player.alive = false;
      }
    }

    const alivePlayers = this.world.players.filter(p => p.alive);

    // Human lost
    const human = this.world.players.find(p => p.isHuman);
    if (human && !human.alive) {
      this.state = GameState.GAME_OVER;
      this.winner = null; // loss
      return;
    }

    // Only one player left
    if (alivePlayers.length <= 1) {
      this.state = GameState.GAME_OVER;
      this.winner = alivePlayers[0] ?? null;
      return;
    }
  }

  /**
   * Redirect a player swarm to a new target — either a node or a map position.
   * @param {Swarm}      swarm
   * @param {Node|null}  targetNode  - if clicking a node
   * @param {{x,y}|null} targetPos   - if clicking empty space
   */
  redirectSwarm(swarm, targetNode, targetPos) {
    if (!swarm || !swarm.alive) return;
    if (swarm.owner !== 0) return; // only human can redirect

    if (targetNode) {
      swarm.target = nodeTarget(targetNode.id);
    } else if (targetPos) {
      swarm.target = posTarget(targetPos.x, targetPos.y);
    }
  }

  /**
   * Send energy from source node to target node as a mote swarm.
   */
  sendEnergy(sourceNode, targetNode, ratio = 0.5) {
    if (!sourceNode || !targetNode) return;
    if (sourceNode.id === targetNode.id) return;
    if (sourceNode.owner === null) return; // can't send from neutral

    const amount = Math.floor(sourceNode.energy * ratio);
    if (amount < 5) return; // not worth sending

    sourceNode.energy -= amount;

    const swarm = createSwarm(sourceNode, targetNode, amount, sourceNode.owner);
    this.world.addSwarm(swarm);
  }
}
