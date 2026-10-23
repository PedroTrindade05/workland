import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { pc, type Media } from '../pc'
import { useUI } from '../store'
import { useRooms, type Item } from '../rooms'
import { FONT, canvasTexture, drawCard, glow, initials, loadImage } from '../textures'
import { useHoverable, useHovered } from '../interact'
import { openShortcut } from '../inside'
import type { Theme } from '../themes'
import type { Target } from '../store'

// ---------- painel genérico: um canvas desenhado e pendurado no ar (com um pé fininho até o chão) ----------

type Draw = (g: CanvasRenderingContext2D, W: number, H: number, theme: Theme, hovered: boolean) => void

// costas lisas no formato do cartão (cantos arredondados), pra não ver o desenho espelhado por trás
export function roundedRect(w: number, h: number, r: number, inset = 0) {
  const x = -w / 2 + inset
  const y = -h / 2 + inset
  const W = w - inset * 2
  const H = h - inset * 2
  const s = new THREE.Shape()
  s.moveTo(x + r, y)
  s.lineTo(x + W - r, y)
  s.quadraticCurveTo(x + W, y, x + W, y + r)
  s.lineTo(x + W, y + H - r)
  s.quadraticCurveTo(x + W, y + H, x + W - r, y + H)
  s.lineTo(x + r, y + H)
  s.quadraticCurveTo(x, y + H, x, y + H - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return new THREE.ShapeGeometry(s, 6)
}
export const backColor = (theme: Theme) => (theme.dark ? '#1a1c22' : '#e4e2dd')

export function CanvasPanel({
  item,
  w,
  h,
  px = 640,
  draw,
  every = 0,
  deps = [],
  target,
  stand = true,
  bg = true,
  back,
}: {
  item: Item
  w: number
  h: number
  px?: number
  draw: Draw
  every?: number
  deps?: unknown[]
  target: Target | null
  stand?: boolean
  bg?: boolean
  // cor das costas; sem fundo e sem cor = vazado (letreiro), aparece dos dois lados
  back?: string
}) {
  const theme = useUI((s) => s.theme)
  const tex = useMemo(() => canvasTexture(px, Math.round((px * h) / w)), [px, w, h])
  const hovered = useHovered(target?.id ?? '')
  const handlers = useHoverable(target)
  const drawRef = useRef(draw)
  drawRef.current = draw

  const redraw = () => {
    const c = tex.image as HTMLCanvasElement
    const g = c.getContext('2d')!
    g.clearRect(0, 0, c.width, c.height)
    if (bg) {
      g.fillStyle = theme.card.bg
      g.beginPath()
      g.roundRect(3, 3, c.width - 6, c.height - 6, c.width * 0.05)
      g.fill()
      g.strokeStyle = hovered ? theme.accent : theme.card.border
      g.lineWidth = hovered ? 6 : 2
      g.stroke()
    }
    drawRef.current(g, c.width, c.height, theme, hovered)
    tex.needsUpdate = true
  }
  useEffect(() => {
    redraw()
    if (!every) return
    const id = setInterval(redraw, every)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, hovered, every, tex, ...deps])
  useEffect(() => () => tex.dispose(), [tex])

  const solid = bg || !!back
  const backGeo = useMemo(() => (solid ? roundedRect(w, h, bg ? w * 0.05 : 0, bg ? 0 : (14 / px) * w) : null), [solid, bg, w, h, px])
  useEffect(() => () => backGeo?.dispose(), [backGeo])

  const standH = item.y / item.scale - h / 2
  return (
    <group>
      <mesh {...handlers} castShadow>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={tex} transparent toneMapped={false} side={solid ? THREE.FrontSide : THREE.DoubleSide} />
      </mesh>
      {backGeo && (
        <mesh geometry={backGeo} rotation-y={Math.PI} position-z={-0.004}>
          <meshStandardMaterial color={back ?? backColor(theme)} roughness={0.85} />
        </mesh>
      )}
      {stand && standH > 0.05 && (
        <group position-y={-h / 2 - standH / 2}>
          <mesh position-z={-0.02} castShadow>
            <cylinderGeometry args={[0.025, 0.025, standH, 10]} />
            <meshStandardMaterial color="#1b1d22" metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh position-y={-standH / 2 + 0.02}>
            <cylinderGeometry args={[0.28, 0.32, 0.04, 32]} />
            <meshStandardMaterial color="#1b1d22" metalness={0.8} roughness={0.3} />
          </mesh>
        </group>
      )}
    </group>
  )
}

function fitText(g: CanvasRenderingContext2D, text: string, max: number, weight: number, size: number) {
  let s = size
  g.font = `${weight} ${s}px ${FONT}`
  while (g.measureText(text).width > max && s > 10) {
    s -= 2
    g.font = `${weight} ${s}px ${FONT}`
  }
}

function wrap(g: CanvasRenderingContext2D, text: string, max: number) {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(' ')) {
      const t = line ? line + ' ' + word : word
      if (g.measureText(t).width > max && line) {
        out.push(line)
        line = word
      } else line = t
    }
    out.push(line)
  }
  return out
}

