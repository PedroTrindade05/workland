import { create } from 'zustand'
import * as THREE from 'three'
import type { AppEntry, Place, PluginInfo, Shortcut, WinEntry } from './pc'
import { themeById, type Theme, type ThemeId } from './themes'
import { useRooms } from './rooms'
import type { Look } from './avatar/look'

// ---------- estado mutável do jogador (lido a cada frame, fora do React) ----------

export const player = {
  pos: new THREE.Vector3(0, 0, 6),
  yaw: Math.PI,
  camYaw: 0,
  pitch: 0.12,
  speed: 0,
  grounded: true,
  pendingTeleport: null as null | { x: number; z: number; yaw?: number },
  // modo simples: ponto do chão pra onde ir andando
  walkTo: null as null | { x: number; z: number },
}

// provador: giro do boneco (arrastar), distância da câmera (rodinha) e pulinho ao trocar de peça
export const wardrobe = { spin: 0, zoom: 2.9, hop: false }

export function teleport(x: number, z: number, yaw?: number) {
  player.pendingTeleport = { x, z, yaw }
}

// ---------- alvo de interação (o que está sob o mouse/mira, ou perto) ----------

export type Target = {
  id: string
  title: string
  verb: string
  run: () => void
  alt?: { verb: string; run: () => void }
  grab?: { verb: string; run: () => void }
}

// interações por proximidade (telas web soltas)
export type Near = Target & { x: number; z: number; r: number }
export const nearby = new Map<string, Near>()


function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {}
}

// ---------- foco: usando um app de dentro do telão ----------

export type Focus = {
  winId: string
  title: string
  icon: string | null
  // 'in' = câmera chegando na tela, 'on' = mouse e teclado vão pro app, 'out' = voltando
  phase: 'in' | 'on' | 'out'
  // onde o telão aparece na tela (px CSS), pra imagem nítida ficar exatamente em cima
  rect?: { x: number; y: number; w: number; h: number }
}

// ---------- telas soltas: cada telão pode sair do painel ----------

export type ScreenPose = { mode: 'carried' | 'free'; x: number; y: number; z: number; rotY: number }

// ---------- preferências de cada pessoa ----------

export type Ambient = 'nenhum' | 'chuva' | 'vento' | 'ondas' | 'lareira'
// null = boneco padrão com as cores do ambiente (versões antigas guardavam só cores + acessório; resolveLook converte)
export type AvatarLook = Look | null
export type Settings = {
  name: string
  controls: 'simples' | 'jogo'
  ambient: Ambient
  volume: number
  realTime: boolean
  sky: null | { path: string; video: boolean }
  avatar: AvatarLook
}
const DEFAULT_SETTINGS: Settings = { name: '', controls: 'simples', ambient: 'nenhum', volume: 0.5, realTime: false, sky: null, avatar: null }

// ---------- store reativa ----------

export type Quality = 'leve' | 'equilibrada' | 'alta'

type UI = {
  hover: Target | null
  setHover: (t: Target | null) => void
  near: Near | null
  setNear: (t: Near | null) => void
  cmdOpen: boolean
  setCmdOpen: (v: boolean) => void
  themeOpen: boolean
  setThemeOpen: (v: boolean) => void
  toast: { text: string; n: number } | null
  say: (text: string) => void
  shortcuts: Shortcut[]
  plugins: PluginInfo[]
  setPlugins: (p: PluginInfo[]) => void
  setShortcuts: (s: Shortcut[]) => void
  apps: AppEntry[]
  places: Place[]
  windows: WinEntry[]
  setApps: (a: AppEntry[]) => void
  setPlaces: (p: Place[]) => void
  setWindows: (w: WinEntry[]) => void
  section: string
  setSection: (d: string) => void
  themeId: ThemeId
  theme: Theme
  setTheme: (id: ThemeId) => void
  view: 'first' | 'third'
  toggleView: () => void
  quality: Quality
  setQuality: (q: Quality) => void
  locked: boolean
  setLocked: (v: boolean) => void
  // modo foco: some tudo menos as telas
  settings: Settings
  setSettings: (patch: Partial<Settings>) => void
  focusMode: boolean
  setFocusMode: (v: boolean) => void
  // objeto aberto pra editar (nota, tarefas...)
  editItem: string | null
  setEditItem: (id: string | null) => void
  panel: null | 'rooms' | 'scenes' | 'settings' | 'avatar' | 'meet'
  setPanel: (p: UI['panel']) => void
  focus: Focus | null
  setFocus: (f: Focus | null) => void
  // assistindo a apresentação: a câmera enquadra o telão do palco
  watching: boolean
  setWatching: (v: boolean) => void
  // telas fora do painel (as que não estão aqui ficam no lugar delas)
  poses: Record<string, ScreenPose>
  carrying: { id: string; byMouse: boolean } | null
  carry: (id: string, byMouse: boolean) => void
  drop: (pose: Omit<ScreenPose, 'mode'>) => void
  sendHome: (id: string) => void
}

