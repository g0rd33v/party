// Party — pixel identicon avatar.
//
// 5×5 symmetric grid (mirrored left-right), single foreground color picked from
// a fixed party palette. Everything derived deterministically from the seed hex,
// so a given passkey always renders the same face.
//
// Seed byte mapping:
//   byte 0 → color index (8 colors)
//   bytes 1–2 → 15-bit pattern for the left half (cols 0..2 × rows 0..4), mirrored

const COLORS = [
  '#ff6ba8', // hot pink
  '#5eb8ff', // sky blue
  '#6be0a8', // mint
  '#ffd84a', // sunny yellow
  '#ff9255', // coral
  '#b489ff', // lavender
  '#ff5757', // red
  '#4ade80', // green
]

const GRID = 5
const CELL = 96 / GRID  // 19.2, rendered crisp via shape-rendering

export function avatarSvg(seedHex) {
  const s = (seedHex && seedHex.length >= 6) ? seedHex : '0'.repeat(32)

  const color = COLORS[parseInt(s.slice(0, 2), 16) % COLORS.length]
  const hi = parseInt(s.slice(2, 4), 16)
  const lo = parseInt(s.slice(4, 6), 16)

  // 16 bits total; we use 15 for a 3-wide × 5-tall half-grid
  const bits = new Array(15)
  for (let i = 0; i < 8; i++) bits[i] = (hi >> (7 - i)) & 1
  for (let i = 0; i < 7; i++) bits[8 + i] = (lo >> (7 - i)) & 1

  let cells = ''
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < 3; col++) {
      if (!bits[row * 3 + col]) continue
      const y = row * CELL
      cells += `<rect x="${col * CELL}" y="${y}" width="${CELL}" height="${CELL}" fill="${color}"/>`
      if (col < 2) {
        const mirrorX = (GRID - 1 - col) * CELL
        cells += `<rect x="${mirrorX}" y="${y}" width="${CELL}" height="${CELL}" fill="${color}"/>`
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" shape-rendering="crispEdges">` +
    `<rect width="96" height="96" fill="var(--avatar-bg, #151515)"/>` +
    cells +
    `</svg>`
}
