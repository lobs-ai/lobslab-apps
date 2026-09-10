const { createGameContext } = require('./game-harness.cjs');
const { simulate } = require('./bin/balance.cjs');

let game;
beforeEach(() => {
  game = createGameContext();
  for (const name of ['renderGenerators', 'renderMilestones', 'renderUpgrades', 'renderActiveTab', 'updateUI', 'updateFloor', 'showToast', 'playSound']) game[name] = () => {};
});

test('15 ordinary taps buy the first productive machine', () => {
  for (let i = 0; i < 15; i++) game.handlePlayClick({ clientX: 200, clientY: 100 }, true);
  expect(game.state.balls).toBe(15);
  game.buyGenerator('dropper', 1);
  expect(game.state.balls).toBe(0);
  expect(game.getBPS()).toBe(1);
});

test('MAX agrees with actual bundle prices at fractional prices and discounts', () => {
  const gen = game.state.generators[0];
  for (const count of [0, 3, 25, 50, 100]) {
    for (const discount of [0, 4, 8]) {
      gen.count = count;
      game.state.skills.cheapGens.level = discount;
      game.state.skills.bulkBuy.level = 1;
      game.state.balls = game.getGenCost(gen, 10);
      const max = game.getMaxBuyable(gen);
      expect(max.count).toBe(10);
      expect(max.totalCost).toBe(game.state.balls);
      game.state.balls--;
      expect(game.getMaxBuyable(gen).count).toBe(9);
    }
  }
});

test('invalid purchases cannot create currency or unlock hidden generators', () => {
  game.state.balls = 1e12;
  for (const qty of [-5, 0, 1.5, NaN, Infinity]) game.buyGenerator('dropper', qty);
  game.buyGenerator('qfabric', 1);
  expect(game.getGenCount('dropper')).toBe(0);
  expect(game.getGenCount('qfabric')).toBe(0);
  expect(game.state.balls).toBe(1e12);
});

test('factory goals pay once and survive save/load and prestige', () => {
  game.state.generators[0].count = 1;
  game.claimGoal('first');
  expect(game.state.balls).toBe(30);
  game.claimGoal('first');
  expect(game.state.balls).toBe(30);
  game.saveGame();
  game.loadGame();
  expect(game.state.goalsClaimed.first).toBe(true);
  game.state.totalBalls = 1e6;
  game.doPrestige();
  game.state.generators[0].count = 1;
  const before = game.state.balls;
  game.claimGoal('first');
  expect(game.state.balls).toBe(before);
});

test('incomplete goals and challenge goals do not pay', () => {
  game.claimGoal('first');
  expect(game.state.balls).toBe(0);
  game.startChallenge('noClick');
  game.claimGoal('first');
  expect(game.state.balls).toBe(0);
  expect(game.getBPS()).toBeGreaterThan(0);
  expect(game.getClickValue()).toBe(0);
});

test('offline income is 50%, capped at eight hours, and excludes temporary buffs', () => {
  game.state.generators[0].count = 1;
  expect(game.getOfflineEarnings(60)).toBe(30);
  expect(game.getOfflineEarnings(24 * 3600)).toBe(14400);
  expect(game.getOfflineEarnings(-10)).toBe(0);
  game.addBuff('frenzy', 'Frenzy', '★', 100000, { bpsMult: 7 });
  expect(game.getBPS()).toBe(7);
  expect(game.getOfflineEarnings(60)).toBe(30);
  expect(game.getBPS()).toBe(7);
  game.state.skills.idleEfficiency.level = 5;
  expect(game.getOfflineEarnings(60)).toBe(60);
});

test('confirming a challenge starts the selected run and clears old buffs', () => {
  game.state.leechers = [{ totalDrained: 1000 }];
  game.state.doubleProdUntil = Date.now() + 100000;
  game.openChallengeModal('noClick');
  game.confirmStartChallenge();
  expect(game.state.activeChallenge.id).toBe('noClick');
  expect(game.state.leechers).toEqual([]);
  expect(game.state.doubleProdUntil).toBe(0);
  expect(game.getGenCount('dropper')).toBe(1);
});

