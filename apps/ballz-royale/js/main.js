// ── Ballz Royale — Entry Point ──

import { PLAYER_COLORS } from './constants.js';
import { GameManager } from './game/GameManager.js';

const canvas = document.getElementById('c');
const game = new GameManager(canvas);

// ── Resize ──
function resize() {
  game.resize();
}
window.addEventListener('resize', resize);
resize();

// ── Setup Screen ──
const playerCountEl = document.getElementById('playerCount');
const playerNamesEl = document.getElementById('playerNames');
const startBtn = document.getElementById('startBtn');

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

startBtn.addEventListener('click', () => {
  const n = parseInt(playerCountEl.value);
  const fillAI = document.getElementById('aiToggle').checked;
  const configs = [];
  for (let i = 0; i < n; i++) {
    const nameEl = document.getElementById(`pname${i}`);
    const name = nameEl.value.trim() || `Player ${i + 1}`;
    const aiCheck = document.querySelector(`.aiCheck[data-idx="${i}"]`);
    // Player 0 is never AI. Others: check individual checkbox, or auto-fill if toggle is on and name is empty
    const isAI = i === 0 ? false : (aiCheck?.checked || (fillAI && !nameEl.value.trim()));
    configs.push({ name: isAI && !nameEl.value.trim() ? `Bot ${i}` : name, color: PLAYER_COLORS[i], isAI });
  }

  document.getElementById('setup').style.display = 'none';
  game.start(configs);
});
