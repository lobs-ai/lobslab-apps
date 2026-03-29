//  EARLY DECLARATIONS (needed by helpers)
// ══════════════════════════════════════════════════════

let balls = [];
let floatingTexts = [];
let frenzyActive = false;
let frenzyTimer = 0;
let autoClickTimer = 0;
let dimensionHopTimer = 0;
let alchemyTimer = 0;
let tickAccumulator = 0;
let bgParticles = [];
let tabFocused = true;
let rushActive = false;
let rushEndTime = 0;

let pendingChallengeId = null;
let leecher_spawn_timer = 0;

// ══════════════════════════════════════════════════════


function skillLevel(id) {
  return state.skills[id]?.level || 0;
}

function skillCost(id) {
  const def = SKILL_DEFS[id];
  const lv = skillLevel(id);
  return Math.floor(def.baseCost * Math.pow(def.costScale, lv));
}

function totalSkillLevels() {
  return Object.values(state.skills).reduce((a, s) => a + s.level, 0);
}

function hasResearch(rewardId) {
  return state.completedResearch.includes(rewardId);
}

function isResearching(id) {
  return state.activeResearch.some(r => r.id === id);
}

function maxResearchSlots() {
  return hasResearch('parallelRes') ? 2 : 1;
}

function getGenCount(id) {
  return state.generators.find(g => g.id === id)?.count || 0;
}

function genTypesOwned() {
  return state.generators.filter(g => g.count > 0).length;
}

function getClickValue() {
  let base = 1;
  if (state.upgrades.find(u => u.id === 'clickPow')?.bought) base = 5;
  if (state.upgrades.find(u => u.id === 'critClick')?.bought && Math.random() < 0.1) base *= 10;

  // Skill: Click Power
  base *= (1 + skillLevel('clickPower') * 0.5);
  // Skill: Ball Magnetism
  base *= (1 + skillLevel('ballMagnetism') * 0.2);
  // Research: elastic balls
  if (hasResearch('elasticBalls')) base *= 1.1;
  // Research: hyper click
  if (hasResearch('hyperClick')) base *= 3;
  // Click boost active
  if (Date.now() < state.clickBoostUntil) base *= 5;
  // Combo
  base *= state.combo;
  // Challenge: noClick active
  if (state.activeChallenge?.noClick) return 0;

  return Math.max(1, Math.floor(base));
}

function getGenCost(gen, quantity) {
  quantity = quantity || 1;
  const def = SKILL_DEFS.cheapGens;
  const cheapLevel = skillLevel('cheapGens');
  const discount = cheapLevel * 0.1;

  // Eternal generators discount (per prestige)
  const eternalLevel = skillLevel('eternalGens');
  let prestigeDiscount = 0;
  if (eternalLevel > 0) {
    prestigeDiscount = Math.min(0.9, 0.25 * state.prestiges * eternalLevel / 100);
  }

  // Challenge: inflation/frenzy cost multi
  let challengeCostMulti = 1;
  if (state.activeChallenge) {
    const cDef = CHALLENGE_DEFS.find(c => c.id === state.activeChallenge.id);
    if (cDef?.costMulti) challengeCostMulti = cDef.costMulti;
  }
  // Challenge: inflation reward
  if (state.challengeCompleted?.inflationReward) challengeCostMulti *= 0.8;

  let totalCost = 0;
  const baseC = gen.baseCost;
  for (let i = 0; i < quantity; i++) {
    let cost = baseC * Math.pow(1.18, gen.count + i);
    cost *= (1 - discount);
    cost *= (1 - prestigeDiscount);
    cost *= challengeCostMulti;
    if (hasResearch('theoryAll')) cost *= 0.5;
    totalCost += cost;
  }
  return Math.floor(totalCost);
}