const say = (t: string) => useUI.getState().say(t)
const edit = (id: string) => useUI.getState().setEditItem(id)

// ---------- relógio ----------

export function Clock({ item }: { item: Item }) {
  const style = String(item.props.style || 'digital')
  const tz = String(item.props.tz || '')
  const analog = style === 'analogico'
  return (
    <CanvasPanel
      item={item}
      w={analog ? 1.6 : 2.6}
      h={analog ? 1.6 : 1.1}
      px={analog ? 512 : 768}
      every={1000}
      deps={[style, tz]}
      target={{ id: `clock:${item.id}`, title: 'Relógio', verb: 'Mudar estilo', run: () => useRooms.getState().setProps(item.id, { style: analog ? 'digital' : 'analogico' }) }}
      bg={!analog}
      draw={(g, W, H, theme) => {
        const now = new Date()
        const opt = tz ? { timeZone: tz } : {}
        if (!analog) {
          g.fillStyle = theme.card.text
          g.textAlign = 'center'
          g.textBaseline = 'middle'
          g.font = `200 ${H * 0.52}px ${FONT}`
          g.fillText(now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', ...opt }), W / 2, H * 0.44)
          g.fillStyle = theme.card.sub
          g.font = `400 ${H * 0.12}px ${FONT}`
          const zone = tz ? tz.split('/').pop()!.replace('_', ' ') + ' · ' : ''
          g.fillText(zone + now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short', ...opt }), W / 2, H * 0.82)
          return
        }
        const parts = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false, ...opt }).formatToParts(now)
        const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
        const [hh, mm, ss] = [get('hour'), get('minute'), get('second')]
        const cx = W / 2
        const cy = H / 2
        const R = W * 0.46
        g.fillStyle = theme.card.bg
        g.beginPath()
        g.arc(cx, cy, R, 0, Math.PI * 2)
        g.fill()
        g.strokeStyle = theme.card.border
        g.lineWidth = 4
        g.stroke()
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2
          g.strokeStyle = i % 3 === 0 ? theme.card.text : theme.card.sub
          g.lineWidth = i % 3 === 0 ? 8 : 4
          g.beginPath()
          g.moveTo(cx + Math.sin(a) * R * 0.8, cy - Math.cos(a) * R * 0.8)
          g.lineTo(cx + Math.sin(a) * R * 0.9, cy - Math.cos(a) * R * 0.9)
          g.stroke()
        }
        const hand = (a: number, len: number, wdt: number, color: string) => {
          g.strokeStyle = color
          g.lineWidth = wdt
          g.lineCap = 'round'
          g.beginPath()
          g.moveTo(cx, cy)
          g.lineTo(cx + Math.sin(a) * len, cy - Math.cos(a) * len)
          g.stroke()
        }
        hand(((hh % 12) + mm / 60) * (Math.PI / 6), R * 0.5, 12, theme.card.text)
        hand((mm + ss / 60) * (Math.PI / 30), R * 0.72, 8, theme.card.text)
        hand(ss * (Math.PI / 30), R * 0.78, 3, theme.accent)
        g.fillStyle = theme.accent
        g.beginPath()
        g.arc(cx, cy, 10, 0, Math.PI * 2)
        g.fill()
      }}
    />
  )
}

// ---------- calendário ----------

export function Calendar({ item }: { item: Item }) {
  return (
    <CanvasPanel
      item={item}
      w={2.2}
      h={2.2}
      px={640}
      every={60_000}
      target={null}
      draw={(g, W, H, theme) => {
        const now = new Date()
        const y = now.getFullYear()
        const m = now.getMonth()
        g.textAlign = 'left'
        g.textBaseline = 'alphabetic'
        g.fillStyle = theme.card.text
        g.font = `300 ${W * 0.075}px ${FONT}`
        const title = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
        g.fillText(title[0].toUpperCase() + title.slice(1), W * 0.08, H * 0.14)
        const days = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
        const cw = (W * 0.84) / 7
        g.textAlign = 'center'
        g.fillStyle = theme.card.sub
        g.font = `500 ${W * 0.035}px ${FONT}`
        days.forEach((d, i) => g.fillText(d, W * 0.08 + cw * (i + 0.5), H * 0.24))
        const first = new Date(y, m, 1).getDay()
        const count = new Date(y, m + 1, 0).getDate()
        g.font = `400 ${W * 0.042}px ${FONT}`
        for (let d = 1; d <= count; d++) {
          const idx = first + d - 1
          const cx = W * 0.08 + cw * ((idx % 7) + 0.5)
          const cy = H * 0.33 + Math.floor(idx / 7) * H * 0.11
          if (d === now.getDate()) {
            g.fillStyle = theme.accent
            g.beginPath()
            g.arc(cx, cy - W * 0.014, W * 0.04, 0, Math.PI * 2)
            g.fill()
            g.fillStyle = theme.dark ? '#111' : '#fff'
          } else g.fillStyle = idx % 7 === 0 ? theme.card.sub : theme.card.text
          g.fillText(String(d), cx, cy)
        }
      }}
    />
  )
}

