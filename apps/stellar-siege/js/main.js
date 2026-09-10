import { SoundSystem } from './systems/SoundSystem.js';
import { Game, GameState } from './game/Game.js';
import { Renderer }        from './render/Renderer.js';
import { InputManager }    from './input/InputManager.js';
import { World }           from './game/World.js';
import { TICK_RATE }       from './utils/constants.js';
import { NetClient }       from './net/NetClient.js';

// ============================================================================
// Bootstrap
// ============================================================================

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game-canvas'));

const game        = new Game();
const renderer    = new Renderer(canvas);
const inputManager = new InputManager(canvas, () => isMultiplayer ? mpWorld : game.world);

// Expose for browser console debugging
window.game = game;

// ============================================================================
// Multiplayer state
// ============================================================================

let isMultiplayer = false;
let netClient     = null;
let mpWorld       = null;   // World populated from server state in multiplayer
let myPlayerId    = 0;
let isHost        = false;

// ============================================================================
const sound = new SoundSystem();
const soundButton = document.getElementById('sound-toggle');
function updateSoundButton() {
  soundButton.textContent = sound.enabled ? 'Sound on' : 'Sound off';
  soundButton.setAttribute('aria-pressed', String(sound.enabled));
}
soundButton.addEventListener('click', () => { sound.toggle(); updateSoundButton(); });
updateSoundButton();

// Send-energy callback (works for both solo and multiplayer)
// ============================================================================

inputManager.onSendEnergy = (selectedNodes, targetNode, ratio) => {
  console.log('[input] onSendEnergy', { isMultiplayer, selectedNodes: selectedNodes.map(n => n.id), targetId: targetNode?.id, ratio });
  if (selectedNodes.some(n => Math.floor(n.energy * ratio) >= 5)) sound.launch();
  if (isMultiplayer && netClient) {
    for (const source of selectedNodes) {
      // Don't apply locally — wait for the server broadcast so all clients
      // (including us) create swarms from the same authoritative state.
      netClient.sendAction({
        type: 'send_energy',
        sourceId: source.id,
        targetId: targetNode.id,
        ratio,
      });
    }
  } else {
    if (!game.world) return;
    for (const source of selectedNodes) {
      game.sendEnergy(source, targetNode, ratio);
    }
  }
};

inputManager.onRedirectSwarm = (swarm, newTargetNode, newTargetPos) => {
  if (isMultiplayer && netClient) {
    // Don't apply locally — wait for server broadcast
    netClient.sendAction({
      type: 'redirect_swarm',
      swarmId: swarm.id,
      targetNodeId: newTargetNode?.id ?? null,
      targetPos: newTargetPos ?? null,
    });
  } else {
    if (!game.world) return;
    game.redirectSwarm(swarm, newTargetNode, newTargetPos);
  }
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
  if (isMultiplayer) {
    // In multiplayer, "play again" goes back to menu
    gameOverScreen.classList.add('hidden');
    hud.classList.add('hidden');
    cleanupMultiplayer();
    menuScreen.classList.remove('hidden');
    return;
  }
  if (!lastConfig) return;
  gameOverScreen.classList.add('hidden');
  startGame(lastConfig);
});

function returnToMenu() {
  cleanupMultiplayer();
  game.state = GameState.MENU;
  game.world = null;
  hideAllScreens();
  hud.classList.add('hidden');
  document.getElementById('hud-players').classList.add('hidden');
  menuScreen.classList.remove('hidden');
}
document.getElementById('game-over-menu').addEventListener('click', returnToMenu);
document.getElementById('hud-menu').addEventListener('click', returnToMenu);

// ============================================================================
// Multiplayer menu wiring
// ============================================================================

document.getElementById('menu-multiplayer').addEventListener('click', () => {
  menuScreen.classList.add('hidden');
  document.getElementById('mp-menu').classList.remove('hidden');
});

// MP menu navigation
document.getElementById('mp-create').addEventListener('click', () => {
  document.getElementById('mp-menu').classList.add('hidden');
  document.getElementById('mp-create-screen').classList.remove('hidden');
});

document.getElementById('mp-join').addEventListener('click', () => {
  document.getElementById('mp-menu').classList.add('hidden');
  document.getElementById('mp-join-screen').classList.remove('hidden');
});

