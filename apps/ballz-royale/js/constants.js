// ── Game Constants ──

export const BALL_RADIUS = 14;
export const POCKET_RADIUS = 22;
export const FRICTION = 0.985;
export const MIN_SPEED = 0.15;
export const MAX_POWER = 22;
export const STORM_FORCE = 0.06;
export const PHYSICS_STEPS = 4;
export const ITEM_RADIUS = 12;

// Storm config
export const STORM_SHRINK_INTERVAL = 4;   // shrink every N rounds
export const STORM_SHRINK_AMOUNT = 20;    // percent per shrink
export const STORM_MIN_PERCENT = 20;

// Item spawn config
export const ITEM_SPAWN_INTERVAL = 3;     // spawn items every N rounds
export const ITEM_MAX_PER_PLAYER = 3;

// Arena
export const ARENA_SCALE = 0.4;           // fraction of min(width,height)
export const POCKET_COUNT = 6;
export const BALL_SPAWN_DISTANCE = 0.65;  // fraction of arena radius

// Physics tuning
export const WALL_RESTITUTION = 0.85;
export const BALL_RESTITUTION = 0.92;
export const EXPLOSION_RADIUS = 250;
export const EXPLOSION_FORCE = 18;

// AI
export const AI_TURN_DELAY = 600;         // ms before AI shoots
export const AI_ACCURACY_SPREAD = 0.3;    // radians of aim randomness

export const PLAYER_COLORS = [
  { main: '#ff6b6b', glow: '#ff4444', name: 'Red' },
  { main: '#4d96ff', glow: '#2277ff', name: 'Blue' },
  { main: '#6bcb77', glow: '#44bb55', name: 'Green' },
  { main: '#ffd93d', glow: '#ffcc00', name: 'Gold' },
];

export const ITEM_TYPES = [
  { id: 'bomb',    emoji: '💣', name: 'Bomb Shot',  desc: '3× knockback explosion on first hit' },
  { id: 'heavy',   emoji: '🏋️', name: 'Heavy Ball', desc: '3× mass for this shot' },
  { id: 'ghost',   emoji: '👻', name: 'Ghost Ball', desc: 'Phase through the first ball hit' },
  { id: 'magnet',  emoji: '🧲', name: 'Magnet Shot', desc: 'Pulls nearby balls toward impact point' },
  { id: 'shield',  emoji: '🛡️', name: 'Shield',     desc: 'Prevents your next ball from being pocketed' },
];
