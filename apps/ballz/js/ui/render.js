//  RENDER: GENERATORS
// ══════════════════════════════════════════════════════

function renderGenerators() {
  const el = document.getElementById('generators');
  let html = '';

  for (const gen of state.generators) {
    if (!isGenUnlocked(gen.id)) continue;

    const vis = GEN_VISUALS[gen.id] || { emoji: '❓', color: '#888' };
    let qty = buyAmount === -1 ? getMaxBuyable(gen).count : buyAmount;
    if (qty < 1) qty = 1;
    let cost;
    if (buyAmount === -1) {
      const mb = getMaxBuyable(gen);
      cost = mb.totalCost;
      qty = mb.count;
    } else {
      cost = getGenCost(gen, qty);
    }
    const canBuy = state.balls >= cost && qty > 0;
    // Challenge: max gen types
    let typeBlocked = false;
    if (state.activeChallenge) {
      const cDef = CHALLENGE_DEFS.find(c => c.id === state.activeChallenge.id);
      if (cDef?.maxGenTypes && gen.count === 0) {
        const currentTypes = state.generators.filter(g => g.count > 0).length;
        if (currentTypes >= cDef.maxGenTypes) typeBlocked = true;
      }
    }

    const showBPS = skillLevel('omniscience') > 0;
    const genBps = showBPS ? getGenBPS(gen) : 0;

    html += `<div class="upgrade-btn ${canBuy && !typeBlocked ? '' : 'locked'}" onclick="buyGenerator('${gen.id}', ${qty})" style="border-left: 3px solid ${vis.color}">
      <div class="top-row">
        <span class="name">${vis.emoji} ${gen.name}</span>
        <span class="cost">${formatNum(cost)} 🔵</span>
      </div>
      <div class="desc">${gen.desc}${showBPS && gen.count > 0 ? ` — <span style="color:${vis.color}">${formatNum(genBps)} BPS</span>` : ''}</div>
      <div class="top-row">
        <span class="level">Owned: ${gen.count}${qty > 1 ? ` (+${qty})` : ''}</span>
        <span class="desc">${formatNum(gen.baseRate * gen.count)}/s base</span>
      </div>
    </div>`;
  }
  el.innerHTML = html;

  // Update buy amount buttons
  const bar = document.getElementById('buy-amount-bar');
  const btns = bar.querySelectorAll('.buy-amt-btn');
  [1, 10, 100, -1].forEach((amt, i) => {
    if (amt > 1 || amt === -1) {
      btns[i].classList.toggle('locked', skillLevel('bulkBuy') < 1);
    }
    btns[i].classList.toggle('active', buyAmount === amt);
  });
}

function buyGenerator(id, quantity) {
  const gen = state.generators.find(g => g.id === id);
  if (!gen) return;

  // Challenge: max gen types
  if (state.activeChallenge) {
    const cDef = CHALLENGE_DEFS.find(c => c.id === state.activeChallenge.id);
    if (cDef?.maxGenTypes && gen.count === 0) {
      const currentTypes = state.generators.filter(g => g.count > 0).length;
      if (currentTypes >= cDef.maxGenTypes) return;
    }
  }

  if (buyAmount === -1) {
    const mb = getMaxBuyable(gen);
    if (mb.count > 0 && state.balls >= mb.totalCost) {
      state.balls -= mb.totalCost;
      gen.count += mb.count;
    }
  } else {
    const cost = getGenCost(gen, quantity);
    if (state.balls >= cost) {
      state.balls -= cost;
      gen.count += quantity;
    }
  }

  renderGenerators();
  renderMilestones();
  checkOverflow();
}

// ══════════════════════════════════════════════════════
//  RENDER: MILESTONES
// ══════════════════════════════════════════════════════

function renderMilestones() {
  const section = document.getElementById('milestones-section');
  const el = document.getElementById('milestones');
  const activeGens = state.generators.filter(g => g.count > 0 && isGenUnlocked(g.id));
  if (activeGens.length === 0) { section.style.display = 'none'; return; }
  section.style.display = '';

  let html = '';
  for (const gen of activeGens) {
    const vis = GEN_VISUALS[gen.id] || { emoji: '❓', color: '#888' };
    const ms = GEN_MILESTONES.filter(m => m.genId === gen.id);
    if (ms.length === 0) continue;
    const nextMs = ms.find(m => gen.count < m.threshold) || ms[ms.length - 1];
    const pct = Math.min(100, (gen.count / nextMs.threshold) * 100);

    html += `<div class="milestone-row">
      <div class="ms-header">
        <span>${vis.emoji} ${gen.name}</span>
        <span>${gen.count} / ${nextMs.threshold}</span>
      </div>
      <div class="ms-bar-bg">
        <div class="ms-bar-fill" style="width:${pct}%;background:${vis.color}"></div>
      </div>
      <div class="ms-badges">
        ${ms.map(m => `<span class="ms-badge ${gen.count >= m.threshold ? 'unlocked' : 'locked'}">${m.threshold}: ${m.name}</span>`).join('')}
      </div>
    </div>`;
  }
  el.innerHTML = html;
}