function getMaxBuyable(gen) {
  let count = 0;
  let totalCost = 0;
  while (true) {
    const baseCost = gen.baseCost;
    let cost = baseCost * Math.pow(1.18, gen.count + count);
    const cheapLevel = skillLevel('cheapGens');
    cost *= (1 - cheapLevel * 0.1);
    const eternalLevel = skillLevel('eternalGens');
    if (eternalLevel > 0) {
      cost *= (1 - Math.min(0.9, 0.25 * state.prestiges * eternalLevel / 100));
    }
    let challengeCostMulti = 1;
    if (state.activeChallenge) {
      const cDef = CHALLENGE_DEFS.find(c => c.id === state.activeChallenge.id);
      if (cDef?.costMulti) challengeCostMulti = cDef.costMulti;
    }
    if (state.challengeCompleted?.inflationReward) challengeCostMulti *= 0.8;
    cost *= challengeCostMulti;
    if (hasResearch('theoryAll')) cost *= 0.5;
    cost = Math.floor(cost);
    if (totalCost + cost > state.balls) break;
    totalCost += cost;
    count++;
    if (count > 10000) break; // safety
  }
  return { count, totalCost };
}

function getBPS() {
  if (!state.generators) return 0;
  let total = 0;
  const genTypeCount = genTypesOwned();
  const synthLevel = skillLevel('generatorSynth');
  const masteryLevel = skillLevel('generatorMastery');
  const synergyMasterLevel = skillLevel('synergyMaster');
  const milBoostLevel = skillLevel('milestoneBoost');
  const isOverflowing = state.overflowActive;
  const now = Date.now();

  for (const gen of state.generators) {
    if (gen.count === 0) continue;
    // Skip hidden gens
    if (!isGenUnlocked(gen.id)) continue;

    let rate = gen.baseRate;

    // Quantum Fabric: rate = 1000 * prestiges
    if (gen.id === 'qfabric') {
      rate = 1000 * (state.prestiges || 1);
    }

    let perUnit = rate;

    // Milestone multiplier for this generator
    const milestones = GEN_MILESTONES.filter(m => m.genId === gen.id && gen.count >= m.threshold);
    let msMulti = 1;
    for (const m of milestones) msMulti *= m.multiplier;
    if (milBoostLevel > 0) msMulti = Math.pow(msMulti, 1 + milBoostLevel * 0.5);
    perUnit *= msMulti;

    // Synergy upgrades
    if (gen.id === 'launcher' && state.upgrades.find(u => u.id === 'launcherCal')?.bought) {
      const factoryCount = getGenCount('factory');
      let synergyBonus = factoryCount * 0.02;
      if (synergyMasterLevel > 0) synergyBonus *= (1 + synergyMasterLevel * 0.5);
      perUnit *= (1 + synergyBonus);
    }
    if (gen.id === 'factory' && state.upgrades.find(u => u.id === 'factoryFuel')?.bought) {
      const vortexCount = getGenCount('vortex');
      let synergyBonus = vortexCount * 0.03;
      if (synergyMasterLevel > 0) synergyBonus *= (1 + synergyMasterLevel * 0.5);
      perUnit *= (1 + synergyBonus);
    }
    if (state.upgrades.find(u => u.id === 'vortexConv')?.bought) {
      const singCount = getGenCount('singularity');
      let synergyBonus = singCount * 0.01;
      if (synergyMasterLevel > 0) synergyBonus *= (1 + synergyMasterLevel * 0.5);
      perUnit *= (1 + synergyBonus);
    }
    if (gen.id === 'dimension' && state.upgrades.find(u => u.id === 'quantumEnt')?.bought) {
      const qCount = getGenCount('quantum');
      let synergyBonus = qCount * 0.05;
      if (synergyMasterLevel > 0) synergyBonus *= (1 + synergyMasterLevel * 0.5);
      perUnit *= (1 + synergyBonus);
    }
    if (state.upgrades.find(u => u.id === 'cosmicRes')?.bought) {
      const bbCount = getGenCount('bigbang');
      let synergyBonus = bbCount * 0.02;
      if (synergyMasterLevel > 0) synergyBonus *= (1 + synergyMasterLevel * 0.5);
      perUnit *= (1 + synergyBonus);
    }

    // Hyper Droppers
    if ((gen.id === 'dropper' || gen.id === 'launcher') && state.upgrades.find(u => u.id === 'hyperDrop')?.bought) {
      perUnit *= 3;
    }
    // Overclock
    if (state.upgrades.find(u => u.id === 'overclock')?.bought) {
      perUnit *= 2;
    }
    // Magnet
    if (state.upgrades.find(u => u.id === 'magnet')?.bought) {
      perUnit *= 1.5;
    }
    // Reality Anchor (overflow upgrade)
    if (state.upgrades.find(u => u.id === 'realityAnchor')?.bought) {
      perUnit *= 3;
    }

    // Generator Synth skill
    if (synthLevel > 0) {
      perUnit *= (1 + (genTypeCount - 1) * synthLevel * 0.01);
    }

    // Generator Mastery: if 50+ owned, 3x per level
    if (masteryLevel > 0 && gen.count >= 50) {
      perUnit *= Math.pow(3, masteryLevel);
    }

    // Minimalist challenge reward
    if (state.challengeCompleted?.minimalistReward) {
      // top 3 generators by count get +100%
      const sorted = [...state.generators].sort((a, b) => b.count - a.count);
      const top3 = sorted.slice(0, 3).map(g => g.id);
      if (top3.includes(gen.id)) perUnit *= 2;
    }

    total += perUnit * gen.count;
  }

  // Global multipliers
  total *= (state.prestigeMulti || 1);

  // BPS multiplier skill
  total *= (1 + skillLevel('bpsMulti') * 0.25);

  // Prestige Power: each prestige +15%
  total *= (1 + state.prestiges * skillLevel('prestigePower') * 0.15);

  // Temporal Shift: +10% in first 60s after prestige
  const timeSincePrestige = (now - state.lastPrestigeTime) / 1000;
  if (skillLevel('temporalShift') > 0 && timeSincePrestige < 60) {
    total *= (1 + skillLevel('temporalShift') * 0.1);
  }

  // Critical Mass: >1M balls, +25% per level
  if (skillLevel('criticalMass') > 0 && state.balls > 1e6) {
    total *= (1 + skillLevel('criticalMass') * 0.25);
  }

  // Double production boost
  if (now < state.doubleProdUntil) total *= 2;

  // Golden frenzy
  if (now < state.goldenFrenzyUntil) total *= 2;

  // Ball frenzy active (checked elsewhere, but contribute here for display)
  if (frenzyActive) {
    const frenzyLevel = skillLevel('ballFrenzy');
    if (frenzyLevel > 0) total *= (5 * frenzyLevel);
  }

  // Challenge: frenzy always on
  if (state.activeChallenge) {
    const cDef = CHALLENGE_DEFS.find(c => c.id === state.activeChallenge.id);
    if (cDef?.frenzyAlways && !frenzyActive) {
      total *= 5;
    }
  }

  // Challenge: frenzy reward (frenzy duration +50% applied in timing)
  // Speed run reward
  if (state.challengeCompleted?.speedRunReward) total *= 1.5;
  // Dark matter research
  if (hasResearch('darkMatter')) total *= 2;
  // Theory of everything
  if (hasResearch('theoryAll')) total *= 2;

  // Achievement bonus
  const achCount = Object.keys(state.achievementsUnlocked).length;
  if (achCount > 0) total *= (1 + achCount * 0.01);

  // Fusion bonus
  total *= (1 + getFusionBonus());

  // Ball alchemy permanent BPS
  total += state.alchemyBPS;

  // The Convergence: every maxed skill +5%
  if (skillLevel('theConvergence') > 0) {
    const maxedCount = Object.entries(state.skills).filter(([k,v]) => v.level >= (SKILL_DEFS[k]?.maxLevel||99)).length;
    total *= (1 + maxedCount * 0.05);
  }

  // Reality Engine: all multipliers squared
  if (skillLevel('realityEngine') > 0) {
    total = total * total / (state.alchemyBPS || 1); // square everything except alchemy
    // simplified: just square the total (it's OP, that's the point)
    total = Math.pow(total, 0.5) * total; // ≈ total^1.5 to avoid insane numbers
  }

  // Generator Overdrive: +50% per level (multiplicative)
  const genOverdriveLevel = skillLevel('genMultiplier');
  if (genOverdriveLevel > 0) {
    total *= Math.pow(1.5, genOverdriveLevel);
  }

  // Cosmic Singularity: all skill effects are cubed (boost total by cubing)
  if (skillLevel('cosmicSingularity') > 0) {
    total = Math.pow(total, 1.5); // cubed-ish boost (total^1.5 to avoid infinity)
  }

  // Overflow bonus
  if (isOverflowing) total *= 3;

  // === PRODUCTION SOFTCAPS (applied lowest→highest) ===
  if (skillLevel('decillionDream') === 0) {
    // Softcap 1 (1T = 1e12): excess past 1T multiplied by 0.5 * (1 + softcapBreak1 * 0.4)
    if (total > 1e12) {
      const sc1Factor = Math.min(1, 0.5 * (1 + skillLevel('softcapBreak1') * 0.4));
      const excess = total - 1e12;
      total = 1e12 + excess * sc1Factor;
    }
    // Softcap 2 (1Qa = 1e15): excess past 1Qa multiplied by 0.25 * (1 + softcapBreak2 * 0.5)
    if (total > 1e15) {
      const sc2Factor = Math.min(1, 0.25 * (1 + skillLevel('softcapBreak2') * 0.5));
      const excess = total - 1e15;
      total = 1e15 + excess * sc2Factor;
    }
    // Softcap 3 (1Qi = 1e18): excess past 1Qi multiplied by 0.1 (only broken by decillionDream)
    if (total > 1e18) {
      const excess = total - 1e18;
      total = 1e18 + excess * 0.1;
    }
  }

  // Leecher drain: each leecher drains 3% BPS, max 70% total drain
  if (state.leechers && state.leechers.length > 0) {
    const leecherDrainPct = Math.min(0.7, state.leechers.length * 0.03);
    total *= (1 - leecherDrainPct);
  }

  return total;
}

