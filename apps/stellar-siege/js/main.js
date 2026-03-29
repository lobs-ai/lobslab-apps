import { Game, GameState } from './game/Game.js';
import { Renderer }        from './render/Renderer.js';
import { InputManager }    from './input/InputManager.js';
import { TICK_RATE } from './utils/constants.js';

// ============================================================================
// Bootstrap
// ============================================================================

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game-canvas'));

const game        = new Game();
const renderer    = new Renderer(canvas);
const inputManager = new InputManager(canvas, () => game.world);

// Expose for browser console debugging
window.game = game;

// ============================================================================
// Send-energy callback
// ============================================================================

inputManager.onSendEnergy = (selectedNodes, targetNode, ratio) => {
  if (!game.world) return;
  for (const source of selectedNodes) {
    game.sendEnergy(source, targetNode, ratio);
  }
};

inputManager.onRedirectSwarm = (swarm, newTargetNode, newTargetPos) => {
  if (!game.world) return;
  game.redirectSwarm(swarm, newTargetNode, newTargetPos);
};

// ============================================================================
// Saved config (so "Play Again" uses the same settings)
// ============================================================================

let lastConfig = null;

// ============================================================================
// Menu wiring
// ============================================================================

const menuScreen     = document.getElementById('menu-screen');
const hud            = document.getElementById('hud');
const gameOverScreen = document.getElementById('game-over-screen');

document.getElementById('menu-start').addEventListener('click', () => {
  const config = readMenuConfig();
  lastConfig = config;
  startGame(config);
});

document.getElementById('game-over-restart').addEventListener('click', () => {
  if (!lastConfig) return;
  gameOverScreen.classList.add('hidden');
  startGame(lastConfig);
});

document.getElementById('game-over-menu').addEventListener('click', () => {
  gameOverScreen.classList.add('hidden');
  hud.classList.add('hidden');
  menuScreen.classList.remove('hidden');
});

// ============================================================================
// Game start helper
// ============================================================================

function readMenuConfig() {
  const opponents = parseInt(document.getElementById('menu-opponents').value, 10);
  const difficulty = document.getElementById('menu-difficulty').value;
  const mapSize    = document.getElementById('menu-mapsize').value;
  return { opponents, difficulty, mapSize };
}

function startGame(config) {
  // Reset input state between games
  inputManager.selectedNodes = [];
  inputManager.isDragging    = false;
  inputManager.dragStartNode = null;
  inputManager.hoveredNode   = null;
  inputManager.selectedSwarm = null;
  inputManager.isRedirecting = false;

  // Reset speed buttons to 1× and unpause
  document.querySelectorAll('.speed-btn[data-speed]').forEach(b => b.classList.remove('active'));
  const defaultSpeedBtn = document.querySelector('.speed-btn[data-speed="1"]');
  if (defaultSpeedBtn) defaultSpeedBtn.classList.add('active');
  if (pauseBtn) {
    pauseBtn.textContent = '⏸';
    pauseBtn.classList.remove('paused');
  }

  game.startGame(config);

  menuScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');
  hud.classList.remove('hidden');

  // Colour the HUD dot to the human player's colour
  const humanPlayer = game.world.players.find(p => p.isHuman);
  if (humanPlayer) {
    const dot = document.getElementById('hud-color');
    if (dot) {
      dot.style.background = humanPlayer.color;
      dot.style.boxShadow  = `0 0 8px ${humanPlayer.color}`;
    }
  }
}

// ============================================================================
// Game-over screen
// ============================================================================

let _gameOverShown = false;