// ══════════════════════════════════════════════════════
//  RENDER: UPGRADES
// ══════════════════════════════════════════════════════

function renderUpgrades() {
  const el = document.getElementById('upgrades');
  let html = '';
  for (const up of state.upgrades) {
    if (up.requiresOverflow && !state.overflowActive) continue;
    if (up.bought) {
      html += `<div class="upgrade-btn maxed" style="opacity:0.4">
        <div class="top-row"><span class="name">✓ ${up.name}</span></div>
        <div class="desc">${up.desc}</div>
      </div>`;
    } else {
      const canBuy = state.balls >= up.cost;
      html += `<div class="upgrade-btn ${canBuy ? '' : 'locked'}" onclick="buyUpgrade('${up.id}')">
        <div class="top-row">
          <span class="name">${up.name}</span>
          <span class="cost">${formatNum(up.cost)} 🔵</span>
        </div>
        <div class="desc">${up.desc}</div>
      </div>`;
    }
  }
  el.innerHTML = html;
}

function buyUpgrade(id) {
  const up = state.upgrades.find(u => u.id === id);
  if (!up || up.bought || state.balls < up.cost) return;
  state.balls -= up.cost;
  up.bought = true;
  renderUpgrades();
}

// ══════════════════════════════════════════════════════
//  RENDER: SKILL TREE
// ══════════════════════════════════════════════════════

function renderSkillTree() {
  const el = document.getElementById('skill-tree');
  const tl = totalSkillLevels();
  const pp = state.prestigePoints;
  const prestiges = state.prestiges;

  // Update prestige button
  const pBtn = document.getElementById('prestige-btn');
  const canP = canPrestige();
  const ppReward = getPrestigeReward();
  pBtn.classList.toggle('locked', !canP);
  pBtn.classList.toggle('can-prestige', canP);
  const threshold = getPrestigeThreshold();
  document.getElementById('prestige-desc').textContent = canP
    ? `Reset for ${ppReward} PP (from ${formatNum(state.totalBalls)} balls)`
    : `Need ${formatNum(threshold)} total balls (have ${formatNum(state.totalBalls)})`;

  const tierBadge = document.getElementById('prestige-tier-badge');
  if (prestiges > 0) {
    const tier = prestiges >= 50 ? '💎' : prestiges >= 25 ? '👑' : prestiges >= 10 ? '🌟' : prestiges >= 5 ? '⭐' : '✦';
    tierBadge.textContent = `${tier} ×${prestiges}`;
  }

  document.getElementById('pp-count').textContent = pp;

  let html = '';
  for (let tier = 1; tier <= 7; tier++) {
    const req = TIER_REQS[tier];
    const locked = tl < req.totalLevels || prestiges < req.prestiges;
    const headerClass = `tier-${tier}-header`;
    const reqText = req.totalLevels > 0 || req.prestiges > 0
      ? `Requires: ${req.totalLevels > 0 ? req.totalLevels + ' skill levels' : ''}${req.totalLevels > 0 && req.prestiges > 0 ? ' + ' : ''}${req.prestiges > 0 ? req.prestiges + ' prestiges' : ''}`
      : 'No requirements';

    html += `<div class="skill-tier-header ${headerClass} ${locked ? 'locked' : ''}">
      ${TIER_NAMES[tier]}
      ${locked ? `<span class="tier-req">${reqText} (${tl}/${req.totalLevels} levels, ${prestiges}/${req.prestiges} prestiges)</span>` : `<span class="tier-req">${reqText} ✓</span>`}
    </div>`;

    const tierSkills = Object.entries(SKILL_DEFS).filter(([, d]) => d.tier === tier);
    for (const [id, def] of tierSkills) {
      const lv = skillLevel(id);
      const maxed = lv >= def.maxLevel;
      const cost = skillCost(id);

      // Prereq check
      const prereqsMet = !def.prereq || def.prereq.every(p => skillLevel(p) >= (SKILL_DEFS[p]?.maxLevel || 99));
      const prereqNames = def.prereq ? def.prereq.map(p => SKILL_DEFS[p]?.name || p).join(', ') : '';
      const canBuyS = !locked && !maxed && pp >= cost && prereqsMet;
      const prereqLocked = !locked && !maxed && !prereqsMet;

      html += `<div class="skill-btn tier-${tier} ${locked ? 'locked' : prereqLocked ? 'locked prereq-locked' : maxed ? 'maxed' : canBuyS ? '' : 'locked'}" onclick="buySkill('${id}')">
        <div class="top-row">
          <span class="name">${def.name}</span>
          <span class="cost">${maxed ? 'MAXED' : cost + ' PP'}</span>
        </div>
        <div class="desc">${def.desc}</div>
        ${prereqLocked ? `<div class="prereq-msg">🔒 Requires: ${prereqNames} maxed</div>` : ''}
        <div class="level">Level ${lv} / ${def.maxLevel}</div>
      </div>`;
    }
  }
  el.innerHTML = html;
}