document.getElementById('mp-back').addEventListener('click', () => {
  document.getElementById('mp-menu').classList.add('hidden');
  menuScreen.classList.remove('hidden');
});

document.getElementById('mp-create-back').addEventListener('click', () => {
  document.getElementById('mp-create-screen').classList.add('hidden');
  document.getElementById('mp-menu').classList.remove('hidden');
});

document.getElementById('mp-join-back').addEventListener('click', () => {
  document.getElementById('mp-join-screen').classList.add('hidden');
  document.getElementById('mp-menu').classList.remove('hidden');
});

// ===== Create Lobby =====

document.getElementById('mp-create-go').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    netClient = new NetClient();
    await netClient.connect();

    const mapSize = document.getElementById('mp-mapsize').value;
    const slots = [];
    slots.push({ type: 'human' }); // host = slot 0

    document.querySelectorAll('.slot-select').forEach(sel => {
      const val = sel.value;
      if (val === 'open') slots.push({ type: 'open' });
      else if (val === 'closed') slots.push({ type: 'closed' });
      else if (val.startsWith('ai-')) slots.push({ type: 'ai', difficulty: val.split('-')[1] });
    });

    netClient.onLobbyCreated = (code, lobby) => {
      isHost = true;
      document.getElementById('mp-create-screen').classList.add('hidden');
      showLobbyScreen(code, lobby, true);
    };

    netClient.onLobbyUpdate = (lobby) => updateLobbyDisplay(lobby);
    netClient.onGameStart   = (payload, playerId) => startMultiplayerGame(payload, playerId);
    netClient.onStateUpdate = (state) => { mpWorld = state; };
    netClient.onGameOver    = (winnerId) => showMultiplayerGameOver(winnerId);
    netClient.onMatchClosed = showMatchClosed;
    netClient.onError       = (msg) => showMpError(msg);
    netClient.onDisconnect  = () => {
      if (isMultiplayer) {
        showMatchClosed('Disconnected from server');
      }
    };

    const createName = document.getElementById('mp-create-name').value.trim() || 'Player 1';
    netClient.createLobby({ mapSize, slots, name: createName });
  } catch (e) {
    showMpError(e?.message?.includes('Game updated') ? e.message : 'Failed to connect to server');
  } finally {
    button.disabled = false;
  }
});

// ===== Join Lobby =====

document.getElementById('mp-join-go').addEventListener('click', async (event) => {
  const code = document.getElementById('mp-join-code').value.trim().toUpperCase();
  if (code.length !== 6) {
    showMpError('Enter a 6-character invite code');
    return;
  }

  const button = event.currentTarget;
  button.disabled = true;
  try {
    netClient = new NetClient();
    await netClient.connect();

    netClient.onLobbyJoined = (lobby, playerId) => {
      myPlayerId = playerId;
      isHost = false;
      document.getElementById('mp-join-screen').classList.add('hidden');
      showLobbyScreen(lobby.code, lobby, false);
    };

    netClient.onLobbyUpdate = (lobby) => updateLobbyDisplay(lobby);
    netClient.onGameStart   = (payload, playerId) => startMultiplayerGame(payload, playerId);
    netClient.onStateUpdate = (state) => { mpWorld = state; };
    netClient.onGameOver    = (winnerId) => showMultiplayerGameOver(winnerId);
    netClient.onMatchClosed = showMatchClosed;
    netClient.onError       = (msg) => showMpError(msg);
    netClient.onDisconnect  = () => {
      if (isMultiplayer) {
        showMatchClosed('Disconnected from server');
      }
    };

    const joinName = document.getElementById('mp-join-name').value.trim() || 'Player';
    netClient.joinLobby(code, joinName);
  } catch (e) {
    showMpError(e?.message?.includes('Game updated') ? e.message : 'Failed to connect to server');
  } finally {
    button.disabled = false;
  }
});

// ===== Start game (host only) =====

document.getElementById('mp-start').addEventListener('click', () => {
  if (netClient) netClient.startGame();
});

// ===== Leave lobby =====

