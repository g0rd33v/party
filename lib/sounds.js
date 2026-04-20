// sounds.js — three short synthesized tones.
//
// Web Audio API oscillators instead of audio files: zero bytes on disk, no
// external dependencies, no format compatibility issues, trivially tunable.
// iOS Safari won't let audio play before a user gesture — we lazily init
// the AudioContext on first call, so the first sound a user triggers (their
// tap to open a party) is also what unlocks audio.
//
// Three moments:
//   playConnect()  — warm ascending chime when joining a live party
//   playReceive()  — soft two-note bell when a message lands
//   playSend()     — short blip when you send a message

let ctx = null

function audioCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    try { ctx = new AC() } catch { return null }
  }
  // iOS suspends context until user gesture — resume defensively
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

// Schedule one oscillator tone with a smooth gain envelope. Attack fades in
// over 10ms (prevents click); release decays exponentially over the duration.
function tone(freq, startOffset, duration, peakGain = 0.14, type = 'sine') {
  const c = audioCtx()
  if (!c) return
  const t0 = c.currentTime + startOffset
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.value = freq
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peakGain, t0 + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(g)
  g.connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.05)
}

// Warm ascending chime: C5 then E5, overlapping.
export function playConnect() {
  tone(523.25, 0,    0.28, 0.14)
  tone(659.25, 0.10, 0.34, 0.12)
}

// Soft two-note bell: A5 then E5.
export function playReceive() {
  tone(880.00, 0,    0.11, 0.10)
  tone(659.25, 0.06, 0.18, 0.08)
}

// Short blip: single quick E5.
export function playSend() {
  tone(659.25, 0, 0.07, 0.08)
}