// ---------- pomodoro ----------

let chimeCtx: AudioContext | null = null
function chime() {
  try {
    chimeCtx ??= new AudioContext()
    const t = chimeCtx.currentTime
    for (const [i, f] of [523.25, 659.25, 783.99].entries()) {
      const o = chimeCtx.createOscillator()
      const gain = chimeCtx.createGain()
      o.frequency.value = f
      gain.gain.setValueAtTime(0, t + i * 0.12)
      gain.gain.linearRampToValueAtTime(0.18, t + i * 0.12 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 1.2)
      o.connect(gain).connect(chimeCtx.destination)
      o.start(t + i * 0.12)
      o.stop(t + i * 0.12 + 1.3)
    }
  } catch {}
}

export function Pomodoro({ item }: { item: Item }) {
  const work = Math.max(1, Number(item.props.work) || 25) * 60_000
  const rest = Math.max(1, Number(item.props.rest) || 5) * 60_000
  const st = useRef({ mode: 'foco' as 'foco' | 'pausa', running: false, left: work, endsAt: 0 })
  const [, bump] = useState(0)
  useEffect(() => {
    const s = st.current
    if (!s.running) s.left = s.mode === 'foco' ? work : rest
  }, [work, rest])
  useEffect(() => {
    const id = setInterval(() => {
      const s = st.current
      if (!s.running) return
      s.left = s.endsAt - Date.now()
      if (s.left <= 0) {
        chime()
        s.mode = s.mode === 'foco' ? 'pausa' : 'foco'
        s.left = s.mode === 'foco' ? work : rest
        s.endsAt = Date.now() + s.left
        say(s.mode === 'pausa' ? 'Pomodoro: hora da pausa' : 'Pomodoro: bora focar')
      }
      bump((n) => n + 1)
    }, 500)
    return () => clearInterval(id)
  }, [work, rest])
  const s = st.current
  const toggle = () => {
    s.running = !s.running
    if (s.running) s.endsAt = Date.now() + s.left
    bump((n) => n + 1)
  }
  const reset = () => {
    Object.assign(s, { mode: 'foco', running: false, left: work })
    bump((n) => n + 1)
  }
  const total = s.mode === 'foco' ? work : rest
  const mm = Math.max(0, Math.ceil(s.left / 1000))
  return (
    <CanvasPanel
      item={item}
      w={1.7}
      h={1.9}
      px={512}
      deps={[mm, s.running, s.mode]}
      target={{ id: `pomo:${item.id}`, title: 'Pomodoro', verb: s.running ? 'Pausar' : 'Começar', run: toggle, alt: { verb: 'Zerar', run: reset } }}
      draw={(g, W, H, theme) => {
        const cx = W / 2
        const cy = H * 0.44
        const R = W * 0.34
        g.lineCap = 'round'
        g.lineWidth = 18
        g.strokeStyle = theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
        g.beginPath()
        g.arc(cx, cy, R, 0, Math.PI * 2)
        g.stroke()
        g.strokeStyle = s.mode === 'foco' ? theme.accent : '#4cc38a'
        g.beginPath()
        g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - s.left / total))
        g.stroke()
        g.fillStyle = theme.card.text
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.font = `300 ${W * 0.16}px ${FONT}`
        g.fillText(`${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`, cx, cy)
        g.fillStyle = theme.card.sub
        g.font = `500 ${W * 0.06}px ${FONT}`
        g.fillText(s.mode === 'foco' ? 'FOCO' : 'PAUSA', cx, H * 0.84)
        g.font = `400 ${W * 0.045}px ${FONT}`
        g.fillText(s.running ? 'E pausa · F zera' : 'E começa', cx, H * 0.92)
      }}
    />
  )
}

// ---------- post-it ----------

