// Salas e objetos: tudo que existe no mundo é um objeto com posição, rotação e tamanho,
// guardado por sala. Cada pessoa monta do jeito que quiser.
import { create } from 'zustand'
import type { ThemeId } from './themes'

export type ItemKind =
  | 'shortcut-wall'
  | 'screen-wall'
  | 'system-panel'
  | 'shortcut'
  | 'clock'
  | 'calendar'
  | 'pomodoro'
  | 'note'
  | 'todo'
  | 'photos'
  | 'shelf'
  | 'music'
  | 'weather'
  | 'site'
  | 'plugin'
  | 'portal'
  | 'text'
  | 'plant'
  | 'lamp'
  | 'sofa'
  | 'desk'
  | 'rug'
  | 'sculpture'
  | 'frame'
  | 'stage'
  | 'seats'

export type Item = {
  id: string
  kind: ItemKind
  x: number
  y: number
  z: number
  rotY: number
  scale: number
  props: Record<string, unknown>
}

// shared = sala de quem criou o encontro, só enquanto você está nele (não é salva)
export type Room = { id: string; name: string; themeId: ThemeId; items: Item[]; shared?: boolean }

export const SHARED_ID = 'encontro'

// o que vai pros convidados: só o que não depende do PC de quem montou (atalhos, pastas, música, fotos ficam de fora)
const SHAREABLE = new Set<ItemKind>(['stage', 'seats', 'clock', 'calendar', 'pomodoro', 'weather', 'note', 'text', 'site', 'plant', 'lamp', 'sofa', 'desk', 'rug', 'sculpture'])
export const shareableRoom = (r: Room) => ({ name: r.name, themeId: r.themeId, items: r.items.filter((i) => SHAREABLE.has(i.kind)) })

export const uid = () => Math.random().toString(36).slice(2, 10)

const D = Math.PI / 180
// ponto num círculo em volta do centro, virado pra ele (0° = norte)
function around(deg: number, r: number, y = 0) {
  const a = deg * D
  return { x: Math.sin(a) * r, y, z: -Math.cos(a) * r, rotY: -a }
}

function item(kind: ItemKind, pose: { x: number; y: number; z: number; rotY: number }, props: Record<string, unknown> = {}, scale = 1): Item {
  return { id: uid(), kind, ...pose, scale, props }
}

// ---------- modelos de sala ----------

export type Template = { id: string; name: string; desc: string; build: () => Item[] }

export const TEMPLATES: Template[] = [
  {
    id: 'escritorio',
    name: 'Escritório',
    desc: 'atalhos, telas ao vivo, sistema e um cantinho pra relaxar',
    build: () => [
      item('shortcut-wall', around(0, 24)),
      item('screen-wall', around(270, 24)),
      item('system-panel', around(180, 24)),
      item('clock', { ...around(38, 12, 2.2) }, { style: 'digital' }),
      item('rug', { x: 14, y: 0, z: 2, rotY: -Math.PI / 2 }, { color: '#3a3f4a' }),
      item('sofa', { x: 17, y: 0, z: 2, rotY: -Math.PI / 2 }, { color: '#4a4f5c' }),
      item('lamp', { x: 17.5, y: 0, z: -2.2, rotY: 0 }),
      item('plant', { x: 10.5, y: 0, z: -12, rotY: 0 }),
      item('plant', { x: -10.5, y: 0, z: 12, rotY: 1 }),
      item('note', { ...around(125, 16, 1.8) }, { text: 'Bem-vindo ao seu Workland!\nAperte B pra montar do seu jeito.', color: '#ffd76a' }),
    ],
  },
  {
    id: 'foco',
    name: 'Foco',
    desc: 'só as telas, um relógio e o pomodoro',
    build: () => [
      item('screen-wall', around(0, 20)),
      item('clock', { ...around(-40, 12, 2.2) }, { style: 'analogico' }),
      item('pomodoro', { ...around(40, 12, 1.9) }),
      item('plant', { x: -8, y: 0, z: -8, rotY: 0 }),
    ],
  },
  {
    id: 'estudio',
    name: 'Estúdio',
    desc: 'telas, música, fotos, notas e tarefas',
    build: () => [
      item('screen-wall', around(0, 22)),
      item('music', { ...around(60, 14, 1.9) }),
      item('photos', { ...around(-60, 14, 2.2) }),
      item('todo', { ...around(115, 14, 1.9) }),
      item('note', { ...around(-115, 14, 1.8) }, { text: 'Ideias:', color: '#9be7ff' }),
      item('desk', { x: 0, y: 0, z: -9, rotY: 0 }),
      item('lamp', { x: 3.2, y: 0, z: -10, rotY: 0 }),
      item('rug', { x: 0, y: 0, z: -7, rotY: 0 }, { color: '#2f3640' }),
    ],
  },
  {
    id: 'apresentacao',
    name: 'Apresentação',
    desc: 'palco com telão, púlpito e plateia pra mostrar projetos',
    build: () => [
      item('stage', around(0, 21)),
      item('seats', { x: 0, y: 0, z: -9.5, rotY: Math.PI }, { rows: 4, cols: 10, color: '#3d4350' }),
      item('plant', { x: -9, y: 0, z: -18, rotY: 0 }, { kind: 'arvore' }),
      item('plant', { x: 9, y: 0, z: -18, rotY: 2 }, { kind: 'arvore' }),
      item('clock', { ...around(-38, 17, 2.2) }, { style: 'digital' }),
      item('lamp', { x: -11, y: 0, z: -6, rotY: 0 }),
      item('lamp', { x: 11, y: 0, z: -6, rotY: 0 }),
    ],
  },
  { id: 'vazia', name: 'Vazia', desc: 'piso limpo pra montar do zero', build: () => [] },
]

