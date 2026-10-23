// Abrir coisas DENTRO do mundo: cada janela vira um telão, e usar o telão traz o app real
// por cima do Workland, com a área útil encaixada exatamente em cima dele (ui/Hud.tsx, RealWindow).
import type * as THREE from 'three'
import { pc, type AppEntry, type Shortcut, type WinEntry } from './pc'
import { useUI } from './store'

// cada telão se registra aqui pra câmera saber onde ele está (pode estar no painel ou solto)
export const screenObjects = new Map<string, { group: THREE.Object3D; w: number; h: number }>()

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

// mantém a ordem: janelas novas (ou a escolhida) vão pro telão do meio
export function mergeWindows(list: WinEntry[], featured?: string) {
  const prev = useUI.getState().windows
  const alive = new Map(list.map((w) => [w.id, w]))
  const kept = prev.filter((w) => alive.has(w.id)).map((w) => alive.get(w.id)!)
  const known = new Set(prev.map((w) => w.id))
  const fresh = list.filter((w) => !known.has(w.id))
  let next = [...fresh, ...kept]
  if (featured) {
    const f = next.find((w) => w.id === featured)
    if (f) next = [f, ...next.filter((w) => w.id !== featured)]
  }
  const sig = (a: WinEntry[]) => a.map((w) => w.id + w.name).join('|')
  if (sig(next) !== sig(prev)) useUI.getState().setWindows(next)
}

// várias janelas pros telões da frente, na ordem dada
export function featureWindows(list: WinEntry[], ids: string[]) {
  mergeWindows(list)
  const cur = useUI.getState().windows
  const first = ids.map((id) => cur.find((w) => w.id === id)).filter(Boolean) as WinEntry[]
  const next = [...first, ...cur.filter((w) => !ids.includes(w.id))]
  if (next.map((w) => w.id).join() !== cur.map((w) => w.id).join()) useUI.getState().setWindows(next)
}

export async function enterWindow(id: string) {
  const ui = useUI.getState()
  if (ui.focus) return
  const win = ui.windows.find((w) => w.id === id)
  if (document.pointerLockElement) document.exitPointerLock()
  ui.setHover(null)
  ui.setFocus({ winId: id, title: win?.name ?? 'Janela', icon: win?.icon ?? null, phase: 'in' })
  // minimizada volta em segundo plano (sem aparecer na frente) pra ter imagem ao vivo
  await pc.prepare(id)
  if (win?.minimized) mergeWindows(await pc.windows())
}

export function leaveWindow() {
  const f = useUI.getState().focus
  if (!f || f.phase === 'out') return
  useUI.getState().setFocus({ ...f, phase: 'out' })
}

// abre um app/arquivo e, quando a janela aparecer, entra nela
export async function openInside(launch: () => Promise<unknown>, hint: string) {
  const ui = useUI.getState()
  ui.say(`Abrindo ${hint}`)
  if (!pc.native) return void launch()
  const before = new Set((await pc.windows()).map((w) => w.id))
  await launch()
  const key = fold(hint.replace(/\.[^.]+$/, '')).slice(0, 24)
  const t0 = Date.now()
  while (Date.now() - t0 < 15000) {
    await sleep(600)
    const list = await pc.windows()
    const fresh = list.find((w) => !before.has(w.id))
    // app que já estava aberto não cria janela nova: procura pelo nome
    const match = fresh ?? (Date.now() - t0 > 2500 ? list.find((w) => fold(w.name).includes(key)) : undefined)
    if (match) {
      mergeWindows(list, match.id)
      await sleep(250)
      return enterWindow(match.id)
    }
  }
}

export const launchApp = (a: AppEntry) => openInside(() => pc.launch(a), a.name)
export const openShortcut = (s: Shortcut) => openInside(() => pc.openShortcut(s.path), s.name)

// pose da tela que está sendo carregada (atualizada a cada frame pelo telão)
export const carriedPose = { x: 0, y: 1.6, z: 0, rotY: 0 }
export const dropCarried = () => useUI.getState().drop({ ...carriedPose })
