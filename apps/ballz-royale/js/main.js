// ── Ballz Royale — Entry Point ──

import { PLAYER_COLORS } from './constants.js';
import { GameManager } from './game/GameManager.js';
import { OnlineGameManager } from './game/OnlineGameManager.js';
import { audio } from './effects/Audio.js';

document.addEventListener('pointerdown', () => audio.unlock());
document.getElementById('soundBtn').onclick = (e) => {
  audio.enabled = !audio.enabled;
  e.currentTarget.textContent = audio.enabled ? 'Sound on' : 'Sound off';
  e.currentTarget.setAttribute('aria-pressed', audio.enabled);
  if (audio.enabled) audio.unlock();
};

const canvas = document.getElementById('c');
let game = null;
let onlineGame = null;

function startLocal(configs) {
  game?.destroy();
  game = new GameManager(canvas);
  document.getElementById('matchControls').hidden = false;
  document.getElementById('shotHint').hidden = false;
  resize();
  game.start(configs);
}

function returnToMenu() {
  game?.destroy();
  game = null;
  onlineGame?.destroy();
  onlineGame = null;
  document.getElementById('matchControls').hidden = true;
  document.getElementById('shotHint').hidden = true;
  document.getElementById('lobbyOverlay').style.display = 'none';
  document.getElementById('lobbyJoinCreate').style.display = 'block';
  document.getElementById('lobbyRoom').style.display = 'none';
  document.getElementById('gameOverOverlay').style.display = 'none';
  document.getElementById('modeSelect').style.display = 'flex';
}
document.getElementById('menuBtn').onclick = returnToMenu;
document.getElementById('winMenuBtn').onclick = returnToMenu;
document.getElementById('quickPlayBtn').onclick = () => {
  document.getElementById('modeSelect').style.display = 'none';
  startLocal(['You', 'Scratch', 'Sidewinder', 'Lucky'].map((name, i) => ({
    name, color: PLAYER_COLORS[i], isAI: i > 0,
  })));
};

// ── Resize ──
function resize() {
  if (game) game.resize();
}
window.addEventListener('resize', resize);

// ═══════════════════════════════════════════
//  Mode Select
// ═══════════════════════════════════════════

const modeSelect = document.getElementById('modeSelect');
const localPlayBtn = document.getElementById('localPlayBtn');
const onlinePlayBtn = document.getElementById('onlinePlayBtn');

localPlayBtn.addEventListener('click', () => {
  modeSelect.style.display = 'none';
  document.getElementById('setup').style.display = 'flex';
});

onlinePlayBtn.addEventListener('click', () => {
  modeSelect.style.display = 'none';
  document.getElementById('lobbyOverlay').style.display = 'flex';
  startOnlineLobby();
});

// ═══════════════════════════════════════════
//  Local Play Setup
// ═══════════════════════════════════════════

const playerCountEl = document.getElementById('playerCount');
const playerNamesEl = document.getElementById('playerNames');
const startBtn = document.getElementById('startBtn');
const setupBackBtn = document.getElementById('setupBackBtn');

function updateSetupNames() {
  const n = parseInt(playerCountEl.value);
  playerNamesEl.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const row = document.createElement('div');
    row.className = 'setup-row';
    row.innerHTML = `
      <label style="color:${PLAYER_COLORS[i].main}">●</label>
      <input type="text" aria-label="Player ${i + 1} name" placeholder="Player ${i + 1}" id="pname${i}" maxlength="12">
      ${i > 0 ? `<label><input type="checkbox" aria-label="Make player ${i + 1} a bot" class="aiCheck" data-idx="${i}"> AI</label>` : ''}
    `;
    playerNamesEl.appendChild(row);
  }
}

playerCountEl.addEventListener('change', updateSetupNames);
updateSetupNames();

setupBackBtn.addEventListener('click', () => {
  document.getElementById('setup').style.display = 'none';
  modeSelect.style.display = 'flex';
});

startBtn.addEventListener('click', () => {
  const n = parseInt(playerCountEl.value);
  const fillAI = document.getElementById('aiToggle').checked;
  const configs = [];
  for (let i = 0; i < n; i++) {
    const nameEl = document.getElementById(`pname${i}`);
    const name = nameEl.value.trim() || `Player ${i + 1}`;
    const aiCheck = document.querySelector(`.aiCheck[data-idx="${i}"]`);
    const isAI = i === 0 ? false : (aiCheck?.checked || (fillAI && !nameEl.value.trim()));
    configs.push({ name: isAI && !nameEl.value.trim() ? `Bot ${i}` : name, color: PLAYER_COLORS[i], isAI });
  }

  document.getElementById('setup').style.display = 'none';
  startLocal(configs);
});

// ═══════════════════════════════════════════
//  Online Play Lobby
// ═══════════════════════════════════════════

function startOnlineLobby() {
  onlineGame = new OnlineGameManager(canvas);
  onlineGame.connect();

  // UI elements
  const createBtn = document.getElementById('createRoomBtn');
  const joinBtn = document.getElementById('joinRoomBtn');
  const joinCode = document.getElementById('joinCodeInput');
  const lobbyStartBtn = document.getElementById('lobbyStartBtn');
  const lobbyBackBtn = document.getElementById('lobbyBackBtn');

  createBtn.onclick = () => {
    const name = document.getElementById('lobbyName').value.trim() || 'Player 1';
    onlineGame.createRoom(name);
  };

  joinBtn.onclick = () => {
    const name = document.getElementById('lobbyName').value.trim() || 'Player';
    const code = joinCode.value.trim();
    if (code.length < 4) {
      showLobbyError('Enter a 4-letter room code');
      return;
    }
    onlineGame.joinRoom(code, name);
  };

  joinCode.onkeydown = (e) => {
    if (e.key === 'Enter') joinBtn.click();
  };

  lobbyStartBtn.onclick = () => {
    onlineGame.startGame();
  };

  lobbyBackBtn.onclick = () => {
    if (onlineGame) {
      onlineGame.destroy();
      onlineGame = null;
    }
    document.getElementById('lobbyOverlay').style.display = 'none';
    document.getElementById('lobbyJoinCreate').style.display = 'block';
    document.getElementById('lobbyRoom').style.display = 'none';
    modeSelect.style.display = 'flex';
  };
}

function showLobbyError(msg) {
  const el = document.getElementById('lobbyError');
  if (el) {
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  }
}