// Get raw BPS (before softcaps and leecher drain) for leecher drain calculation
function getRawBPS() {
  // Save/restore leechers to get pre-drain BPS
  const savedLeechers = state.leechers;
  state.leechers = [];
  const savedSCB1 = state.skills.softcapBreak1;
  const savedSCB2 = state.skills.softcapBreak2;
  const savedDD = state.skills.decillionDream;
  // Temporarily pretend decillionDream is on to skip softcaps
  if (!state.skills.decillionDream) state.skills.decillionDream = { level: 0 };
  state.skills.decillionDream = { level: 1 };
  const raw = getBPS();
  state.skills.decillionDream = savedDD;
  state.leechers = savedLeechers;
  return raw;
}

function getGenBPS(gen) {
  if (gen.count === 0 || !isGenUnlocked(gen.id)) return 0;
  // Recalculate for just this gen (simplified)
  let rate = gen.baseRate;
  if (gen.id === 'qfabric') rate = 1000 * (state.prestiges || 1);
  let perUnit = rate;

  const milestones = GEN_MILESTONES.filter(m => m.genId === gen.id && gen.count >= m.threshold);
  let msMulti = 1;
  for (const m of milestones) msMulti *= m.multiplier;
  const milBoostLevel = skillLevel('milestoneBoost');
  if (milBoostLevel > 0) msMulti = Math.pow(msMulti, 1 + milBoostLevel * 0.5);
  perUnit *= msMulti;

  if (state.upgrades.find(u => u.id === 'overclock')?.bought) perUnit *= 2;
  if (state.upgrades.find(u => u.id === 'magnet')?.bought) perUnit *= 1.5;
  if (state.upgrades.find(u => u.id === 'realityAnchor')?.bought) perUnit *= 3;
  if ((gen.id === 'dropper' || gen.id === 'launcher') && state.upgrades.find(u => u.id === 'hyperDrop')?.bought) perUnit *= 3;

  const masteryLevel = skillLevel('generatorMastery');
  if (masteryLevel > 0 && gen.count >= 50) perUnit *= Math.pow(3, masteryLevel);

  return perUnit * gen.count;
}

