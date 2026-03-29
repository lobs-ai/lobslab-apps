import { PLAYER_COLORS } from '../utils/colors.js';

/**
 * Create a player.
 */
export function createPlayer(id, isHuman = false, difficulty = 'medium') {
  return {
    id,
    color: PLAYER_COLORS[id] ?? '#ffffff',
    isHuman,
    difficulty,     // AI difficulty (ignored for human)
    alive: true,
  };
}