document.getElementById('mp-lobby-leave').addEventListener('click', () => {
  if (netClient) netClient.leave();
  cleanupMultiplayer();
  hideAllScreens();
  menuScreen.classList.remove('hidden');
});

// ===== Copy invite code =====

document.getElementById('mp-copy-code').addEventListener('click', () => {
  const code = document.getElementById('mp-code').textContent;
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.getElementById('mp-copy-code');
    btn.textContent = '✓ Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = '📋 Copy';
      btn.classList.remove('copied');
    }, 2000);
  });
});

// ============================================================================
// Multiplayer Lobby UI
// ============================================================================

function showLobbyScreen(code, lobby, asHost) {
  const lobbyEl = document.getElementById('mp-lobby');
  document.getElementById('mp-code').textContent = code;

  if (asHost) {
    lobbyEl.classList.remove('guest');
  } else {
    lobbyEl.classList.add('guest');
  }

  updateLobbyDisplay(lobby);
  lobbyEl.classList.remove('hidden');
}

function updateLobbyDisplay(lobby) {
  const slotsEl = document.getElementById('mp-lobby-slots');
  slotsEl.innerHTML = '';

  const slots = lobby.config.slots;
  const players = lobby.players || [];

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (slot.type === 'closed') continue;

    const div = document.createElement('div');
    div.className = 'lobby-slot';

    const label = document.createElement('span');
    label.className = 'slot-label';
    label.textContent = `Slot ${i + 1}`;

    const status = document.createElement('span');

    if (slot.type === 'human' && slot.taken) {
      const player = players.find(p => p.playerId === i);
      const displayName = player?.name || 'Player';
      if (player?.isHost) {
        div.classList.add('host');
        status.className = 'slot-type';
        status.textContent = `HOST — ${displayName}`;
      } else {
        div.classList.add('human-joined');
        status.className = 'slot-status connected';
        status.textContent = `JOINED — ${displayName}`;
      }
    } else if (slot.type === 'open' && slot.taken) {
      const player = players.find(p => p.playerId === i);
      const displayName = player?.name || 'Player';
      div.classList.add('human-joined');
      status.className = 'slot-status connected';
      status.textContent = `JOINED — ${displayName}`;
    } else if (slot.type === 'open' && !slot.taken) {
      status.className = 'slot-status';
      status.textContent = 'Waiting...';
    } else if (slot.type === 'ai') {
      status.className = 'slot-type';
      status.textContent = `AI (${slot.difficulty || 'medium'})`;
    }

    div.appendChild(label);
    div.appendChild(status);
    slotsEl.appendChild(div);
  }
}

// ============================================================================
// Multiplayer game start / state handling
// ============================================================================

function startMultiplayerGame(initialState, playerId) {
  isMultiplayer = true;
  myPlayerId = playerId;
  mpWorld = netClient?.getRenderWorld() || new World();
  mpWorld.width = initialState.world?.width || 0;
  mpWorld.height = initialState.world?.height || 0;
  mpWorld.players = (initialState.players || []).map(p => ({
    id: p.id,
    color: p.color,
    isHuman: p.isHuman,
    alive: p.alive,
    difficulty: p.difficulty || 'medium',
    name: p.name || `Player ${p.id + 1}`,
  }));

  // Set input manager to use multiplayer playerId
  inputManager.localPlayerId = myPlayerId;

  // Reset input state
  inputManager.selectedNodes = [];
  inputManager.isDragging    = false;
  inputManager.dragStartNode = null;
  inputManager.hoveredNode   = null;
  inputManager.selectedSwarm = null;
  inputManager.isRedirecting = false;

  console.log('[MP_INIT] startMultiplayerGame complete', {
    myPlayerId,
    isMultiplayer,
    localPlayerId: inputManager.localPlayerId,
    worldNodes: mpWorld.nodes?.length ?? 0,
    worldPlayers: mpWorld.players?.length ?? 0,
    ownedNodes: mpWorld.nodes.filter(n => n.owner === myPlayerId).map(n => ({
      id: n.id, owner: n.owner, pos: `${Math.round(n.position.x)},${Math.round(n.position.y)}`, radius: n.radius
    })),
  });

  // Hide all screens, show HUD
  hideAllScreens();
  hud.classList.remove('hidden');

  // Hide speed controls in multiplayer (server controls timing)
  const speedControls = document.getElementById('speed-controls');
  if (speedControls) speedControls.style.display = 'none';

  // Color HUD dot
  const myPlayer = mpWorld.players.find(p => p.id === myPlayerId);
  if (myPlayer) {
    const dot = document.getElementById('hud-color');
    if (dot) {
      dot.style.background = myPlayer.color;
      dot.style.boxShadow  = `0 0 8px ${myPlayer.color}`;
    }
  }
}