export function Note({ item }: { item: Item }) {
  const text = String(item.props.text ?? '')
  const color = String(item.props.color || '#ffd76a')
  return (
    <CanvasPanel
      item={item}
      w={1.3}
      h={1.3}
      px={512}
      bg={false}
      back={color}
      deps={[text, color]}
      target={{ id: `note:${item.id}`, title: 'Post-it', verb: 'Escrever', run: () => edit(item.id) }}
      draw={(g, W, H, _theme, hovered) => {
        g.fillStyle = color
        g.shadowColor = 'rgba(0,0,0,0.25)'
        g.shadowBlur = 18
        g.fillRect(14, 14, W - 28, H - 28)
        g.shadowBlur = 0
        if (hovered) {
          g.strokeStyle = 'rgba(0,0,0,0.35)'
          g.lineWidth = 6
          g.strokeRect(14, 14, W - 28, H - 28)
        }
        g.fillStyle = 'rgba(0,0,0,0.82)'
        g.textAlign = 'left'
        g.textBaseline = 'top'
        let size = W * 0.1
        g.font = `500 ${size}px ${FONT}`
        let lines = wrap(g, text, W - 90)
        while (lines.length * size * 1.3 > H - 90 && size > 16) {
          size -= 2
          g.font = `500 ${size}px ${FONT}`
          lines = wrap(g, text, W - 90)
        }
        lines.forEach((l, i) => g.fillText(l, 45, 45 + i * size * 1.3))
      }}
    />
  )
}

// ---------- lista de tarefas ----------

type Task = { text: string; done: boolean }

export function Todo({ item }: { item: Item }) {
  const tasks = (item.props.items as Task[] | undefined) ?? []
  const title = String(item.props.title || 'Tarefas')
  return (
    <CanvasPanel
      item={item}
      w={1.8}
      h={2.2}
      px={720}
      deps={[JSON.stringify(tasks), title]}
      target={{ id: `todo:${item.id}`, title, verb: 'Editar tarefas', run: () => edit(item.id) }}
      draw={(g, W, H, theme) => {
        g.textAlign = 'left'
        g.textBaseline = 'alphabetic'
        g.fillStyle = theme.card.text
        fitText(g, title, W * 0.8, 400, W * 0.1)
        g.fillText(title, W * 0.1, H * 0.12)
        const left = tasks.filter((t) => !t.done).length
        g.fillStyle = theme.card.sub
        g.font = `400 ${W * 0.052}px ${FONT}`
        g.fillText(tasks.length ? `${left} de ${tasks.length} pra fazer` : 'aperte E pra adicionar', W * 0.1, H * 0.18)
        tasks.slice(0, 8).forEach((t, i) => {
          const y = H * 0.29 + i * H * 0.088
          g.strokeStyle = t.done ? theme.accent : theme.card.sub
          g.lineWidth = 3
          g.beginPath()
          g.roundRect(W * 0.1, y - W * 0.052, W * 0.064, W * 0.064, 8)
          g.stroke()
          if (t.done) {
            g.fillStyle = theme.accent
            g.fill()
          }
          g.fillStyle = t.done ? theme.card.sub : theme.card.text
          fitText(g, t.text, W * 0.7, 400, W * 0.068)
          g.fillText(t.text, W * 0.2, y)
          if (t.done) {
            const w = g.measureText(t.text).width
            g.fillRect(W * 0.2, y - W * 0.022, w, 3)
          }
        })
      }}
    />
  )
}

// ---------- tocando agora ----------

const media = {
  data: null as Media | null,
  art: null as HTMLImageElement | null,
  artPath: null as string | null,
  users: 0,
  timer: 0,
  listeners: new Set<() => void>(),
}
// a capa só recarrega quando o arquivo muda (o script guarda uma por música)
async function setMedia(d: Media | null) {
  const path = d?.art ?? null
  if (path !== media.artPath) {
    media.artPath = path
    media.art = path ? await loadImage(pc.fileUrl(path)).catch(() => null) : null
  }
  media.data = d
  media.listeners.forEach((f) => f())
}
const pollMedia = async () => setMedia(await pc.media('status').catch(() => null))
// pros testes escondidos: forçar música sem capa, etc.
Object.assign(window, { __media: { media, setMedia } })
function useMedia() {
  const [, bump] = useState(0)
  useEffect(() => {
    const f = () => bump((n) => n + 1)
    media.listeners.add(f)
    if (media.users++ === 0) {
      pollMedia()
      media.timer = window.setInterval(pollMedia, 4000)
    }
    return () => {
      media.listeners.delete(f)
      if (--media.users === 0) clearInterval(media.timer)
    }
  }, [])
  return media
}
const mediaCmd = async (cmd: 'play' | 'next' | 'prev') => {
  const d = await pc.media(cmd).catch(() => undefined)
  if (d !== undefined) await setMedia(d)
  setTimeout(pollMedia, 600)
}