function buySkill(id) {
  const def = SKILL_DEFS[id];
  if (!def) return;
  const lv = skillLevel(id);
  if (lv >= def.maxLevel) return;

  const tier = def.tier;
  const req = TIER_REQS[tier];
  const tl = totalSkillLevels();
  if (tl < req.totalLevels || state.prestiges < req.prestiges) return;

  // Prereq check
  if (def.prereq) {
    const prereqsMet = def.prereq.every(p => skillLevel(p) >= (SKILL_DEFS[p]?.maxLevel || 99));
    if (!prereqsMet) return;
  }

  const cost = skillCost(id);
  if (state.prestigePoints < cost) return;

  state.prestigePoints -= cost;
  state.skills[id].level++;
  renderSkillTree();
}

// ══════════════════════════════════════════════════════
//  PRESTIGE
// ══════════════════════════════════════════════════════

function openPrestigeModal() {
  if (!canPrestige()) return;
  const pp = getPrestigeReward();
  const body = document.getElementById('prestige-modal-body');
  const infinite = skillLevel('infinitePrestige') > 0;
  body.innerHTML = infinite
    ? `You will gain <strong>${pp} Prestige Points</strong>.<br>Your generators will NOT be reset! (Infinite Prestige)`
    : `This will <strong>reset all your balls and generators</strong>.<br>You will gain <strong>${pp} Prestige Points</strong> to spend on skills.<br>Your skills and fusion balls are kept.`;
  document.getElementById('prestige-modal-overlay').classList.add('visible');
}

function closePrestigeModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('prestige-modal-overlay').classList.remove('visible');
}

function confirmPrestige() {
  closePrestigeModal();
  doPrestige();
}

function doPrestige() {
  if (!canPrestige()) return;
  const pp = getPrestigeReward();
  state.prestigePoints += pp;
  state.totalPPEarned += pp;
  state.prestiges++;
  state.prestigeMulti = 1 + state.prestiges * 0.1;

  const infinite = skillLevel('infinitePrestige') > 0;
  const rebirthLevel = skillLevel('rebirthMemory');
  const keepPercent = Math.min(0.25, rebirthLevel * 0.05);

  if (!infinite) {
    // Save generator counts for rebirth memory
    const savedCounts = {};
    if (keepPercent > 0) {
      for (const gen of state.generators) {
        savedCounts[gen.id] = Math.floor(gen.count * keepPercent);
      }
    }

    // Reset
    state.balls = 0;
    state.totalBalls = 0;
    for (const gen of state.generators) {
      gen.count = savedCounts[gen.id] || 0;
    }
    for (const up of state.upgrades) {
      up.bought = false;
    }

    // Starting balls skill
    const startBalls = skillLevel('startingBalls') * 500;
    if (startBalls > 0) {
      state.balls += startBalls;
      state.totalBalls += startBalls;
    }
  }

  // Reset leechers on prestige
  state.leechers = [];
  leecher_spawn_timer = 0;

  // Prestige Cascade: free random T1 skills
  const cascadeLevel = skillLevel('prestigeCascade');
  if (cascadeLevel > 0) {
    const t1Skills = Object.entries(SKILL_DEFS).filter(([, d]) => d.tier === 1);
    for (let i = 0; i < cascadeLevel; i++) {
      const upgradeable = t1Skills.filter(([k, d]) => skillLevel(k) < d.maxLevel);
      if (upgradeable.length > 0) {
        const [randomId] = upgradeable[Math.floor(Math.random() * upgradeable.length)];
        state.skills[randomId].level++;
        showToast(`Prestige Cascade: free ${SKILL_DEFS[randomId].name} level!`, 'reward', '🎲');
      }
    }
  }

  state.lastPrestigeTime = Date.now();
  state.combo = 1;
  state.comboTimer = 0;

  // Cancel active challenge
  if (state.activeChallenge) {
    state.activeChallenge = null;
  }

  showToast(`Prestige #${state.prestiges}! +${pp} PP`, 'reward', '⟳');
  balls = [];
  updateTabLocks();
  saveGame();
  renderActiveTab();
}

