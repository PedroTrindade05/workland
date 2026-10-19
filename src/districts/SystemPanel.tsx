import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { pc, type Stats } from '../pc'
import { useUI } from '../store'
import type { Item } from '../rooms'
import { FONT, canvasTexture } from '../textures'
import { useHoverable, useHovered } from '../interact'
import { ArcWall } from '../world/ArcWall'
import type { Theme } from '../themes'

// tela curva acompanhando a parede (um painel plano atravessava a parede nas pontas)
const WALL_R = 24
const SPAN = 40
const R = WALL_R - 0.45
const PW = 14.4
const PH = 6
const CW = 2400
const CH = 1000
const PAD = 90

type Battery = { level: number; charging: boolean } | null
type State = { st: Stats | null; hist: number[]; battery: Battery; hovered: boolean }

// plano dobrado sobre o arco: as pontas vêm pra frente, côncavo pro centro do salão
function bentPlane(w: number, h: number, r: number) {
  const g = new THREE.PlaneGeometry(w, h, 64, 1)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const a = p.getX(i) / r
    p.setX(i, Math.sin(a) * r)
    p.setZ(i, r * (1 - Math.cos(a)))
  }
  g.computeVertexNormals()
  return g
}

const gb = (b: number) => b / 1024 ** 3
function fmtGB(b: number) {
  const v = gb(b)
  return v >= 100 ? v.toFixed(0) : v.toFixed(1).replace('.', ',')
}
function fmtUptime(s: number) {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d) return `${d} ${d > 1 ? 'dias' : 'dia'} e ${h}h`
  return h ? `${h}h ${m}min` : `${m} min`
}

// texto que encolhe até caber na largura
function fit(g: CanvasRenderingContext2D, text: string, max: number, weight: number, size: number) {
  let s = size
  g.font = `${weight} ${s}px ${FONT}`
  while (g.measureText(text).width > max && s > 12) {
    s -= 2
    g.font = `${weight} ${s}px ${FONT}`
  }
  return s
}
function ellipsize(g: CanvasRenderingContext2D, text: string, max: number) {
  if (g.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && g.measureText(t + '…').width > max) t = t.slice(0, -1)
  return t + '…'
}

function draw(c: HTMLCanvasElement, s: State, theme: Theme) {
  const g = c.getContext('2d')!
  const ink = theme.card.text
  const muted = theme.card.sub
  const track = theme.dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)'
  g.clearRect(0, 0, CW, CH)

  // fundo
  g.fillStyle = theme.card.bg
  g.beginPath()
  g.roundRect(4, 4, CW - 8, CH - 8, 56)
  g.fill()
  g.strokeStyle = s.hovered ? theme.accent : theme.card.border
  g.lineWidth = s.hovered ? 8 : 3
  g.stroke()

  // ---- coluna da esquerda: hora e máquina ----
  const now = new Date()
  const leftW = 760
  g.textAlign = 'left'
  g.textBaseline = 'alphabetic'
  g.fillStyle = ink
  fit(g, '00:00', leftW, 250, 250)
  g.fillText(now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), PAD - 8, PAD + 220)
  g.fillStyle = muted
  const date = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  fit(g, date, leftW, 400, 44)
  g.fillText(date, PAD, PAD + 300)

  g.fillStyle = track
  g.fillRect(PAD, PAD + 360, leftW, 3)

  const st = s.st
  if (st) {
    g.fillStyle = ink
    fit(g, st.host, leftW, 600, 46)
    g.fillText(ellipsize(g, st.host, leftW), PAD, PAD + 450)
    g.fillStyle = muted
    g.font = `400 36px ${FONT}`
    const lines = [`${st.user}  ·  ligado há ${fmtUptime(st.uptime)}`, `${st.cpuName.replace(/\s+/g, ' ')}`, `${st.cores} núcleos  ·  ${fmtGB(st.memTotal)} GB de memória`]
    lines.forEach((l, i) => g.fillText(ellipsize(g, l, leftW), PAD, PAD + 515 + i * 54))
  }
  g.fillStyle = muted
  g.font = `400 30px ${FONT}`
  g.fillText('clique pra abrir o Gerenciador de Tarefas', PAD, CH - PAD + 10)

  // divisória vertical
  const rx = PAD + leftW + 90
  g.fillStyle = track
  g.fillRect(rx - 45, PAD, 3, CH - PAD * 2)

  if (!st) return

  // ---- medidores ----
  const rw = CW - PAD - rx
  type Meter = { label: string; value: number; big: string; sub: string }
  const meters: Meter[] = [
    { label: 'CPU', value: st.cpu, big: `${Math.round(st.cpu * 100)}%`, sub: `${st.cores} núcleos` },
    { label: 'Memória', value: st.memUsed / st.memTotal, big: `${Math.round((st.memUsed / st.memTotal) * 100)}%`, sub: `${fmtGB(st.memUsed)} de ${fmtGB(st.memTotal)} GB` },
  ]
  if (st.diskTotal)
    meters.push({
      label: 'Disco',
      value: st.diskUsed / st.diskTotal,
      big: `${Math.round((st.diskUsed / st.diskTotal) * 100)}%`,
      sub: `${fmtGB(st.diskTotal - st.diskUsed)} GB livres`,
    })
  if (s.battery)
    meters.push({
      label: 'Bateria',
      value: s.battery.level,
      big: `${Math.round(s.battery.level * 100)}%`,
      sub: s.battery.charging ? 'carregando' : 'na bateria',
    })
  const cell = rw / meters.length
  const radius = Math.min(118, cell / 2 - 40)
  const cy = PAD + 170
  meters.forEach((m, i) => {
    const cx = rx + cell * i + cell / 2
    g.lineCap = 'round'
    g.lineWidth = 18
    g.strokeStyle = track
    g.beginPath()
    g.arc(cx, cy, radius, 0, Math.PI * 2)
    g.stroke()
    // passou de 90%: avisa com a cor
    g.strokeStyle = m.value > 0.9 && m.label !== 'Bateria' ? '#e5484d' : theme.accent
    g.beginPath()
    g.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.005, Math.min(1, m.value)))
    g.stroke()
    g.textAlign = 'center'
    g.fillStyle = ink
    g.font = `${theme.dark ? 300 : 400} ${Math.round(radius * 0.52)}px ${FONT}`
    g.textBaseline = 'middle'
    g.fillText(m.big, cx, cy + 4)
    g.textBaseline = 'alphabetic'
    g.font = `500 40px ${FONT}`
    g.fillText(m.label, cx, cy + radius + 74)
    g.fillStyle = muted
    fit(g, m.sub, cell - 30, 400, 32)
    g.fillText(m.sub, cx, cy + radius + 122)
  })

  // ---- histórico da CPU ----
  const gx = rx
  const gw = rw
  const gy = PAD + 520
  const gh = CH - PAD - gy - 10
  g.textAlign = 'left'
  g.fillStyle = muted
  g.font = `400 32px ${FONT}`
  g.fillText('CPU nos últimos 2 minutos', gx, gy - 20)
  g.fillStyle = track
  g.fillRect(gx, gy + gh, gw, 2)
  const h = s.hist
  if (h.length > 1) {
    const pt = (v: number, i: number) => [gx + (i / (h.length - 1)) * gw, gy + gh - Math.min(1, v) * gh] as const
    const grad = g.createLinearGradient(0, gy, 0, gy + gh)
    grad.addColorStop(0, theme.accent + '55')
    grad.addColorStop(1, theme.accent + '00')
    g.beginPath()
    g.moveTo(gx, gy + gh)
    h.forEach((v, i) => g.lineTo(...pt(v, i)))
    g.lineTo(gx + gw, gy + gh)
    g.closePath()
    g.fillStyle = grad
    g.fill()
    g.beginPath()
    h.forEach((v, i) => (i ? g.lineTo(...pt(v, i)) : g.moveTo(...pt(v, i))))
    g.strokeStyle = theme.accent
    g.lineWidth = 4
    g.lineJoin = 'round'
    g.stroke()
  }
}

