import * as THREE from 'three'
import type { Theme } from './themes'

export const FONT = '"Segoe UI Variable Display", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif'

export function canvasTexture(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  t.generateMipmaps = true
  return t
}

// título solto no ar (sem fundo), com espaçamento entre letras
const labelCache = new Map<string, THREE.CanvasTexture>()
export function label(
  text: string,
  o: { color: string; w?: number; h?: number; size?: number; weight?: number; spacing?: number; sub?: string; subColor?: string; align?: CanvasTextAlign; bg?: string },
) {
  const key = JSON.stringify([text, o])
  const hit = labelCache.get(key)
  if (hit) return hit
  const w = o.w ?? 1024
  const h = o.h ?? 160
  const t = canvasTexture(w, h)
  const g = (t.image as HTMLCanvasElement).getContext('2d')!
  if (o.bg) {
    g.fillStyle = o.bg
    g.beginPath()
    g.roundRect(0, 0, w, h, h / 2)
    g.fill()
  }
  g.fillStyle = o.color
  g.textAlign = o.align ?? 'center'
  g.textBaseline = 'middle'
  const x = g.textAlign === 'left' ? 0 : g.textAlign === 'right' ? w : w / 2
  let size = o.size ?? h * 0.42
  ;(g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${o.spacing ?? 0}px`
  g.font = `${o.weight ?? 500} ${size}px ${FONT}`
  while (g.measureText(text).width > w * 0.94 && size > 8) {
    size -= 2
    g.font = `${o.weight ?? 500} ${size}px ${FONT}`
  }
  g.fillText(text, x, o.sub ? h * 0.38 : h / 2)
  if (o.sub) {
    ;(g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '2px'
    g.fillStyle = o.subColor ?? o.color
    g.font = `400 ${h * 0.2}px ${FONT}`
    g.fillText(o.sub, x, h * 0.78)
  }
  t.needsUpdate = true
  labelCache.set(key, t)
  return t
}

const imgCache = new Map<string, Promise<HTMLImageElement>>()
export function loadImage(src: string) {
  let p = imgCache.get(src)
  if (!p) {
    p = new Promise((res, rej) => {
      const img = new Image()
      // arquivos locais (wlfile) precisam de CORS pra virar textura
      if (src.startsWith('wlfile:')) img.crossOrigin = 'anonymous'
      img.onload = () => res(img)
      img.onerror = rej
      img.src = src
    })
    imgCache.set(src, p)
  }
  return p
}

// ---------- tipos de arquivo ----------

const KIND: Record<string, string> = {}
for (const e of ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'psd', 'ico', 'heic']) KIND[e] = 'image'
for (const e of ['mp4', 'mov', 'mkv', 'avi', 'webm']) KIND[e] = 'video'
for (const e of ['mp3', 'wav', 'flac', 'ogg', 'm4a']) KIND[e] = 'audio'
for (const e of ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'ppt', 'pptx']) KIND[e] = 'doc'
for (const e of ['xls', 'xlsx', 'csv']) KIND[e] = 'sheet'
for (const e of ['js', 'ts', 'tsx', 'jsx', 'json', 'py', 'html', 'css', 'cs', 'cpp', 'java', 'go', 'rs']) KIND[e] = 'code'
for (const e of ['zip', 'rar', '7z', 'tar', 'gz']) KIND[e] = 'archive'
for (const e of ['exe', 'msi', 'lnk', 'url', 'bat']) KIND[e] = 'app'

export function kindOf(ext: string, isDir: boolean) {
  return isDir ? 'folder' : KIND[ext] ?? 'other'
}

// ---------- cartão (app, arquivo, janela) ----------

export function drawCard(
  tex: THREE.CanvasTexture,
  title: string,
  theme: Theme,
  opts: { icon?: HTMLImageElement | null; tag?: string; cover?: boolean; sub?: string },
) {
  const c = tex.image as HTMLCanvasElement
  const g = c.getContext('2d')!
  const W = c.width
  const H = c.height
  const R = W * 0.12
  g.clearRect(0, 0, W, H)
  g.fillStyle = theme.card.bg
  g.beginPath()
  g.roundRect(2, 2, W - 4, H - 4, R)
  g.fill()
  g.strokeStyle = theme.card.border
  g.lineWidth = 2
  g.stroke()

  const area = { x: 0, y: 0, w: W, h: H * 0.72 }
  if (opts.icon && opts.cover) {
    g.save()
    g.beginPath()
    g.roundRect(10, 10, W - 20, area.h - 10, R * 0.7)
    g.clip()
    const s = Math.max((W - 20) / opts.icon.width, (area.h - 10) / opts.icon.height)
    g.drawImage(opts.icon, (W - opts.icon.width * s) / 2, 10 + (area.h - 10 - opts.icon.height * s) / 2, opts.icon.width * s, opts.icon.height * s)
    g.restore()
  } else if (opts.icon) {
    const s = W * 0.44
    g.imageSmoothingQuality = 'high'
    g.drawImage(opts.icon, (W - s) / 2, area.h / 2 - s / 2 + H * 0.03, s, s)
  } else if (opts.tag) {
    g.fillStyle = theme.accent
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = `300 ${W * (opts.tag.length > 2 ? 0.16 : 0.24)}px ${FONT}`
    g.fillText(opts.tag, W / 2, area.h / 2 + H * 0.03)
  }

  g.fillStyle = theme.card.text
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  let size = W * 0.085
  g.font = `500 ${size}px ${FONT}`
  let t = title
  while (g.measureText(t).width > W * 0.84 && size > W * 0.062) {
    size -= 1
    g.font = `500 ${size}px ${FONT}`
  }
  while (g.measureText(t + '…').width > W * 0.84 && t.length > 3) t = t.slice(0, -1)
  if (t !== title) t += '…'
  g.fillText(t, W / 2, opts.sub ? H * 0.8 : H * 0.84)
  if (opts.sub) {
    g.fillStyle = theme.card.sub
    g.font = `400 ${W * 0.058}px ${FONT}`
    g.fillText(opts.sub, W / 2, H * 0.9)
  }
  tex.needsUpdate = true
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

// cor "acesa" (acima de 1.0) pra entrar no brilho do pós-processamento
export function glow(color: string, k = 2.5) {
  return new THREE.Color(color).multiplyScalar(k)
}
