// Party — pixel emoji avatar renderer.
// 6 head colors × 6 hair × 6 eyes × 6 noses × 6 mouths × 6 accessories = 46,656 faces.
// Deterministic from seed hex (first 12 hex chars are used).

const COLORS = [
  '#ff6ba8', // hot pink
  '#5eb8ff', // sky blue
  '#6be0a8', // mint
  '#ffd84a', // sunny yellow
  '#ff9255', // coral
  '#b489ff', // lavender
]

const HAIR = [
  `<path d="M 12 30 Q 12 14 48 11 Q 84 14 84 30 L 84 34 L 12 34 Z" fill="#2a1f1a"/>`,
  `<path d="M 10 30 Q 10 10 48 9 Q 86 10 86 30 L 86 62 L 74 62 L 74 34 L 22 34 L 22 62 L 10 62 Z" fill="#2a1f1a"/>`,
  `<g fill="#2a1f1a"><circle cx="22" cy="22" r="10"/><circle cx="36" cy="14" r="10"/><circle cx="50" cy="11" r="10"/><circle cx="64" cy="14" r="10"/><circle cx="76" cy="22" r="10"/><rect x="14" y="22" width="68" height="12"/></g>`,
  `<g fill="#2a1f1a"><polygon points="14,34 24,10 32,34"/><polygon points="30,34 42,6 50,34"/><polygon points="46,34 58,6 66,34"/><polygon points="62,34 72,10 82,34"/></g>`,
  ``,
  `<g fill="#2a1f1a"><rect x="40" y="10" width="16" height="26"/><polygon points="40,10 56,10 52,2 44,2"/></g>`,
]