// ══════════════════════════════════════════════════════
//  RENDER: ACHIEVEMENTS
// ══════════════════════════════════════════════════════

function renderAchievements() {
  const el = document.getElementById('achievement-list');
  const categories = [...new Set(ACHIEVEMENTS.map(a => a.cat))];
  const unlocked = Object.keys(state.achievementsUnlocked).length;

  document.getElementById('ach-count').textContent = unlocked;
  document.getElementById('ach-total').textContent = ACHIEVEMENTS.length;
  document.getElementById('ach-bonus').textContent = unlocked;

  let html = '';
  for (const cat of categories) {
    html += `<div class="ach-category-title">${cat}</div>`;
    html += '<div class="achievement-grid">';
    for (const ach of ACHIEVEMENTS.filter(a => a.cat === cat)) {
      const isUnlocked = state.achievementsUnlocked[ach.id];
      html += `<div class="ach-card ${isUnlocked ? 'unlocked' : ''}">
        <span class="ach-icon">${isUnlocked ? ach.icon : '🔒'}</span>
        <div class="ach-name">${isUnlocked ? ach.name : '???'}</div>
        <div>${isUnlocked ? ach.desc : '???'}</div>
      </div>`;
    }
    html += '</div>';
  }
  el.innerHTML = html;
}

function checkAchievements() {
  for (const ach of ACHIEVEMENTS) {
    if (state.achievementsUnlocked[ach.id]) continue;
    try {
      if (ach.check(state)) {
        state.achievementsUnlocked[ach.id] = Date.now();
        showToast(`🏅 Achievement: ${ach.name} — ${ach.desc}`, 'achievement', ach.icon);
      }
    } catch(e) {}
  }
}

// ══════════════════════════════════════════════════════
//  RENDER: FUSION LAB
// ══════════════════════════════════════════════════════

function renderFusionLab() {
  const el = document.getElementById('fusion-lab');
  let html = '<div class="fusion-grid">';
  for (const tier of FUSION_TIERS) {
    const count = state.fusionBalls[tier.id] || 0;
    const cost = getFusionCost(tier.id);
    const canBuy = state.balls >= cost;
    html += `<div class="fusion-slot ${canBuy ? '' : 'locked'}" onclick="fuseBall('${tier.id}')">
      <div class="f-icon">${tier.icon}</div>
      <div class="f-name">${tier.name}</div>
      <div class="f-count">${count}</div>
      <div class="f-cost">${formatNum(cost)}</div>
    </div>`;
  }
  html += '</div>';

  // Collected balls display
  const totalFused = Object.values(state.fusionBalls).reduce((a, v) => a + v, 0);
  if (totalFused > 0) {
    html += '<div style="margin-top:8px; font-size:11px; color:#888">Collected fusion balls (persist through prestige):</div>';
    html += '<div class="fusion-collected">';
    for (const tier of FUSION_TIERS) {
      const count = state.fusionBalls[tier.id] || 0;
      for (let i = 0; i < Math.min(count, 20); i++) {
        html += `<div class="fusion-ball-owned" style="border-color:${tier.color}; background:${tier.color}22">${tier.icon}</div>`;
      }
      if (count > 20) html += `<div style="font-size:10px;color:${tier.color};align-self:center">+${count - 20}</div>`;
    }
    html += '</div>';
  }
  html += `<div style="margin-top:8px; font-size:11px; color:#5a8">Total BPS bonus from fusion: +${(getFusionBonus() * 100).toFixed(0)}%</div>`;
  el.innerHTML = html;
}

