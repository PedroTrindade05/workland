// Som ambiente gerado na hora (nada de arquivo de áudio): chuva, vento, ondas e lareira.
import type { Ambient } from '../store'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let stopCurrent: (() => void) | null = null
let current: Ambient = 'nenhum'

function noiseBuffer(c: AudioContext, brown = false) {
  const len = c.sampleRate * 3
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1
    if (brown) {
      last = (last + 0.02 * w) / 1.02
      d[i] = last * 3.5
    } else d[i] = w
  }
  return buf
}

function loop(c: AudioContext, buf: AudioBuffer) {
  const s = c.createBufferSource()
  s.buffer = buf
  s.loop = true
  s.start()
  return s
}

function lfo(c: AudioContext, hz: number, depth: number, target: AudioParam) {
  const o = c.createOscillator()
  const g = c.createGain()
  o.frequency.value = hz
  g.gain.value = depth
  o.connect(g).connect(target)
  o.start()
  return o
}

const BUILDERS: Record<Exclude<Ambient, 'nenhum'>, (c: AudioContext, out: AudioNode) => () => void> = {
  chuva: (c, out) => {
    const src = loop(c, noiseBuffer(c))
    const bp = new BiquadFilterNode(c, { type: 'bandpass', frequency: 1400, Q: 0.5 })
    const hp = new BiquadFilterNode(c, { type: 'highpass', frequency: 400 })
    const g = new GainNode(c, { gain: 0.5 })
    src.connect(bp).connect(hp).connect(g).connect(out)
    const l = lfo(c, 0.07, 0.12, g.gain)
    // pingos mais grossos de vez em quando
    const drops = setInterval(() => {
      const s = c.createBufferSource()
      s.buffer = noiseBuffer(c)
      const f = new BiquadFilterNode(c, { type: 'bandpass', frequency: 2500 + Math.random() * 3000, Q: 8 })
      const e = new GainNode(c, { gain: 0 })
      const t = c.currentTime
      e.gain.setValueAtTime(0, t)
      e.gain.linearRampToValueAtTime(0.25 * Math.random(), t + 0.005)
      e.gain.exponentialRampToValueAtTime(0.0001, t + 0.08)
      s.connect(f).connect(e).connect(out)
      s.start(t)
      s.stop(t + 0.1)
    }, 90)
    return () => {
      clearInterval(drops)
      src.stop()
      l.stop()
    }
  },
  vento: (c, out) => {
    const src = loop(c, noiseBuffer(c, true))
    const lp = new BiquadFilterNode(c, { type: 'lowpass', frequency: 500, Q: 2 })
    const g = new GainNode(c, { gain: 0.9 })
    src.connect(lp).connect(g).connect(out)
    const l1 = lfo(c, 0.05, 280, lp.frequency)
    const l2 = lfo(c, 0.11, 0.35, g.gain)
    return () => {
      src.stop()
      l1.stop()
      l2.stop()
    }
  },
  ondas: (c, out) => {
    const src = loop(c, noiseBuffer(c))
    const lp = new BiquadFilterNode(c, { type: 'lowpass', frequency: 650 })
    const g = new GainNode(c, { gain: 0.25 })
    src.connect(lp).connect(g).connect(out)
    // ondas chegando a cada ~8s
    const l = lfo(c, 0.12, 0.22, g.gain)
    const l2 = lfo(c, 0.12, 350, lp.frequency)
    return () => {
      src.stop()
      l.stop()
      l2.stop()
    }
  },
  lareira: (c, out) => {
    const src = loop(c, noiseBuffer(c, true))
    const lp = new BiquadFilterNode(c, { type: 'lowpass', frequency: 260 })
    const g = new GainNode(c, { gain: 0.8 })
    src.connect(lp).connect(g).connect(out)
    const white = noiseBuffer(c)
    let alive = true
    const crackle = () => {
      if (!alive) return
      const s = c.createBufferSource()
      s.buffer = white
      const f = new BiquadFilterNode(c, { type: 'highpass', frequency: 1800 + Math.random() * 2500 })
      const e = new GainNode(c, { gain: 0 })
      const t = c.currentTime
      e.gain.linearRampToValueAtTime(0.35 * Math.random(), t + 0.002)
      e.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.05)
      s.connect(f).connect(e).connect(out)
      s.start(t, Math.random() * 2)
      s.stop(t + 0.1)
      setTimeout(crackle, 40 + Math.random() * 600)
    }
    crackle()
    return () => {
      alive = false
      src.stop()
    }
  },
}

export function setAmbient(kind: Ambient, volume: number) {
  if (kind === 'nenhum') {
    stopCurrent?.()
    stopCurrent = null
    current = 'nenhum'
    return
  }
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') ctx.resume()
  if (!master) {
    master = ctx.createGain()
    master.connect(ctx.destination)
  }
  master.gain.setTargetAtTime(volume * 0.6, ctx.currentTime, 0.3)
  if (kind === current) return
  stopCurrent?.()
  stopCurrent = BUILDERS[kind](ctx, master)
  current = kind
}