const EYES = [
  `<rect x="32" y="42" width="4" height="5" fill="#2a1f1a"/><rect x="60" y="42" width="4" height="5" fill="#2a1f1a"/>`,
  `<rect x="28" y="40" width="10" height="10" fill="#fff"/><rect x="31" y="42" width="5" height="6" fill="#2a1f1a"/><rect x="58" y="40" width="10" height="10" fill="#fff"/><rect x="61" y="42" width="5" height="6" fill="#2a1f1a"/>`,
  `<path d="M 28 46 Q 34 40 40 46" stroke="#2a1f1a" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M 56 46 Q 62 40 68 46" stroke="#2a1f1a" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  `<g fill="#2a1f1a"><rect x="30" y="41" width="10" height="2" transform="rotate(45 35 42)"/><rect x="30" y="41" width="10" height="2" transform="rotate(-45 35 42)"/><rect x="58" y="41" width="10" height="2" transform="rotate(45 63 42)"/><rect x="58" y="41" width="10" height="2" transform="rotate(-45 63 42)"/></g>`,
  `<g fill="#ffdc4a" stroke="#2a1f1a" stroke-width="1"><polygon points="34,38 35.5,43 40,43 36,46 38,51 34,48 30,51 32,46 28,43 32.5,43"/><polygon points="62,38 63.5,43 68,43 64,46 66,51 62,48 58,51 60,46 56,43 60.5,43"/></g>`,
  `<g fill="#ff3a70"><path d="M 34 49 L 28 43 Q 27 39 31 39 Q 34 39 34 42 Q 34 39 37 39 Q 41 39 40 43 Z"/><path d="M 62 49 L 56 43 Q 55 39 59 39 Q 62 39 62 42 Q 62 39 65 39 Q 69 39 68 43 Z"/></g>`,
]

const NOSE = [
  `<rect x="47" y="55" width="2" height="2" fill="#2a1f1a" opacity="0.55"/>`,
  `<rect x="47" y="52" width="2" height="6" fill="#2a1f1a" opacity="0.5"/>`,
  `<polygon points="48,52 45,58 51,58" fill="#2a1f1a" opacity="0.55"/>`,
  ``,
  `<path d="M 45 53 Q 48 60 51 53" stroke="#2a1f1a" stroke-width="1.5" fill="none" opacity="0.55" stroke-linecap="round"/>`,
  `<rect x="45" y="56" width="2" height="2" fill="#2a1f1a" opacity="0.55"/><rect x="49" y="56" width="2" height="2" fill="#2a1f1a" opacity="0.55"/>`,
]

const MOUTH = [
  `<path d="M 38 66 Q 48 74 58 66" stroke="#2a1f1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
  `<path d="M 36 64 Q 48 76 60 64 Z" fill="#2a1f1a"/><rect x="40" y="65" width="16" height="3" fill="#fff"/>`,
  `<ellipse cx="48" cy="68" rx="4" ry="5" fill="#2a1f1a"/>`,
  `<path d="M 38 64 Q 48 71 58 64" stroke="#2a1f1a" stroke-width="2.5" fill="none" stroke-linecap="round"/><ellipse cx="52" cy="70" rx="3" ry="4" fill="#ff3a70"/>`,
  `<rect x="40" y="66" width="16" height="2.5" fill="#2a1f1a" rx="1"/>`,
  `<polyline points="38,66 42,64 46,68 50,64 54,68 58,66" stroke="#2a1f1a" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
]

const ACCESSORY = [
  `<g><polygon points="48,2 36,22 60,22" fill="#ff3a70"/><circle cx="48" cy="2" r="3.5" fill="#ffdc4a"/><rect x="40" y="12" width="16" height="2" fill="#ffdc4a"/></g>`,
  `<g><rect x="22" y="40" width="22" height="10" fill="#151515" rx="2"/><rect x="52" y="40" width="22" height="10" fill="#151515" rx="2"/><rect x="44" y="43" width="8" height="2" fill="#151515"/><rect x="26" y="42" width="6" height="2" fill="#444" opacity="0.7"/><rect x="56" y="42" width="6" height="2" fill="#444" opacity="0.7"/></g>`,
  `<g fill="#ffdc4a" stroke="#2a1f1a" stroke-width="1"><polygon points="18,28 26,12 34,24 40,8 48,24 56,8 62,24 70,12 78,28"/><rect x="18" y="26" width="60" height="5"/><circle cx="30" cy="17" r="2" fill="#ff3a70"/><circle cx="48" cy="14" r="2" fill="#5eb8ff"/><circle cx="66" cy="17" r="2" fill="#6be0a8"/></g>`,
  `<g><path d="M 22 42 Q 26 34 34 36 Q 44 36 48 44 Q 52 36 62 36 Q 70 34 74 42 Q 74 48 64 50 Q 54 50 48 46 Q 42 50 32 50 Q 22 48 22 42 Z" fill="#8a3dff" stroke="#2a1f1a" stroke-width="1"/><rect x="32" y="42" width="4" height="4" fill="#151515"/><rect x="60" y="42" width="4" height="4" fill="#151515"/></g>`,
  `<g><path d="M 14 48 Q 14 10 48 10 Q 82 10 82 48" stroke="#2a1f1a" stroke-width="4" fill="none"/><rect x="8" y="40" width="14" height="22" rx="3" fill="#ff3a70"/><rect x="74" y="40" width="14" height="22" rx="3" fill="#ff3a70"/></g>`,
  ``,
]

// Pad seed to at least 32 hex chars and extract 6 attribute indices.
function seedBytes(seedHex) {
  let s = (seedHex || '').toLowerCase()
  if (s.length < 32) s = s + '0'.repeat(32 - s.length)
  return [
    parseInt(s.slice(0, 2), 16) % 6,
    parseInt(s.slice(2, 4), 16) % 6,
    parseInt(s.slice(4, 6), 16) % 6,
    parseInt(s.slice(6, 8), 16) % 6,
    parseInt(s.slice(8, 10), 16) % 6,
    parseInt(s.slice(10, 12), 16) % 6,
  ]
}

let renderCounter = 0

export function avatarSvg(seedHex) {
  const [cIdx, hIdx, eIdx, nIdx, mIdx, aIdx] = seedBytes(seedHex)

  const headColor = COLORS[cIdx]
  const bgHue = (cIdx * 60 + 20) % 360
  const bg = `hsl(${bgHue}, 30%, 13%)`

  // Unique clip id per render (multiple avatars in DOM mustn't share it)
  renderCounter += 1
  const clipId = `hc-${renderCounter}-${(seedHex || '').slice(0, 6)}`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">` +
    `<defs><clipPath id="${clipId}"><circle cx="48" cy="48" r="38"/></clipPath></defs>` +
    `<rect width="96" height="96" fill="${bg}"/>` +
    `<circle cx="48" cy="48" r="38" fill="${headColor}"/>` +
    `<g clip-path="url(#${clipId})">${HAIR[hIdx]}</g>` +
    EYES[eIdx] + NOSE[nIdx] + MOUTH[mIdx] + ACCESSORY[aIdx] +
    `</svg>`
}