const SPOTIFY = '#1ED760'
// logo do Spotify: círculo verde com as três ondas
function spotifyLogo(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  g.fillStyle = SPOTIFY
  g.beginPath()
  g.arc(cx, cy, r, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#000'
  g.lineCap = 'round'
  const waves: [number, number, number][] = [
    [-0.3, 1.18, 0.17],
    [0.04, 0.98, 0.14],
    [0.34, 0.78, 0.11],
  ]
  for (const [dy, w, t] of waves) {
    const y = cy + dy * r
    const half = (w * r) / 2
    g.lineWidth = t * r
    g.beginPath()
    g.moveTo(cx - half, y + 0.02 * r)
    g.quadraticCurveTo(cx - 0.05 * r, y - 0.26 * r, cx + half * 0.96, y + 0.12 * r)
    g.stroke()
  }
}
// recorte quadrado do meio (capas de vídeo vêm 16:9)
function drawCover(g: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const k = Math.max(w / img.width, h / img.height)
  const sw = w / k
  const sh = h / k
  g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h)
}
// fundo desfocado da capa, feito uma vez por capa e tamanho (blur no canvas é caro)
const backdrops = new WeakMap<HTMLImageElement, HTMLCanvasElement>()
function backdrop(img: HTMLImageElement | null, W: number, H: number) {
  const hit = img && backdrops.get(img)
  if (hit && hit.width === W && hit.height === H) return hit
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = '#0b0c0e'
  g.fillRect(0, 0, W, H)
  if (img) {
    g.filter = `blur(${Math.round(H * 0.09)}px) saturate(1.4)`
    drawCover(g, img, -W * 0.15, -H * 0.6, W * 1.3, H * 2.2)
    g.filter = 'none'
    const sh = g.createLinearGradient(0, 0, W, 0)
    sh.addColorStop(0, 'rgba(0,0,0,0.35)')
    sh.addColorStop(1, 'rgba(0,0,0,0.7)')
    g.fillStyle = sh
    g.fillRect(0, 0, W, H)
    backdrops.set(img, c)
  } else {
    const glowG = g.createRadialGradient(H * 0.5, H * 0.5, 0, H * 0.5, H * 0.5, W * 0.7)
    glowG.addColorStop(0, 'rgba(30,215,96,0.16)')
    glowG.addColorStop(1, 'rgba(30,215,96,0)')
    g.fillStyle = glowG
    g.fillRect(0, 0, W, H)
  }
  return c
}
// encolhe até 70% do tamanho e, se ainda não couber, corta com reticências
function fitLine(g: CanvasRenderingContext2D, text: string, max: number, weight: number, size: number) {
  let s = size
  const font = () => (g.font = `${weight} ${s}px ${FONT}`)
  font()
  while (g.measureText(text).width > max && s > size * 0.7) {
    s -= 2
    font()
  }
  if (g.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && g.measureText(t + '…').width > max) t = t.slice(0, -1)
  return t.trimEnd() + '…'
}
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
// posição agora: o Windows manda onde estava e quando mediu, o resto anda aqui
function position(d: Media) {
  if (d.pos == null || !d.dur) return null
  const p = d.playing && d.at ? d.pos + (Date.now() - d.at) / 1000 : d.pos
  return Math.min(Math.max(p, 0), d.dur)
}
function playIcon(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, playing: boolean) {
  g.beginPath()
  if (playing) {
    g.roundRect(cx - s * 0.42, cy - s * 0.5, s * 0.3, s, s * 0.06)
    g.roundRect(cx + s * 0.12, cy - s * 0.5, s * 0.3, s, s * 0.06)
  } else {
    g.moveTo(cx - s * 0.32, cy - s * 0.52)
    g.lineTo(cx + s * 0.5, cy)
    g.lineTo(cx - s * 0.32, cy + s * 0.52)
    g.closePath()
  }
  g.fill()
}
function skipIcon(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, dir: 1 | -1) {
  g.beginPath()
  g.moveTo(cx - dir * s * 0.45, cy - s * 0.5)
  g.lineTo(cx + dir * s * 0.3, cy)
  g.lineTo(cx - dir * s * 0.45, cy + s * 0.5)
  g.closePath()
  g.fill()
  g.beginPath()
  g.roundRect(cx + dir * s * 0.3 - (dir > 0 ? 0 : s * 0.16), cy - s * 0.5, s * 0.16, s, s * 0.04)
  g.fill()
}

