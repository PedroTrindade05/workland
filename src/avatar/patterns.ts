import * as THREE from 'three'
import type { PatternId } from './look'

// estampa da roupa desenhada num canvas pequeno; poucas combinações ficam guardadas
const cache = new Map<string, THREE.CanvasTexture>()

export function patternTexture(pattern: PatternId, main: string, second: string) {
  if (pattern === 'liso') return null
  const key = `${pattern}|${main}|${second}`
  const hit = cache.get(key)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const S = 128
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  g.fillStyle = main
  g.fillRect(0, 0, S, S)
  g.fillStyle = second
  if (pattern === 'listras') {
    for (let y = 0; y < S; y += 32) g.fillRect(0, y, S, 12)
  } else if (pattern === 'bolinhas') {
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        g.beginPath()
        g.arc(x * 32 + (y % 2 ? 24 : 8), y * 32 + 16, 6, 0, Math.PI * 2)
        g.fill()
      }
  } else if (pattern === 'xadrez') {
    g.globalAlpha = 0.55
    for (let i = 0; i < S; i += 32) {
      g.fillRect(i, 0, 14, S)
      g.fillRect(0, i, S, 14)
    }
    g.globalAlpha = 1
  } else if (pattern === 'diagonal') {
    g.lineWidth = 11
    g.strokeStyle = second
    for (let i = -S; i < S * 2; i += 32) {
      g.beginPath()
      g.moveTo(i, 0)
      g.lineTo(i + S, S)
      g.stroke()
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(3, 2)
  t.anisotropy = 4
  cache.set(key, t)
  // o provador gera muitas no "sortear": as mais antigas saem da GPU
  if (cache.size > 6) {
    const [old, tex] = cache.entries().next().value as [string, THREE.CanvasTexture]
    cache.delete(old)
    tex.dispose()
  }
  return t
}
