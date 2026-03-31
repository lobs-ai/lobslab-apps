/**
 * Seeded PRNG — mulberry32.
 * Produces identical sequences on server and client given the same seed.
 * This is critical for multiplayer determinism: mote positions and jitter
 * must match exactly between server and all clients.
 */

let state = 1;

/**
 * Seed the RNG. Call once at game start with the same seed on all peers.
 * @param {number} seed
 */
export function seedRng(seed) {
  state = seed | 0 || 1; // ensure non-zero integer
}

/**
 * Return a deterministic pseudo-random float in [0, 1).
 * Drop-in replacement for Math.random() in gameplay code.
 */
export function random() {
  state = (state + 0x6D2B79F5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