export function Music({ item }: { item: Item }) {
  const m = useMedia()
  const d = m.data
  return (
    <CanvasPanel
      item={item}
      w={2.6}
      h={1.1}
      px={1024}
      // tocando: redesenha pra barra andar e o equalizador mexer; pausado fica parado
      every={d?.playing ? 180 : 0}
      deps={[d?.title, d?.artist, d?.album, d?.playing, d?.pos, d?.dur, m.art]}
      target={{ id: `music:${item.id}`, title: d?.title || 'Tocando agora', verb: d?.playing ? 'Pausar' : 'Tocar', run: () => mediaCmd('play'), alt: { verb: 'Próxima', run: () => mediaCmd('next') } }}
      draw={(g, W, H, theme, hovered) => {
        const R = W * 0.05
        g.save()
        g.beginPath()
        g.roundRect(3, 3, W - 6, H - 6, R)
        g.clip()
        g.drawImage(backdrop(m.art, W, H), 0, 0)
        g.restore()

        // capa (ou quadrado preto com a logo do Spotify)
        const pad = H * 0.12
        const s = H - pad * 2
        g.save()
        g.shadowColor = 'rgba(0,0,0,0.55)'
        g.shadowBlur = H * 0.08
        g.shadowOffsetY = H * 0.025
        g.fillStyle = '#000'
        g.beginPath()
        g.roundRect(pad, pad, s, s, H * 0.045)
        g.fill()
        g.restore()
        if (m.art) {
          g.save()
          g.beginPath()
          g.roundRect(pad, pad, s, s, H * 0.045)
          g.clip()
          drawCover(g, m.art, pad, pad, s, s)
          g.restore()
        } else spotifyLogo(g, pad + s / 2, pad + s / 2, s * 0.26)

        const x = pad * 2 + s
        const right = W - pad
        const maxW = right - x
        const playing = !!d?.playing
        g.textAlign = 'left'
        g.textBaseline = 'alphabetic'

        // rótulo + logo pequena + equalizador
        const ly = H * 0.2
        spotifyLogo(g, x + H * 0.03, ly - H * 0.02, H * 0.03)
        g.fillStyle = 'rgba(255,255,255,0.7)'
        g.font = `600 ${H * 0.05}px ${FONT}`
        g.letterSpacing = `${H * 0.006}px`
        g.fillText(d ? (playing ? 'TOCANDO AGORA' : 'PAUSADO') : 'NADA TOCANDO', x + H * 0.085, ly)
        g.letterSpacing = '0px'
        const t = performance.now() / 1000
        const bw = H * 0.016
        for (let i = 0; i < 4; i++) {
          const k = playing ? 0.35 + 0.65 * Math.abs(Math.sin(t * (2.1 + i * 0.7) + i * 1.7)) : 0.25
          const bh = H * 0.065 * k
          g.fillStyle = playing ? SPOTIFY : 'rgba(255,255,255,0.35)'
          g.beginPath()
          g.roundRect(right - (4 - i) * bw * 1.8, ly - bh, bw, bh, bw / 2)
          g.fill()
        }

        // título, artista, álbum
        const title = d?.title || 'Abra o Spotify ou um vídeo'
        g.fillStyle = '#fff'
        g.fillText(fitLine(g, title, maxW, 650, H * 0.12), x, H * 0.37)
        g.fillStyle = 'rgba(255,255,255,0.78)'
        g.fillText(fitLine(g, d?.artist || (d ? '' : 'a música aparece aqui'), maxW, 400, H * 0.072), x, H * 0.47)
        if (d?.album && d.album !== d.title) {
          g.fillStyle = 'rgba(255,255,255,0.48)'
          g.fillText(fitLine(g, d.album, maxW, 400, H * 0.056), x, H * 0.555)
        }

        // barra de progresso
        const p = d ? position(d) : null
        const by = H * 0.635
        const bh = H * 0.014
        g.fillStyle = 'rgba(255,255,255,0.18)'
        g.beginPath()
        g.roundRect(x, by - bh / 2, maxW, bh, bh / 2)
        g.fill()
        if (p != null && d?.dur) {
          const f = p / d.dur
          g.fillStyle = '#fff'
          g.beginPath()
          g.roundRect(x, by - bh / 2, Math.max(bh, maxW * f), bh, bh / 2)
          g.fill()
          g.beginPath()
          g.arc(x + maxW * f, by, bh * 1.3, 0, Math.PI * 2)
          g.fill()
          g.fillStyle = 'rgba(255,255,255,0.55)'
          g.font = `500 ${H * 0.045}px ${FONT}`
          g.fillText(clock(p), x, H * 0.715)
          g.textAlign = 'right'
          g.fillText(clock(d.dur), right, H * 0.715)
          g.textAlign = 'left'
        }

        // controles (E toca/pausa, F próxima)
        const cy = H * 0.82
        const cr = H * 0.068
        const cx = x + cr
        g.fillStyle = '#fff'
        g.beginPath()
        g.arc(cx, cy, cr, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = '#000'
        playIcon(g, cx + (playing ? 0 : cr * 0.06), cy, cr * 0.8, playing)
        g.fillStyle = 'rgba(255,255,255,0.85)'
        skipIcon(g, cx + cr * 2.3, cy, cr * 0.72, 1)
        const key = (k: string, kx: number, label: string) => {
          g.font = `600 ${H * 0.042}px ${FONT}`
          const kw = H * 0.075
          g.strokeStyle = 'rgba(255,255,255,0.4)'
          g.lineWidth = 2
          g.beginPath()
          g.roundRect(kx, cy - kw / 2, kw, kw, H * 0.014)
          g.stroke()
          g.fillStyle = 'rgba(255,255,255,0.85)'
          g.textAlign = 'center'
          g.fillText(k, kx + kw / 2, cy + H * 0.015)
          g.textAlign = 'left'
          g.fillStyle = 'rgba(255,255,255,0.55)'
          g.font = `400 ${H * 0.045}px ${FONT}`
          g.fillText(label, kx + kw + H * 0.02, cy + H * 0.016)
          return kx + kw + H * 0.02 + g.measureText(label).width
        }
        const hintW = (() => {
          g.font = `400 ${H * 0.045}px ${FONT}`
          return H * 0.075 * 2 + H * 0.02 * 2 + H * 0.05 + g.measureText(playing ? 'pausar' : 'tocar').width + g.measureText('próxima').width
        })()
        const after = key('E', right - hintW, playing ? 'pausar' : 'tocar')
        key('F', after + H * 0.05, 'próxima')

        if (hovered) {
          g.strokeStyle = theme.accent
          g.lineWidth = 6
          g.beginPath()
          g.roundRect(3, 3, W - 6, H - 6, R)
          g.stroke()
        }
      }}
    />
  )
}

// ---------- clima (open-meteo, sem chave) ----------

const WEATHER: Record<number, [string, string]> = {
  0: ['Céu limpo', '☀'],
  1: ['Quase limpo', '🌤'],
  2: ['Parcialmente nublado', '⛅'],
  3: ['Nublado', '☁'],
  45: ['Neblina', '🌫'],
  48: ['Neblina', '🌫'],
  51: ['Garoa', '🌦'],
  53: ['Garoa', '🌦'],
  55: ['Garoa forte', '🌧'],
  61: ['Chuva fraca', '🌦'],
  63: ['Chuva', '🌧'],
  65: ['Chuva forte', '🌧'],
  80: ['Pancadas', '🌦'],
  81: ['Pancadas', '🌧'],
  82: ['Temporal', '⛈'],
  95: ['Trovoadas', '⛈'],
  96: ['Trovoadas', '⛈'],
  99: ['Trovoadas', '⛈'],
}
type Wx = { city: string; temp: number; code: number; max: number; min: number } | { error: string }

export function Weather({ item }: { item: Item }) {
  const city = String(item.props.city || 'São Paulo')
  const [wx, setWx] = useState<Wx | null>(null)
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const geo = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=pt&name=${encodeURIComponent(city)}`)).json()
        const p = geo.results?.[0]
        if (!p) return alive && setWx({ error: 'Cidade não encontrada' })
        const f = await (
          await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`)
        ).json()
        if (alive) setWx({ city: p.name, temp: f.current.temperature_2m, code: f.current.weather_code, max: f.daily.temperature_2m_max[0], min: f.daily.temperature_2m_min[0] })
      } catch {
        if (alive) setWx({ error: 'Sem internet' })
      }
    }
    load()
    const id = setInterval(load, 30 * 60_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [city])
  return (
    <CanvasPanel
      item={item}
      w={2.2}
      h={1.3}
      px={704}
      deps={[JSON.stringify(wx)]}
      target={null}
      draw={(g, W, H, theme) => {
        g.textBaseline = 'alphabetic'
        if (!wx || 'error' in wx) {
          g.fillStyle = theme.card.sub
          g.textAlign = 'center'
          g.font = `400 ${H * 0.12}px ${FONT}`
          g.fillText(wx && 'error' in wx ? wx.error : `Buscando o clima de ${city}...`, W / 2, H / 2)
          return
        }
        const [desc, icon] = WEATHER[wx.code] ?? ['', '·']
        g.textAlign = 'left'
        g.font = `${H * 0.42}px "Segoe UI Emoji", ${FONT}`
        g.fillText(icon, W * 0.07, H * 0.62)
        g.fillStyle = theme.card.text
        g.font = `200 ${H * 0.42}px ${FONT}`
        g.fillText(`${Math.round(wx.temp)}°`, W * 0.4, H * 0.6)
        g.fillStyle = theme.card.sub
        g.font = `500 ${H * 0.1}px ${FONT}`
        fitText(g, wx.city.toUpperCase(), W * 0.86, 500, H * 0.1)
        g.fillText(wx.city.toUpperCase(), W * 0.07, H * 0.18)
        g.font = `400 ${H * 0.1}px ${FONT}`
        g.fillText(`${desc} · ${Math.round(wx.min)}° / ${Math.round(wx.max)}°`, W * 0.07, H * 0.85)
      }}
    />
  )
}

