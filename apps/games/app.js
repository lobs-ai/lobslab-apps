/* =========================================
   GAMES — Daily Puzzle Dashboard
   All state stored in localStorage.
   Completion keys reset automatically each day.
   ========================================= */

// ---- Data ---------------------------------------------------------------

const DEFAULT_GAMES = [
  {
    id: 'clues-by-sam',
    name: 'Clues By Sam',
    url: 'https://cluesbysam.com/',
    desc: 'My friends accused me of cheating, so I now record myself doing it every day.',
    tags: ['logic'],
  },
  {
    id: 'enclose-horse',
    name: 'Enclose Horse',
    url: 'https://enclose.horse/',
    desc: 'Sometimes that horse does not want to be enclosed.',
    tags: ['logic', 'spatial'],
  },
  {
    id: 'zip',
    name: 'Zip',
    url: 'https://www.linkedin.com/games/zip',
    desc: 'Have over a 1-year win streak.',
    tags: ['logic', 'spatial'],
  },
  {
    id: 'travle',
    name: 'Travle',
    url: 'https://travle.earth/',
    desc: "I'm bad at Europe.",
    tags: ['geography'],
  },
  {
    id: 'flagle',
    name: 'Flagle',
    url: 'https://www.flagle.io/',
    desc: 'I try to get it in 2 guesses.',
    tags: ['geography'],
  },
  {
    id: 'worldle',
    name: 'Worldle',
    url: 'https://worldle.teuteuf.fr/',
    desc: "I give up if it's an island nation.",
    tags: ['geography'],
  },
  {
    id: 'globle',
    name: 'Globle',
    url: 'https://globle-game.com/',
    desc: 'I always guess Libya first.',
    tags: ['geography'],
  },
  {
    id: 'shikaku',
    name: 'Shikaku of the Day',
    url: 'https://shikakuofthe.day/',
    desc: 'I normally skip expert and master, too tedious.',
    tags: ['logic', 'spatial'],
  },
  {
    id: 'patches',
    name: 'Patches',
    url: 'https://playpatches.today/',
    desc: 'They explained the rules of this game terribly at first.',
    tags: ['logic', 'spatial'],
  },
  {
    id: 'digitle',
    name: 'Digitle',
    url: 'https://www.digitle.io/',
    desc: 'Get it right first-try or else.',
    tags: ['math', 'logic'],
  },
  {
    id: 'connections',
    name: 'Connections',
    url: 'https://www.nytimes.com/games/connections',
    desc: 'Reverse rainbow only.',
    tags: ['word', 'logic'],
  },
  {
    id: 'emblem-wordle',
    name: 'Emblem Wordle',
    url: 'https://fire-guesser.vercel.app/',
    desc: "I've played too many of these games, so I may as well put my knowledge to good use.",
    tags: ['word', 'gaming'],
  },
];

const TAG_ICONS = {
  logic:     '🧩',
  geography: '🌍',
  word:      '📝',
  math:      '🔢',
  gaming:    '🎮',
  spatial:   '📐',
};

// ---- Storage keys -------------------------------------------------------

const KEYS = {
  hidden:  'games:hidden',   // Set<id> — disabled games
  custom:  'games:custom',   // Array of custom game objects
  // completion: games:done:YYYY-MM-DD  → Set<id>
  // share text: games:share:YYYY-MM-DD → { [id]: string }
};

function todayKey() {
  return `games:done:${todayStr()}`;
}

