// Party — avatar renderer.
//
// Two visual classes, dispatched by the `-bot` handle suffix:
//
//   Humans → native system emoji (Apple on iOS, Noto on Android, Segoe on
//            Windows, Twemoji Mozilla on Firefox/Linux). Each platform's
//            familiar glyphs, no CDN dependency, no network.
//
//   Bots   → Gravatar identicon — the colorful geometric-block images
//            Gravatar has served unchanged since 2007. CDN-backed, consistent
//            across every device. We pass the agent's avatar seed (32 hex
//            chars, deterministic from the agent secret) as the Gravatar hash
//            and force the identicon fallback via `f=y`, so no real user
//            profile ever leaks through.
//
// The suffix check is local — no identity.js dependency to keep this module
// usable from anywhere. Both paths return a <div class="..."> wrapper; the
// parent container sets width/height and clips to a circle via border-radius.

const GRAVATAR_BASE = 'https://www.gravatar.com/avatar/'

// Handle suffix check. No import from identity.js — keeps this leaf-level.
function isBotHandle(handle) {
  return typeof handle === 'string' && handle.endsWith('-bot')
}

// --- Emoji list (human avatars) ----------
// Locked order — existing seeds must keep resolving to the same emoji across
// deploys. Unicode ≤ 13 for broad render support.

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

// Gravatar expects a 32-char hex hash. Our avatar seeds are already exactly
// that (first 16 bytes of SHA-256, hex-encoded). `f=y` forces the identicon
// fallback regardless of whether the hash matches any real Gravatar user.
function gravatarUrl(seed32) {
  const hash = (seed32 || '').padEnd(32, '0').slice(0, 32)
  return `${GRAVATAR_BASE}${hash}?d=identicon&s=200&f=y`
}

export function avatarSvg(seedHex, handle) {
  if (isBotHandle(handle)) {
    return `<div class="gravatar-avatar"><img src="${gravatarUrl(seedHex)}" alt="" loading="lazy" draggable="false"></div>`
  }
  const idx = seedHex && seedHex.length >= 2
    ? parseInt(seedHex.slice(0, 2), 16) % EMOJIS.length
    : 0
  return `<div class="emoji-avatar">${EMOJIS[idx]}</div>`
}