function showMultiplayerGameOver(winnerId) {
  const title   = document.getElementById('game-over-title');
  const statsEl = document.getElementById('game-over-stats');

  const isVictory = winnerId === myPlayerId;
  title.textContent = isVictory ? '✦ VICTORY ✦' : '✗ DEFEAT ✗';
  title.style.color = isVictory ? '#00e5ff' : '#ff4466';

  const elapsed = mpWorld ? Math.floor(mpWorld.time) : 0;
  const mins    = Math.floor(elapsed / 60);
  const secs    = elapsed % 60;
  const nodes   = mpWorld ? mpWorld.getNodesByOwner(myPlayerId).length : 0;
  const totalNodes = mpWorld ? mpWorld.nodes.length : 0;

  statsEl.innerHTML =
    `<p>Time: ${mins}:${secs.toString().padStart(2, '0')}</p>` +
    `<p>Nodes controlled: ${nodes} / ${totalNodes}</p>`;

  gameOverScreen.classList.remove('hidden');
}

function showMatchClosed(message) {
  document.getElementById('game-over-title').textContent = 'MATCH ENDED';
  document.getElementById('game-over-title').style.color = '#93a5bb';
  document.getElementById('game-over-stats').textContent = message;
  gameOverScreen.classList.remove('hidden');
}

function cleanupMultiplayer() {
  if (netClient) {
    netClient.disconnect();
    netClient = null;
  }
  isMultiplayer = false;
  mpWorld = null;
  myPlayerId = 0;
  isHost = false;
  inputManager.localPlayerId = 0;

  // Re-show speed controls
  const speedControls = document.getElementById('speed-controls');
  if (speedControls) speedControls.style.display = '';
}

function hideAllScreens() {
  for (const id of [
    'menu-screen', 'mp-menu', 'mp-create-screen',
    'mp-lobby', 'mp-join-screen', 'game-over-screen',
  ]) {
    document.getElementById(id)?.classList.add('hidden');
  }
}

// ===== MP Error toast =====