export function roomFrom(templateId: string, name: string, themeId: ThemeId): Room {
  const t = TEMPLATES.find((x) => x.id === templateId) ?? TEMPLATES[0]
  return { id: uid(), name, themeId, items: t.build() }
}

// ---------- store ----------

const KEY = 'workland.rooms.v1'
type Saved = { rooms: Room[]; roomId: string }
function load(): Saved | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null') as Saved | null
    return v && Array.isArray(v.rooms) && v.rooms.length ? v : null
  } catch {
    return null
  }
}

type RoomsState = {
  rooms: Room[]
  roomId: string
  ready: boolean
  build: boolean
  selected: string | null
  past: Room[][]
  future: Room[][]
  setBuild: (v: boolean) => void
  select: (id: string | null) => void
  checkpoint: () => void
  undo: () => void
  redo: () => void
  addItem: (kind: ItemKind, pose: Omit<Item, 'id' | 'kind' | 'props' | 'scale'> & { scale?: number }, props?: Record<string, unknown>) => string
  update: (id: string, patch: Partial<Omit<Item, 'id' | 'kind'>>, commit?: boolean) => void
  setProps: (id: string, props: Record<string, unknown>) => void
  remove: (id: string) => void
  duplicate: (id: string) => void
  switchRoom: (id: string) => void
  createRoom: (name: string, templateId: string, themeId: ThemeId) => string
  renameRoom: (id: string, name: string) => void
  deleteRoom: (id: string) => void
  setRoomTheme: (id: string, themeId: ThemeId) => void
  replaceAll: (rooms: Room[], roomId?: string) => void
  // encontro: entra na sala de quem criou, atualiza quando ela muda e volta pra sua ao sair
  sharedFrom: string | null
  enterShared: (room: Pick<Room, 'name' | 'themeId' | 'items'>) => void
  leaveShared: () => void
}

const saved = load()