function fuseBall(tierId) {
  const cost = getFusionCost(tierId);
  if (state.balls < cost) return;
  state.balls -= cost;
  state.fusionBalls[tierId] = (state.fusionBalls[tierId] || 0) + 1;
  showToast(`Fused a ${tierId} ball! +${(FUSION_TIERS.find(t => t.id === tierId).bpsBonus * 100)}% BPS`, 'reward', FUSION_TIERS.find(t => t.id === tierId).icon);
  renderFusionLab();
}

// ══════════════════════════════════════════════════════

//  RENDER: BALL RUSH
// ══════════════════════════════════════════════════════

// rushActive & rushEndTime declared earlier

function renderBallRushInfo() {
  const el = document.getElementById('ball-rush-info');
  const now = Date.now();
  const interval = getRushInterval();
  const timeSince = now - state.lastRushTime;

  if (rushActive) {
    const remaining = Math.ceil((rushEndTime - now) / 1000);
    el.innerHTML = `<div style="text-align:center;font-size:14px;font-weight:700;color:#ff6b00">⚡ RUSH ACTIVE! ${remaining}s remaining — Click balls for 10× value!</div>`;
  } else {
    const remaining = Math.ceil((interval - timeSince) / 1000);
    if (remaining <= 0) {
      el.innerHTML = `<div style="text-align:center;font-size:12px;color:#888">⚡ Ball Rush is ready! It will trigger soon...</div>`;
    } else {
      el.innerHTML = `<div style="text-align:center;font-size:12px;color:#666">Next Ball Rush in: ${formatTime(remaining)}<br><span style="font-size:10px">Balls rain down and are worth 10× when clicked!</span></div>`;
    }
  }
}

function startBallRush() {
  rushActive = true;
  const rushDuration = 15000 + skillLevel('rushEnhancer') * 5000;
  rushEndTime = Date.now() + rushDuration;
  state.lastRushTime = Date.now();
  document.getElementById('ball-rush-banner').style.display = 'block';
  showToast('⚡ BALL RUSH! Click fast for 10× rewards!', 'event', '⚡');
}

function endBallRush() {
  rushActive = false;
  document.getElementById('ball-rush-banner').style.display = 'none';
  state.rushesCompleted++;
  showToast('Ball Rush ended!', 'event', '⚡');
}

// ══════════════════════════════════════════════════════
//  RENDER: RESEARCH
// ══════════════════════════════════════════════════════

function renderResearch() {
  const el = document.getElementById('research-list');
  const queueEl = document.getElementById('research-queue');
  const now = Date.now();

  // Show active research queue
  let qHtml = '';
  if (state.activeResearch.length > 0) {
    qHtml += '<div class="section-title">🔬 Active Research</div>';
    for (const active of state.activeResearch) {
      const def = RESEARCH_DEFS.find(r => r.id === active.id);
      const elapsed = (now - active.startTime) / 1000;
      const pct = Math.min(100, (elapsed / active.duration) * 100);
      const remaining = Math.max(0, active.duration - elapsed);
      qHtml += `<div class="research-card active">
        <div class="r-top"><span class="r-name">${def.name}</span><span class="r-time">${formatTime(remaining)}</span></div>
        <div class="r-bar"><div class="r-bar-fill" style="width:${pct}%"></div></div>
      </div>`;
    }
  }
  queueEl.innerHTML = qHtml;

  // All research
  let html = '<div class="section-title">📋 Available Research</div>';
  for (const rd of RESEARCH_DEFS) {
    const completed = state.completedResearch.includes(rd.reward);
    const researching = isResearching(rd.id);
    const slotsFull = state.activeResearch.length >= maxResearchSlots();
    const locked = completed || researching || slotsFull;

    html += `<div class="research-card ${completed ? 'completed' : researching ? 'active' : locked ? 'locked' : ''}" onclick="startResearch('${rd.id}')">
      <div class="r-top">
        <span class="r-name">${completed ? '✓ ' : ''}${rd.name}</span>
        <span class="r-time">${formatTime(rd.time)}</span>
      </div>
      <div class="r-desc">${rd.desc}</div>
      ${completed ? '<div class="r-status">✓ Completed</div>' : ''}
    </div>`;
  }
  el.innerHTML = html;
}

function startResearch(id) {
  if (state.completedResearch.includes(RESEARCH_DEFS.find(r => r.id === id)?.reward)) return;
  if (isResearching(id)) return;
  if (state.activeResearch.length >= maxResearchSlots()) return;

  const def = RESEARCH_DEFS.find(r => r.id === id);
  if (!def) return;

  state.activeResearch.push({
    id: def.id,
    startTime: Date.now(),
    duration: def.time * (1 - skillLevel('researchSpeed') * 0.15),
  });

  showToast(`Started research: ${def.name}`, 'event', '🔬');
  renderResearch();
}