function showGameOver() {
  if (_gameOverShown) return;
  _gameOverShown = true;

  const title   = document.getElementById('game-over-title');
  const statsEl = document.getElementById('game-over-stats');

  const isVictory = game.winner && game.winner.isHuman;

  title.textContent = isVictory ? '✦ VICTORY ✦' : '✗ DEFEAT ✗';
  title.style.color = isVictory ? '#00e5ff' : '#ff4466';

  // Stats summary
  const elapsed = game.world ? Math.floor(game.world.time) : 0;
  const mins    = Math.floor(elapsed / 60);
  const secs    = elapsed % 60;
  const nodes   = game.world ? game.world.getNodesByOwner(0).length : 0;
  const totalNodes = game.world ? game.world.nodes.length : 0;

  statsEl.innerHTML =
    `<p>Time: ${mins}:${secs.toString().padStart(2, '0')}</p>` +
    `<p>Nodes controlled: ${nodes} / ${totalNodes}</p>`;

  gameOverScreen.classList.remove('hidden');
}

// ============================================================================
// HUD update
// ============================================================================

let _hudFpsTimer   = 0;
let _hudFrameCount = 0;
let _hudFps        = 0;

function updateHUD(dt) {
  if (!game.world || game.state === GameState.MENU) return;

  // FPS counter (updated once per second)
  _hudFrameCount++;
  _hudFpsTimer += dt;
  if (_hudFpsTimer >= 1) {
    _hudFps = _hudFrameCount;
    _hudFrameCount = 0;
    _hudFpsTimer  -= 1;
  }

  const world    = game.world;
  const energy   = Math.floor(world.getPlayerEnergy(0));
  const nodeCount = world.getNodesByOwner(0).length;
  const elapsed  = Math.floor(world.time);
  const mins     = Math.floor(elapsed / 60);
  const secs     = elapsed % 60;

  const elEnergy = document.getElementById('hud-energy');
  const elNodes  = document.getElementById('hud-nodes');
  const elTimer  = document.getElementById('hud-timer');
  const elFps    = document.getElementById('hud-fps');

  if (elEnergy) elEnergy.textContent = `⚡ ${energy}`;
  if (elNodes)  elNodes.textContent  = `● ${nodeCount} node${nodeCount !== 1 ? 's' : ''}`;
  if (elTimer)  elTimer.textContent  = `${mins}:${secs.toString().padStart(2, '0')}`;
  if (elFps)    elFps.textContent    = `${_hudFps} fps`;
}

// ============================================================================
// Speed controls + pause
// ============================================================================

document.querySelectorAll('.speed-btn[data-speed]').forEach(btn => {
  btn.addEventListener('click', () => {
    const speed = parseFloat(btn.dataset.speed);
    game.setSpeed(speed);
    document.querySelectorAll('.speed-btn[data-speed]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

const pauseBtn = document.getElementById('pause-btn');
pauseBtn.addEventListener('click', () => {
  if (game.state === GameState.PLAYING) {
    game.pause();
    pauseBtn.textContent = '▶';
    pauseBtn.classList.add('paused');
  } else if (game.state === GameState.PAUSED) {
    game.unpause();
    pauseBtn.textContent = '⏸';
    pauseBtn.classList.remove('paused');
  }
});

// Spacebar to toggle pause
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && (game.state === GameState.PLAYING || game.state === GameState.PAUSED)) {
    e.preventDefault();
    pauseBtn.click();
  }
});

// ============================================================================
// Game loop
// ============================================================================

let lastTime    = 0;
let accumulator = 0;

function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.1); // cap at 100ms
  lastTime = timestamp;

  if (game.state === GameState.PLAYING) {
    accumulator += dt;
    while (accumulator >= TICK_RATE) {
      game.update(TICK_RATE * game.gameSpeed);
      accumulator -= TICK_RATE;
    }
  }

  // Update input state (refresh hoveredNode, etc.)
  if (game.world) {
    inputManager.update(game.world);
  }

  // Render
  if (game.world) {
    const interpolation = accumulator / TICK_RATE;
    renderer.draw(game.world, inputManager, interpolation, dt);
  }

  // HUD
  updateHUD(dt);

  // Game-over check
  if (game.state === GameState.GAME_OVER) {
    showGameOver();
  } else {
    // Reset flag if a new game started
    _gameOverShown = false;
  }

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
