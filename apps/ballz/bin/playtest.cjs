#!/usr/bin/env node
// Isolated Chrome profile: never touches a player's browser or saved factory.
const { spawn } = require('node:child_process');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const chromePath = process.env.CHROME_BIN || [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
  ].find(existsSync);
  if (!chromePath) throw new Error('Set CHROME_BIN to a Chrome or Chromium executable.');
  const profile = mkdtempSync(path.join(tmpdir(), 'ballz-playtest-'));
  const chrome = spawn(chromePath, ['--headless=new', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let socket;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let log = '';
      const timeout = setTimeout(() => reject(new Error('Chrome did not start')), 15000);
      chrome.on('error', reject);
      chrome.stderr.on('data', chunk => {
        log += chunk;
        const found = log.match(/DevTools listening on (ws:\/\/\S+)/);
        if (found) { clearTimeout(timeout); resolve(found[1]); }
      });
    });
    socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let serial = 0, sessionId;
    const pending = new Map();
    const errors = [];
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.id && pending.has(message.id)) {
        const { resolve, reject, timeout } = pending.get(message.id);
        pending.delete(message.id); clearTimeout(timeout);
        message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
      }
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ': ' + message.params.exceptionDetails.exception?.description);
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(JSON.stringify(message.params.args));
    };
    const send = (method, params = {}, session = sessionId) => new Promise((resolve, reject) => {
      const id = ++serial;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 15000);
      pending.set(id, { resolve, reject, timeout });
      socket.send(JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }));
    });
    const target = await send('Target.createTarget', { url: 'about:blank' });
    sessionId = (await send('Target.attachToTarget', { targetId: target.targetId, flatten: true })).sessionId;
    await send('Page.enable'); await send('Runtime.enable');
    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const waitFor = async expression => {
      const until = Date.now() + 8000;
      while (Date.now() < until) {
        if (await evaluate(expression)) return;
        await new Promise(r => setTimeout(r, 50));
      }
      throw new Error(`Condition failed: ${expression}`);
    };
    const click = async selector => {
      const box = await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)}); if(!e)throw Error('Missing control'); e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...box, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...box, button: 'left', clickCount: 1 });
    };
    const viewport = (width, height) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
    const screenshot = async name => {
      const image = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(path.join('.playtest', name + '.png'), Buffer.from(image.data, 'base64'));
    };
    mkdirSync('.playtest', { recursive: true });
    await viewport(1440, 900);
    await send('Page.navigate', { url: `http://localhost:${process.env.PORT || 47100}` });
    await waitFor('document.readyState === "complete" && typeof getBPS === "function"');
    assert.equal(await evaluate('!!document.getElementById("core-ball")'), false);
    await evaluate('state.muted=true;document.getElementById("c").focus()');
    for (let i = 0; i < 15; i++) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    }
    assert.equal(await evaluate('state.totalClicks'), 15);
    await waitFor('document.querySelector("#generators button").getAttribute("aria-disabled") === "false"');
    await click('#generators button');
    assert.equal(await evaluate('getGenCount("dropper")'), 1);
    await click('.claim-goal');
    assert.equal(await evaluate('state.goalsClaimed.first'), true);
    await waitFor('state.balls > 30');
    await evaluate('spawnBall(100,100,{golden:true});updateUI()');
    await click('#golden-catch');
    assert.equal(await evaluate('state.goldenClicks'), 1);
    await screenshot('desktop');
    // Seed later progression to exercise real purchase and confirmation controls.
    await evaluate('state.balls=1e6;state.totalBalls=1e6;state.totalBallsEver=1e6;state.buffs=[];updateUI()');
    await click('[data-tab="skills"]');
    await click('#prestige-btn');
    await waitFor('document.getElementById("prestige-modal-overlay").classList.contains("visible")');
    await click('#prestige-modal-overlay .btn-confirm');
    assert.equal(await evaluate('state.prestiges'), 1);
    assert.equal(await evaluate('state.prestigePoints'), 5);
    assert.equal(await evaluate('canPrestige()'), false);
    await click('[onclick="openSkillTree()"]');
    await click('[onclick="buySkill(\'bpsMulti\')"]');
    assert.equal(await evaluate('skillLevel("bpsMulti")'), 1);
    assert.equal(await evaluate('state.prestigePoints'), 4);
    await evaluate('Array.from(document.querySelectorAll(".skill-node")).find(e=>e.getAttribute("onclick").includes("clickPower")).focus()');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    assert.equal(await evaluate('skillLevel("clickPower")'), 1);
    await click('[onclick="closeSkillTree()"]');
    await evaluate('state.prestiges=3;updateTabLocks()');
    await click('[data-tab="challenges"]');
    await waitFor('activeTab === "challenges"');
    await click('[onclick="openChallengeModal(\'noClick\')"]');
    await click('#challenge-modal-overlay .btn-confirm');
    assert.equal(await evaluate('state.activeChallenge.id'), 'noClick');
    assert.equal(await evaluate('getGenCount("dropper")'), 1);
    assert.ok(await evaluate('getBPS() > 0'));
    // Persist a purchased factory and verify a real reload, including offline grant.
    await evaluate('abandonChallenge();state.generators[0].count=10;state.balls=100;saveGame();state.lastSaveTime=Date.now()-60000;localStorage.setItem(SAVE_KEY,JSON.stringify(state));suppressSave=true');
    await send('Page.reload');
    await waitFor('typeof getBPS === "function" && state.generators[0].count === 10');
    await waitFor('document.getElementById("welcome-modal-overlay").classList.contains("visible")');
    assert.ok(await evaluate('state.balls > 100'));
    await click('#welcome-modal-overlay .btn-confirm');
    await viewport(390, 844);
    await waitFor('innerWidth === 390');
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'));
    await screenshot('mobile');
    await click('[onclick="setBuyAmount(-1)"]');
    const before = await evaluate('getGenCount("dropper")');
    await click('#generators button');
    assert.ok(await evaluate('getGenCount("dropper")') > before);
    for (const tab of ['upgrades', 'skills', 'achievements', 'stats', 'generators']) {
      await click(`[data-tab="${tab}"]`);
      assert.equal(await evaluate('activeTab'), tab);
      if (tab === 'skills') {
        await click('[onclick="openSkillTree()"]');
        const point = await evaluate('(() => {const e=Array.from(document.querySelectorAll(".skill-node")).find(e=>e.getAttribute("onclick").includes("clickPower"));e.scrollIntoView();const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await waitFor('skillLevel("clickPower") === 2');
        assert.ok(await evaluate('!document.getElementById("skill-tooltip").style.left.includes("NaN")'));
        await click('[onclick="closeSkillTree()"]');
      }
    }
    assert.deepEqual(errors, []);
    console.log('PASS: original playfield, keyboard taps, purchases, goals, golden events, prestige, skill purchases, challenges, save/reload, offline income, mobile layout, MAX, and all tabs. No browser errors.');
    console.log('Screenshots: .playtest/desktop.png and .playtest/mobile.png');
  } finally {
    if (socket) socket.close();
    if (chrome.pid && chrome.exitCode === null && chrome.signalCode === null) {
      chrome.kill('SIGTERM');
      await new Promise(resolve => chrome.once('exit', resolve));
    }
    rmSync(profile, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
