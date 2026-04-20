// Party — emoji-based avatar (placeholder; we'll return to our own avatar system later).
// Deterministic pick from a curated 256-emoji set (Unicode ≤ 13 for broad iOS support).
// Call sites kept using the name `avatarSvg` — function now returns an HTML snippet.

// Locked order — never reorder or remove; existing seeds must keep producing the same face.
// 32 rows × 8 = 256 emoji, all unique.
const EMOJIS = [
  // Happy & cat faces
  '😀','😃','😁','😊','🙂','🤩','🥰','😘',
  '😎','🤓','🥳','🤗','🤠','😺','😸','😻',
  // Symbols & fantasy
  '🙈','🙉','🙊','👻','👽','🤖','🦄','🐉',
  // Dogs, cats, foxes
  '🐶','🐱','🦊','🦝','🐺','🐈','🦁','🐯',
  // Bears & primates
  '🐻','🐼','🐨','🦍','🦧','🐒','🐵','🦥',
  // Small mammals
  '🐭','🐹','🐰','🐇','🦦','🦨','🦡','🦔',
  // Farm animals
  '🐮','🐷','🐽','🐑','🐐','🐴','🦓','🐗',
  // Wild mammals
  '🦒','🐫','🦙','🐘','🦏','🦛','🦬','🦌',
  // Birds
  '🐔','🐣','🐤','🐥','🐦','🐧','🕊','🦆',
  '🦅','🦉','🦜','🦚','🦢','🦩','🦃','🐓',
  // Sea creatures
  '🐟','🐠','🐡','🦈','🐬','🐳','🐋','🦭',
  '🐙','🦑','🦐','🦞','🦀','🐚','🪸','🪼',
  // Reptiles, amphibians, dinos
  '🐢','🦎','🐍','🐊','🐸','🦖','🦕','🐲',
  // Bugs
  '🐝','🐞','🦋','🐛','🐌','🐜','🕷','🦗',
  // Trees & plants
  '🌵','🌲','🌳','🌴','🎄','🪴','🌱','🌿',
  '🍀','🍃','🌾','🌷','🌹','🥀','🌺','🌻',
  // Flowers & other plants
  '🌼','🌸','💐','🍄','🌰','🎍','🌽','🌶',
  // Fruits
  '🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓',
  '🫐','🍒','🍑','🥭','🍍','🥥','🥝','🍅',
  // Veggies
  '🫒','🥑','🍆','🥔','🥕','🫑','🥒','🥦',
  '🧄','🧅','🥬','🥜','🫘','🫛','🧈','🍠',
  // Prepared food
  '🥐','🥖','🫓','🥯','🧇','🧀','🍞','🥞',
  '🍔','🍟','🍕','🌭','🥪','🌮','🌯','🥙',
  '🍳','🥘','🍲','🥟','🍱','🍣','🍤','🍙',
  // Desserts & sweets
  '🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁',
  '🥧','🍭','🍬','🍫','🍮','🍯','🥮','🍢',
  // Drinks
  '🥤','☕','🍵','🧋','🥛','🫖','🧃','🧊',
  // Celebration
  '🎉','🎊','🎁','🎈','🎆','🎇','🧨','✨',
  '🎀','🎃','🎏','🎎','🎐','🪅','🪄','🔮',
  // Music
  '🎵','🎶','🎤','🎧','🎹','🥁','🎺','🎸',
  // Objects & toys
  '💎','👑','🎩','🧢','🎒','🏆','🎯','🎲',
  '🎳','🪁','🎮','🕹','🔭','🎨','🧶','🧩',
  // Sky & weather
  '☀','⭐','🌟','💫','⚡','🔥','🌈','🌙',
  // Sports
  '⚽','🏀','🎾','🏐','⚾','🏈','🥊','⛸',
  // Hearts
  '❤','🧡','💛','💚','💙','💜','🤍','💖',
]

export function avatarSvg(seedHex) {
  const idx = seedHex && seedHex.length >= 2
    ? parseInt(seedHex.slice(0, 2), 16) % EMOJIS.length
    : 0
  return `<div class="emoji-avatar">${EMOJIS[idx]}</div>`
}