// tema salvo que saiu (Terraço, Lago) vira o padrão
const initialTheme = themeById(load<string>('workland.theme', 'escritorio')).id

export const useUI = create<UI>((set, get) => ({
  hover: null,
  setHover: (hover) => set({ hover }),
  near: null,
  setNear: (near) => set({ near }),
  cmdOpen: false,
  setCmdOpen: (cmdOpen) => set({ cmdOpen }),
  themeOpen: false,
  setThemeOpen: (themeOpen) => set({ themeOpen }),
  toast: null,
  say: (text) => set({ toast: { text, n: (get().toast?.n ?? 0) + 1 } }),
  shortcuts: [],
  plugins: [],
  setPlugins: (plugins) => set({ plugins }),
  setShortcuts: (shortcuts) => set({ shortcuts }),
  apps: [],
  places: [],
  windows: [],
  setApps: (apps) => set({ apps }),
  setPlaces: (places) => set({ places }),
  setWindows: (windows) => set({ windows }),
  section: 'Centro',
  setSection: (section) => set({ section }),
  themeId: initialTheme,
  theme: themeById(initialTheme),
  setTheme: (id) => {
    save('workland.theme', id)
    set({ themeId: themeById(id).id, theme: themeById(id) })
  },
  view: load<'first' | 'third'>('workland.view', 'third'),
  toggleView: () => {
    const view = get().view === 'first' ? 'third' : 'first'
    save('workland.view', view)
    set({ view })
  },
  quality: load<Quality>('workland.quality', 'equilibrada'),
  setQuality: (quality) => {
    save('workland.quality', quality)
    set({ quality })
  },
  locked: false,
  setLocked: (locked) => set({ locked }),
  settings: { ...DEFAULT_SETTINGS, ...load<Partial<Settings>>('workland.settings', {}) },
  setSettings: (patch) => {
    const settings = { ...get().settings, ...patch }
    save('workland.settings', settings)
    set({ settings })
  },
  focusMode: false,
  setFocusMode: (focusMode) => set({ focusMode }),
  editItem: null,
  setEditItem: (editItem) => set({ editItem }),
  panel: null,
  setPanel: (panel) => set({ panel }),
  focus: null,
  setFocus: (focus) => set({ focus }),
  watching: false,
  setWatching: (watching) => set({ watching }),
  poses: {},
  carrying: null,
  carry: (id, byMouse) => {
    const cur = get().carrying
    const poses = { ...get().poses }
    // só dá pra carregar uma de cada vez: a anterior fica onde estava
    if (cur && cur.id !== id && poses[cur.id]) poses[cur.id] = { ...poses[cur.id], mode: 'free' }
    poses[id] = { ...(poses[id] ?? { x: 0, y: 0, z: 0, rotY: 0 }), mode: 'carried' }
    set({ poses, carrying: { id, byMouse } })
  },
  drop: (pose) => {
    const cur = get().carrying
    if (!cur) return
    set({ poses: { ...get().poses, [cur.id]: { ...pose, mode: 'free' } }, carrying: null })
  },
  sendHome: (id) => {
    const poses = { ...get().poses }
    delete poses[id]
    set({ poses, carrying: get().carrying?.id === id ? null : get().carrying })
  },
}))

export const currentTarget = () => {
  const s = useUI.getState()
  return s.hover ?? s.near
}

// coloca um objeto novo na frente de quem está jogando, virado pra ele
export function inFront(dist: number, y: number) {
  const x = player.pos.x - Math.sin(player.camYaw) * dist
  const z = player.pos.z - Math.cos(player.camYaw) * dist
  return { x: Math.round(x * 4) / 4, y, z: Math.round(z * 4) / 4, rotY: player.camYaw }
}

export function spawnWebScreen(url: string) {
  useRooms.getState().addItem('site', inFront(4.5, 0), { url })
  useUI.getState().say('Tela nova aberta na sua frente')
}
