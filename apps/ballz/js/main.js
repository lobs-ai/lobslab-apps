  if (state.activeChallenge?.noClick) return;

  state.totalClicks++;

  // Check leecher clicks
  for (let i = state.leechers.length - 1; i >= 0; i--) {
    const l = state.leechers[i];
    const dx = mx - l.x;
    const dy = my - l.y;
    if (dx*dx + dy*dy < (l.r + 15) * (l.r + 15)) {
      const leecher_mult = 1.15 + skillLevel('leecher') * 0.2;
      const gain = Math.floor(l.totalDrained * leecher_mult);
      state.balls += gain;
      state.totalBalls += gain;
      state.totalBallsEver += gain;
      state.leechersPopped = (state.leechersPopped || 0) + 1;
      spawnFloatingText(l.x, l.y, '+' + formatNum(gain) + ' 🦠 POPPED!', '#cc44ff');
      state.leechers.splice(i, 1);
      showToast(`🦠 Leecher popped! +${formatNum(gain)} balls!`, 'reward', '🦠');
      return; // don't also click a ball
    }
  }

  // Check if clicked on a ball
  let clickedBall = null;
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];
    const dx = mx - b.x;
    const dy = my - b.y;
    if (dx * dx + dy * dy < (b.r + 10) * (b.r + 10)) {
      clickedBall = b;
      balls.splice(i, 1);
      break;
    }
  }

  let value = getClickValue();
  let extra = '';

  if (clickedBall) {
    // Combo
    state.combo = Math.min(20 + skillLevel('maxCombo') * 20, state.combo + 1);
    state.comboTimer = 3 + skillLevel('comboSustain');
    if (state.combo > state.highestCombo) state.highestCombo = state.combo;

    // Golden ball
    if (clickedBall.golden) {
      const goldenMulti = state.challengeCompleted?.darkModeReward ? 200 : 100;
      value = Math.max(100, Math.floor(getBPS() * 10)) * goldenMulti;
      extra = ' GOLDEN!';
      state.goldenClicks++;

      // Golden Frenzy skill
      if (skillLevel('goldenFrenzy') > 0) {
        const dur = skillLevel('goldenFrenzy') * 5000;
        state.goldenFrenzyUntil = Math.max(state.goldenFrenzyUntil, Date.now()) + dur;
      }
    }

    // Overflow ball
    if (clickedBall.overflow) {
      value = Math.max(1000, Math.floor(getBPS() * 30));
      extra = ' OVERFLOW!';
    }

    // Rush ball
    if (clickedBall.rush || rushActive) {
      value *= 10;
      extra = ' RUSH!';
    }

    // Ball Magnetism bonus already in getClickValue

    // Explosion upgrade
    if (state.upgrades.find(u => u.id === 'explosion')?.bought) {
      for (let j = 0; j < 3; j++) {
        spawnBall(clickedBall.x, clickedBall.y, { vy: -3 + Math.random() * -3 });
      }
    }

    // Cascade Click skill
    const cascadeLevel = skillLevel('cascadeClick');
    if (cascadeLevel > 0) {
      for (let j = 0; j < cascadeLevel; j++) {
        spawnBall(clickedBall.x + (Math.random()-0.5)*30, clickedBall.y, { vy: -2 + Math.random() * -2 });
      }
    }
  }

  state.balls += value;
  state.totalBalls += value;
  state.totalBallsEver += value;

  // Always spawn a visual ball on click
  if (!clickedBall) {
    spawnBall(mx, my, { vy: -2 - Math.random() * 3 });
  }

  spawnFloatingText(mx, my, '+' + formatNum(value) + extra, clickedBall?.golden ? '#ffd700' : clickedBall?.overflow ? '#ff4444' : '#ffd93d');
});

// ── Visibility ──
document.addEventListener('visibilitychange', () => {
  tabFocused = !document.hidden;
});

// ══════════════════════════════════════════════════════
//  GAME LOOP
// ══════════════════════════════════════════════════════

let lastTime = performance.now();
let saveTimer = 0;
let uiUpdateTimer = 0;
let achievementCheckTimer = 0;
let rushCheckTimer = 0;

