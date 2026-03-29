import { AI_REACTION, MIN_SEND_ENERGY } from '../utils/constants.js';
import { createSwarm } from '../game/Swarm.js';
import { dist } from '../utils/math.js';

/**
 * AISystem — drives non-human players.
 *
 * Each AI player has its own controller with an independent reaction timer.
 * On timer fire: evaluate the map, pick the best action, execute it.
 *
 * Decision priorities (each timer tick):
 *   1. Reinforce owned nodes under attack
 *   2. Attack high-value neutral / weak enemy nodes
 *   3. Expand to nearest unclaimed node
 */
export class AISystem {
  constructor() {
    // Map from playerId -> AIController
    this.controllers = new Map();
  }

  init(world) {
    this.controllers.clear();
    for (const player of world.players) {
      if (!player.isHuman) {
        this.controllers.set(player.id, new AIController(player.id, player.difficulty));
      }
    }
  }

  update(world, dt) {
    for (const [, controller] of this.controllers) {
      controller.update(world, dt);
    }
  }
}

class AIController {
  constructor(playerId, difficulty) {
    this.playerId = playerId;
    this.difficulty = difficulty || 'medium';
    this.reactionTimer = Math.random() * AI_REACTION[this.difficulty]; // stagger start
  }

  update(world, dt) {
    this.reactionTimer -= dt;
    if (this.reactionTimer > 0) return;
    this.reactionTimer = AI_REACTION[this.difficulty] * (0.8 + Math.random() * 0.4);

    const myNodes = world.getNodesByOwner(this.playerId);
    if (myNodes.length === 0) return; // eliminated

    // --- Priority 1: Reinforce nodes under threat ---
    this._reinforceThreats(world, myNodes);

    // --- Priority 2 & 3: Attack / Expand ---
    this._attackOrExpand(world, myNodes);
  }

  /**
   * Find nodes being attacked by enemy swarms and send help from safe neighbors.
   */
  _reinforceThreats(world, myNodes) {
    for (const node of myNodes) {
      // Check if enemy swarms are targeting this node
      const underAttack = world.swarms.some(
        s => s.alive && s.target.type === 'node' && s.target.nodeId === node.id && s.owner !== this.playerId
      );

      if (!underAttack) continue;

      // Find nearby friendly node with surplus energy to reinforce
      const reinforcer = this._findBestSource(world, myNodes, node, 0.4);
      if (!reinforcer) continue;

      const amount = Math.floor(reinforcer.energy * 0.5);
      if (amount < MIN_SEND_ENERGY) continue;

      this._sendSwarm(world, reinforcer, node, 0.5);
    }
  }

  /**
   * Find the best attack/expansion target and send a swarm.
   */
  _attackOrExpand(world, myNodes) {
    // Best source — node with the most available energy
    const source = myNodes
      .filter(n => n.energy > n.maxEnergy * 0.3)
      .sort((a, b) => b.energy - a.energy)[0];

    if (!source) return;

    // Score all non-owned nodes
    const candidates = world.nodes.filter(n => n.owner !== this.playerId);
    if (candidates.length === 0) return;

    let bestTarget = null;
    let bestScore = -Infinity;

    for (const target of candidates) {
      const d = dist(source.position, target.position);
      const score = this._scoreTarget(target, d, world);
      if (score > bestScore) {
        bestScore = score;
        bestTarget = target;
      }
    }

    if (!bestTarget) return;

    // Only attack if we have enough energy to be meaningful
    const sendAmount = source.energy * this._getSendRatio();
    if (sendAmount < MIN_SEND_ENERGY * 2) return;

    this._sendSwarm(world, source, bestTarget, this._getSendRatio());
  }

  /**
   * Score a target node for attack priority.
   * Higher is better.
   */
  _scoreTarget(target, distance, world) {
    // Neutral nodes get a bonus (less risky to capture)
    const neutralBonus = target.owner === null ? 20 : 0;

    // Production value
    const productionValue = target.productionRate * 10;

    // Current energy as a deterrent (higher energy = harder to capture)
    const energyPenalty = target.energy * 2;

    // Distance penalty
    const distPenalty = distance * 0.1;

    // Capacity value
    const capacityValue = target.maxEnergy * 0.5;

    return productionValue + capacityValue + neutralBonus - energyPenalty - distPenalty;
  }

  /**
   * Find the best source node among myNodes to reinforce a given target.
   * Excludes nodes that are themselves under threat.
   */
  _findBestSource(world, myNodes, targetNode, minEnergyFraction) {
    return myNodes
      .filter(n => {
        if (n.id === targetNode.id) return false;
        if (n.energy < n.maxEnergy * minEnergyFraction) return false;
        // Skip nodes already under attack
        const underAttack = world.swarms.some(
          s => s.alive && s.target.type === 'node' && s.target.nodeId === n.id && s.owner !== this.playerId
        );
        return !underAttack;
      })
      .sort((a, b) => b.energy - a.energy)[0] || null;
  }

  /**
   * How much energy to send — varies by difficulty.
   */
  _getSendRatio() {
    switch (this.difficulty) {
      case 'hard':   return 0.75;
      case 'medium': return 0.6;
      case 'easy':   return 0.5;
      default:       return 0.5;
    }
  }

  _sendSwarm(world, source, target, ratio) {
    const amount = Math.floor(source.energy * ratio);
    if (amount < MIN_SEND_ENERGY) return;

    source.energy -= amount;
    const swarm = createSwarm(source, target, amount, this.playerId);
    world.addSwarm(swarm);
  }
}
