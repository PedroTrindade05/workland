// Tela de app ao vivo no telão: quem apresenta captura a janela e manda o vídeo direto pra cada PC (WebRTC na rede local).
// A sala do encontro só repassa os recados (oferta, resposta, candidatos).
import { create } from 'zustand'
import { pc } from '../pc'
import { useUI } from '../store'
import { usePresent } from '../present/state'

export const useStreams = create<{ local: MediaStream | null; remote: MediaStream | null }>(() => ({ local: null, remote: null }))

type Msg = { want?: true; sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit }
let sendRtc: (to: string, data: Msg) => void = () => {}
export const setRtcSender = (fn: typeof sendRtc) => (sendRtc = fn)

// na rede do escritório não precisa de STUN: os candidatos com IP local bastam
const CONFIG: RTCConfiguration = { iceServers: [] }

type Conn = { pc: RTCPeerConnection; queue: RTCIceCandidateInit[] }
const outgoing = new Map<string, Conn>()
let incoming: (Conn & { from: string }) | null = null
const waiting = new Set<string>()

function conn(onIce: (c: RTCIceCandidateInit) => void): Conn {
  const c: Conn = { pc: new RTCPeerConnection(CONFIG), queue: [] }
  c.pc.onicecandidate = (e) => e.candidate && onIce(e.candidate.toJSON())
  return c
}

async function flushIce(c: Conn) {
  for (const ice of c.queue.splice(0)) await c.pc.addIceCandidate(ice).catch(() => {})
}

// ---------- quem apresenta ----------

export async function captureWindow(id: string) {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: id, maxWidth: 1920, maxHeight: 1200, maxFrameRate: 30 } },
  } as unknown as MediaStreamConstraints)
}

async function offerTo(id: string, stream: MediaStream) {
  outgoing.get(id)?.pc.close()
  const c = conn((ice) => sendRtc(id, { ice }))
  outgoing.set(id, c)
  for (const t of stream.getVideoTracks()) c.pc.addTrack(t, stream)
  await c.pc.setLocalDescription(await c.pc.createOffer())
  sendRtc(id, { sdp: c.pc.localDescription!.toJSON() })
}

function closeOutgoing() {
  for (const c of outgoing.values()) c.pc.close()
  outgoing.clear()
}

// a janela escolhida muda: troca a captura e derruba as transmissões antigas
let capturing: string | null = null
usePresent.subscribe(async (s) => {
  if (s.winId === capturing) return
  capturing = s.winId
  closeOutgoing()
  useStreams.getState().local?.getTracks().forEach((t) => t.stop())
  useStreams.setState({ local: null })
  if (!s.winId || !pc.native) return
  try {
    const stream = await captureWindow(s.winId)
    if (capturing !== s.winId) return stream.getTracks().forEach((t) => t.stop())
    useStreams.setState({ local: stream })
    for (const id of waiting) offerTo(id, stream).catch(() => {})
    waiting.clear()
  } catch {
    useUI.getState().say('Não deu pra capturar essa janela')
  }
})

// ---------- quem assiste ----------

async function accept(from: string, sdp: RTCSessionDescriptionInit) {
  closeIncoming()
  const c = { ...conn((ice) => sendRtc(from, { ice })), from }
  incoming = c
  c.pc.ontrack = (e) => useStreams.setState({ remote: e.streams[0] ?? new MediaStream([e.track]) })
  await c.pc.setRemoteDescription(sdp)
  await flushIce(c)
  await c.pc.setLocalDescription(await c.pc.createAnswer())
  sendRtc(from, { sdp: c.pc.localDescription!.toJSON() })
}

export function wantStream(presenter: string) {
  closeIncoming()
  sendRtc(presenter, { want: true })
}

export function closeIncoming() {
  incoming?.pc.close()
  incoming = null
  if (useStreams.getState().remote) useStreams.setState({ remote: null })
}

// ---------- recados que chegam pela sala ----------

export async function onRtc(from: string, data: Msg) {
  try {
    if (data.want) {
      const local = useStreams.getState().local
      if (local) await offerTo(from, local)
      else waiting.add(from)
    } else if (data.sdp?.type === 'offer') await accept(from, data.sdp)
    else if (data.sdp?.type === 'answer') {
      const c = outgoing.get(from)
      if (c) {
        await c.pc.setRemoteDescription(data.sdp)
        await flushIce(c)
      }
    } else if (data.ice) {
      const c = outgoing.get(from) ?? (incoming?.from === from ? incoming : null)
      if (!c) return
      if (c.pc.remoteDescription) await c.pc.addIceCandidate(data.ice).catch(() => {})
      else c.queue.push(data.ice)
    }
  } catch {}
}

export function peerGone(id: string) {
  outgoing.get(id)?.pc.close()
  outgoing.delete(id)
  waiting.delete(id)
  if (incoming?.from === id) closeIncoming()
}

export function resetRtc() {
  closeOutgoing()
  closeIncoming()
  waiting.clear()
}

// diagnóstico pros testes
export const rtcStats = () => ({ outgoing: [...outgoing.keys()], incoming: incoming?.from ?? null, states: [...outgoing.values()].map((c) => c.pc.connectionState), inState: incoming?.pc.connectionState ?? null })
Object.assign(window, { __rtc: { rtcStats, useStreams } })
