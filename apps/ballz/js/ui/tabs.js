// Tab state
let activeTab = 'generators';
let buyAmount = 1;

//  TAB SYSTEM
// ══════════════════════════════════════════════════════

function switchTab(tabId) {
  // Check if tab is locked
  const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  if (btn?.classList.contains('locked')) return;

  activeTab = tabId;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn?.classList.add('active');
  const panel = document.getElementById('panel-' + tabId);
  if (panel) panel.classList.add('active');
  renderActiveTab();
}

function updateTabLocks() {
  const researchBtn = document.querySelector('.tab-btn[data-tab="research"]');
  const challengeBtn = document.querySelector('.tab-btn[data-tab="challenges"]');
  if (researchBtn) {
    if (state.prestiges >= 1 || state.completedResearch.length > 0) {
      researchBtn.classList.remove('locked');
    }
  }
  if (challengeBtn) {
    if (state.prestiges >= 3 || Object.keys(state.challengeCompleted).length > 0) {
      challengeBtn.classList.remove('locked');
    }
  }
}

function renderActiveTab() {
  switch (activeTab) {
    case 'generators': renderGenerators(); renderMilestones(); break;
    case 'upgrades': renderUpgrades(); break;
    case 'skills': renderSkillTree(); break;
    case 'minigames': renderFusionLab(); renderBallRushInfo(); break;
    case 'research': renderResearch(); break;
    case 'challenges': renderChallenges(); break;
    case 'achievements': renderAchievements(); break;
    case 'stats': renderStats(); break;
  }
}

function setBuyAmount(amount) {
  if (amount > 1 && skillLevel('bulkBuy') < 1) return;
  buyAmount = amount;
  document.querySelectorAll('.buy-amt-btn').forEach((btn, i) => {
    const amounts = [1, 10, 100, -1];
    btn.classList.toggle('active', amounts[i] === amount);
    if (amounts[i] > 1 || amounts[i] === -1) {
      btn.classList.toggle('locked', skillLevel('bulkBuy') < 1);
    }
  });
  renderGenerators();
}

// ══════════════════════════════════════════════════════
