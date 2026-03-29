import { NODE_DEFAULTS } from '../utils/constants.js';

let nextNodeId = 1;

/**
 * Create a new node entity.
 */
export function createNode(config) {
  const defaults = NODE_DEFAULTS[config.type];
  if (!defaults) throw new Error(`Unknown node type: ${config.type}`);

  return {
    id: nextNodeId++,
    type: config.type,
    owner: config.owner ?? null,
    energy: config.energy ?? (config.owner !== null ? defaults.maxEnergy * 0.5 : defaults.maxEnergy * 0.3),
    maxEnergy: defaults.maxEnergy,
    productionRate: defaults.productionRate,
    defense: defaults.defense,
    position: { x: config.x, y: config.y },
    radius: defaults.radius,
    upgrade: null,
    // Visual state
    pulsePhase: Math.random() * Math.PI * 2,
    captureFlash: 0,  // countdown for capture animation
  };
}

/**
 * Get effective production rate after upgrades.
 */
export function getEffectiveProduction(node) {
  let rate = node.productionRate;
  if (node.upgrade === 'overcharge') rate *= 1.5;
  if (node.upgrade === 'shield') rate *= 0.8;
  return rate;
}

/**
 * Get effective defense multiplier after upgrades.
 */
export function getEffectiveDefense(node) {
  let def = node.defense;
  if (node.upgrade === 'shield') def *= 1.5;
  if (node.upgrade === 'overcharge') def *= 0.8;
  return def;
}

export function resetNodeIds() {
  nextNodeId = 1;
}