function gameLoop(timestamp) {
 try {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.1); // cap dt
  lastTime = timestamp;

  const now = Date.now();
  const bps = getBPS();

  // Track highest BPS
  if (bps > state.highestBPS) state.highestBPS = bps;

  // ── Production ──
  let production = bps * dt;

  // Idle efficiency (tab unfocused)
  if (!tabFocused) {
    const idleLevel = skillLevel('idleEfficiency');
    if (idleLevel > 0) {
      production *= (0.5 + idleLevel * 0.1);
    } else {
      production *= 0.1; // tiny amount when unfocused without skill
    }
  }

  // Lucky Drops
  const luckyLevel = skillLevel('luckyDrops');
  if (luckyLevel > 0) {
    tickAccumulator += dt;
    while (tickAccumulator >= 1) {
      tickAccumulator -= 1;
      if (Math.random() < luckyLevel * 0.05) {
        production += bps; // double for this tick
      }
    }
  }

  state.balls += production;
  state.totalBalls += production;
  state.totalBallsEver += production;

  // ── Ball Alchemy ──
  const alchemyLevel = skillLevel('ballAlchemy');
  if (alchemyLevel > 0) {
    alchemyTimer += dt;
    while (alchemyTimer >= 1) {
      alchemyTimer -= 1;
      if (Math.random() < 0.01 * alchemyLevel) {
        const convert = state.balls * 0.01 * alchemyLevel;
        if (convert > 0) {
          state.alchemyBPS += convert * 0.001; // small permanent BPS boost
        }
      }
    }
  }

  // ── Dimension Hopper ──
  const hopLevel = skillLevel('dimensionHopper');
  if (hopLevel > 0) {
    if (now - state.lastDimensionHop >= 300000) { // 5 minutes
      const burst = bps * 30 * hopLevel;
      state.balls += burst;
      state.totalBalls += burst;
      state.totalBallsEver += burst;
      state.lastDimensionHop = now;
      showToast(`🚀 Dimension Hop! +${formatNum(burst)} balls`, 'reward', '🚀');
    }
  }

  // ── Combo timer ──
  if (state.comboTimer > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) {
      state.combo = 1;
      state.comboTimer = 0;
    }
  }

  // ── Ball Frenzy ──
  const frenzyLevel = skillLevel('ballFrenzy');
  if (frenzyLevel > 0) {
    frenzyTimer += dt;
    const frenzyInterval = 60;
    let frenzyDuration = 10;
    if (state.challengeCompleted?.frenzyReward) frenzyDuration *= 1.5;

    if (!frenzyActive && frenzyTimer >= frenzyInterval) {
      frenzyActive = true;
      frenzyTimer = 0;
      showToast(`🎉 Ball Frenzy! ${frenzyLevel * 5}× production for ${frenzyDuration}s!`, 'event', '🎉');
    }
    if (frenzyActive && frenzyTimer >= frenzyDuration) {
      frenzyActive = false;
      frenzyTimer = 0;
    }
  }

  // ── Auto Clicker ──
  const autoLevel = skillLevel('autoClicker');
  if (autoLevel > 0) {
    let interval = 3 - (autoLevel - 1) * 0.4;
    if (state.challengeCompleted?.noClickReward) interval /= 3;
    if (hasResearch('infiniteLoop')) interval /= 2;
    interval = Math.max(0.3, interval);

    autoClickTimer += dt;
    if (autoClickTimer >= interval) {
      autoClickTimer = 0;
      const val = getClickValue();
      state.balls += val;
      state.totalBalls += val;
      state.totalBallsEver += val;

      // Auto-click spawns ball
      const x = Math.random() * W;
      spawnBall(x, H * 0.3 + Math.random() * H * 0.4);
    }
  }

  // ── Ball Rush ──
  rushCheckTimer += dt;
  if (rushCheckTimer >= 5) {
    rushCheckTimer = 0;
    if (!rushActive && now - state.lastRushTime >= getRushInterval()) {
      startBallRush();
    }
  }

  if (rushActive) {
    if (now >= rushEndTime) {
      endBallRush();
    } else {
      // Spawn extra rush balls
      if (Math.random() < 0.3) {
        spawnBall(Math.random() * W, -10, { rush: true, vy: 2 + Math.random() * 3, r: 10 + Math.random() * 6 });
      }
    }
    // Update rush timer
    const timerEl = document.getElementById('rush-timer');
    if (timerEl) timerEl.textContent = Math.ceil((rushEndTime - now) / 1000);
  }

  // ── Leecher spawning & drain ──
  if (bps >= 1e6 && state.leechers.length < 10) {
    leecher_spawn_timer += dt;
    const spawnInterval = 180; // 3 minutes
    if (leecher_spawn_timer >= spawnInterval) {
      leecher_spawn_timer = 0;
      spawnLeecher();
    }
  } else if (bps < 1e6) {
    leecher_spawn_timer = 0;
  }
  // Drain leechers (use raw BPS for drain calculation)
  if (state.leechers.length > 0) {
    const drainRate = 0.03 + skillLevel('leecher') * 0.05;
    for (const leecher of state.leechers) {
      leecher.totalDrained += bps * drainRate * dt;
    }
  }

  // ── Ball Nova ──
  const ballNovaLevel = skillLevel('ballNova');
  if (ballNovaLevel > 0) {
    if (now - state.lastBallNova >= 300000) { // 5 minutes
      const novaBurst = bps * 7200 * ballNovaLevel; // 2 hours per level
      state.balls += novaBurst;
      state.totalBalls += novaBurst;
      state.totalBallsEver += novaBurst;
      state.lastBallNova = now;
      showToast(`💫 Ball Nova! +${formatNum(novaBurst)} balls (${ballNovaLevel * 2}h production)`, 'reward', '💫');
    }
  }

  // ── Challenge check ──
  if (state.activeChallenge) {
    checkChallengeCompletion();
  }

  // ── Spawn visual balls from generators ──
  const totalBPS = bps;
  // Spawn rate: always some ambient balls, scales with BPS
  const baseSpawnRate = 0.5; // ambient balls even at 0 BPS
  const bpsSpawnRate = Math.min(3, totalBPS / 500);
  const spawnRate = Math.max(baseSpawnRate, bpsSpawnRate);
  if (Math.random() < spawnRate * dt) {
    // Challenge: no special balls
    const noSpecial = state.activeChallenge?.noSpecialBalls;

    let isGolden = false;
    let isOverflow = false;
    let isAntiGrav = false;

    if (!noSpecial) {
      // Golden chance
      let goldenChance = (state.upgrades.find(u => u.id === 'golden')?.bought ? 0.01 : 0) + skillLevel('goldenChance') * 0.01;
      if (skillLevel('goldenAge') > 0) goldenChance *= 5;
      isGolden = Math.random() < goldenChance;

      // Overflow balls
      if (state.overflowActive) {
        const overflowChance = 0.005 * (1 + skillLevel('overflowMastery'));
        isOverflow = Math.random() < overflowChance;
      }

      // Anti-gravity balls (research)
      if (hasResearch('antiGravBalls')) {
        isAntiGrav = !isGolden && !isOverflow && Math.random() < 0.03;
      }
    }

    spawnBall(null, null, {
      golden: isGolden,
      overflow: isOverflow,
      antiGrav: isAntiGrav,
    });
  }

  // ── Research progress ──
  processResearchCompletion();

  // ── UI Updates (throttled) ──
  uiUpdateTimer += dt;
  if (uiUpdateTimer >= 0.25) {
    uiUpdateTimer = 0;
    updateUI();
  }

  // ── Achievement check (every 2s) ──
  achievementCheckTimer += dt;
  if (achievementCheckTimer >= 2) {
    achievementCheckTimer = 0;
    checkAchievements();
  }

  // ── Save (every 15s) ──
  saveTimer += dt;
  if (saveTimer >= 15) {
    saveTimer = 0;
    saveGame();
  }

  // ── Physics & Render ──
  updatePhysics(dt);
  render();

 } catch(err) {
  console.error('Game loop error:', err);
 }
  requestAnimationFrame(gameLoop);
}

