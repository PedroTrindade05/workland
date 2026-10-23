// Hora real: o céu e a luz do ambiente acompanham o relógio (amanhecer, dia, pôr do sol, noite).
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { useUI } from '../store'
import type { Theme } from '../themes'

const NIGHT = { top: '#02040b', mid: '#0a1024', horizon: '#1c1a33' }
const DUSK = { mid: '#b4607a', horizon: '#ff9a62' }

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const mix = (a: string, b: string, t: number) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()

export function atTime(theme: Theme, now: Date): Theme {
  const h = now.getHours() + now.getMinutes() / 60
  const day = smooth(5.5, 7.5, h) * (1 - smooth(17.3, 19.2, h))
  const dusk = Math.max(Math.exp(-((h - 6.4) ** 2) / 0.6), Math.exp(-((h - 18.2) ** 2) / 0.6))
  const night = 1 - day
  const sky = {
    ...theme.sky,
    top: mix(theme.sky.top, NIGHT.top, night),
    mid: mix(mix(theme.sky.mid, NIGHT.mid, night), DUSK.mid, dusk * 0.6),
    horizon: mix(mix(theme.sky.horizon, NIGHT.horizon, night), DUSK.horizon, dusk * 0.7),
  }
  return {
    ...theme,
    sky,
    fog: { ...theme.fog, color: mix(mix(theme.fog.color, NIGHT.mid, night * 0.8), DUSK.horizon, dusk * 0.3) },
    light: {
      ...theme.light,
      sunIntensity: theme.light.sunIntensity * (0.12 + 0.88 * day),
      hemi: theme.light.hemi * (0.45 + 0.55 * day),
      sun: mix(theme.light.sun, '#ffb070', dusk * 0.6),
    },
  }
}

// o tema "ao vivo": igual ao escolhido, ou ajustado pela hora real (menos no espaço)
export function useLiveTheme() {
  const base = useUI((s) => s.theme)
  const real = useUI((s) => s.settings.realTime)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!real) return
    const id = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [real])
  return useMemo(() => (real && !base.real ? atTime(base, new Date()) : base), [base, real, tick]) // eslint-disable-line react-hooks/exhaustive-deps
}
