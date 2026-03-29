// Player colors — index 0 is human, 1–3 are AI
export const PLAYER_COLORS = [
  '#00e5ff',  // cyan
  '#ff00e5',  // magenta
  '#ffe500',  // gold
  '#00ff88',  // green
];

// Neutral / unclaimed
export const NEUTRAL_COLOR = '#555555';

// Background
export const BG_COLOR = '#0a0a12';
export const STAR_FIELD_COLOR = '#ffffff';

// Node type accent colors (used for glow/details, owner color overrides fill)
export const NODE_TYPE_ACCENTS = {
  star:      '#fff8e0',
  planet:    '#8899cc',
  asteroid:  '#cc9966',
  blackhole: '#aa00ff',
  nebula:    '#6644aa',
};

/**
 * Get the display color for a node based on its owner.
 */
export function getOwnerColor(owner) {
  if (owner === null || owner === undefined) return NEUTRAL_COLOR;
  return PLAYER_COLORS[owner] ?? NEUTRAL_COLOR;
}

/**
 * Parse hex color to {r, g, b} object.
 */
export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

/**
 * Create rgba string from hex + alpha.
 */
export function hexAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