function todayShareKey() {
  return `games:share:${todayStr()}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---- State --------------------------------------------------------------

let hiddenGames  = new Set(JSON.parse(localStorage.getItem(KEYS.hidden)  || '[]'));
let customGames  = JSON.parse(localStorage.getItem(KEYS.custom) || '[]');
let doneGames    = new Set(JSON.parse(localStorage.getItem(todayKey())   || '[]'));
let shareTexts   = JSON.parse(localStorage.getItem(todayShareKey()) || '{}'); // { [id]: string }
let activeFilter = 'all';

function allGames() {
  return [...DEFAULT_GAMES, ...customGames];
}

function activeGames() {
  return allGames().filter(g => !hiddenGames.has(g.id));
}

function filteredGames() {
  const games = activeGames();
  if (activeFilter === 'all') return games;
  return games.filter(g => g.tags.includes(activeFilter));
}

// ---- Persistence helpers ------------------------------------------------

function saveHidden()     { localStorage.setItem(KEYS.hidden,       JSON.stringify([...hiddenGames])); }
function saveCustom()     { localStorage.setItem(KEYS.custom,       JSON.stringify(customGames)); }
function saveDone()       { localStorage.setItem(todayKey(),         JSON.stringify([...doneGames])); }
function saveShareTexts() { localStorage.setItem(todayShareKey(),    JSON.stringify(shareTexts)); }

// ---- DOM Refs -----------------------------------------------------------

const gameGrid       = document.getElementById('gameGrid');
const progressFill   = document.getElementById('progressFill');
const progressText   = document.getElementById('progressText');
const progressEmoji  = document.getElementById('progressEmoji');
const emptyMsg       = document.getElementById('emptyMsg');
const filterBar      = document.getElementById('filterBar');
const settingsBtn    = document.getElementById('settingsBtn');
const settingsPanel  = document.getElementById('settingsPanel');
const overlay        = document.getElementById('overlay');
const closeSettings  = document.getElementById('closeSettings');
const gameToggleList = document.getElementById('gameToggleList');
const customGameList = document.getElementById('customGameList');
const addGameForm    = document.getElementById('addGameForm');
const resetTodayBtn  = document.getElementById('resetTodayBtn');
const todayDate      = document.getElementById('todayDate');
const confettiCanvas = document.getElementById('confettiCanvas');
const shareAllBtn    = document.getElementById('shareAllBtn');
const toast          = document.getElementById('toast');

// Share modal DOM refs
const shareModalOverlay = document.getElementById('shareModalOverlay');
const shareModal        = document.getElementById('shareModal');
const shareModalTitle   = document.getElementById('shareModalTitle');
const shareModalClose   = document.getElementById('shareModalClose');
const shareTextInput    = document.getElementById('shareTextInput');
const shareModalConfirm = document.getElementById('shareModalConfirm');
const shareModalSkip    = document.getElementById('shareModalSkip');

// ---- Render -------------------------------------------------------------

function formatDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatDateLong(str) {
  const [y, m, d] = str.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

todayDate.textContent = formatDate(todayStr());

function renderProgress() {
  const games = activeGames();
  const total = games.length;
  const done  = games.filter(g => doneGames.has(g.id)).length;
  const pct   = total === 0 ? 0 : Math.round((done / total) * 100);

  progressFill.style.width = pct + '%';
  progressText.textContent = `${done} / ${total} completed today`;

  if (total === 0) {
    progressEmoji.textContent = '';
  } else if (done === 0) {
    progressEmoji.textContent = '☕';
  } else if (done < total * 0.5) {
    progressEmoji.textContent = '🔥';
  } else if (done < total) {
    progressEmoji.textContent = '⚡';
  } else {
    progressEmoji.textContent = '🏆';
    triggerConfetti();
  }
}

function renderGrid() {
  const games = filteredGames();
  gameGrid.innerHTML = '';

  if (games.length === 0) {
    emptyMsg.classList.remove('hidden');
    return;
  }
  emptyMsg.classList.add('hidden');

  games.forEach(game => {
    const isDone    = doneGames.has(game.id);
    const shareText = shareTexts[game.id] || '';

    const card = document.createElement('div');
    card.className = `card${isDone ? ' done' : ''}`;
    card.dataset.id = game.id;

    const tagsHtml = game.tags.map(t =>
      `<span class="tag">${TAG_ICONS[t] ?? '•'} ${t}</span>`
    ).join('');

    // Share result block (only shown when done AND has share text)
    const shareBlockHtml = (isDone && shareText)
      ? `<pre class="share-result">${escHtml(shareText)}</pre>`
      : '';

    // Edit share text button (shown when done — add or edit)
    const editShareHtml = isDone
      ? `<button class="btn-edit-share" data-id="${escAttr(game.id)}" title="${shareText ? 'Edit share text' : 'Add share text'}" aria-label="${shareText ? 'Edit share text' : 'Add share text'}">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
         </button>`
      : '';

    card.innerHTML = `
      <div class="card-top">
        <span class="card-name">${escHtml(game.name)}</span>
        <div class="done-badge">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="3"
               stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
      </div>
      <p class="card-desc">"${escHtml(game.desc)}"</p>
      ${shareBlockHtml}
      <div class="card-tags">${tagsHtml}</div>
      <div class="card-actions">
        <a class="btn-play" href="${escAttr(game.url)}" target="_blank" rel="noopener noreferrer">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          Play
        </a>
        ${editShareHtml}
        <button class="btn-done" data-id="${escAttr(game.id)}" title="${isDone ? 'Mark undone' : 'Mark done'}" aria-label="${isDone ? 'Mark undone' : 'Mark as done'}">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </button>
      </div>
    `;
    gameGrid.appendChild(card);
  });
}

function render() {
  renderProgress();
  renderGrid();
}

// ---- Settings panel rendering -------------------------------------------

function renderSettingsToggles() {
  gameToggleList.innerHTML = '';
  allGames().forEach(game => {
    const isActive = !hiddenGames.has(game.id);
    const li = document.createElement('li');
    li.className = 'game-toggle-item';
    li.innerHTML = `
      <span class="game-toggle-name">${escHtml(game.name)}</span>
      <label class="toggle-switch" aria-label="Toggle ${escAttr(game.name)}">
        <input type="checkbox" data-id="${escAttr(game.id)}" ${isActive ? 'checked' : ''} />
        <span class="toggle-slider"></span>
      </label>
    `;
    gameToggleList.appendChild(li);
  });
}

function renderCustomGameList() {
  if (customGames.length === 0) {
    customGameList.innerHTML = '<li class="custom-game-empty">No custom games yet.</li>';
    return;
  }
  customGameList.innerHTML = '';
  customGames.forEach(game => {
    const li = document.createElement('li');
    li.className = 'custom-game-entry';
    li.innerHTML = `
      <span class="custom-game-entry-name">${escHtml(game.name)}</span>
      <button class="btn-remove" data-id="${escAttr(game.id)}" title="Remove ${escAttr(game.name)}" aria-label="Remove ${escAttr(game.name)}">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
      </button>
    `;
    customGameList.appendChild(li);
  });
}

function openSettings() {
  renderSettingsToggles();
  renderCustomGameList();
  settingsPanel.classList.remove('hidden');
  overlay.classList.remove('hidden');
  settingsPanel.classList.remove('closing');
  overlay.classList.remove('closing');
}

function closeSettingsPanel() {
  settingsPanel.classList.add('closing');
  overlay.classList.add('closing');
  setTimeout(() => {
    settingsPanel.classList.add('hidden');
    overlay.classList.add('hidden');
  }, 200);
}

// ---- Share Modal --------------------------------------------------------

// State for the currently pending "mark done + share text" action
let pendingShareGameId = null;   // game id awaiting confirmation
let shareModalMode = 'done';     // 'done' | 'edit'

function openShareModal(gameId, mode = 'done') {
  const game = allGames().find(g => g.id === gameId);
  if (!game) return;

  pendingShareGameId = gameId;
  shareModalMode = mode;

  shareModalTitle.textContent = mode === 'edit'
    ? `Edit share text — ${game.name}`
    : `Mark done — ${game.name}`;

  shareTextInput.value = shareTexts[gameId] || '';

  shareModalOverlay.classList.remove('hidden');
  shareModal.classList.remove('hidden');
  shareModal.classList.remove('closing');
  shareModalOverlay.classList.remove('closing');

  // Focus textarea after a tick so animation doesn't fight focus
  requestAnimationFrame(() => shareTextInput.focus());
}

function closeShareModal() {
  shareModal.classList.add('closing');
  shareModalOverlay.classList.add('closing');
  setTimeout(() => {
    shareModal.classList.add('hidden');
    shareModalOverlay.classList.add('hidden');
    shareModal.classList.remove('closing');
    shareModalOverlay.classList.remove('closing');
    shareTextInput.value = '';
    pendingShareGameId = null;
  }, 180);
}

function confirmShareModal(markDone) {
  if (!pendingShareGameId) return;

  const id = pendingShareGameId;
  const text = shareTextInput.value.trim();

  // Save or clear share text
  if (text) {
    shareTexts[id] = text;
  } else {
    delete shareTexts[id];
  }
  saveShareTexts();

  // Mark done if applicable
  if (markDone && shareModalMode === 'done') {
    doneGames.add(id);
    if (navigator.vibrate) navigator.vibrate(30);
    saveDone();
  }

  closeShareModal();
  render();
}

// Modal event listeners
shareModalClose.addEventListener('click', closeShareModal);
shareModalOverlay.addEventListener('click', closeShareModal);

shareModalConfirm.addEventListener('click', () => confirmShareModal(true));

shareModalSkip.addEventListener('click', () => {
  if (!pendingShareGameId) return;
  // In 'edit' mode, Skip discards changes. In 'done' mode, Skip marks done without text.
  if (shareModalMode === 'done') {
    const id = pendingShareGameId;
    doneGames.add(id);
    if (navigator.vibrate) navigator.vibrate(30);
    saveDone();
  }
  closeShareModal();
  render();
});

// Ctrl/Cmd+Enter to confirm from textarea
shareTextInput.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    confirmShareModal(true);
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    closeShareModal();
  }
});

// ---- Event Delegation ---------------------------------------------------

// Mark done / undone + edit share text
gameGrid.addEventListener('click', e => {
  // Edit share text button
  const editBtn = e.target.closest('.btn-edit-share');
  if (editBtn) {
    const id = editBtn.dataset.id;
    if (id) openShareModal(id, 'edit');
    return;
  }

  // Done / undone button
  const btn = e.target.closest('.btn-done');
  if (!btn) return;
  const id = btn.dataset.id;
  if (!id) return;

  if (doneGames.has(id)) {
    // Toggle back to undone — clear share text too
    doneGames.delete(id);
    saveDone();
    render();
  } else {
    // Open share modal before marking done
    openShareModal(id, 'done');
  }
});

// Filter buttons
filterBar.addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  activeFilter = btn.dataset.cat;
  filterBar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderGrid();
});

// Settings
settingsBtn.addEventListener('click', openSettings);
closeSettings.addEventListener('click', closeSettingsPanel);
overlay.addEventListener('click', closeSettingsPanel);

// ESC to close settings (share modal handles its own ESC via keydown)
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !settingsPanel.classList.contains('hidden')) {
    closeSettingsPanel();
  }
});

// Toggle game visibility
gameToggleList.addEventListener('change', e => {
  const input = e.target.closest('input[type=checkbox]');
  if (!input) return;
  const id = input.dataset.id;
  if (input.checked) {
    hiddenGames.delete(id);
  } else {
    hiddenGames.add(id);
  }
  saveHidden();
  render();
});

// Add custom game
addGameForm.addEventListener('submit', e => {
  e.preventDefault();
  const name = document.getElementById('customName').value.trim();
  const url  = document.getElementById('customUrl').value.trim();
  const desc = document.getElementById('customDesc').value.trim() || 'A custom daily puzzle.';
  const rawTags = document.getElementById('customTags').value.trim();
  const tags = rawTags
    ? rawTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
    : ['logic'];

  const id = 'custom-' + Date.now();
  const game = { id, name, url, desc, tags, custom: true };
  customGames.push(game);
  saveCustom();

  // Reset form
  addGameForm.reset();

  // Re-render settings list + main grid
  renderSettingsToggles();
  renderCustomGameList();
  render();
});

// Remove custom game
customGameList.addEventListener('click', e => {
  const btn = e.target.closest('.btn-remove');
  if (!btn) return;
  const id = btn.dataset.id;
  customGames = customGames.filter(g => g.id !== id);
  saveCustom();
  hiddenGames.delete(id);
  saveHidden();
  doneGames.delete(id);
  saveDone();
  delete shareTexts[id];
  saveShareTexts();
  renderSettingsToggles();
  renderCustomGameList();
  render();
});

// Reset today
resetTodayBtn.addEventListener('click', () => {
  if (!confirm("Reset today's progress? This can't be undone.")) return;
  doneGames.clear();
  shareTexts = {};
  saveDone();
  saveShareTexts();
  closeSettingsPanel();
  render();
});

// ---- Share All ----------------------------------------------------------

function buildShareText() {
  const games  = activeGames();
  const total  = games.length;
  const done   = games.filter(g => doneGames.has(g.id)).length;
  const header = `🎮 Daily Games — ${formatDateLong(todayStr())}`;

  const parts = [header, ''];

  games.forEach(game => {
    if (!doneGames.has(game.id)) return;
    const text = shareTexts[game.id];
    if (text) {
      parts.push(text.trim());
    } else {
      parts.push(`✅ ${game.name}`);
    }
    parts.push('');
  });

  parts.push(`${done}/${total} completed`);
  parts.push('games.lobslab.com');

  return parts.join('\n');
}

shareAllBtn.addEventListener('click', () => {
  const text = buildShareText();
  navigator.clipboard.writeText(text).then(() => {
    showToast('📋 Copied to clipboard!');
  }).catch(() => {
    // Fallback for older browsers / non-secure contexts
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('📋 Copied to clipboard!');
  });
});

// ---- Toast --------------------------------------------------------------

let toastTimer = null;

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden', 'toast-hide');
  toast.classList.add('toast-show');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('toast-show');
    toast.classList.add('toast-hide');
    setTimeout(() => {
      toast.classList.add('hidden');
      toast.classList.remove('toast-hide');
    }, 300);
  }, 2000);
}

// ---- Confetti -----------------------------------------------------------

let confettiActive = false;
let confettiFrameId = null;

function triggerConfetti() {
  if (confettiActive) return; // already running
  confettiActive = true;

  const canvas = confettiCanvas;
  const ctx = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  const COLORS = ['#818cf8','#34d399','#fbbf24','#f472b6','#60a5fa','#a78bfa','#fb923c'];
  const COUNT = 120;

  const particles = Array.from({ length: COUNT }, () => ({
    x: Math.random() * canvas.width,
    y: -10 - Math.random() * 100,
    r: 4 + Math.random() * 6,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    vx: (Math.random() - 0.5) * 3,
    vy: 2 + Math.random() * 4,
    spin: (Math.random() - 0.5) * 0.3,
    angle: Math.random() * Math.PI * 2,
    shape: Math.random() > 0.5 ? 'rect' : 'circle',
  }));

  let startTime = null;
  const DURATION = 3000;

  function draw(ts) {
    if (!startTime) startTime = ts;
    const elapsed = ts - startTime;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let alive = 0;
    particles.forEach(p => {
      if (p.y > canvas.height + 20) return;
      alive++;
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.spin;
      p.vy += 0.06; // gravity

      const alpha = elapsed < DURATION ? 1 : Math.max(0, 1 - (elapsed - DURATION) / 500);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      if (p.shape === 'rect') {
        ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.r / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });

    if (alive > 0 && elapsed < DURATION + 1000) {
      confettiFrameId = requestAnimationFrame(draw);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      confettiActive = false;
    }
  }

  confettiFrameId = requestAnimationFrame(draw);
}

// ---- Utilities ----------------------------------------------------------

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str) {
  return String(str).replace(/"/g, '&quot;');
}

// ---- Init ---------------------------------------------------------------

render();
