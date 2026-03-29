// ── Skill Tree Definitions ──
const SKILL_DEFS = {
  // Tier 1: no prereqs, cheap
  bpsMulti:       { tier: 1, maxLevel: 10, baseCost: 1,  costScale: 1.8, name: '⚡ BPS Multiplier',   desc: '+25% ball production per level' },
  clickPower:     { tier: 1, maxLevel: 10, baseCost: 1,  costScale: 1.6, name: '👆 Click Power',      desc: '+50% click value per level' },
  cheapGens:      { tier: 1, maxLevel: 8,  baseCost: 2,  costScale: 2.0, name: '💰 Cheap Generators', desc: 'Generators cost 10% less per level' },
  startingBalls:  { tier: 1, maxLevel: 5,  baseCost: 2,  costScale: 2.5, name: '🎁 Starting Balls',   desc: 'Start with 500 balls per level after prestige' },
  maxCombo:       { tier: 1, maxLevel: 5,  baseCost: 2,  costScale: 2.0, name: '🔥 Max Combo',        desc: '+20 max combo per level' },
  idleEfficiency: { tier: 1, maxLevel: 5,  baseCost: 2,  costScale: 2.0, name: '😴 Idle Efficiency',  desc: 'Earn 50%+10%/lvl of BPS while tab unfocused' },
  luckyDrops:     { tier: 1, maxLevel: 5,  baseCost: 2,  costScale: 2.0, name: '🍀 Lucky Drops',      desc: '5% chance per tick for double production per level' },
  bulkBuy:        { tier: 1, maxLevel: 1,  baseCost: 2,  costScale: 1,   name: '📦 Bulk Buy',         desc: 'Unlock 10x, 100x, and MAX buy buttons' },

  // Tier 2: requires 5 tier 1 levels
  autoClicker:    { tier: 2, maxLevel: 5,  baseCost: 3,  costScale: 2.0, name: '🤖 Auto Clicker',     desc: 'Auto-click once every 3s (-0.4s per level)' },
  goldenChance:   { tier: 2, maxLevel: 5,  baseCost: 3,  costScale: 2.5, name: '✨ Golden Chance',     desc: '+1% golden ball chance per level' },
  cascadeClick:   { tier: 2, maxLevel: 5,  baseCost: 4,  costScale: 2.5, name: '💫 Cascade Click',    desc: 'Clicks spawn 1 extra auto-ball per level' },
  synergyMaster:  { tier: 2, maxLevel: 5,  baseCost: 4,  costScale: 2.5, name: '🔗 Synergy Master',   desc: 'Synergy upgrades 50% stronger per level' },
  comboSustain:   { tier: 2, maxLevel: 5,  baseCost: 3,  costScale: 2.0, name: '⏱️ Combo Sustain',    desc: 'Combo timer lasts 1s longer per level' },
  generatorSynth: { tier: 2, maxLevel: 5,  baseCost: 4,  costScale: 2.5, name: '🔄 Generator Synth',  desc: 'Each gen type owned boosts all others by 1%/lvl' },
  temporalShift:  { tier: 2, maxLevel: 5,  baseCost: 4,  costScale: 2.0, name: '⏰ Temporal Shift',    desc: '+10% BPS in first 60s after prestige per level' },
  ballMagnetism:  { tier: 2, maxLevel: 5,  baseCost: 3,  costScale: 2.0, name: '🧲 Ball Magnetism',   desc: 'Clicked balls give +20% value per level' },
  rushEnhancer:   { tier: 2, maxLevel: 3,  baseCost: 5,  costScale: 2.5, name: '⚡ Rush Enhancer',    desc: 'Ball Rush lasts 5s longer per level' },
  fusionExpert:   { tier: 2, maxLevel: 3,  baseCost: 4,  costScale: 2.0, name: '🧪 Fusion Expert',    desc: 'Fusion balls give 25% more BPS per level' },
  leecher:        { tier: 2, maxLevel: 5,  baseCost: 5,  costScale: 2.5, name: '🦠 Leecher Expert',   desc: 'Leechers absorb 5% more per level but give 20% more when popped' },

  // Tier 3: requires 15 total + 3 prestiges
  ballFrenzy:     { tier: 3, maxLevel: 3,  baseCost: 6,  costScale: 3.0, name: '🎉 Ball Frenzy',      desc: 'Every 60s, 10s of 5x production per level' },
  prestigePower:  { tier: 3, maxLevel: 8,  baseCost: 6,  costScale: 2.2, name: '👑 Prestige Power',    desc: 'Each prestige permanently +15% base BPS' },
  milestoneBoost: { tier: 3, maxLevel: 5,  baseCost: 7,  costScale: 3.0, name: '🏆 Milestone Boost',   desc: 'Milestone multipliers ×1.5 per level' },
  ascensionBonus: { tier: 3, maxLevel: 5,  baseCost: 7,  costScale: 2.5, name: '🌟 Ascension Bonus',   desc: 'Gain 10% more prestige points per level' },
  generatorMastery:{ tier: 3, maxLevel: 3, baseCost: 8,  costScale: 3.0, name: '🏗️ Generator Mastery', desc: 'Gens you own 50+ of produce 3x per level' },
  criticalMass:   { tier: 3, maxLevel: 5,  baseCost: 7,  costScale: 2.5, name: '💎 Critical Mass',     desc: 'When >1M balls, BPS +25% per level' },
  goldenFrenzy:   { tier: 3, maxLevel: 3,  baseCost: 8,  costScale: 3.5, name: '🌈 Golden Frenzy',     desc: 'Golden balls trigger 5s 2x boost per level' },
  rebirthMemory:  { tier: 3, maxLevel: 5,  baseCost: 8,  costScale: 3.0, name: '🧠 Rebirth Memory',    desc: 'Keep 5% of generators after prestige per level' },
  researchSpeed:  { tier: 3, maxLevel: 3,  baseCost: 7,  costScale: 2.5, name: '🔬 Quick Study',       desc: 'Research completes 15% faster per level' },

  // Tier 4: requires 30 total + 8 prestiges
  overflowMastery:{ tier: 4, maxLevel: 3,  baseCost: 10, costScale: 3.5, name: '🌊 Overflow Mastery',  desc: 'Overflow balls appear 2× more often per level' },
  dimensionHopper:{ tier: 4, maxLevel: 3,  baseCost: 12, costScale: 3.0, name: '🚀 Dimension Hopper',  desc: 'Every 5min, gain 30s of production per level' },
  eternalGens:    { tier: 4, maxLevel: 3,  baseCost: 15, costScale: 3.0, name: '♾️ Eternal Generators', desc: 'Gens 25% cheaper per prestige count (cap 90%)/lvl' },
  ballAlchemy:    { tier: 4, maxLevel: 3,  baseCost: 15, costScale: 3.5, name: '⚗️ Ball Alchemy',      desc: '1%/s chance to convert 1% of balls to perm BPS/lvl' },
  prestigeCascade:{ tier: 4, maxLevel: 3,  baseCost: 12, costScale: 3.0, name: '🎲 Prestige Cascade',  desc: 'Prestige gives 1 free random T1 skill level/lvl' },
  quantumTunneling:{ tier: 4, maxLevel: 1, baseCost: 20, costScale: 1,   name: '🌀 Quantum Tunneling', desc: 'Unlock Quantum Fabric generator (prestige-based)' },

  // Tier 5: requires 50 total + 15 prestiges
  omniscience:    { tier: 5, maxLevel: 1,  baseCost: 25, costScale: 1,   name: '👁️ Omniscience',       desc: 'See exact BPS contribution of each generator' },
  timeWarp:       { tier: 5, maxLevel: 3,  baseCost: 30, costScale: 2.0, name: '⏩ Time Warp',          desc: 'Skip 4h of production. 24h CD (-4h/lvl)' },
  realityEngine:  { tier: 5, maxLevel: 1,  baseCost: 50, costScale: 1,   name: '🔮 Reality Engine',     desc: 'All multipliers are SQUARED' },
  theConvergence: { tier: 5, maxLevel: 1,  baseCost: 40, costScale: 1,   name: '🌌 The Convergence',    desc: 'Every maxed skill gives +5% to everything' },
  infinitePrestige:{ tier: 5, maxLevel: 1, baseCost: 100,costScale: 1,   name: '♾️ Infinite Prestige',  desc: 'Prestige no longer resets generators' },
  goldenAge:      { tier: 5, maxLevel: 1,  baseCost: 35, costScale: 1,   name: '✨ Golden Age',          desc: 'Golden balls appear 5× more often' },

  // Tier 6: requires 100 total + 30 prestiges — Cosmic
  softcapBreak1:  { tier: 6, maxLevel: 5,  baseCost: 1000000, costScale: 5.0,  name: '💥 Softcap Breaker I',   desc: 'Break first production softcap — each level +40% past the 1T BPS cap', prereq: ['prestigePower'] },
  megaPrestige:   { tier: 6, maxLevel: 3,  baseCost: 2000000, costScale: 8.0,  name: '🌠 Mega Prestige',       desc: 'Prestige rewards give 2× more PP per level', prereq: ['ascensionBonus'] },
  ballNova:       { tier: 6, maxLevel: 5,  baseCost: 500000,  costScale: 4.0,  name: '💫 Ball Nova',           desc: 'Every 5 min, instantly gain 2 hours of production per level', prereq: ['dimensionHopper'] },
  genMultiplier:  { tier: 6, maxLevel: 5,  baseCost: 800000,  costScale: 5.0,  name: '⚡ Generator Overdrive', desc: 'All generators produce 50% more per level (multiplicative)', prereq: ['generatorMastery'] },

  // Tier 7: requires 150 total + 50 prestiges — Transcendence II
  softcapBreak2:  { tier: 7, maxLevel: 5,  baseCost: 1000000000, costScale: 10.0, name: '💥 Softcap Breaker II',  desc: 'Break second softcap — each level +50% past 1Qa BPS cap', prereq: ['softcapBreak1'] },
  decillionDream: { tier: 7, maxLevel: 1,  baseCost: 100000000000, costScale: 1,  name: '🎯 Decillion Dream',     desc: 'Remove ALL production softcaps permanently', prereq: ['softcapBreak2'] },
  prestigeAscension:{ tier: 7, maxLevel: 3,baseCost: 5000000000, costScale: 20.0, name: '👑 Prestige Ascension',  desc: 'PP earned per prestige ×5 per level', prereq: ['megaPrestige'] },
  cosmicSingularity:{ tier: 7, maxLevel: 1,baseCost: 50000000000, costScale: 1,   name: '🌌 Cosmic Singularity',  desc: 'All skill effects are cubed. Costs 50B PP.', prereq: ['theConvergence'] },
};

const TIER_REQS = {
  1: { totalLevels: 0, prestiges: 0 },
  2: { totalLevels: 5, prestiges: 0 },
  3: { totalLevels: 15, prestiges: 3 },
  4: { totalLevels: 30, prestiges: 8 },
  5: { totalLevels: 50, prestiges: 15 },
  6: { totalLevels: 100, prestiges: 30 },
  7: { totalLevels: 150, prestiges: 50 },
};

const TIER_NAMES = {
  1: '🌱 Tier 1 — Foundation',
  2: '🔵 Tier 2 — Advanced',
  3: '🟣 Tier 3 — Expert',
  4: '🟡 Tier 4 — Legendary',
  5: '🔴 Tier 5 — Transcendent',
  6: '🟠 Tier 6 — Cosmic',
  7: '⚫ Tier 7 — Transcendence II',
};

