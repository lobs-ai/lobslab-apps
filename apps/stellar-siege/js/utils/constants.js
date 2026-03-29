// ===== Node Type Defaults =====
export const NODE_DEFAULTS = {
  star:      { productionRate: 8,  maxEnergy: 200, defense: 1.0, radius: 30 },
  planet:    { productionRate: 4,  maxEnergy: 120, defense: 1.0, radius: 22 },
  asteroid:  { productionRate: 12, maxEnergy: 60,  defense: 0.6, radius: 16 },
  blackhole: { productionRate: 10, maxEnergy: 250, defense: 1.4, radius: 35 },
  nebula:    { productionRate: 2,  maxEnergy: 100, defense: 1.0, radius: 24 },
};

// ===== Stream =====
export const STREAM_SPEED = 150;           // pixels per second
export const STREAM_PARTICLE_SPACING = 8;  // pixels between particles in stream

// ===== Send Ratios =====
export const SEND_RATIO_DEFAULT = 0.5;
export const SEND_RATIO_SHIFT = 1.0;
export const SEND_RATIO_CTRL = 0.25;
export const MIN_SEND_ENERGY = 5;          // don't send if source has less than this

// ===== Upgrades =====
export const UPGRADE_COST_RATIO = 0.5;     // fraction of maxEnergy
export const OVERCHARGE_PRODUCTION_BONUS = 1.5;
export const OVERCHARGE_DEFENSE_PENALTY = 0.8;
export const SHIELD_DEFENSE_BONUS = 1.5;
export const SHIELD_PRODUCTION_PENALTY = 0.8;
export const CANNON_RANGE = 150;
export const CANNON_DPS = 5;

// ===== Events =====
export const SOLAR_STORM_INTERVAL = 120;   // seconds
export const SOLAR_STORM_DURATION = 10;    // seconds
export const SOLAR_STORM_VARIANCE = 30;    // ± seconds
export const SOLAR_STORM_MULTIPLIER = 2;

// ===== AI =====
export const AI_REACTION = {
  easy: 3.0,
  medium: 1.5,
  hard: 0.5,
};

// ===== Map =====
export const MAP_SIZES = {
  small:  { nodeCount: 20, width: 1200, height: 800 },
  medium: { nodeCount: 35, width: 1600, height: 1000 },
  large:  { nodeCount: 50, width: 2000, height: 1200 },
};

export const MAP_NODE_MIN_DISTANCE = 80;   // minimum pixels between nodes

// ===== Game =====
export const TICK_RATE = 1 / 60;
export const NEUTRAL_OWNER = null;

// ===== Rendering =====
export const PARTICLE_POOL_SIZE = 2000;
export const ENERGY_BAR_WIDTH = 40;
export const ENERGY_BAR_HEIGHT = 4;
export const ENERGY_BAR_OFFSET = 8;        // pixels below node
