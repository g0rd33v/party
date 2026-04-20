// Party — identity layer.
// WebAuthn Face ID → deterministic 3-word handle + avatar seed.
// Passkey lives in iCloud Keychain (residentKey: 'required').

import { sha256, b64url } from './util.js'

// --- Word lists ----------
// Locked order: never reorder or modify existing entries; append-only if ever extended.
// 64 sizes × 64 colors × 256 nouns = 1,048,576 handles.

const SIZE_WORDS = [
  'big','tiny','huge','small','giant','mini','tall','short',
  'wide','slim','old','new','fresh','young','quick','slow',
  'fast','swift','lazy','bold','shy','brave','calm','wild',
  'kind','happy','grumpy','jolly','proud','silly','wise','clever',
  'smart','chill','fierce','gentle','loud','quiet','soft','tough',
  'sleek','rough','smooth','sharp','dull','bright','dim','shiny',
  'plain','fancy','noble','humble','cosmic','lucky','sleepy','mighty',
  'tired','eager','zesty','fuzzy','merry','sunny','cheery','nimble',
]

const COLOR_WORDS = [
  'red','blue','green','gold','silver','pink','black','white',
  'purple','orange','yellow','crimson','scarlet','azure','teal','cyan',
  'violet','indigo','magenta','lime','olive','mint','jade','emerald',
  'ruby','amber','coral','pearl','ivory','bronze','copper','rust',
  'brown','tan','cream','beige','rose','peach','plum','lemon',
  'lilac','navy','mauve','cobalt','ochre','sable','honey','snow',
  'frost','ash','slate','smoke','neon','misty','starry','dusky',
  'velvet','glass','steel','clay','mossy','foamy','golden','silky',
]

const NOUNS = [
  'fox','wolf','bear','lion','tiger','deer','elk','moose',
  'horse','zebra','camel','panda','koala','sloth','monkey','lemur',
  'rabbit','hare','mouse','otter','beaver','seal','whale','dolphin',
  'shark','fish','squid','crab','shrimp','turtle','frog','toad',
  'snake','lizard','gecko','newt','bat','eagle','hawk','owl',
  'crow','raven','dove','swan','duck','goose','robin','finch',
  'sparrow','heron','stork','crane','falcon','kite','puffin','parrot',
  'bee','ant','wasp','moth','beetle','spider','cricket','firefly',
  'dragon','phoenix','griffin','unicorn','pegasus','kraken','sphinx','hydra',
  'husky','corgi','terrier','poodle','mustang','raccoon','badger','ferret',
  'apple','moon','star','cloud','wave','storm','flame','stone',
  'lake','river','hill','tree','leaf','seed','root','branch',
  'key','door','book','page','pen','lamp','candle','mirror',
  'cup','bowl','plate','spoon','bed','chair','table','rug',
  'shoe','hat','scarf','glove','ring','crown','sword','shield',
  'arrow','bow','tower','bridge','road','path','trail','map',
  'ship','boat','sail','anchor','wheel','car','bike','kite',
  'drum','flute','bell','song','mask','robe','cape','lantern',
  'compass','telescope','quill','scroll','prism','crystal','gem','jewel',
  'feather','brush','palette','chisel','hammer','anvil','forge','torch',
  'ocean','beach','island','valley','meadow','forest','jungle','desert',
  'canyon','cliff','cave','crater','volcano','glacier','reef','swamp',
  'marsh','pond','creek','stream','cascade','geyser','spring','peak',
  'summit','ridge','slope','gorge','plain','prairie','tundra','savanna',
  'oasis','dune','delta','lagoon','bay','cove','harbor','fjord',
  'atoll','mesa','grove','thicket','fern','vine','bloom','petal',
  'mango','peach','plum','pear','grape','cherry','lemon','lime',
  'melon','orange','banana','olive','wheat','rice','bread','honey',
  'sugar','butter','cheese','pepper','basil','thyme','sage','clove',
  'ginger','cocoa','coffee','wine','milk','cream','berry','tomato',
  'onion','garlic','pasta','noodle','biscuit','muffin','waffle','donut',
  'pretzel','pickle','cookie','pancake','pizza','taco','barley','maple',
]

// URL / message validation regex — any 3-word lowercase-hyphen handle
export const HANDLE_RE = /^[a-z]{2,10}-[a-z]{2,10}-[a-z]{2,12}$/

// --- Derivation ----------

export async function deriveHandle(credentialIdBuf) {
  const h = await sha256(credentialIdBuf)
  return [
    SIZE_WORDS[h[0] % SIZE_WORDS.length],
    COLOR_WORDS[h[1] % COLOR_WORDS.length],
    NOUNS[h[2] % NOUNS.length],
  ].join('-')
}

export async function deriveAvatarSeed(credentialIdBuf) {
  const h = await sha256(credentialIdBuf)
  return Array.from(h.slice(0, 16))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// --- Persistence ----------

const LS_CRED_ID = 'party.credentialId'
const LS_HANDLE = 'party.handle'
const LS_AVATAR_SEED = 'party.avatarSeed'

export const Identity = {
  async create() {
    if (!window.PublicKeyCredential) {
      throw new Error('This device does not support passkeys. Use Safari on iPhone.')
    }
    const challenge = crypto.getRandomValues(new Uint8Array(32))
    const userId = crypto.getRandomValues(new Uint8Array(16))

    const cred = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'Party' },
        user: { id: userId, name: 'party-user', displayName: 'Party User' },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },   // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'required',
          requireResidentKey: true,
        },
        timeout: 60000,
        attestation: 'none',
      },
    })
    if (!cred) throw new Error('Face ID cancelled')

    const rawId = cred.rawId
    const handle = await deriveHandle(rawId)
    const avatarSeed = await deriveAvatarSeed(rawId)

    localStorage.setItem(LS_CRED_ID, b64url.encode(rawId))
    localStorage.setItem(LS_HANDLE, handle)
    localStorage.setItem(LS_AVATAR_SEED, avatarSeed)

    return { handle, avatarSeed, rawIdB64: b64url.encode(rawId) }
  },

  load() {
    const credId = localStorage.getItem(LS_CRED_ID)
    const handle = localStorage.getItem(LS_HANDLE)
    const avatarSeed = localStorage.getItem(LS_AVATAR_SEED)
    if (!credId || !handle || !avatarSeed) return null
    return { handle, avatarSeed, rawIdB64: credId }
  },

  clear() {
    localStorage.removeItem(LS_CRED_ID)
    localStorage.removeItem(LS_HANDLE)
    localStorage.removeItem(LS_AVATAR_SEED)
  },

  // Migrate anything in localStorage whose handle doesn't match current format.
  // Uses the stored credential to re-derive; no Face ID prompt needed.
  async migrate() {
    const credId = localStorage.getItem(LS_CRED_ID)
    const handle = localStorage.getItem(LS_HANDLE)
    if (!credId || !handle) return
    if (HANDLE_RE.test(handle)) return
    try {
      const rawIdBuf = b64url.decode(credId)
      const newHandle = await deriveHandle(rawIdBuf)
      const newSeed = await deriveAvatarSeed(rawIdBuf)
      localStorage.setItem(LS_HANDLE, newHandle)
      localStorage.setItem(LS_AVATAR_SEED, newSeed)
    } catch (e) {
      console.warn('Identity migration failed; clearing', e)
      this.clear()
    }
  },
}
