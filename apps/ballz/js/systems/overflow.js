//  OVERFLOW CHECK
// ══════════════════════════════════════════════════════

function checkOverflow() {
  if (state.overflowActive) return;
  const totalGens = state.generators.reduce((a, g) => a + g.count, 0);
  const threshold = 500;
  if (totalGens >= threshold && !state.overflowUnlocked) {
    state.overflowUnlocked = true;
    state.overflowActive = true;
    const banner = document.getElementById('overflow-banner');
    banner.style.display = 'block';
    document.getElementById('c').classList.add('overflow-active');
    setTimeout(() => { banner.style.display = 'none'; }, 4000);
    showToast('⚠️ OVERFLOW DETECTED! Reality is destabilizing! New content unlocked!', 'event', '⚠️');
  }
}

// ══════════════════════════════════════════════════════
