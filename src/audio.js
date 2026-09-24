// Tiny WebAudio engine: prop drone + wind rush, plus blips for rings/crash.
import { game } from './game.js'

let ctx, engineGain, engineOsc, engineOsc2, engineFilter, windGain, windFilter, master

export function initAudio() {
  if (ctx) return
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)()
  } catch (e) {
    return
  }
  master = ctx.createGain()
  master.gain.value = 0.5
  master.connect(ctx.destination)

  engineOsc = ctx.createOscillator()
  engineOsc.type = 'sawtooth'
  engineOsc2 = ctx.createOscillator()
  engineOsc2.type = 'square'
  engineFilter = ctx.createBiquadFilter()
  engineFilter.type = 'lowpass'
  engineFilter.frequency.value = 420
  engineGain = ctx.createGain()
  engineGain.gain.value = 0
  engineOsc.connect(engineFilter)
  engineOsc2.connect(engineFilter)
  engineFilter.connect(engineGain)
  engineGain.connect(master)
  engineOsc.start()
  engineOsc2.start()

  const len = ctx.sampleRate * 2
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  const noise = ctx.createBufferSource()
  noise.buffer = buf
  noise.loop = true
  windFilter = ctx.createBiquadFilter()
  windFilter.type = 'bandpass'
  windFilter.frequency.value = 600
  windFilter.Q.value = 0.6
  windGain = ctx.createGain()
  windGain.gain.value = 0
  noise.connect(windFilter)
  windFilter.connect(windGain)
  windGain.connect(master)
  noise.start()
}

function blip(freqs, dur = 0.15, type = 'sine', vol = 0.25) {
  if (!ctx) return
  const t0 = ctx.currentTime
  freqs.forEach((f, i) => {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = type
    o.frequency.value = f
    g.gain.setValueAtTime(0, t0 + i * dur * 0.7)
    g.gain.linearRampToValueAtTime(vol, t0 + i * dur * 0.7 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + i * dur * 0.7 + dur)
    o.connect(g)
    g.connect(master)
    o.start(t0 + i * dur * 0.7)
    o.stop(t0 + i * dur * 0.7 + dur + 0.05)
  })
}

function crash() {
  if (!ctx) return
  const len = ctx.sampleRate * 0.8
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2)
  const s = ctx.createBufferSource()
  s.buffer = buf
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = 900
  const g = ctx.createGain()
  g.gain.value = 0.7
  s.connect(f)
  f.connect(g)
  g.connect(master)
  s.start()
}

export function updateAudio() {
  if (!ctx) return
  const g = game
  const t = ctx.currentTime
  master.gain.setTargetAtTime(g.muted ? 0 : 0.5, t, 0.05)
  const flying = g.phase === 'flying' || g.phase === 'finished'
  const sp = g.speed
  engineOsc.frequency.setTargetAtTime(55 + sp * 0.9 + (g.boosting ? 40 : 0), t, 0.1)
  engineOsc2.frequency.setTargetAtTime(27 + sp * 0.45, t, 0.1)
  engineFilter.frequency.setTargetAtTime(300 + sp * 6 + (g.boosting ? 600 : 0), t, 0.1)
  engineGain.gain.setTargetAtTime(flying ? 0.07 : 0, t, 0.15)
  windFilter.frequency.setTargetAtTime(300 + sp * 8, t, 0.2)
  windGain.gain.setTargetAtTime(flying ? Math.min(0.35, (sp / 170) ** 2 * 0.5) : 0, t, 0.2)

  while (g.events.length) {
    const e = g.events.shift()
    if (e === 'ring') blip([880, 1320], 0.14, 'triangle', 0.22)
    else if (e === 'finish') blip([523, 659, 784, 1046], 0.22, 'triangle', 0.25)
    else if (e === 'crash') crash()
  }
}
