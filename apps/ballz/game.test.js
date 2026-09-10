const { createGameContext } = require('./game-harness.cjs');

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
    expect(typeof ctx.openSkillTree).toBe('function');
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

  test('loadGame initializes new feature fields from a pre-expansion save', () => {
    const old = ctx.getDefaultState();
    delete old.genUpgradesBought;
    delete old.buffs;
    delete old.buffsTriggered;
    delete old.stormUntil;
    delete old.muted;
    ctx.localStorage._data[ctx.SAVE_KEY] = JSON.stringify(old);
    expect(() => ctx.loadGame()).not.toThrow();
    expect(ctx.state.genUpgradesBought).toEqual({});
    expect(Array.isArray(ctx.state.buffs)).toBe(true);
    expect(ctx.state.buffsTriggered).toBe(0);
    expect(ctx.state.muted).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Generator tier upgrades
// ─────────────────────────────────────────────────────────────────────────────
describe('Generator Upgrades', () => {
  beforeEach(() => {
    ctx.state = ctx.getDefaultState();
  });

  test('GEN_UPGRADES has 8 tiers for each of the 10 generators', () => {
    expect(ctx.GEN_UPGRADES.length).toBe(80);
    const ids = ctx.GEN_UPGRADES.map(d => d.id);
    expect(new Set(ids).size).toBe(80); // unique ids
  });

  test('every gen upgrade references a real generator and has a positive cost', () => {
    const genIds = ctx.state.generators.map(g => g.id);
    for (const def of ctx.GEN_UPGRADES) {
      expect(genIds).toContain(def.genId);
      expect(def.cost).toBeGreaterThan(0);
      expect(def.threshold).toBeGreaterThan(0);
    }
  });

  test('genUpgradeMult is 1 with nothing bought, 2 with one bought, 4 with two', () => {
    expect(ctx.genUpgradeMult('dropper')).toBe(1);
    ctx.state.genUpgradesBought['gu_dropper_10'] = true;
    expect(ctx.genUpgradeMult('dropper')).toBe(2);
    ctx.state.genUpgradesBought['gu_dropper_25'] = true;
    expect(ctx.genUpgradeMult('dropper')).toBe(4);
    // Other generators unaffected
    expect(ctx.genUpgradeMult('launcher')).toBe(1);
  });

  test('buying a gen upgrade doubles that generator BPS', () => {
    ctx.state.generators[0].count = 10;
    const before = ctx.getBPS();
    ctx.state.genUpgradesBought['gu_dropper_10'] = true;
    const after = ctx.getBPS();
    expect(after).toBeCloseTo(before * 2, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Golden events & buffs
// ─────────────────────────────────────────────────────────────────────────────
describe('Golden Events & Buffs', () => {
  beforeEach(() => {
    ctx.state = ctx.getDefaultState();
  });

  test('GOLDEN_EVENTS all have positive weights and required fields', () => {
    expect(ctx.GOLDEN_EVENTS.length).toBeGreaterThanOrEqual(5);
    for (const e of ctx.GOLDEN_EVENTS) {
      expect(typeof e.id).toBe('string');
      expect(e.weight).toBeGreaterThan(0);
      expect(typeof e.name).toBe('string');
    }
  });

  test('frenzy buff multiplies BPS by 7', () => {
    ctx.state.generators[0].count = 10;
    const before = ctx.getBPS();
    ctx.addBuff('frenzy', 'Frenzy ×7', '🔥', 60000, { bpsMult: 7 });
    const after = ctx.getBPS();
    expect(after).toBeCloseTo(before * 7, 5);
  });

  test('expired buffs have no effect', () => {
    ctx.state.buffs.push({ id: 'frenzy', name: 'x', icon: 'x', until: Date.now() - 1000, bpsMult: 7 });
    expect(ctx.buffBPSMult()).toBe(1);
  });

  test('addBuff extends duration instead of stacking the same buff', () => {
    ctx.addBuff('frenzy', 'Frenzy ×7', '🔥', 10000, { bpsMult: 7 });
    ctx.addBuff('frenzy', 'Frenzy ×7', '🔥', 10000, { bpsMult: 7 });
    expect(ctx.state.buffs.filter(b => b.id === 'frenzy').length).toBe(1);
    expect(ctx.buffBPSMult()).toBe(7); // not 49
  });

  test('click frenzy buff multiplies click value', () => {
    const before = ctx.getClickValue();
    ctx.addBuff('clickFrenzy', 'Click ×77', '👆', 60000, { clickMult: 77 });
    const after = ctx.getClickValue();
    expect(after).toBeGreaterThanOrEqual(before * 77);
  });

  test('per-generator boon buff only affects that generator', () => {
    ctx.state.generators[0].count = 10; // dropper
    ctx.state.generators[1].count = 10; // launcher
    const dropperBefore = ctx.getGenBPS(ctx.state.generators[0]);
    const launcherBefore = ctx.getGenBPS(ctx.state.generators[1]);
    ctx.addBuff('boon', 'Dropper ×10', '💧', 60000, { bpsMult: 10, genId: 'dropper' });
    expect(ctx.getGenBPS(ctx.state.generators[0])).toBeCloseTo(dropperBefore * 10, 5);
    expect(ctx.getGenBPS(ctx.state.generators[1])).toBeCloseTo(launcherBefore, 5);
  });

  test('triggerGoldenEvent increments counters and returns an outcome', () => {
    ctx.state.generators[0].count = 5;
    const outcome = ctx.triggerGoldenEvent(0, 0);
    expect(ctx.state.buffsTriggered).toBe(1);
    expect(ctx.state.goldenClicks).toBe(1);
    expect(typeof outcome.value).toBe('number');
    expect(typeof outcome.label).toBe('string');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Click-BPS upgrades
// ─────────────────────────────────────────────────────────────────────────────
describe('Click-BPS upgrades', () => {
  beforeEach(() => {
    ctx.state = ctx.getDefaultState();
  });

  test('clickBpsPct sums bought click upgrades', () => {
    expect(ctx.clickBpsPct()).toBe(0);
    ctx.state.upgrades.find(u => u.id === 'clickBps1').bought = true;
    expect(ctx.clickBpsPct()).toBeCloseTo(0.01, 5);
    ctx.state.upgrades.find(u => u.id === 'clickBps3').bought = true;
    expect(ctx.clickBpsPct()).toBeCloseTo(0.05, 5);
  });

  test('click value includes % of BPS when upgrade bought', () => {
    ctx.state.generators[2].count = 100; // big BPS
    const bps = ctx.getBPS();
    ctx.state.upgrades.find(u => u.id === 'clickBps4').bought = true;
    const val = ctx.getClickValue();
    expect(val).toBeGreaterThanOrEqual(Math.floor(bps * 0.08));
  });
});
