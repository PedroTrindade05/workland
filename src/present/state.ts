// O que está no telão do palco. Sozinho, é só seu; num encontro, quem tem a vez manda e todo mundo vê igual.
import { create } from 'zustand'
import { pc } from '../pc'

// arquivo da apresentação: caminho no seu PC e/ou id dele na sala do encontro
export type Ref = { local?: string; file?: string }
export type Slide = { src: Ref; video: boolean; name: string }

export type Present =
  | { kind: 'pdf'; title: string; src: Ref; index: number; count: number }
  | { kind: 'media'; title: string; slides: Slide[]; index: number; count: number }
  | { kind: 'window'; title: string; index: 0; count: 1; stamp: number }
  | { kind: 'site'; title: string; url: string; index: 0; count: 1 }

type PresentStore = {
  state: Present | null
  // janela mostrada ao vivo (só no PC de quem apresenta)
  winId: string | null
  busy: string | null
  // menu de escolher o que mostrar (abre pelo púlpito ou pela barra)
  menu: boolean
  setMenu: (v: boolean) => void
  muted: boolean
  setMuted: (v: boolean) => void
  setBusy: (v: string | null) => void
  // aplica localmente; quem está conectado manda pro resto (net.ts liga isso)
  apply: (state: Present | null, winId?: string | null) => void
  // veio da sala (outra pessoa apresentando)
  receive: (state: Present | null) => void
  // página que o PDF descobriu que tem
  setCount: (count: number) => void
}

export const usePresent = create<PresentStore>((set, get) => ({
  state: null,
  winId: null,
  busy: null,
  menu: false,
  setMenu: (menu) => set({ menu }),
  muted: false,
  setMuted: (muted) => set({ muted }),
  setBusy: (busy) => set({ busy }),
  apply: (state, winId = null) => {
    set({ state, winId: state?.kind === 'window' ? winId : null })
    onLocalChange?.(state)
  },
  receive: (state) => set({ state, winId: null }),
  setCount: (count) => {
    const s = get().state
    if (!s || s.kind !== 'pdf' || s.count === count) return
    get().apply({ ...s, count, index: Math.min(s.index, count - 1) }, null)
  },
}))

// net.ts registra aqui pra mandar a mudança pra sala e dizer se você pode mexer (sozinho, sempre pode)
let onLocalChange: ((s: Present | null) => void) | null = null
export const onPresentChange = (fn: typeof onLocalChange) => (onLocalChange = fn)
let controlCheck = () => true
export const setControlCheck = (fn: () => boolean) => (controlCheck = fn)
export const canControl = () => controlCheck()

// endereço do arquivo: o seu caminho local se for seu, senão o da sala (net.ts informa a base)
let roomBase: { base: string; pin: string } | null = null
export const setRoomBase = (b: typeof roomBase) => (roomBase = b)
export function srcUrl(r: Ref) {
  if (r.local) return pc.fileUrl(r.local)
  if (r.file && roomBase) return `${roomBase.base}/files/${r.file}?pin=${roomBase.pin}`
  return ''
}
// o que vai pra sala não leva caminho do seu PC
export function forRoom(s: Present | null): Present | null {
  if (!s) return s
  if (s.kind === 'pdf') return { ...s, src: { file: s.src.file } }
  if (s.kind === 'media') return { ...s, slides: s.slides.map((x) => ({ ...x, src: { file: x.src.file } })) }
  return s
}

export function go(delta: number) {
  const s = usePresent.getState().state
  if (!s || s.count < 2) return
  const index = Math.max(0, Math.min(s.count - 1, s.index + delta))
  if (index !== s.index) usePresent.getState().apply({ ...s, index } as Present, usePresent.getState().winId)
}

const isVideo = (p: string) => /\.(mp4|webm|mov|m4v)$/i.test(p)
const base = (p: string) => p.split(/[\\/]/).pop() ?? p

// arquivos escolhidos -> apresentação (num encontro sobe pra sala antes; share vem do net.ts)
export async function presentPdf(path: string, share?: (p: string) => Promise<string | undefined>) {
  const file = await share?.(path)
  usePresent.getState().apply({ kind: 'pdf', title: base(path), src: { local: path, file }, index: 0, count: 1 })
}

export async function presentSlides(paths: string[], share?: (p: string) => Promise<string | undefined>) {
  if (!paths.length) return
  const slides: Slide[] = []
  for (const p of paths) slides.push({ src: { local: p, file: await share?.(p) }, video: isVideo(p), name: base(p) })
  usePresent.getState().apply({ kind: 'media', title: paths.length === 1 ? base(paths[0]) : `${paths.length} arquivos`, slides, index: 0, count: slides.length })
}

export function presentWindow(id: string, title: string) {
  usePresent.getState().apply({ kind: 'window', title, index: 0, count: 1, stamp: Date.now() }, id)
}

export function presentSite(url: string) {
  usePresent.getState().apply({ kind: 'site', title: url.replace(/^https?:\/\//, '').replace(/\/$/, ''), url, index: 0, count: 1 })
}

export const stopPresenting = () => usePresent.getState().apply(null)

// pros testes
Object.assign(window, { __present: { usePresent, presentPdf, presentSlides, presentSite, presentWindow, go, stopPresenting } })
