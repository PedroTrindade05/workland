// Encontro na rede: conectar na sala (sua ou de outra pessoa), ver quem está lá e manter o telão igual pra todos.
import { create } from 'zustand'
import { pc, type MeetFound } from '../pc'
import { player, teleport, useUI } from '../store'
import { currentRoom, shareableRoom, useRooms, type Room } from '../rooms'
import { forRoom, onPresentChange, setControlCheck, setRoomBase, usePresent, type Present } from '../present/state'
import { closeIncoming, onRtc, peerGone, resetRtc, setRtcSender, wantStream } from './rtc'

// viewer = assistindo pelo navegador (sem boneco, não pega a vez)
export type Peer = { id: string; name: string; look: unknown; host: boolean; viewer?: boolean }

type Meet = {
  status: 'off' | 'connecting' | 'on'
  host: boolean
  me: string | null
  name: string
  base: string
  pin: string
  // pra quem criou: o que passar pro pessoal
  invite: { ips: string[]; port: number; pin: string } | null
  peers: Record<string, Peer>
  presenter: string | null
  error: string | null
}

export const useMeet = create<Meet>(() => ({ status: 'off', host: false, me: null, name: '', base: '', pin: '', invite: null, peers: {}, presenter: null, error: null }))

// posição dos outros (mutável, lida a cada quadro) e reações recentes
export const poses = new Map<string, number[]>()
export const reactions: { id: string; e: string; at: number }[] = []
export const REACTIONS = ['👏', '✋', '👍', '🔥', '😂', '❓'] as const

let ws: WebSocket | null = null
let leaving = false
let welcomed: ((ok: boolean) => void) | null = null

const send = (m: object) => ws?.readyState === 1 && ws.send(JSON.stringify(m))
const say = (t: string) => useUI.getState().say(t)
const nameOf = (id: string | null) => (id && useMeet.getState().peers[id]?.name) || 'Alguém'

export const connected = () => useMeet.getState().status === 'on'
// sozinho você sempre manda no telão; num encontro, só quem tem a vez
export const isPresenter = () => !connected() || useMeet.getState().presenter === useMeet.getState().me

setControlCheck(isPresenter)
setRtcSender((to, data) => send({ t: 'rtc', to, data }))
onPresentChange((s) => connected() && isPresenter() && send({ t: 'present', state: forRoom(s) }))

// ---------- arquivos: num encontro sobem pra sala antes de aparecer ----------

export async function shareFile(path: string) {
  const m = useMeet.getState()
  if (m.status !== 'on') return undefined
  usePresent.getState().setBusy(`Enviando ${path.split(/[\\/]/).pop()} pro pessoal...`)
  try {
    return (await pc.meetShare({ file: path, base: m.base, pin: m.pin })).id
  } catch {
    say('Não deu pra mandar o arquivo pra sala')
    return undefined
  } finally {
    usePresent.getState().setBusy(null)
  }
}

// apresentação escolhida antes de entrar: sobe os arquivos e mostra pra todo mundo
async function reshare() {
  const s = usePresent.getState().state
  if (!s || !isPresenter()) return
  if (s.kind === 'pdf' && s.src.local && !s.src.file) {
    const file = await shareFile(s.src.local)
    return usePresent.getState().apply({ ...s, src: { ...s.src, file } })
  }
  if (s.kind === 'media') {
    const slides = []
    for (const x of s.slides) slides.push(x.src.local && !x.src.file ? { ...x, src: { ...x.src, file: await shareFile(x.src.local) } } : x)
    return usePresent.getState().apply({ ...s, slides }, null)
  }
  usePresent.getState().apply(s, usePresent.getState().winId)
}

// ---------- chegar na sala do encontro ----------

// convidado entra na sala de quem criou, atrás da plateia, olhando pro palco
function enterRoom(room: Pick<Room, 'name' | 'themeId' | 'items'>, first: boolean) {
  useRooms.getState().enterShared(room)
  useUI.getState().setTheme(room.themeId)
  if (!first) return
  const stage = room.items.find((i) => i.kind === 'stage')
  if (!stage) return teleport((Math.random() - 0.5) * 6, 6, Math.PI)
  const fx = Math.sin(stage.rotY)
  const fz = Math.cos(stage.rotY)
  const side = (Math.random() - 0.5) * 8
  const d = 17 + Math.random() * 1.5
  teleport(stage.x + fx * d + fz * side, stage.z + fz * d - fx * side, stage.rotY + Math.PI)
}