// ---------- porta-retrato (passa as fotos de uma pasta) ----------

export function Photos({ item }: { item: Item }) {
  const places = useUI((s) => s.places)
  const folder = String(item.props.folder || places.find((p) => p.key === 'pictures')?.path || '')
  const [imgs, setImgs] = useState<string[]>([])
  const [idx, setIdx] = useState(0)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!folder) return
    let alive = true
    pc.list(folder).then((l) => alive && setImgs(l.items.filter((i) => /^(png|jpe?g|webp|gif|bmp)$/.test(i.ext)).map((i) => i.path)))
    return () => {
      alive = false
    }
  }, [folder])
  useEffect(() => {
    if (imgs.length < 2) return
    const id = setInterval(() => setIdx((i) => (i + 1) % imgs.length), 8000)
    return () => clearInterval(id)
  }, [imgs.length])
  useEffect(() => {
    const p = imgs[idx % Math.max(1, imgs.length)]
    if (!p) return setImg(null)
    let alive = true
    pc.thumb(p).then((t) => {
      if (t) loadImage(t).then((im) => alive && setImg(im))
    })
    return () => {
      alive = false
    }
  }, [imgs, idx])
  return (
    <CanvasPanel
      item={item}
      w={2.2}
      h={1.6}
      px={768}
      deps={[img, imgs.length]}
      target={{ id: `photos:${item.id}`, title: 'Porta-retrato', verb: 'Próxima foto', run: () => setIdx((i) => i + 1), alt: { verb: 'Abrir a pasta', run: () => folder && pc.open(folder) } }}
      draw={(g, W, H, theme) => {
        const pad = W * 0.03
        g.fillStyle = '#0c0d10'
        g.fillRect(pad, pad, W - pad * 2, H - pad * 2)
        if (img) {
          const s = Math.max((W - pad * 2) / img.width, (H - pad * 2) / img.height)
          g.save()
          g.beginPath()
          g.rect(pad, pad, W - pad * 2, H - pad * 2)
          g.clip()
          g.drawImage(img, W / 2 - (img.width * s) / 2, H / 2 - (img.height * s) / 2, img.width * s, img.height * s)
          g.restore()
        } else {
          g.fillStyle = theme.card.sub
          g.textAlign = 'center'
          g.textBaseline = 'middle'
          g.font = `400 ${H * 0.07}px ${FONT}`
          g.fillText(imgs.length ? 'carregando...' : 'escolha uma pasta com fotos (B, editar)', W / 2, H / 2)
        }
      }}
    />
  )
}