test('fractional background earnings survive low production and frequent frames', () => {
  game.state.generators[0].count = 1;
  expect(game.getOfflineEarnings(0.9, false)).toBeCloseTo(0.45);
});

test('first prestige awards useful skills and the second has a reachable threshold', () => {
  game.state.totalBalls = 1e6;
  expect(game.getPrestigeReward()).toBe(5);
  game.doPrestige();
  expect(game.state.prestigePoints).toBe(5);
  expect(game.state.prestigeMulti).toBe(1.25);
  expect(game.getPrestigeThreshold()).toBe(4e6);
  expect(game.canPrestige()).toBe(false);
});

test('Infinite Prestige cannot award the same run twice', () => {
  game.state.skills.infinitePrestige.level = 1;
  game.state.generators[0].count = 50;
  game.state.totalBalls = 1e9;
  game.doPrestige();
  const points = game.state.prestigePoints;
  expect(game.getGenCount('dropper')).toBe(50);
  expect(game.state.totalBalls).toBe(0);
  game.doPrestige();
  expect(game.state.prestigePoints).toBe(points);
});

test('old saves retain purchases and adopt current balance and goal defaults', () => {
  const old = game.getDefaultState();
  delete old.goalsClaimed;
  old.generators[0].baseCost = 100;
  old.generators[0].count = 17;
  old.upgrades[1].bought = true;
  game.localStorage.setItem(game.SAVE_KEY, JSON.stringify(old));
  game.loadGame();
  expect(game.state.generators[0].baseCost).toBe(15);
  expect(game.getGenCount('dropper')).toBe(17);
  expect(game.state.upgrades[1].bought).toBe(true);
  expect(game.state.goalsClaimed).toEqual({});
});

test('active clicking stays useful after production grows', () => {
  game.state.generators[4].count = 15;
  expect(game.getClickValue()).toBeGreaterThanOrEqual(Math.floor(game.getBPS() * 0.02));
});

test('catches reward aim and cap their production bonus at 10%', () => {
  game.state.generators[4].count = 5;
  game.state.combo = 10;
  expect(game.getCatchValue() - game.getClickValue()).toBe(Math.floor(game.getBPS() * 0.1));
  game.state.combo = 50;
  expect(game.getCatchValue() - game.getClickValue()).toBe(Math.floor(game.getBPS() * 0.1));
  game.state.activeChallenge = { noClick: true };
  expect(game.getCatchValue()).toBe(0);
});

test('a physical catch grants the new combo immediately', () => {
  game.spawnBall(100, 100);
  game.handlePlayClick({ clientX: 100, clientY: 100 });
  expect(game.state.combo).toBe(2);
  expect(game.state.balls).toBe(2);
  expect(game.state.comboTimer).toBe(4);
});

test('hard reset clears Ballz while preserving unrelated local storage', () => {
  game.location = { reload: () => {} };
  game.localStorage.setItem('other-app', 'keep');
  game.localStorage.setItem('ballz_save_v2', '{}');
  game.state.balls = 1234;
  game.resetGame();
  expect(game.localStorage.getItem('other-app')).toBe('keep');
  expect(game.localStorage.getItem('ballz_save_v2')).toBeNull();
  expect(JSON.parse(game.localStorage.getItem(game.SAVE_KEY)).balls).toBe(0);
});

test('a steady opening reaches new machines and prestige without lucky events', () => {
  const result = simulate(1);
  expect(result.secondsToUnlock.dropper).toBeLessThanOrEqual(20);
  expect(result.secondsToUnlock.launcher).toBeLessThan(120);
  expect(result.secondsToUnlock.factory).toBeLessThan(240);
  expect(result.secondsToUnlock.prestige).toBeGreaterThan(180);
  expect(result.secondsToUnlock.prestige).toBeLessThan(900);
});