function handle(m: { t: string; [k: string]: any }) {
  const st = useMeet.getState()
  switch (m.t) {
    case 'welcome': {
      const peers: Record<string, Peer> = {}
      for (const p of m.peers as (Peer & { p: number[] | null })[]) {
        peers[p.id] = { id: p.id, name: p.name, look: p.look, host: p.host, viewer: !!p.viewer }
        if (p.p) poses.set(p.id, p.p)
      }
      useMeet.setState({ status: 'on', me: m.id, name: m.name, presenter: m.presenter, peers, error: null })
      setRoomBase({ base: st.base, pin: st.pin })
      if (st.host) {
        sendRoom()
        reshare()
      } else {
        if (m.room) enterRoom(m.room, true)
        usePresent.getState().receive(m.present)
        if (m.present?.kind === 'window' && m.presenter) wantStream(m.presenter)
        say(`Você entrou em ${m.name}`)
      }
      welcomed?.(true)
      welcomed = null
      return
    }
    case 'join':
      useMeet.setState({ peers: { ...st.peers, [m.peer.id]: { id: m.peer.id, name: m.peer.name, look: m.peer.look, host: m.peer.host, viewer: !!m.peer.viewer } } })
      if (m.peer.p) poses.set(m.peer.id, m.peer.p)
      return say(m.peer.viewer ? `${m.peer.name} está assistindo pelo navegador` : `${m.peer.name} entrou`)
    case 'peer':
      if (st.peers[m.peer.id]) useMeet.setState({ peers: { ...st.peers, [m.peer.id]: { ...st.peers[m.peer.id], name: m.peer.name, look: m.peer.look } } })
      return
    case 'leave': {
      const peers = { ...st.peers }
      const who = peers[m.id]?.name
      delete peers[m.id]
      poses.delete(m.id)
      peerGone(m.id)
      useMeet.setState({ peers })
      return who && say(`${who} saiu`)
    }
    case 'pose':
      return void poses.set(m.id, m.p)
    case 'present': {
      if (m.by && m.by === st.me) return
      const prev = usePresent.getState().state
      const next = m.state as Present | null
      usePresent.getState().receive(next)
      if (next?.kind === 'window') {
        if ((prev?.kind !== 'window' || prev.stamp !== next.stamp) && st.presenter && st.presenter !== st.me) wantStream(st.presenter)
      } else closeIncoming()
      return
    }
    case 'presenter': {
      const was = isPresenter()
      useMeet.setState({ presenter: m.id })
      if (m.id === st.me) say('Agora é sua vez de apresentar')
      else {
        say(`${nameOf(m.id)} está apresentando`)
        // perdeu a vez com a tela ao vivo: para de capturar
        if (was && usePresent.getState().winId) usePresent.getState().receive(null)
      }
      return
    }
    case 'react':
      reactions.push({ id: m.id, e: m.e, at: performance.now() })
      if (reactions.length > 30) reactions.shift()
      return
    case 'room':
      if (!st.host && m.room) enterRoom(m.room, false)
      return
    case 'rtc':
      return void onRtc(m.from, m.data)
    case 'bye':
      return ended('Quem criou encerrou o encontro')
  }
}

// ---------- conectar / sair ----------

function connect(base: string, pin: string, opts: { host: boolean; token?: string; name: string }) {
  closeSocket()
  leaving = false
  useMeet.setState({ status: 'connecting', base, pin, host: opts.host, name: opts.name, error: null, peers: {}, presenter: null, me: null })
  return new Promise<boolean>((resolve) => {
    const sock = new WebSocket(`${base.replace(/^http/, 'ws')}/ws?pin=${encodeURIComponent(pin)}${opts.token ? `&host=${opts.token}` : ''}`)
    ws = sock
    welcomed = resolve
    const timer = setTimeout(() => {
      if (useMeet.getState().status === 'connecting') sock.close()
    }, 6000)
    sock.onopen = () => {
      const s = useUI.getState().settings
      sock.send(JSON.stringify({ t: 'hello', name: s.name || 'Sem nome', look: s.avatar }))
    }
    sock.onmessage = (e) => {
      try {
        handle(JSON.parse(e.data))
      } catch {}
    }
    sock.onclose = () => {
      clearTimeout(timer)
      if (ws !== sock) return
      ws = null
      if (useMeet.getState().status === 'connecting') {
        useMeet.setState({ status: 'off', error: 'Não conectou: confira o PIN e se a sala ainda está aberta' })
        welcomed?.(false)
        welcomed = null
        return
      }
      if (!leaving) ended('A conexão com a sala caiu')
    }
  })
}