function processResearchCompletion() {
  const now = Date.now();
  const completed = [];
  state.activeResearch = state.activeResearch.filter(r => {
    const elapsed = (now - r.startTime) / 1000;
    const def = RESEARCH_DEFS.find(d => d.id === r.id);
    if (elapsed >= r.duration) {
      if (def && !state.completedResearch.includes(def.reward)) {
        state.completedResearch.push(def.reward);
        completed.push(def);
      }
      return false;
    }
    return true;
  });

  for (const def of completed) {
    showToast(`Research complete: ${def.name} — ${def.desc}`, 'reward', '🔬');
  }
}

// ══════════════════════════════════════════════════════
//  RENDER: CHALLENGES
// ══════════════════════════════════════════════════════

// pendingChallengeId declared earlier

function renderChallenges() {
  const el = document.getElementById('challenge-list');
  let html = '';

  if (state.activeChallenge) {
    const cDef = CHALLENGE_DEFS.find(c => c.id === state.activeChallenge.id);
    const elapsed = (Date.now() - state.activeChallenge.startTime) / 1000;
    html += `<div class="research-card active" style="border-color:#ff6b6b">
      <div class="r-top"><span class="r-name" style="color:#f88">Active: ${cDef.name}</span></div>
      <div class="r-desc">${cDef.desc}</div>
      <div class="r-desc">Progress: ${formatNum(state.totalBalls)} / ${formatNum(cDef.goal)} balls</div>
      ${cDef.timeLimit ? `<div class="r-desc">Time: ${formatTime(elapsed)} / ${formatTime(cDef.timeLimit)}</div>` : ''}
      <div class="r-desc" style="color:#a66">Restriction: ${cDef.restriction}</div>
      <button class="btn-cancel" style="margin-top:8px;font-size:11px" onclick="abandonChallenge()">Abandon</button>
    </div>`;
  }

  for (const cDef of CHALLENGE_DEFS) {
    const completed = state.challengeCompleted[cDef.rewardId];
    const isActive = state.activeChallenge?.id === cDef.id;
    if (isActive) continue;

    html += `<div class="challenge-card ${completed ? 'completed' : ''}" onclick="openChallengeModal('${cDef.id}')">
      <div class="c-top">
        <span class="c-name">${cDef.name}</span>
        <span class="c-status" style="color:${completed ? '#5a8' : '#666'}">${completed ? '✓ DONE' : 'Available'}</span>
      </div>
      <div class="c-desc">${cDef.desc}</div>
      <div class="c-restriction">⚠ ${cDef.restriction}</div>
      <div class="c-reward">🎁 Reward: ${cDef.reward}</div>
    </div>`;
  }
  el.innerHTML = html;
}

function openChallengeModal(id) {
  if (state.activeChallenge) return;
  const cDef = CHALLENGE_DEFS.find(c => c.id === id);
  if (!cDef) return;
  pendingChallengeId = id;
  document.getElementById('challenge-modal-title').textContent = `⚔️ Start ${cDef.name}?`;
  document.getElementById('challenge-modal-body').innerHTML = `
    <strong>${cDef.desc}</strong><br><br>
    Restriction: ${cDef.restriction}<br>
    Goal: ${formatNum(cDef.goal)} balls<br><br>
    This will prestige and start a special run.
    ${cDef.timeLimit ? `<br>Time limit: ${formatTime(cDef.timeLimit)}` : ''}
  `;
  document.getElementById('challenge-modal-overlay').classList.add('visible');
}

function closeChallengeModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('challenge-modal-overlay').classList.remove('visible');
  pendingChallengeId = null;
}

function confirmStartChallenge() {
  closeChallengeModal();
  if (!pendingChallengeId) return;
  startChallenge(pendingChallengeId);
}

function startChallenge(id) {
  const cDef = CHALLENGE_DEFS.find(c => c.id === id);
  if (!cDef) return;

  // Do a prestige-like reset
  state.balls = 0;
  state.totalBalls = 0;
  for (const gen of state.generators) gen.count = 0;
  for (const up of state.upgrades) up.bought = false;
  state.combo = 1;
  state.comboTimer = 0;
  balls = [];

  state.activeChallenge = {
    id: cDef.id,
    startTime: Date.now(),
    startBalls: 0,
    startClicks: state.totalClicks,
    noClick: cDef.noClick || false,
    noSpecialBalls: cDef.noSpecialBalls || false,
    maxGenTypes: cDef.maxGenTypes || null,
    costMulti: cDef.costMulti || 1,
    frenzyAlways: cDef.frenzyAlways || false,
    timeLimit: cDef.timeLimit || null,
    goal: cDef.goal,
    rewardId: cDef.rewardId,
  };

  showToast(`Challenge started: ${cDef.name}!`, 'event', '⚔️');
  renderActiveTab();
}

