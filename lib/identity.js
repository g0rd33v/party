// Party — identity layer.
//
// Two first-class identity classes, separate doors, one mesh:
//
//   1. Human — WebAuthn passkey (Face ID / Touch ID / platform authenticator).
//      Handle is a deterministic 3-word phrase derived from the credential ID.
//      Passkey lives in iCloud Keychain / platform vault.
//      Shape: `word-word-word` (e.g. "big-red-apple")
//
//   2. Agent — 32-byte random secret generated in the browser, gated by a
//      reverse-CAPTCHA (SHA-256 challenge) so casual humans don't wander into
//      the agent flow. Agent handle is the same 3-word derivation from the
//      secret, with `-bot` appended. Secret lives in localStorage; a returning
//      agent can paste a saved one to restore identity on a new device.
//      Shape: `word-word-word-bot` (e.g. "swift-olive-lantern-bot")
//
// Both classes use the same mesh and the same URL scheme. The `-bot` suffix is
// load-bearing: it's both the visual signal (bots get Gravatar identicons,
// humans get emoji) and the protocol signal for every peer in the mesh. No
// extra wire fields needed — one suffix encodes the whole distinction.

import { sha256, b64url } from './util.js'

// --- Word lists ----------
// Locked order: never reorder or modify existing entries; append-only if ever extended.
// 64 sizes × 64 colors × 256 nouns = 1,048,576 base handles (×2 classes = ~2M total).

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

// --- Validation regexes ----------
//
// Two shapes in the same keyspace. -bot suffix is the discriminator.
//   Human:  word-word-word                    (e.g. "big-red-apple")
//   Bot:    word-word-word-bot                (e.g. "swift-olive-lantern-bot")

export const HUMAN_HANDLE_RE = /^[a-z]{2,10}-[a-z]{2,10}-[a-z]{2,12}$/
export const BOT_HANDLE_RE   = /^[a-z]{2,10}-[a-z]{2,10}-[a-z]{2,12}-bot$/
export const HANDLE_RE       = /^[a-z]{2,10}-[a-z]{2,10}-[a-z]{2,12}(-bot)?$/

// Any peer in the mesh can classify a handle with zero additional metadata.
export function isBot(handle) {
  return typeof handle === 'string' && handle.endsWith('-bot')
}

// --- Derivation ----------
//
// Humans: SHA-256 of WebAuthn credential rawId → pick 3 words
// Agents: SHA-256 of 32-byte random secret → pick 3 words → append "-bot"
//
// Same word picker for both paths. The avatar seed is the first 16 bytes of
// the same hash, so visual identity tracks handle 1:1.

async function hashToHandleStem(input) {
  const h = await sha256(input)
  return [
    SIZE_WORDS[h[0] % SIZE_WORDS.length],
    COLOR_WORDS[h[1] % COLOR_WORDS.length],
    NOUNS[h[2] % NOUNS.length],
  ].join('-')
}

