// Party — Twemoji avatar.
//
// Uses Twitter's open-source emoji set (Twemoji) served from cdnjs. Every device
// renders the exact same glyph regardless of OS or browser — Apple, Android,
// Windows, Linux, all see the same thing.
//
// Deterministic pick from a curated 280-emoji list (Unicode ≤ 13).
// Locked order — never reorder; existing seeds must keep resolving to the same
// emoji across deploys.

const TWEMOJI_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/'

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

// Emoji char(s) → Twemoji filename (hex codepoints joined with '-', VS16 stripped)
function emojiToUrl(emoji) {
  const codes = []
  for (const ch of emoji) {
    const cp = ch.codePointAt(0)
    if (cp === 0xFE0F) continue  // strip emoji variation selector
    codes.push(cp.toString(16))
  }
  return `${TWEMOJI_CDN}${codes.join('-')}.svg`
}

export function avatarSvg(seedHex) {
  const idx = seedHex && seedHex.length >= 2
    ? parseInt(seedHex.slice(0, 2), 16) % EMOJIS.length
    : 0
  const url = emojiToUrl(EMOJIS[idx])
  return `<div class="emoji-avatar"><img src="${url}" alt="" loading="lazy" draggable="false"></div>`
}
