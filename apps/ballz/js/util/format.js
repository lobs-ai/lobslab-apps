//  HELPER FUNCTIONS
// ══════════════════════════════════════════════════════

function formatNum(n) {
  if (n === Infinity) return '∞';
  if (n !== n) return '0'; // NaN
  if (n < 0) return '-' + formatNum(-n);
  if (n < 1000) return Math.floor(n).toLocaleString();
  const suffixes = [
    '', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No',
    'Dc', 'Ud', 'Dd', 'Td', 'Qad', 'Qid', 'Sxd', 'Spd', 'Ocd', 'Nod',
    'Vg', 'UVg', 'DVg', 'TVg', 'QaVg', 'QiVg', 'SxVg', 'SpVg', 'OcVg', 'NoVg', 'Tg'
  ]; // Tg = 10^93
  // For extremely large numbers beyond suffix list, use scientific notation
  if (!isFinite(n)) return '∞';
  const log = Math.log10(n);
  let tier = Math.floor(log / 3);
  if (tier >= suffixes.length) {
    // Scientific notation fallback for numbers > 10^93
    const exp = Math.floor(log);
    const mantissa = n / Math.pow(10, exp);
    return mantissa.toFixed(2) + 'e' + exp;
  }
  if (tier <= 0) return Math.floor(n).toLocaleString();
  const scaled = n / Math.pow(10, tier * 3);
  return (scaled >= 100 ? Math.floor(scaled) : scaled.toFixed(1)) + suffixes[tier];
}

function formatTime(seconds) {
  if (seconds < 60) return Math.ceil(seconds) + 's';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ' + Math.floor(seconds % 60) + 's';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return d + 'd ' + (h % 24) + 'h';
  }
  return h + 'h ' + m + 'm';
}