function showMpError(msg) {
  // Remove existing toasts
  document.querySelectorAll('.mp-error-toast').forEach(el => el.remove());

  const toast = document.createElement('div');
  toast.className = 'mp-error-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ============================================================================
// Game start helper (solo mode)
// ============================================================================

function readMenuConfig() {
  const opponents  = parseInt(document.getElementById('menu-opponents').value, 10);
  const difficulty = document.getElementById('menu-difficulty').value;
  const mapSize    = document.getElementById('menu-mapsize').value;
  return { opponents, difficulty, mapSize };
}

function startGame(config) {
  // Ensure we're in solo mode
  cleanupMultiplayer();

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
// Game-over screen (solo)
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
  const elapsed    = game.world ? Math.floor(game.world.time) : 0;
  const mins       = Math.floor(elapsed / 60);
  const secs       = elapsed % 60;
  const nodes      = game.world ? game.world.getNodesByOwner(0).length : 0;
  const totalNodes = game.world ? game.world.nodes.length : 0;

  statsEl.innerHTML =
    `<p>Time: ${mins}:${secs.toString().padStart(2, '0')}</p>` +
    `<p>Nodes controlled: ${nodes} / ${totalNodes}</p>`;

  gameOverScreen.classList.remove('hidden');
}

// ============================================================================
// HUD update (works for both solo and multiplayer)
// ============================================================================

let _hudFpsTimer   = 0;
let _hudFrameCount = 0;
let _hudFps        = 0;

function updateHUD(dt) {
  const world = isMultiplayer ? mpWorld : game.world;
  if (!world) return;
  if (!isMultiplayer && game.state === GameState.MENU) return;

  // FPS counter (updated once per second)
  _hudFrameCount++;
  _hudFpsTimer += dt;
  if (_hudFpsTimer >= 1) {
    _hudFps = _hudFrameCount;
    _hudFrameCount = 0;
    _hudFpsTimer  -= 1;
  }

  const pid       = isMultiplayer ? myPlayerId : 0;
  const energy    = Math.floor(world.getPlayerEnergy(pid));
  const nodeCount = world.getNodesByOwner(pid).length;
  const elapsed   = Math.floor(world.time);
  const mins      = Math.floor(elapsed / 60);
  const secs      = elapsed % 60;

  const elEnergy = document.getElementById('hud-energy');
  const elNodes  = document.getElementById('hud-nodes');
  const elTimer  = document.getElementById('hud-timer');
  const elFps    = document.getElementById('hud-fps');

  if (elEnergy) elEnergy.textContent = `⚡ ${energy}`;
  if (elNodes)  elNodes.textContent  = `● ${nodeCount} node${nodeCount !== 1 ? 's' : ''}`;
  if (elTimer)  elTimer.textContent  = `${mins}:${secs.toString().padStart(2, '0')}`;
  if (elFps) {
    const delayed = isMultiplayer && performance.now() - (netClient?.lastStateAt || 0) > 500;
    elFps.textContent = isMultiplayer && !netClient?.connected ? 'Disconnected'
      : delayed ? 'Network delayed' : `${_hudFps} fps`;
  }

  // Multiplayer player list
  const elPlayers = document.getElementById('hud-players');
  if (elPlayers) {
    if (isMultiplayer && world.players.length > 0) {
      elPlayers.classList.remove('hidden');
      const markup = world.players.map(p => {
        const nodes  = world.getNodesByOwner(p.id).length;
        const isMe   = p.id === myPlayerId;
        const status = p.alive ? '' : ' eliminated';
        const youTag = isMe ? ' <span class="hud-player-you">YOU</span>' : '';
        return `<div class="hud-player-row${status}">` +
          `<span class="hud-player-dot" style="background:${p.color}"></span>` +
          `<span class="hud-player-name">${escapeHtml(p.name || `P${p.id + 1}`)}</span>` +
          `${youTag}` +
          `<span class="hud-player-nodes">${nodes}▲</span>` +
          `</div>`;
      }).join('');
      if (elPlayers._markup !== markup) { elPlayers.innerHTML = markup; elPlayers._markup = markup; }
    } else {
      elPlayers.classList.add('hidden');
    }
  }
}

// ============================================================================
// Speed controls + pause (solo only — disabled in multiplayer)
// ============================================================================

document.querySelectorAll('.speed-btn[data-speed]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (isMultiplayer) return; // server controls speed
    const speed = parseFloat(btn.dataset.speed);
    game.setSpeed(speed);
    document.querySelectorAll('.speed-btn[data-speed]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

const pauseBtn = document.getElementById('pause-btn');
pauseBtn.addEventListener('click', () => {
  if (isMultiplayer) return; // server controls timing
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
  if (isMultiplayer) return;
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

  if (!isMultiplayer) {
    // Solo mode — run local simulation
    if (game.state === GameState.PLAYING) {
      accumulator += dt;
      while (accumulator >= TICK_RATE) {
        game.update(TICK_RATE * game.gameSpeed);
        accumulator -= TICK_RATE;
      }
    }
  } else if (isMultiplayer && netClient) {
    netClient.updateVisuals(dt, timestamp);
    mpWorld = netClient.getRenderWorld();
  }

  const world = isMultiplayer ? mpWorld : game.world;

  // Update input state (refresh hoveredNode, etc.)
  if (world) {
    inputManager.update(world);
  }

  // Render
  if (world) {
    const interpolation = accumulator / TICK_RATE;
    sound.update(world, isMultiplayer ? myPlayerId : 0);
    renderer.draw(world, inputManager, interpolation, dt);
  }

  // HUD
  updateHUD(dt);

  // Game-over check (solo only — multiplayer handled via WebSocket callback)
  if (!isMultiplayer) {
    if (game.state === GameState.GAME_OVER) {
      showGameOver();
    } else {
      _gameOverShown = false;
    }
  }

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