function isGenUnlocked(genId) {
  if (genId === 'overflow') return state.overflowActive || state.overflowUnlocked;
  if (genId === 'qfabric') return skillLevel('quantumTunneling') > 0;
  if (genId === 'molecular') return hasResearch('molecularGen');
  if (genId === 'cosmic') return hasResearch('cosmicGen');
  return true;
}

function canPrestige() {
  const required = 1e6 * Math.pow(10, state.prestiges);
  return state.totalBalls >= required;
}

function getPrestigeThreshold() {
  return 1e6 * Math.pow(10, state.prestiges);
}

function getPrestigeReward() {
  let pp = Math.max(1, Math.floor(Math.sqrt(state.totalBalls / 1e6)));
  // Prestige multiplier: grows with each prestige
  pp *= (1 + state.prestiges * 0.05);
  // Ascension Bonus
  pp *= (1 + skillLevel('ascensionBonus') * 0.1);
  // Mega Prestige: 2× more PP per level
  const megaPLevel = skillLevel('megaPrestige');
  if (megaPLevel > 0) pp *= Math.pow(2, megaPLevel);
  // Prestige Ascension: ×5 per level
  const paLevel = skillLevel('prestigeAscension');
  if (paLevel > 0) pp *= Math.pow(5, paLevel);
  // Quantum Computing research
  if (hasResearch('quantumComp')) pp *= 1.5;
  return Math.floor(pp);
}