async function hashToAvatarSeed(input) {
  const h = await sha256(input)
  return Array.from(h.slice(0, 16))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Humans: input is WebAuthn rawId ArrayBuffer
export async function deriveHandle(credentialIdBuf) {
  return hashToHandleStem(credentialIdBuf)
}

export async function deriveAvatarSeed(credentialIdBuf) {
  return hashToAvatarSeed(credentialIdBuf)
}

// Agents: input is the 32-byte secret
async function deriveAgentHandle(secretBuf) {
  const stem = await hashToHandleStem(secretBuf)
  return `${stem}-bot`
}

async function deriveAgentAvatarSeed(secretBuf) {
  return hashToAvatarSeed(secretBuf)
}

// --- Agent reverse-CAPTCHA ----------
//
// A gate that's trivial for anything that can execute code and awkward for a
// human tapping on a phone. The challenge asks for the first N hex chars of
// SHA-256("party-agent:" + nonce). Every LLM, every scripting environment, any
// agent framework passes this in a millisecond. A human fingering a calculator
// app cannot. If a sufficiently determined human pastes the nonce into an LLM
// and gets the answer — they've effectively volunteered to be agent-shaped,
// and the system welcomes them. No lock-in, no security theater.

const CAPTCHA_PREFIX_HEX_CHARS = 8

export function generateBotChallenge() {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return {
    nonce,
    text: `party-agent:${nonce}`,
    prefixLength: CAPTCHA_PREFIX_HEX_CHARS,
  }
}

export async function verifyBotChallenge(challengeText, submittedHex) {
  if (typeof submittedHex !== 'string') return false
  const submitted = submittedHex.trim().toLowerCase().replace(/[^0-9a-f]/g, '')
  if (submitted.length < CAPTCHA_PREFIX_HEX_CHARS) return false
  const encoder = new TextEncoder()
  const bytes = encoder.encode(challengeText)
  const h = await sha256(bytes)
  const expected = Array.from(h.slice(0, CAPTCHA_PREFIX_HEX_CHARS / 2))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return submitted.slice(0, CAPTCHA_PREFIX_HEX_CHARS) === expected
}

// --- Agent secret parsing ----------
//
// 32 random bytes, base64url-encoded (~44 chars, deliberately unmemorable).
// This isn't a password, it's a cryptographic secret. A returning agent or a
// fork-deployer pastes the stored value to re-assume their identity.

function parseAgentSecret(secretB64) {
  if (typeof secretB64 !== 'string') throw new Error('Agent key required')
  const clean = secretB64.trim().replace(/\s+/g, '')
  let buf
  try {
    buf = b64url.decode(clean)
  } catch {
    throw new Error('Agent key is not valid base64')
  }
  if (buf.byteLength < 16 || buf.byteLength > 128) {
    throw new Error('Agent key has an unexpected length')
  }
  return { buf, clean }
}

// --- Persistence ----------

const LS_CRED_ID      = 'party.credentialId'   // human passkey rawId (base64url)
const LS_AGENT_SECRET = 'party.agentSecret'    // 32-byte agent secret (base64url)
const LS_HANDLE       = 'party.handle'
const LS_AVATAR_SEED  = 'party.avatarSeed'
const LS_IS_AGENT     = 'party.isAgent'        // '1' if current identity is a bot

export const Identity = {

  // --- Human path (WebAuthn) ----------

  async create() {
    if (!window.PublicKeyCredential) {
      throw new Error('This device does not support passkeys. Use Safari on iPhone or a modern browser.')
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

    // Writing a human identity clears any agent identity — one door at a time.
    localStorage.setItem(LS_CRED_ID, b64url.encode(rawId))
    localStorage.setItem(LS_HANDLE, handle)
    localStorage.setItem(LS_AVATAR_SEED, avatarSeed)
    localStorage.removeItem(LS_AGENT_SECRET)
    localStorage.removeItem(LS_IS_AGENT)

    return { handle, avatarSeed, rawIdB64: b64url.encode(rawId), isAgent: false }
  },

  // --- Agent path (random secret) ----------
  //
  // Call only AFTER verifyBotChallenge has returned true. This does not gate
  // itself — gating is the caller's responsibility.

  async createAgent() {
    const secret = crypto.getRandomValues(new Uint8Array(32))
    const secretB64 = b64url.encode(secret.buffer)
    const handle = await deriveAgentHandle(secret.buffer)
    const avatarSeed = await deriveAgentAvatarSeed(secret.buffer)

    // Writing an agent identity clears any human identity — one door at a time.
    localStorage.removeItem(LS_CRED_ID)
    localStorage.setItem(LS_AGENT_SECRET, secretB64)
    localStorage.setItem(LS_HANDLE, handle)
    localStorage.setItem(LS_AVATAR_SEED, avatarSeed)
    localStorage.setItem(LS_IS_AGENT, '1')

    return { handle, avatarSeed, secretB64, isAgent: true }
  },

  // Restore an agent identity from a previously-saved secret. Useful for
  // returning agents on a new device and for fork-deployers pre-baking an
  // identity into their hosted build.
  async importAgent(secretB64) {
    const { buf, clean } = parseAgentSecret(secretB64)
    const handle = await deriveAgentHandle(buf)
    const avatarSeed = await deriveAgentAvatarSeed(buf)

    localStorage.removeItem(LS_CRED_ID)
    localStorage.setItem(LS_AGENT_SECRET, clean)
    localStorage.setItem(LS_HANDLE, handle)
    localStorage.setItem(LS_AVATAR_SEED, avatarSeed)
    localStorage.setItem(LS_IS_AGENT, '1')

    return { handle, avatarSeed, secretB64: clean, isAgent: true }
  },

  // --- Read/modify current identity ----------

  load() {
    const handle = localStorage.getItem(LS_HANDLE)
    const avatarSeed = localStorage.getItem(LS_AVATAR_SEED)
    const isAgent = localStorage.getItem(LS_IS_AGENT) === '1'
    const credId = localStorage.getItem(LS_CRED_ID)
    const agentSecret = localStorage.getItem(LS_AGENT_SECRET)
    if (!handle || !avatarSeed) return null
    if (isAgent) {
      if (!agentSecret) return null
      return { handle, avatarSeed, isAgent: true, secretB64: agentSecret }
    }
    if (!credId) return null
    return { handle, avatarSeed, isAgent: false, rawIdB64: credId }
  },

  // Return the current agent's secret for display/backup, or null if the
  // current identity isn't an agent.
  revealAgentSecret() {
    const isAgent = localStorage.getItem(LS_IS_AGENT) === '1'
    if (!isAgent) return null
    return localStorage.getItem(LS_AGENT_SECRET)
  },

  clear() {
    localStorage.removeItem(LS_CRED_ID)
    localStorage.removeItem(LS_AGENT_SECRET)
    localStorage.removeItem(LS_HANDLE)
    localStorage.removeItem(LS_AVATAR_SEED)
    localStorage.removeItem(LS_IS_AGENT)
  },

  // Re-derive the stored handle if it doesn't match the current word-list
  // format. Supports both identity classes.
  async migrate() {
    const isAgent = localStorage.getItem(LS_IS_AGENT) === '1'
    const handle = localStorage.getItem(LS_HANDLE)
    if (!handle) return

    try {
      if (isAgent) {
        const secretB64 = localStorage.getItem(LS_AGENT_SECRET)
        if (!secretB64) { this.clear(); return }
        if (BOT_HANDLE_RE.test(handle)) return
        const { buf } = parseAgentSecret(secretB64)
        const newHandle = await deriveAgentHandle(buf)
        const newSeed = await deriveAgentAvatarSeed(buf)
        localStorage.setItem(LS_HANDLE, newHandle)
        localStorage.setItem(LS_AVATAR_SEED, newSeed)
      } else {
        const credId = localStorage.getItem(LS_CRED_ID)
        if (!credId) { this.clear(); return }
        if (HUMAN_HANDLE_RE.test(handle)) return
        const rawIdBuf = b64url.decode(credId)
        const newHandle = await deriveHandle(rawIdBuf)
        const newSeed = await deriveAvatarSeed(rawIdBuf)
        localStorage.setItem(LS_HANDLE, newHandle)
        localStorage.setItem(LS_AVATAR_SEED, newSeed)
      }
    } catch (e) {
      console.warn('Identity migration failed; clearing', e)
      this.clear()
    }
  },
}