export function SystemPanel({ item }: { item: Item }) {
  void item
  const theme = useUI((s) => s.theme)
  const tex = useMemo(() => canvasTexture(CW, CH), [])
  const geo = useMemo(() => bentPlane(PW, PH, R), [])
  const themeRef = useRef(theme)
  themeRef.current = theme
  const state = useRef<State>({ st: null, hist: [], battery: null, hovered: false })
  const hovered = useHovered('system')

  const redraw = () => {
    draw(tex.image as HTMLCanvasElement, state.current, themeRef.current)
    tex.needsUpdate = true
  }

  useEffect(() => {
    let alive = true
    // bateria vem direto do Chromium (notebook); em desktop fica sem esse medidor
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean; addEventListener: (t: string, f: () => void) => void }> }
    nav.getBattery?.().then((b) => {
      const upd = () => {
        state.current.battery = { level: b.level, charging: b.charging }
        if (alive) redraw()
      }
      // máquina sem bateria aparece como 100% e carregando: esconde
      if (b.level === 1 && b.charging) return
      upd()
      b.addEventListener('levelchange', upd)
      b.addEventListener('chargingchange', upd)
    })
    const tick = async () => {
      const s = state.current
      // fora da seção só o relógio precisa andar
      const here = useUI.getState().section === 'Sistema' || !s.st
      if (here) {
        s.st = await pc.stats()
        s.hist.push(s.st.cpu)
        if (s.hist.length > 60) s.hist.shift()
      }
      if (alive) redraw()
    }
    tick()
    const id = setInterval(tick, 2000)
    return () => {
      alive = false
      clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tex])

  useEffect(() => {
    state.current.hovered = hovered
    redraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, hovered])

  useEffect(
    () => () => {
      tex.dispose()
      geo.dispose()
    },
    [tex, geo],
  )

  const handlers = useHoverable({
    id: 'system',
    title: 'Painel do sistema',
    verb: 'Abrir o Gerenciador de Tarefas',
    run: () => {
      useUI.getState().say('Abrindo o Gerenciador de Tarefas')
      pc.open('C:\\Windows\\System32\\Taskmgr.exe')
    },
  })
  return (
    <group>
      <ArcWall r={WALL_R} span={SPAN} title="Sistema" theme={theme} height={PH + 1.7} />
      <mesh geometry={geo} position={[0, 0.85 + PH / 2, 0.45]} {...handlers}>
        <meshBasicMaterial map={tex} transparent toneMapped={false} />
      </mesh>
    </group>
  )
}
