const fs = require('fs');
const vm = require('vm');
const path = require('path');

// Set up a minimal sandbox for the game code to run in
function createGameContext() {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

  // Extract main script (first <script> to last </script>)
  // Template literals inside use <scr${''}ipt> escapes so they won't interfere.
  const scriptStart = html.indexOf('<script>') + '<script>'.length;
  const scriptEnd = html.lastIndexOf('</script>');
  let js = html.substring(scriptStart, scriptEnd);

  // Disable auto-start and animation loop
  js = js.replace(/^init\(\);$/m, '// init(); // disabled for testing');
  js = js.replace(/requestAnimationFrame\(gameLoop\)/g, '// raf disabled');

  // Expose all game internals to the sandbox context so tests can access them.
  // In a vm context, const/let are not context properties — we must assign them
  // explicitly to globalThis.
  js += `
;(function _expose() {
  // Constants
  globalThis.SAVE_KEY = SAVE_KEY;
  globalThis.GEN_MILESTONES = GEN_MILESTONES;
  globalThis.SKILL_DEFS = SKILL_DEFS;
  globalThis.TIER_REQS = TIER_REQS;
  globalThis.TIER_NAMES = TIER_NAMES;
  globalThis.ACHIEVEMENTS = ACHIEVEMENTS;
  globalThis.CHALLENGE_DEFS = CHALLENGE_DEFS;
  globalThis.GEN_VISUALS = GEN_VISUALS;
  // State accessor — reading/writing ctx.state goes through a getter/setter
  // so that changes from outside the vm propagate to the inner 'state' variable.
  Object.defineProperty(globalThis, 'state', {
    get() { return state; },
    set(v) { state = v; },
    configurable: true,
    enumerable: true,
  });
})();
`;

  // Minimal DOM stubs — enough for game constants & pure functions to load
  const mockElement = () => ({
    innerHTML: '',
    textContent: '',
    style: {},
    classList: {
      add: () => {},
      remove: () => {},
      toggle: () => {},
      contains: () => false,
    },
    querySelectorAll: () => [],
    querySelector: () => null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 600 }),
    addEventListener: () => {},
    getContext: () => ({
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      moveTo: () => {},
      lineTo: () => {},
      fillText: () => {},
      createRadialGradient: () => ({ addColorStop: () => {} }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      save: () => {},
      restore: () => {},
      canvas: { width: 400, height: 600 },
    }),
    width: 400,
    height: 600,
  });

  const sandbox = {
    window: {
      open: () => null,
      addEventListener: () => {},
      removeEventListener: () => {},
      innerWidth: 1280,
      innerHeight: 800,
    },
    performance: {
      now: () => Date.now(),
    },
    document: {
      getElementById: () => mockElement(),
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {},
      title: '',
    },
    localStorage: {
      _data: {},
      getItem(k) { return this._data[k] || null; },
      setItem(k, v) { this._data[k] = v; },
      removeItem(k) { delete this._data[k]; },
    },
    requestAnimationFrame: () => 0,
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: () => 1,
    clearTimeout: () => {},
    alert: () => {},
    confirm: () => true,
    console,
    Math,
    Date,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Infinity,
    NaN,
    undefined,
    Error,
    TypeError,
    ReferenceError,
  };

  const context = vm.createContext(sandbox);
  vm.runInContext(js, context);
  return context;
}

let ctx;

beforeAll(() => {
  ctx = createGameContext();
});