function abandonChallenge() {
  state.activeChallenge = null;
  showToast('Challenge abandoned.', 'default', '❌');
  renderChallenges();
}

function checkChallengeCompletion() {
  if (!state.activeChallenge) return;
  const ch = state.activeChallenge;
  const cDef = CHALLENGE_DEFS.find(c => c.id === ch.id);
  if (!cDef) return;

  // Check time limit
  if (ch.timeLimit) {
    const elapsed = (Date.now() - ch.startTime) / 1000;
    if (elapsed > ch.timeLimit) {
      showToast(`Challenge failed: ${cDef.name} — time's up!`, 'default', '❌');
      state.activeChallenge = null;
      return;
    }
  }

  // Check goal
  if (state.totalBalls >= ch.goal) {
    state.challengeCompleted[ch.rewardId] = true;
    showToast(`🏆 Challenge complete: ${cDef.name}! ${cDef.reward}`, 'achievement', '⚔️');
    state.activeChallenge = null;
    renderActiveTab();
  }
}

// ══════════════════════════════════════════════════════
//  RENDER: STATS
// ══════════════════════════════════════════════════════

function renderStats() {
  const el = document.getElementById('stats-body');
  const now = Date.now();
  const playTime = now - state.gameStartTime;
  const bps = getBPS();

  let html = `
    <div class="section-title">📊 Statistics</div>
    <div class="stat-line"><span>Balls</span><span class="sv">${formatNum(state.balls)}</span></div>
    <div class="stat-line"><span>Total Balls (this run)</span><span class="sv">${formatNum(state.totalBalls)}</span></div>
    <div class="stat-line"><span>Total Balls (all time)</span><span class="sv">${formatNum(state.totalBallsEver)}</span></div>
    <div class="stat-line"><span>Balls Per Second</span><span class="sv">${formatNum(bps)}${bps > 1e12 && skillLevel('decillionDream') === 0 ? ' ⚠️ softcapped' : ''}</span></div>
    <div class="stat-line"><span>Highest BPS</span><span class="sv">${formatNum(state.highestBPS)}</span></div>
    ${state.leechers.length > 0 ? `<div class="stat-line"><span>🦠 Active Leechers</span><span class="sv">${state.leechers.length} (-${(Math.min(0.7, state.leechers.length * 0.03) * 100).toFixed(0)}% BPS)</span></div>` : ''}
    <div class="stat-line"><span>🦠 Leechers Popped</span><span class="sv">${state.leechersPopped || 0}</span></div>
    <div class="stat-line"><span>Total Clicks</span><span class="sv">${state.totalClicks.toLocaleString()}</span></div>
    <div class="stat-line"><span>Highest Combo</span><span class="sv">x${state.highestCombo}</span></div>
    <div class="stat-line"><span>Golden Balls Clicked</span><span class="sv">${state.goldenClicks}</span></div>

    <div class="section-title" style="margin-top:12px">⟳ Prestige</div>
    <div class="stat-line"><span>Prestiges</span><span class="sv">${state.prestiges}</span></div>
    <div class="stat-line"><span>Prestige Points</span><span class="sv">${state.prestigePoints}</span></div>
    <div class="stat-line"><span>Total PP Earned</span><span class="sv">${state.totalPPEarned}</span></div>
    <div class="stat-line"><span>Prestige Multiplier</span><span class="sv">${state.prestigeMulti.toFixed(1)}×</span></div>
    <div class="stat-line"><span>Next Prestige At</span><span class="sv">${formatNum(getPrestigeThreshold())} balls</span></div>
    <div class="stat-line"><span>Total Skill Levels</span><span class="sv">${totalSkillLevels()}</span></div>

    <div class="section-title" style="margin-top:12px">🎮 Progress</div>
    <div class="stat-line"><span>Play Time</span><span class="sv">${formatTime(playTime / 1000)}</span></div>
    <div class="stat-line"><span>Achievements</span><span class="sv">${Object.keys(state.achievementsUnlocked).length} / ${ACHIEVEMENTS.length}</span></div>
    <div class="stat-line"><span>Fusion Balls</span><span class="sv">${Object.values(state.fusionBalls).reduce((a,v) => a + v, 0)}</span></div>
    <div class="stat-line"><span>Fusion BPS Bonus</span><span class="sv">+${(getFusionBonus() * 100).toFixed(0)}%</span></div>
    <div class="stat-line"><span>Research Complete</span><span class="sv">${state.completedResearch.length} / ${RESEARCH_DEFS.length}</span></div>
    <div class="stat-line"><span>Challenges Complete</span><span class="sv">${Object.values(state.challengeCompleted).filter(v=>v).length} / ${CHALLENGE_DEFS.length}</span></div>

    <div class="stat-line"><span>Ball Alchemy BPS</span><span class="sv">+${formatNum(state.alchemyBPS)}</span></div>
    <div class="stat-line"><span>Ball Rushes</span><span class="sv">${state.rushesCompleted}</span></div>
    <div class="stat-line"><span>Generator Types</span><span class="sv">${genTypesOwned()}</span></div>
    <div class="stat-line"><span>Total Generators</span><span class="sv">${state.generators.reduce((a,g) => a + g.count, 0)}</span></div>

    <div class="section-title" style="margin-top:12px">🔧 Active Boosts</div>
  `;

  if (now < state.doubleProdUntil) html += `<div class="stat-line"><span>⚡ 2× Production</span><span class="sv">${formatTime((state.doubleProdUntil - now)/1000)}</span></div>`;
  if (now < state.clickBoostUntil) html += `<div class="stat-line"><span>👆 5× Click Power</span><span class="sv">${formatTime((state.clickBoostUntil - now)/1000)}</span></div>`;
  if (now < state.goldenFrenzyUntil) html += `<div class="stat-line"><span>🌈 Golden Frenzy</span><span class="sv">${formatTime((state.goldenFrenzyUntil - now)/1000)}</span></div>`;
  if (frenzyActive) html += `<div class="stat-line"><span>🎉 Ball Frenzy</span><span class="sv">Active!</span></div>`;

  // Time Warp button
  if (skillLevel('timeWarp') > 0) {
    const twLevel = skillLevel('timeWarp');
    const cooldown = (24 - (twLevel - 1) * 4) * 3600 * 1000;
    const timeSince = now - state.lastTimeWarp;
    const ready = timeSince >= cooldown;
    html += `<div class="section-title" style="margin-top:12px">⏩ Time Warp</div>`;
    if (ready) {
      html += `<div class="upgrade-btn" onclick="doTimeWarp()"><div class="top-row"><span class="name">⏩ Activate Time Warp</span></div><div class="desc">Skip 4 hours of production</div></div>`;
    } else {
      html += `<div class="stat-line"><span>Cooldown</span><span class="sv">${formatTime((cooldown - timeSince)/1000)}</span></div>`;
    }
  }

  // Reality Bending button
  if (hasResearch('realityBend')) {
    html += `<div class="section-title" style="margin-top:12px">🌀 Reality Bending</div>`;
    html += `<div class="upgrade-btn" onclick="doRealityBend()"><div class="top-row"><span class="name">🌀 Sacrifice Generators</span></div><div class="desc">Sacrifice 50% of generators for 60s of 10× production</div></div>`;
  }

  html += `<div class="section-title" style="margin-top:16px">💾 Data</div>
    <div class="upgrade-btn" onclick="if(confirm('Reset everything?')){localStorage.clear();location.reload()}">
      <div class="name" style="color:#ff4444">🗑️ Hard Reset</div>
      <div class="desc">Delete ALL save data and start fresh</div>
    </div>`;

  el.innerHTML = html;
}

function doTimeWarp() {
  const bps = getBPS();
  const gain = Math.floor(bps * 4 * 3600);
  state.balls += gain;
  state.totalBalls += gain;
  state.totalBallsEver += gain;
  state.lastTimeWarp = Date.now();
  showToast(`⏩ Time Warp! +${formatNum(gain)} balls (4 hours)`, 'reward', '⏩');
}

function doRealityBend() {
  // Sacrifice 50% of generators for 60s of 10x
  for (const gen of state.generators) {
    gen.count = Math.floor(gen.count / 2);
  }
  state.doubleProdUntil = Date.now() + 60000; // reuse double prod, stack is fine
  showToast('🌀 Reality Bent! Generators sacrificed, 10× production for 60s!', 'reward', '🌀');
}

// ══════════════════════════════════════════════════════