function closeSocket() {
  const s = ws
  ws = null
  s?.close()
}

function ended(message: string | null) {
  const st = useMeet.getState()
  closeSocket()
  resetRtc()
  poses.clear()
  setRoomBase(null)
  // convidado volta pra própria sala; o telão com arquivos da sala some junto
  if (!st.host && useRooms.getState().sharedFrom) {
    usePresent.getState().receive(null)
    useRooms.getState().leaveShared()
    const r = currentRoom()
    if (r) useUI.getState().setTheme(r.themeId)
    teleport(0, 6, Math.PI)
  }
  useMeet.setState({ status: 'off', host: false, me: null, peers: {}, presenter: null, invite: null })
  useUI.getState().setWatching(false)
  if (message) say(message)
}

export async function hostMeet(name: string) {
  try {
    const h = await pc.meetHost({ name, by: useUI.getState().settings.name })
    useMeet.setState({ invite: { ips: h.ips, port: h.port, pin: h.pin } })
    if (!(await connect(`http://127.0.0.1:${h.port}`, h.pin, { host: true, token: h.token, name: h.name }))) await pc.meetStop()
  } catch {
    useMeet.setState({ status: 'off', error: 'Não deu pra criar a sala na rede' })
  }
}

export function joinMeet(found: Pick<MeetFound, 'ip' | 'port' | 'name'>, pin: string) {
  return connect(`http://${found.ip}:${found.port}`, pin.trim(), { host: false, name: found.name })
}

export async function leaveMeet() {
  const host = useMeet.getState().host
  leaving = true
  if (host) await pc.meetStop()
  ended(null)
  say(host ? 'Encontro encerrado' : 'Você saiu do encontro')
}

export const passTurn = (id: string) => send({ t: 'presenter', id })
export const takeTurn = () => send({ t: 'take' })
export function react(e: string) {
  if (!connected()) return
  send({ t: 'react', e })
  reactions.push({ id: useMeet.getState().me ?? 'eu', e, at: performance.now() })
}

// ---------- o que muda do seu lado e vai pra sala ----------

// sua posição ~12x por segundo (só quando muda, e um sinal de vida a cada segundo)
let acc = 0
let last = ''
let quiet = 0
export function tickPose(dt: number) {
  if (!connected()) return
  acc += dt
  quiet += dt
  if (acc < 0.08) return
  acc = 0
  const p = player.pos
  const pose = [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +player.yaw.toFixed(2), +player.speed.toFixed(1), player.grounded ? 1 : 0]
  const key = pose.join()
  if (key === last && quiet < 1) return
  last = key
  quiet = 0
  send({ t: 'pose', p: pose })
}

// trocou de visual ou de nome
useUI.subscribe((s, prev) => {
  if (connected() && (s.settings.avatar !== prev.settings.avatar || s.settings.name !== prev.settings.name)) send({ t: 'look', look: s.settings.avatar, name: s.settings.name || 'Sem nome' })
})

// quem criou mexeu na sala (modo construção) ou trocou de sala: o pessoal acompanha
let roomTimer = 0
function sendRoom() {
  const r = currentRoom()
  if (r && !r.shared) send({ t: 'room', room: shareableRoom(r) })
}
useRooms.subscribe((s, prev) => {
  if (!connected() || !useMeet.getState().host || (s.rooms === prev.rooms && s.roomId === prev.roomId)) return
  clearTimeout(roomTimer)
  roomTimer = window.setTimeout(sendRoom, 500)
})

// pros testes
Object.assign(window, { __meet: { useMeet, poses, reactions, hostMeet, joinMeet, leaveMeet, passTurn, react, shareFile, discover: () => pc.meetDiscover() } })
