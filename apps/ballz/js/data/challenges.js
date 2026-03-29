// ── Challenge definitions ──
const CHALLENGE_DEFS = [
  { id: 'speedRun',  name: '⚡ Speed Run',   desc: 'Reach 10K balls in under 5 minutes', restriction: 'Timer: 5 minutes', goal: 10000, timeLimit: 300, reward: 'Permanent +50% BPS', rewardId: 'speedRunReward' },
  { id: 'noClick',   name: '🚫 No Click',    desc: 'Reach 100K balls without clicking',  restriction: 'Clicking disabled', goal: 100000, noClick: true, reward: 'Auto-clicker 3× faster', rewardId: 'noClickReward' },
  { id: 'minimalist',name: '🎯 Minimalist',  desc: 'Reach 1M balls with max 3 gen types',restriction: 'Max 3 generator types', goal: 1000000, maxGenTypes: 3, reward: '+100% to top 3 generators', rewardId: 'minimalistReward' },
  { id: 'inflation', name: '📈 Inflation',   desc: 'Reach 1M balls with 10× costs',      restriction: 'All costs ×10', goal: 1000000, costMulti: 10, reward: 'Permanent 20% cost reduction', rewardId: 'inflationReward' },
  { id: 'frenzy',    name: '🎉 Frenzy',      desc: 'Reach 5M balls with 5× gen costs',   restriction: 'Frenzy always active, gen costs 5×', goal: 5000000, frenzyAlways: true, costMulti: 5, reward: 'Frenzy duration +50%', rewardId: 'frenzyReward' },
  { id: 'darkMode',  name: '🌑 Dark Mode',   desc: 'Reach 500K with no golden/overflow',  restriction: 'No golden or overflow balls', goal: 500000, noSpecialBalls: true, reward: 'Golden balls give 200× instead of 100×', rewardId: 'darkModeReward' },
];