function updateUI() {
  document.getElementById('ball-count').textContent = formatNum(state.balls);
  const bps = getBPS();
  document.getElementById('bps').textContent = formatNum(bps);
  document.getElementById('combo').textContent = 'x' + state.combo;

  // Overflow flash
  const bpsEl = document.getElementById('bps');
  if (state.overflowActive) {
    bpsEl.classList.add('overflow-flash');
  } else {
    bpsEl.classList.remove('overflow-flash');
  }

  // BPS label with boost indicator
  const label = document.getElementById('bps-label');
  const boosts = [];
  if (Date.now() < state.doubleProdUntil) boosts.push('2×');
  if (Date.now() < state.goldenFrenzyUntil) boosts.push('GF');
  if (frenzyActive) boosts.push('🎉');
  label.textContent = 'Per Second' + (boosts.length ? ' ' + boosts.join(' ') : '');

  // Update tab locks
  updateTabLocks();

  // Update active tab content (lightweight updates)
  if (activeTab === 'generators') { renderGenerators(); renderMilestones(); }
  if (activeTab === 'stats') renderStats();
  if (activeTab === 'research') renderResearch();
  if (activeTab === 'challenges' && state.activeChallenge) renderChallenges();
  if (activeTab === 'minigames') { renderBallRushInfo(); }
}

// ══════════════════════════════════════════════════════

//  INITIALIZATION
// ══════════════════════════════════════════════════════

function init() {
  resize();
  loadGame();
  updateTabLocks();
  renderActiveTab();

  // Start game loop
  requestAnimationFrame(gameLoop);
}

init();
