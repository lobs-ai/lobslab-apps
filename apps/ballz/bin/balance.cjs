#!/usr/bin/env node
// Deterministic economy playthrough. No golden luck, combos, or time skips.
const { createGameContext } = require('../game-harness.cjs');

function simulate(clicksPerSecond, duration = 1800) {
  const game = createGameContext();
  let seed = 42;
  game.Math = Object.create(Math);
  game.Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (const name of ['renderGenerators', 'renderMilestones', 'renderUpgrades', 'updateUI', 'showToast', 'playSound']) game[name] = () => {};
  const milestones = {};
  for (let second = 1; second <= duration; second++) {
    game.grantBalls(game.getBPS() + game.getClickValue() * clicksPerSecond);
    game.state.totalClicks += clicksPerSecond;
    if (second % 2 === 0) game.checkAchievements();
    for (const id of ['first', 'crew', 'launch', 'steady', 'factory', 'gold', 'vortex', 'million']) game.claimGoal(id);
    const bps = game.getBPS();
    const options = [];
    for (const gen of game.state.generators) {
      if (!game.isGenUnlocked(gen.id)) continue;
      const cost = game.getGenCost(gen, 1);
      gen.count++;
      const gain = game.getBPS() - bps;
      gen.count--;
      if (gain > 0) options.push({ cost, score: gain / cost, buy: () => game.buyGenerator(gen.id, 1) });
    }
    for (const up of game.state.upgrades) {
      if (up.bought || up.requiresOverflow) continue;
      const clickBefore = game.getClickValue();
      up.bought = true;
      const gain = game.getBPS() - bps + Math.max(0, game.getClickValue() - clickBefore) * clicksPerSecond;
      up.bought = false;
      if (gain > 0) options.push({ cost: up.cost, score: gain / up.cost, buy: () => game.buyUpgrade(up.id) });
    }
    for (const up of game.GEN_UPGRADES) {
      if (game.state.genUpgradesBought[up.id] || game.getGenCount(up.genId) < up.threshold) continue;
      game.state.genUpgradesBought[up.id] = true;
      const gain = game.getBPS() - bps;
      delete game.state.genUpgradesBought[up.id];
      if (gain > 0) options.push({ cost: up.cost, score: gain / up.cost, buy: () => game.buyGenUpgrade(up.id) });
    }
    const best = options.filter(o => o.cost <= game.state.balls + (bps + clicksPerSecond * game.getClickValue()) * 15)
      .sort((a, b) => b.score - a.score)[0];
    if (best && best.cost <= game.state.balls) best.buy();
    for (const gen of game.state.generators) {
      if (gen.count > 0 && !milestones[gen.id]) milestones[gen.id] = second;
    }
    if (game.canPrestige()) { milestones.prestige = second; break; }
  }
  return { clicksPerSecond, secondsToUnlock: milestones, bps: Math.round(game.getBPS()), total: Math.round(game.state.totalBalls), prestigePoints: game.getPrestigeReward() };
}

if (require.main === module) {
  for (const clicks of [1, 2, 4]) console.log(JSON.stringify(simulate(clicks), null, 2));
}
module.exports = { simulate };
