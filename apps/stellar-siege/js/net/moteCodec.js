// Five UTF-16 code units per mote (10 bytes on Lance's binary wire), compared
// with ~60 bytes for JSON. Quarter-pixel positions/velocities are imperceptible
// at the supported map sizes. Stable indices preserve identity after casualties.
const OFFSET = 16384;
export function encodeMotes(motes) {
  let data = '';
  for (let id = 0; id < motes.length; id++) {
    const m = motes[id];
    if (!m.alive) continue;
    data += String.fromCharCode(id + 1, Math.round(m.x * 4) + OFFSET,
      Math.round(m.y * 4) + OFFSET, Math.round(m.vx * 4) + OFFSET,
      Math.round(m.vy * 4) + OFFSET);
  }
  return data;
}
export function decodeMotes(data) {
  const rows = [];
  for (let i = 0; i + 4 < data.length; i += 5) {
    rows.push([data.charCodeAt(i) - 1, (data.charCodeAt(i + 1) - OFFSET) / 4,
      (data.charCodeAt(i + 2) - OFFSET) / 4, (data.charCodeAt(i + 3) - OFFSET) / 4,
      (data.charCodeAt(i + 4) - OFFSET) / 4]);
  }
  return rows;
}
