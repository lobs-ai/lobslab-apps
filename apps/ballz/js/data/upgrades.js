// ══════════════════════════════════════════════════════
//  Upgrade Definitions (used when creating default state)
// ══════════════════════════════════════════════════════
window.Ballz = window.Ballz || {};

Ballz.UPGRADE_DEFS = [
  { id: 'clickPow', name: 'Click Power',     desc: '+1 ball per click',             baseCost: 50,    costMul: 2.5, maxLevel: 10 },
  { id: 'genSpeed', name: 'Gen Speed',       desc: '+20% generator output',         baseCost: 200,   costMul: 3,   maxLevel: 10 },
  { id: 'ballVal',  name: 'Ball Value',      desc: '+10% all ball value',           baseCost: 500,   costMul: 3.5, maxLevel: 10 },
  { id: 'comboBonus', name: 'Combo Bonus',   desc: '+5% combo multiplier',          baseCost: 1000,  costMul: 4,   maxLevel: 10 },
  { id: 'offlineProd', name: 'Offline Prod',  desc: '+5% offline production',        baseCost: 2000,  costMul: 3,   maxLevel: 5 },
  { id: 'critChance', name: 'Lucky Click',    desc: '+2% critical click chance',     baseCost: 5000,  costMul: 5,   maxLevel: 5 },
  { id: 'overflowBonus', name: 'Overflow+',   desc: '+10% overflow bonus',           baseCost: 10000, costMul: 4,   maxLevel: 5 },
  { id: 'bulkDiscount', name: 'Bulk Buy',     desc: '-3% bulk purchase costs',       baseCost: 25000, costMul: 5,   maxLevel: 5 }
];
