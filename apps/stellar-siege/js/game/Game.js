import { World } from './World.js';
import { createPlayer } from './Player.js';
import { resetNodeIds } from './Node.js';
import { resetStreamIds } from './Stream.js';
import { generateMap } from '../map/MapGenerator.js';
import { ProductionSystem } from '../systems/ProductionSystem.js';
import { StreamSystem } from '../systems/StreamSystem.js';
import { CaptureSystem } from '../systems/CaptureSystem.js';
import { AISystem } from '../systems/AISystem.js';
import { createStream } from './Stream.js';

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

    // Systems
    this.productionSystem = new ProductionSystem();
    this.streamSystem = new StreamSystem();
    this.captureSystem = new CaptureSystem();
    this.aiSystem = new AISystem();
  }

  /**
   * Start a new game with given config.
   */
  startGame(config) {
    resetNodeIds();
    resetStreamIds();

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
  }

  /**
   * Update game simulation by dt seconds.
   */
  update(dt) {
    if (this.state !== GameState.PLAYING) return;

    this.world.time += dt;

    // Run systems
    this.productionSystem.update(this.world, dt);
    this.streamSystem.update(this.world, dt);
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
   * Send energy from source node to target node.
   */
  sendEnergy(sourceNode, targetNode, ratio = 0.5) {
    if (!sourceNode || !targetNode) return;
    if (sourceNode.id === targetNode.id) return;
    if (sourceNode.owner === null) return; // can't send from neutral

    const amount = Math.floor(sourceNode.energy * ratio);
    if (amount < 5) return; // not worth sending

    sourceNode.energy -= amount;

    const stream = createStream(sourceNode, targetNode, amount, sourceNode.owner);
    this.world.addStream(stream);
  }
}
