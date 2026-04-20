// Party — native system emoji avatars.
//
// Each platform renders its own native emoji set via the system font:
//   iOS / macOS  → Apple Color Emoji
//   Android      → Noto Color Emoji
//   Windows      → Segoe UI Emoji
//   Firefox/Linux → Twemoji Mozilla (Firefox's built-in fallback)
//
// Everyone sees the emoji style they're used to on their own device.
// No CDN, no network dependency, nothing to go wrong.
//
// Deterministic pick from a locked 280-emoji list (Unicode ≤ 13 for broad support).

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
