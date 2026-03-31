// ── HUD ──
// Manages all DOM-based UI: turn indicator, round info, player scores, item bar.

export class HUD {
  constructor() {
    this.turnIndicator = document.getElementById('turnIndicator');
    this.roundInfo = document.getElementById('roundInfo');
    this.stormInfo = document.getElementById('stormInfo');
    this.playerScores = document.getElementById('playerScores');
    this.itemsBar = document.getElementById('itemsBar');
    this.powerBar = document.getElementById('powerBar');
    this.powerFill = document.getElementById('powerFill');

    this.onItemClick = null; // callback: (index) => void
  }

  show() {
    document.getElementById('hud').style.display = 'flex';
  }

  hide() {
    document.getElementById('hud').style.display = 'none';
  }

  update(state) {
    const { players, currentPlayer, round, storm, balls, activeItemIndex, phase,
            ballsPerPlayer } = state;
    const player = players[currentPlayer];

    // Turn indicator
    this.turnIndicator.textContent = `${player.name}'s Turn`;
    this.turnIndicator.style.borderColor = player.color.main;
    this.turnIndicator.style.color = player.color.main;

    // Round
    this.roundInfo.textContent = `Round ${round}`;

    // Storm
    this.stormInfo.textContent = `Storm: ${storm.percent}%`;

    // Player scores
    this.playerScores.innerHTML = players.map((pl, i) => {
      const alive = pl.aliveBallCount(balls);
      const opacity = alive === 0 ? 0.3 : 1;
      const filled = '●'.repeat(alive);
      const empty = '○'.repeat(Math.max(0, ballsPerPlayer - alive));
      const pocketed = pl.stats.ballsPocketed || 0;
      return `<span style="color:${pl.color.main};opacity:${opacity};font-size:0.9rem;">
        ${pl.name}: ${filled}${empty}${pocketed > 0 ? ` <span style="font-size:0.75rem;opacity:0.85">(${pocketed} kills)</span>` : ''}
      </span>`;
    }).join('');

    // Items bar
    this._renderItems(player, activeItemIndex, phase);
  }

  _renderItems(player, activeItemIndex, phase) {
    this.itemsBar.innerHTML = '';
    const items = player.items;
    const canUse = phase === 'select' || phase === 'aim';

    for (let i = 0; i < 3; i++) {
      const slot = document.createElement('div');
      slot.className = 'item-slot';
      if (i >= items.length) {
        slot.classList.add('empty');
      } else {
        if (activeItemIndex === i) slot.classList.add('active');
        slot.textContent = items[i].emoji;
        slot.title = `${items[i].name}: ${items[i].desc}`;
        if (canUse) {
          const idx = i;
          slot.addEventListener('click', () => this.onItemClick?.(idx));
        }
      }
      this.itemsBar.appendChild(slot);
    }
  }

  showWin(winnerName, winnerColor) {
    const overlay = document.getElementById('winOverlay');
    const text = document.getElementById('winText');
    text.textContent = `🏆 ${winnerName} Wins!`;
    text.style.color = winnerColor;
    overlay.style.display = 'flex';
  }

  hideWin() {
    document.getElementById('winOverlay').style.display = 'none';
  }
}
