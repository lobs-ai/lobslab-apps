// ── Constants ──
const SAVE_KEY = 'ballz_save_v6';

//  GAME STATE
// ══════════════════════════════════════════════════════

let state = getDefaultState();

function getDefaultState() {
  const skills = {};
  for (const [id, def] of Object.entries(SKILL_DEFS)) {
    skills[id] = { level: 0 };
  }
  return {
    balls: 0,
    totalBalls: 0,
    totalBallsEver: 0,
    totalClicks: 0,
    gameStartTime: Date.now(),
    lastSaveTime: Date.now(),
    prestiges: 0,
    prestigeMulti: 1,
    prestigePoints: 0,
    totalPPEarned: 0,
    highestBPS: 0,
    highestCombo: 1,
    goldenClicks: 0,
    overflowUnlocked: false,
    overflowActive: false,
    combo: 1,
    comboTimer: 0,
    // Generators
    generators: [
      { id: 'dropper',    name: 'Ball Dropper',        desc: 'Drops a ball every few seconds',      baseCost: 100,       baseRate: 0.5,    count: 0 },
      { id: 'launcher',   name: 'Ball Launcher',       desc: 'Launches balls rapidly',              baseCost: 1000,      baseRate: 3,      count: 0 },
      { id: 'factory',    name: 'Ball Factory',        desc: 'Mass-produces balls',                 baseCost: 10000,     baseRate: 20,     count: 0 },
      { id: 'vortex',     name: 'Ball Vortex',         desc: 'Summons balls from the void',         baseCost: 120000,    baseRate: 100,    count: 0 },
      { id: 'singularity',name: 'Singularity',         desc: 'Warps reality to create balls',       baseCost: 1500000,   baseRate: 600,    count: 0 },
      { id: 'quantum',    name: 'Quantum Splitter',    desc: 'Splits each ball into many',          baseCost: 20e6,      baseRate: 4000,   count: 0 },
      { id: 'dimension',  name: 'Dimension Rift',      desc: 'Pulls balls from other timelines',    baseCost: 300e6,     baseRate: 25000,  count: 0 },
      { id: 'bigbang',    name: 'Big Bang Engine',     desc: 'Creates universes of balls',          baseCost: 5000e6,    baseRate: 200000, count: 0 },
      { id: 'overflow',   name: 'Overflow Core',       desc: 'Harnesses reality destabilization',   baseCost: 10e9,      baseRate: 2000000,count: 0 },
      { id: 'qfabric',    name: 'Quantum Fabric',      desc: 'Weaves balls from the quantum foam',  baseCost: 50e9,      baseRate: 0,      count: 0 }, // rate = prestige-based
      { id: 'molecular',  name: 'Molecular Assembler', desc: 'Assembles balls atom by atom',        baseCost: 2e9,       baseRate: 500000, count: 0 },
      { id: 'cosmic',     name: 'Cosmic Forge',        desc: 'Forges balls from starlight',         baseCost: 500e9,     baseRate: 5000000,count: 0 },
    ],
    upgrades: [
      { id: 'bigBalls',   name: 'Bigger Balls',     desc: 'Balls are 2x larger on screen',  cost: 50,    bought: false, effect: 'ballSize' },
      { id: 'clickPow',   name: 'Click Power',      desc: 'Clicking gives 5 balls',         cost: 200,   bought: false, effect: 'clickPower' },
      { id: 'rainbow',    name: 'Rainbow Balls',    desc: 'Balls cycle through colors',     cost: 500,   bought: false, effect: 'rainbow' },
      { id: 'gravity',    name: 'Low Gravity',      desc: 'Balls float more',               cost: 2000,  bought: false, effect: 'lowGravity' },
      { id: 'explosion',  name: 'Ball Explosion',   desc: 'Balls burst into more on click', cost: 5000,  bought: false, effect: 'explosion' },
      { id: 'magnet',     name: 'Ball Magnet',      desc: '+50% production rate',           cost: 25000, bought: false, effect: 'magnet' },
      { id: 'golden',     name: 'Golden Balls',     desc: 'Rare golden balls worth 100x',   cost: 100000,bought: false, effect: 'golden' },
      { id: 'critClick',  name: 'Critical Clicks',  desc: '10% chance for 10x click value', cost: 50000, bought: false, effect: 'critClick' },
      { id: 'ballTrails', name: 'Ball Trails',      desc: 'Balls leave glowing trails',     cost: 250000,bought: false, effect: 'ballTrails' },
      { id: 'hyperDrop',  name: 'Hyper Droppers',   desc: 'Droppers & launchers 3x faster', cost: 500000,bought: false, effect: 'hyperDrop' },
      { id: 'antimatter', name: 'Antimatter Balls',  desc: 'Dark balls that boost nearby',  cost: 2e6,   bought: false, effect: 'antimatter' },
      { id: 'overclock',  name: 'Overclock',        desc: 'All generators +100% speed',     cost: 10e6,  bought: false, effect: 'overclock' },
      // Synergy upgrades
      { id: 'launcherCal',  name: 'Launcher Calibration', desc: 'Each Factory owned: Launchers +2%', cost: 5000,  bought: false, effect: 'launcherCal' },
      { id: 'factoryFuel',  name: 'Factory Fuel',         desc: 'Each Vortex owned: Factories +3%',  cost: 50000, bought: false, effect: 'factoryFuel' },
      { id: 'vortexConv',   name: 'Vortex Convergence',   desc: 'Each Singularity: all gens +1%',    cost: 500000, bought: false, effect: 'vortexConv' },
      { id: 'quantumEnt',   name: 'Quantum Entanglement', desc: 'Quantum count ×5% boost to Dim Rifts', cost: 5e6,  bought: false, effect: 'quantumEnt' },
      { id: 'cosmicRes',    name: 'Cosmic Resonance',     desc: 'Big Bang count ×2% boost to ALL',      cost: 50e6, bought: false, effect: 'cosmicRes' },
      // Overflow upgrades
      { id: 'realityAnchor', name: 'Reality Anchor', desc: 'All production ×3 permanently', cost: 10e6, bought: false, effect: 'realityAnchor', requiresOverflow: true },
    ],
    skills: skills,
    // Achievements
    achievementsUnlocked: {},
    // Fusion Lab
    fusionBalls: {}, // { bronze: 3, silver: 1, ... }
    // Ball Rush
    rushesCompleted: 0,
    lastRushTime: 0,
    // Research
    completedResearch: [],
    activeResearch: [],  // [{ id, startTime, duration }]
    // Challenges
    challengeCompleted: {},
    activeChallenge: null, // { id, startTime, startBalls: 0, startClicks: 0 }
    // Temporary boosts
    doubleProdUntil: 0,
    clickBoostUntil: 0,
    goldenFrenzyUntil: 0,
    // Time Warp
    lastTimeWarp: 0,
    // Ball Alchemy permanent BPS bonus
    alchemyBPS: 0,
    // Dimension Hopper timer
    lastDimensionHop: 0,
    // Prestige timestamp
    lastPrestigeTime: Date.now(),
    // Leechers
    leechers: [],
    leechersPopped: 0,
    // Ball Nova timer
    lastBallNova: Date.now(),
  };
}