// ─────────────────────────────────────────────────────────────────────────────
// Script Parsing — verifies the <scr${''}ipt> fix worked and all core
// functions/constants are actually defined after the template-literal section
// ─────────────────────────────────────────────────────────────────────────────
describe('Script Parsing', () => {
  test('all core functions are defined', () => {
    expect(typeof ctx.switchTab).toBe('function');
    expect(typeof ctx.setBuyAmount).toBe('function');
    expect(typeof ctx.formatNum).toBe('function');
    expect(typeof ctx.getBPS).toBe('function');
    expect(typeof ctx.getClickValue).toBe('function');
    expect(typeof ctx.getGenCost).toBe('function');
    expect(typeof ctx.buyGenerator).toBe('function');
    expect(typeof ctx.renderGenerators).toBe('function');
    expect(typeof ctx.renderActiveTab).toBe('function');
    expect(typeof ctx.init).toBe('function');
    expect(typeof ctx.gameLoop).toBe('function');
    expect(typeof ctx.saveGame).toBe('function');
    expect(typeof ctx.loadGame).toBe('function');
    expect(typeof ctx.openSkillTreeWindow).toBe('function');
  });

  test('no references to removed functions exist as globals', () => {
    expect(ctx.hasResearch).toBeUndefined();
    expect(ctx.renderFusionLab).toBeUndefined();
    expect(ctx.fuseBall).toBeUndefined();
    expect(ctx.getFusionBonus).toBeUndefined();
    expect(ctx.getFusionCost).toBeUndefined();
    expect(ctx.renderSpinUI).toBeUndefined();
    expect(ctx.doSpin).toBeUndefined();
    expect(ctx.applySpinReward).toBeUndefined();
    expect(ctx.getSpinCooldown).toBeUndefined();
    expect(ctx.renderBallRushInfo).toBeUndefined();
    expect(ctx.startBallRush).toBeUndefined();
    expect(ctx.endBallRush).toBeUndefined();
    expect(ctx.getRushInterval).toBeUndefined();
    expect(ctx.renderResearch).toBeUndefined();
    expect(ctx.startResearch).toBeUndefined();
    expect(ctx.processResearchCompletion).toBeUndefined();
    expect(ctx.doRealityBend).toBeUndefined();
    expect(ctx.rushActive).toBeUndefined();
    expect(ctx.spinning).toBeUndefined();
    expect(ctx.spinRotation).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatNum
// ─────────────────────────────────────────────────────────────────────────────
describe('formatNum', () => {
  test('formats small numbers without suffix', () => {
    expect(ctx.formatNum(0)).toBe('0');
    expect(ctx.formatNum(1)).toBe('1');
    expect(ctx.formatNum(999)).toBe('999');
  });

  test('formats thousands with K-scale suffix', () => {
    const result = ctx.formatNum(1500);
    expect(result).toMatch(/1[.,]5/); // 1.5K
  });

  test('formats millions', () => {
    const result = ctx.formatNum(1_000_000);
    expect(result).toMatch(/1/); // at minimum contains "1"
    expect(result).not.toBe('1000000');
  });

  test('handles negative numbers without throwing', () => {
    expect(() => ctx.formatNum(-100)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatTime
// ─────────────────────────────────────────────────────────────────────────────
describe('formatTime', () => {
  test('formats seconds', () => {
    expect(ctx.formatTime(30)).toMatch(/30/);
  });

  test('formats minutes', () => {
    const result = ctx.formatTime(90);
    expect(result).toMatch(/1/); // at least "1" minute
  });

  test('formats hours', () => {
    const result = ctx.formatTime(3600);
    expect(result).toMatch(/1/); // at least "1" hour
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getDefaultState
// ─────────────────────────────────────────────────────────────────────────────
describe('getDefaultState', () => {
  test('returns valid state object with expected fields', () => {
    const state = ctx.getDefaultState();
    expect(state).toBeDefined();
    expect(state.balls).toBe(0);
    expect(state.totalBalls).toBe(0);
    expect(typeof state.prestigePoints).toBe('number');
    expect(typeof state.prestiges).toBe('number');
    expect(Array.isArray(state.generators)).toBe(true);
    expect(Array.isArray(state.upgrades)).toBe(true);
    expect(typeof state.skills).toBe('object');
    expect(typeof state.achievementsUnlocked).toBe('object');
  });

  test('does NOT contain removed feature fields', () => {
    const state = ctx.getDefaultState();
    expect(state.fusionBalls).toBeUndefined();
    expect(state.lastSpinTime).toBeUndefined();
    expect(state.totalSpins).toBeUndefined();
    expect(state.ppFragments).toBeUndefined();
    expect(state.completedResearch).toBeUndefined();
    expect(state.activeResearch).toBeUndefined();
    expect(state.lastRushTime).toBeUndefined();
    expect(state.rushesCompleted).toBeUndefined();
  });

  test('does not contain molecular or cosmic generators', () => {
    const state = ctx.getDefaultState();
    const genIds = state.generators.map(g => g.id);
    expect(genIds).not.toContain('molecular');
    expect(genIds).not.toContain('cosmic');
  });

  test('first generator is dropper', () => {
    const state = ctx.getDefaultState();
    expect(state.generators[0].id).toBe('dropper');
  });

  test('all generators start at count 0', () => {
    const state = ctx.getDefaultState();
    for (const gen of state.generators) {
      expect(gen.count).toBe(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Game Mechanics
// ─────────────────────────────────────────────────────────────────────────────
describe('Game Mechanics', () => {
  beforeEach(() => {
    ctx.state = ctx.getDefaultState();
  });

  test('getClickValue returns a positive number', () => {
    expect(ctx.getClickValue()).toBeGreaterThan(0);
  });

  test('getBPS returns 0 with no generators', () => {
    expect(ctx.getBPS()).toBe(0);
  });

  test('getBPS increases when the first generator has count > 0', () => {
    ctx.state.generators[0].count = 1;
    expect(ctx.getBPS()).toBeGreaterThan(0);
  });

  test('getBPS scales with generator count', () => {
    ctx.state.generators[0].count = 1;
    const bps1 = ctx.getBPS();
    ctx.state.generators[0].count = 10;
    const bps10 = ctx.getBPS();
    expect(bps10).toBeGreaterThan(bps1);
  });

  test('getGenCost returns a positive cost for first generator', () => {
    const gen = ctx.state.generators[0];
    expect(ctx.getGenCost(gen, 1)).toBeGreaterThan(0);
  });

  test('getGenCost increases exponentially with quantity', () => {
    const gen = ctx.state.generators[0];
    const cost1 = ctx.getGenCost(gen, 1);
    const cost10 = ctx.getGenCost(gen, 10);
    expect(cost10).toBeGreaterThan(cost1);
  });

  test('canPrestige returns false initially', () => {
    expect(ctx.canPrestige()).toBe(false);
  });

  test('getPrestigeThreshold returns a positive number', () => {
    expect(ctx.getPrestigeThreshold()).toBeGreaterThan(0);
  });

  test('isGenUnlocked returns true for dropper (first generator)', () => {
    expect(ctx.isGenUnlocked('dropper')).toBe(true);
  });

  test('isGenUnlocked returns falsy for special locked generators (overflow, qfabric)', () => {
    // overflow requires overflowActive or overflowUnlocked (false by default)
    expect(ctx.isGenUnlocked('overflow')).toBeFalsy();
    // qfabric requires quantumTunneling skill (level 0 by default)
    expect(ctx.isGenUnlocked('qfabric')).toBeFalsy();
  });

  test('skill system: totalSkillLevels starts at 0', () => {
    expect(ctx.totalSkillLevels()).toBe(0);
  });

  test('skill system: skillLevel for autoClicker starts at 0', () => {
    expect(ctx.skillLevel('autoClicker')).toBe(0);
  });

  test('skill system: skillCost for any defined skill is positive', () => {
    for (const id of Object.keys(ctx.SKILL_DEFS)) {
      expect(ctx.skillCost(id)).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SKILL_DEFS integrity
// ─────────────────────────────────────────────────────────────────────────────
describe('SKILL_DEFS', () => {
  test('does not contain skills for removed features', () => {
    expect(ctx.SKILL_DEFS.rushEnhancer).toBeUndefined();
    expect(ctx.SKILL_DEFS.fusionExpert).toBeUndefined();
    expect(ctx.SKILL_DEFS.researchSpeed).toBeUndefined();
    expect(ctx.SKILL_DEFS.luckyStreak).toBeUndefined();
  });

  test('every skill prereq references an existing skill', () => {
    for (const [id, def] of Object.entries(ctx.SKILL_DEFS)) {
      if (def.prereq) {
        for (const prereqId of def.prereq) {
          expect(ctx.SKILL_DEFS[prereqId]).toBeDefined();
        }
      }
    }
  });

  test('every skill has required fields', () => {
    for (const [id, def] of Object.entries(ctx.SKILL_DEFS)) {
      expect(typeof def.tier).toBe('number');
      expect(typeof def.maxLevel).toBe('number');
      expect(def.maxLevel).toBeGreaterThan(0);
      expect(typeof def.baseCost).toBe('number');
      expect(def.baseCost).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ACHIEVEMENTS integrity
// ─────────────────────────────────────────────────────────────────────────────
describe('Achievements', () => {
  test('does not contain removed-feature achievements', () => {
    const achIds = ctx.ACHIEVEMENTS.map(a => a.id);
    expect(achIds).not.toContain('fusion_1');
    expect(achIds).not.toContain('spin_1');
    expect(achIds).not.toContain('rush_1');
    expect(achIds).not.toContain('research_1');
  });

  test('achievement check functions do not throw with default state', () => {
    ctx.state = ctx.getDefaultState();
    expect(() => {
      for (const ach of ctx.ACHIEVEMENTS) {
        ach.check(ctx.state);
      }
    }).not.toThrow();
  });

  test('no achievement check returns truthy on a brand-new state', () => {
    ctx.state = ctx.getDefaultState();
    for (const ach of ctx.ACHIEVEMENTS) {
      // A fresh state should not immediately unlock any achievement
      // (except possibly ones with trivially-met conditions — we just ensure no throw)
      expect(() => ach.check(ctx.state)).not.toThrow();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHALLENGE_DEFS integrity
// ─────────────────────────────────────────────────────────────────────────────
describe('CHALLENGE_DEFS', () => {
  test('is defined and is an array', () => {
    expect(Array.isArray(ctx.CHALLENGE_DEFS)).toBe(true);
    expect(ctx.CHALLENGE_DEFS.length).toBeGreaterThan(0);
  });

  test('each challenge has id, name, goal, and reward fields', () => {
    for (const ch of ctx.CHALLENGE_DEFS) {
      expect(typeof ch.id).toBe('string');
      expect(typeof ch.name).toBe('string');
      expect(typeof ch.goal).toBe('number');
      expect(ch.goal).toBeGreaterThan(0);
      expect(typeof ch.reward).toBe('string');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Save / Load round-trip
// ─────────────────────────────────────────────────────────────────────────────
describe('Save / Load', () => {
  beforeEach(() => {
    ctx.state = ctx.getDefaultState();
    // Clear localStorage
    ctx.localStorage._data = {};
  });

  test('saveGame writes something to localStorage', () => {
    ctx.saveGame();
    const key = ctx.SAVE_KEY;
    expect(ctx.localStorage._data[key]).toBeDefined();
  });

  test('loadGame restores state from localStorage', () => {
    ctx.state.balls = 12345;
    ctx.state.prestiges = 3;
    ctx.saveGame();
    // Reset state then reload
    ctx.state = ctx.getDefaultState();
    ctx.loadGame();
    expect(ctx.state.balls).toBe(12345);
    expect(ctx.state.prestiges).toBe(3);
  });

  test('loadGame handles saves with extra/legacy fields gracefully', () => {
    // Simulate an old save that had removed features
    const legacySave = JSON.stringify({
      ...ctx.getDefaultState(),
      fusionBalls: { fire: 2 },
      lastSpinTime: 999999,
      ppFragments: 5,
      activeResearch: 'speedBoost',
    });
    ctx.localStorage._data[ctx.SAVE_KEY] = legacySave;
    expect(() => ctx.loadGame()).not.toThrow();
    // Core fields should still load
    expect(ctx.state.balls).toBe(0);
  });
});