export const useRooms = create<RoomsState>((set, get) => {
  const mapRoom = (fn: (r: Room) => Room) => set({ rooms: get().rooms.map((r) => (r.id === get().roomId ? fn(r) : r)) })
  const snap = () => {
    set({ past: [...get().past.slice(-49), structuredClone(get().rooms)], future: [] })
  }
  return {
    rooms: saved?.rooms ?? [],
    roomId: saved?.roomId ?? saved?.rooms[0]?.id ?? '',
    ready: !!saved,
    build: false,
    selected: null,
    past: [],
    future: [],
    // sala do encontro é de quem criou: convidado não monta nela
    setBuild: (build) => set({ build: build && !currentRoom()?.shared, selected: build ? get().selected : null }),
    select: (selected) => set({ selected }),
    checkpoint: snap,
    undo: () => {
      const past = get().past
      if (!past.length) return
      set({ future: [structuredClone(get().rooms), ...get().future].slice(0, 50), rooms: past[past.length - 1], past: past.slice(0, -1) })
    },
    redo: () => {
      const [next, ...rest] = get().future
      if (!next) return
      set({ past: [...get().past, structuredClone(get().rooms)], rooms: next, future: rest })
    },
    addItem: (kind, pose, props = {}) => {
      snap()
      const it: Item = { id: uid(), kind, x: pose.x, y: pose.y, z: pose.z, rotY: pose.rotY, scale: pose.scale ?? 1, props }
      mapRoom((r) => ({ ...r, items: [...r.items, it] }))
      return it.id
    },
    update: (id, patch, commit = true) => {
      if (commit) snap()
      mapRoom((r) => ({ ...r, items: r.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }))
    },
    setProps: (id, props) => {
      snap()
      mapRoom((r) => ({ ...r, items: r.items.map((i) => (i.id === id ? { ...i, props: { ...i.props, ...props } } : i)) }))
    },
    remove: (id) => {
      snap()
      mapRoom((r) => ({ ...r, items: r.items.filter((i) => i.id !== id) }))
      if (get().selected === id) set({ selected: null })
    },
    duplicate: (id) => {
      const src = currentRoom()?.items.find((i) => i.id === id)
      if (!src) return
      snap()
      const copy: Item = { ...structuredClone(src), id: uid(), x: src.x + 1.5, z: src.z + 1.5 }
      mapRoom((r) => ({ ...r, items: [...r.items, copy] }))
      set({ selected: copy.id })
    },
    switchRoom: (roomId) => set({ roomId, selected: null }),
    createRoom: (name, templateId, themeId) => {
      const room = roomFrom(templateId, name, themeId)
      set({ rooms: [...get().rooms, room], roomId: room.id, ready: true, selected: null })
      return room.id
    },
    renameRoom: (id, name) => set({ rooms: get().rooms.map((r) => (r.id === id ? { ...r, name } : r)) }),
    deleteRoom: (id) => {
      const rooms = get().rooms.filter((r) => r.id !== id)
      if (!rooms.length) return
      set({ rooms, roomId: get().roomId === id ? rooms[0].id : get().roomId, selected: null })
    },
    setRoomTheme: (id, themeId) => set({ rooms: get().rooms.map((r) => (r.id === id ? { ...r, themeId } : r)) }),
    replaceAll: (rooms, roomId) => set({ rooms, roomId: roomId && rooms.some((r) => r.id === roomId) ? roomId : rooms[0]?.id ?? '', ready: rooms.length > 0, selected: null, past: [], future: [] }),
    sharedFrom: null,
    enterShared: (room) => {
      const own = get().rooms.filter((r) => !r.shared)
      const shared: Room = { ...room, id: SHARED_ID, shared: true, items: room.items.map((i) => ({ ...i })) }
      set({ rooms: [...own, shared], roomId: SHARED_ID, sharedFrom: get().sharedFrom ?? get().roomId, build: false, selected: null })
    },
    leaveShared: () => {
      const back = get().sharedFrom
      const own = get().rooms.filter((r) => !r.shared)
      set({ rooms: own, roomId: own.some((r) => r.id === back) ? back! : own[0]?.id ?? '', sharedFrom: null })
    },
  }
})

export const currentRoom = () => {
  const s = useRooms.getState()
  return s.rooms.find((r) => r.id === s.roomId)
}
export const useCurrentRoom = () => useRooms((s) => s.rooms.find((r) => r.id === s.roomId))

// salva sozinho (com um respiro pra não gravar a cada quadro do arrasto)
let saveTimer = 0
useRooms.subscribe((s) => {
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    const rooms = s.rooms.filter((r) => !r.shared)
    if (!rooms.length) return
    try {
      localStorage.setItem(KEY, JSON.stringify({ rooms, roomId: rooms.some((r) => r.id === s.roomId) ? s.roomId : s.sharedFrom ?? rooms[0].id }))
    } catch {}
  }, 400)
})
