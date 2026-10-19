// Cenas de trabalho: um clique abre um conjunto de apps (já nos telões do meio),
// muda pra sala certa, liga o som ambiente e, se quiser, o modo foco.
import { create } from 'zustand'
import { pc } from './pc'
import { useUI, type Ambient } from './store'
import { useRooms, uid } from './rooms'
import { featureWindows } from './inside'
import { goToRoom } from './objects/rooms-nav'

export type SceneApp = { exe: string; name: string }
export type Scene = { id: string; name: string; apps: SceneApp[]; roomId?: string; ambient?: Ambient; focus?: boolean }

const KEY = 'workland.scenes.v1'
const load = (): Scene[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}

type State = {
  scenes: Scene[]
  save: (s: Scene) => void
  remove: (id: string) => void
  replaceAll: (s: Scene[]) => void
}

export const useScenes = create<State>((set, get) => {
  const persist = (scenes: Scene[]) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(scenes))
    } catch {}
    set({ scenes })
  }
  return {
    scenes: load(),
    save: (s) => persist(get().scenes.some((x) => x.id === s.id) ? get().scenes.map((x) => (x.id === s.id ? s : x)) : [...get().scenes, s]),
    remove: (id) => persist(get().scenes.filter((s) => s.id !== id)),
    replaceAll: (s) => persist(s),
  }
})

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

// as janelas abertas agora viram uma cena (um app por programa)
export function sceneFromOpenWindows(name: string): Scene {
  const seen = new Set<string>()
  const apps: SceneApp[] = []
  for (const w of useUI.getState().windows) {
    if (!w.exe || seen.has(w.exe.toLowerCase())) continue
    seen.add(w.exe.toLowerCase())
    apps.push({ exe: w.exe, name: w.name.split(' - ').pop() || w.name })
  }
  return { id: uid(), name, apps, roomId: useRooms.getState().roomId, ambient: useUI.getState().settings.ambient }
}

export async function runScene(scene: Scene) {
  const ui = useUI.getState()
  ui.say(`Cena: ${scene.name}`)
  if (scene.roomId && scene.roomId !== useRooms.getState().roomId) goToRoom(scene.roomId)
  if (scene.ambient) ui.setSettings({ ambient: scene.ambient })
  ui.setFocusMode(!!scene.focus)
  if (!pc.native) return
  let list = await pc.windows()
  for (const app of scene.apps) if (!list.some((w) => same(w.exe, app.exe))) await pc.launchExe(app.exe)
  // espera as janelas aparecerem e põe as da cena nos telões do meio
  for (let i = 0; i < 12; i++) {
    await sleep(800)
    list = await pc.windows()
    const ids = scene.apps.map((a) => list.find((w) => same(w.exe, a.exe))?.id).filter(Boolean) as string[]
    featureWindows(list, ids)
    if (ids.length >= scene.apps.length) break
  }
}
