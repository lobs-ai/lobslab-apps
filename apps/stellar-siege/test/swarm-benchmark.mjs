import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright-chromium');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.GAME_URL || 'http://localhost:47104');
  await page.evaluate(async () => {
    const base = document.querySelector('script[type="module"]').getAttribute('src').replace(/js\/main\.js$/, '');
    const { Game } = await import(base + 'js/game/Game.js');
    const start = Game.prototype.startGame;
    Game.prototype.startGame = function (...args) { start.apply(this, args); window.benchmarkGame = this; };
  });
  await page.selectOption('#menu-mapsize', 'large');
  await page.click('#menu-start');
  const result = await page.evaluate(async () => {
    const base = document.querySelector('script[type="module"]').getAttribute('src').replace(/js\/main\.js$/, '');
    const { createSwarm } = await import(base + 'js/game/Swarm.js');
    const game = window.benchmarkGame, world = game.world;
    game.skipAI = true;
    for (let i = 0; i < 16; i++) {
      const source = { id: 1000 + i, position: { x: 180 + (i % 8) * 210, y: 220 + Math.floor(i / 8) * 550 } };
      const target = world.nodes[0];
      const swarm = createSwarm(source, target, 150, i < 8 ? 0 : 1, world.allocateSwarmId());
      swarm.target = { type: 'position', x: source.position.x, y: 600 };
      world.addSwarm(swarm);
    }
    const samples = []; let previous = performance.now();
    await new Promise(resolve => {
      function frame(now) {
        samples.push(now - previous); previous = now;
        if (samples.length >= 240) resolve(); else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    samples.sort((a, b) => a - b);
    return { initialMotes: 2400, survivingMotes: world.swarms.reduce((n, s) => n + s.motes.filter(m => m.alive).length, 0),
      medianFrameMs: samples[120], p95FrameMs: samples[228], worstFrameMs: samples.at(-1) };
  });
  await page.screenshot({ path: '/tmp/stellar-siege-stress.png' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