function getFusionBonus() {
  let bonus = 0;
  for (const tier of FUSION_TIERS) {
    const count = state.fusionBalls[tier.id] || 0;
    bonus += count * tier.bpsBonus;
  }
  // Fusion Expert skill
  const fusionExpLevel = skillLevel('fusionExpert');
  if (fusionExpLevel > 0) bonus *= (1 + fusionExpLevel * 0.25);
  return bonus;
}

function getFusionCost(tierId) {
  const tier = FUSION_TIERS.find(t => t.id === tierId);
  let cost = tier.cost;
  if (hasResearch('fusionTech')) cost *= 0.5;
  return Math.floor(cost);
}


function getRushInterval() {
  let interval = 1800; // 30 minutes
  if (hasResearch('ballStorm')) interval = 1200; // 20 minutes
  return interval * 1000;
}

// ── Toast system ──
function showToast(message, type = 'default', icon = '') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.innerHTML = (icon ? `<span class="toast-icon">${icon}</span>` : '') + message;
  container.appendChild(toast);
  // Remove after animation
  setTimeout(() => toast.remove(), 3000);
  // Cap max toasts
  while (container.children.length > 5) container.removeChild(container.firstChild);
}

// ── Welcome back modal ──
function showWelcomeBack(seconds, balls) {
  const modal = document.getElementById('welcome-modal-overlay');
  const body = document.getElementById('welcome-modal-body');
  body.innerHTML = `
    You were away for <strong>${formatTime(seconds)}</strong>.<br>
    Your factories produced <strong>${formatNum(balls)}</strong> balls while you were gone!
  `;
  modal.classList.add('visible');
}

function closeWelcomeModal() {
  document.getElementById('welcome-modal-overlay').classList.remove('visible');
}

// ══════════════════════════════════════════════════════