// ══════════════════════════════════════════════════════
//  SAVE / LOAD
// ══════════════════════════════════════════════════════

function saveGame() {
  try {
    state.lastSaveTime = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch(e) {}
}

function loadGame() {
  try {
    // Try v6, v5, v4, v3, v2
    let s = localStorage.getItem(SAVE_KEY);
    if (!s) s = localStorage.getItem('ballz_save_v5');
    if (!s) s = localStorage.getItem('ballz_save_v4');
    if (!s) s = localStorage.getItem('ballz_save_v3');
    if (!s) s = localStorage.getItem('ballz_save_v2');
    if (s) {
      const loaded = JSON.parse(s);
      const def = getDefaultState();
      state = { ...def, ...loaded };

      // Ensure all new fields have defaults
      for (const key of Object.keys(def)) {
        if (state[key] === undefined || state[key] === null) state[key] = def[key];
      }

      // Merge generators by id (add new, keep counts)
      state.generators = def.generators.map(dg => {
        const lg = loaded.generators?.find(g => g.id === dg.id);
        return lg ? { ...dg, count: lg.count || 0 } : { ...dg };
      });

      // Merge upgrades
      state.upgrades = def.upgrades.map(du => {
        const lu = loaded.upgrades?.find(u => u.id === du.id);
        return lu ? { ...du, bought: lu.bought || false } : { ...du };
      });

      // Merge skills (preserve levels, add new skills)
      const mergedSkills = {};
      for (const [k, def_skill] of Object.entries(SKILL_DEFS)) {
        mergedSkills[k] = { level: loaded.skills?.[k]?.level || 0 };
      }
      state.skills = mergedSkills;

      // Migrate from v4: convert old skill format
      if (loaded.skills) {
        for (const [k, v] of Object.entries(loaded.skills)) {
          if (state.skills[k] !== undefined) {
            state.skills[k].level = v.level || 0;
          }
        }
      }

      // Ensure objects
      if (!state.achievementsUnlocked) state.achievementsUnlocked = {};
      if (!state.fusionBalls) state.fusionBalls = {};
      if (!state.completedResearch) state.completedResearch = [];
      if (!state.activeResearch) state.activeResearch = [];
      if (!state.challengeCompleted) state.challengeCompleted = {};
      if (state.totalPPEarned == null) state.totalPPEarned = state.prestigePoints || 0;
      if (state.highestCombo == null) state.highestCombo = 1;
      if (state.goldenClicks == null) state.goldenClicks = 0;

      if (state.rushesCompleted == null) state.rushesCompleted = 0;
      if (state.alchemyBPS == null) state.alchemyBPS = 0;
      if (state.lastPrestigeTime == null) state.lastPrestigeTime = Date.now();
      if (state.lastDimensionHop == null) state.lastDimensionHop = 0;
      if (state.lastTimeWarp == null) state.lastTimeWarp = 0;
      if (state.lastRushTime == null) state.lastRushTime = 0;
      if (!state.leechers) state.leechers = [];
      if (state.leechersPopped == null) state.leechersPopped = 0;
      if (state.lastBallNova == null) state.lastBallNova = Date.now();

      // Migrate v2: convert old prestigeMulti into skill points
      if (!loaded.prestigePoints && loaded.prestigeMulti > 1) {
        state.prestigePoints = Math.floor((loaded.prestigeMulti - 1) * 2);
      }

      // Calculate offline progress
      if (loaded.lastSaveTime) {
        const elapsed = (Date.now() - loaded.lastSaveTime) / 1000;
        if (elapsed > 30) { // at least 30 seconds away
          const offlineBPS = getBPS();
          let offlineRate = 0.25; // 25% default
          if (skillLevel('idleEfficiency') > 0) {
            offlineRate = 0.5 + skillLevel('idleEfficiency') * 0.1;
          }
          if (hasResearch('temporalMech')) offlineRate = Math.max(offlineRate, 0.75);
          const offlineBalls = Math.floor(offlineBPS * elapsed * offlineRate);
          if (offlineBalls > 0) {
            state.balls += offlineBalls;
            state.totalBalls += offlineBalls;
            state.totalBallsEver += offlineBalls;
            // Show welcome back modal
            setTimeout(() => showWelcomeBack(elapsed, offlineBalls), 200);
          }
        }
      }

      // Process completed research
      processResearchCompletion();
    }
  } catch(e) {
    console.error('Load error:', e);
    state = getDefaultState();
  }
}

// ══════════════════════════════════════════════════════