// ---------- letreiro ----------

export function TextSign({ item }: { item: Item }) {
  const text = String(item.props.text || 'Meu espaço')
  const color = String(item.props.color || '#ffffff')
  return (
    <CanvasPanel
      item={item}
      w={6}
      h={1.2}
      px={1024}
      bg={false}
      stand={false}
      deps={[text, color]}
      target={null}
      draw={(g, W, H) => {
        g.fillStyle = color
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        ;(g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '6px'
        fitText(g, text, W * 0.95, 300, H * 0.62)
        g.fillText(text, W / 2, H / 2)
      }}
    />
  )
}

// ---------- atalho solto ----------

const cardBack = roundedRect(1.2, 1.2, 1.2 * 0.12)

export function ShortcutItem({ item }: { item: Item }) {
  const shortcuts = useUI((s) => s.shortcuts)
  const theme = useUI((s) => s.theme)
  const sc = shortcuts.find((s) => s.path === item.props.path) ?? null
  const tex = useMemo(() => canvasTexture(256, 256), [])
  const id = `shortcut:${item.id}`
  const hovered = useHovered(id)
  useEffect(() => {
    let alive = true
    const name = sc?.name ?? 'Escolha um atalho'
    drawCard(tex, name, theme, { tag: sc ? initials(name) : '+' })
    if (sc?.icon) loadImage(sc.icon).then((img) => alive && drawCard(tex, name, theme, { icon: img }))
    return () => {
      alive = false
    }
  }, [sc, tex, theme])
  const handlers = useHoverable(sc ? { id, title: sc.name, verb: 'Abrir aqui dentro', run: () => openShortcut(sc), alt: { verb: 'Abrir fora do mundo', run: () => pc.openShortcut(sc.path) } } : { id, title: 'Atalho solto', verb: 'Escolher atalho (B, editar)', run: () => useRooms.getState().setBuild(true) })
  const standH = item.y / item.scale - 0.6
  return (
    <group>
      <mesh {...handlers} scale={hovered ? 1.06 : 1}>
        <planeGeometry args={[1.2, 1.2]} />
        <meshBasicMaterial map={tex} transparent toneMapped={false} />
      </mesh>
      <mesh geometry={cardBack} rotation-y={Math.PI} position-z={-0.004}>
        <meshStandardMaterial color={backColor(theme)} roughness={0.85} />
      </mesh>
      {standH > 0.05 && (
        <mesh position={[0, -0.6 - standH / 2, -0.02]}>
          <cylinderGeometry args={[0.02, 0.02, standH, 8]} />
          <meshBasicMaterial color={glow(theme.accent, 1)} />
        </mesh>
      )}
    </group>
  )
}
