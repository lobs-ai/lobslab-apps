const fs = require('fs');

function extractGameJS() {
  const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

  // Find the main script block (first <script> to last </script>)
  // The template literals inside use <scr${''}ipt> escape so they won't
  // match these plain searches.
  const scriptStart = html.indexOf('<script>') + '<script>'.length;
  const scriptEnd = html.lastIndexOf('</script>');

  let js = html.substring(scriptStart, scriptEnd);

  // Comment out init() call at the end so it doesn't run during tests
  js = js.replace(/^init\(\);$/m, '// init(); // disabled for testing');

  // Disable requestAnimationFrame scheduling
  js = js.replace(/requestAnimationFrame\(gameLoop\)/g, '// requestAnimationFrame(gameLoop)');

  // Add module exports for testing
  js += `
// Test exports
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatNum,
    formatTime,
    getDefaultState,
    getBPS,
    getClickValue,
    getGenCost,
    getMaxBuyable,
    isGenUnlocked,
    canPrestige,
    getPrestigeThreshold,
    getPrestigeReward,
    skillLevel,
    skillCost,
    totalSkillLevels,
    getGenCount,
    genTypesOwned,
    getGenBPS,
    getRawBPS,
    SKILL_DEFS,
    TIER_REQS,
    GEN_MILESTONES,
    ACHIEVEMENTS,
    CHALLENGE_DEFS,
  };
}
`;

  return js;
}

if (require.main === module) {
  const js = extractGameJS();
  fs.writeFileSync(__dirname + '/game-extracted.js', js);
  console.log('Extracted game JS to game-extracted.js');
}

module.exports = { extractGameJS };
