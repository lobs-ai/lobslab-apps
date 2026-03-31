// ── Ballz Royale — Entry Point ──

import { PLAYER_COLORS } from './constants.js';
import { GameManager } from './game/GameManager.js';
import { OnlineGameManager } from './game/OnlineGameManager.js';

const canvas = document.getElementById('c');
let game = null;
let onlineGame = null;

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
      <input type="text" placeholder="Player ${i + 1}" id="pname${i}" maxlength="12">
      ${i > 0 ? `<label><input type="checkbox" class="aiCheck" data-idx="${i}"> AI</label>` : ''}
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
  game = new GameManager(canvas);
  resize();
  game.start(configs);
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

  joinCode.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinBtn.click();
  });

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
