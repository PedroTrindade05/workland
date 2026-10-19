import type { Theme } from '../themes'

// ---------- o boneco por partes (estilo provador: chapéu, rosto, roupa, extra, pernas, pés) ----------

export const SHAPES = [
  { id: 'esguio', label: 'Esguio' },
  { id: 'padrao', label: 'Padrão' },
  { id: 'fofinho', label: 'Fofinho' },
] as const

export const HEADS = [
  { id: 'nenhum', label: 'Nada' },
  { id: 'bone', label: 'Boné' },
  { id: 'gorro', label: 'Gorro' },
  { id: 'cartola', label: 'Cartola' },
  { id: 'fedora', label: 'Chapéu' },
  { id: 'chef', label: 'Chef' },
  { id: 'mago', label: 'Mago' },
  { id: 'coroa', label: 'Coroa' },
  { id: 'capacete', label: 'Capacete espacial' },
  { id: 'elmo', label: 'Elmo' },
  { id: 'viking', label: 'Chifres' },
  { id: 'fones', label: 'Fones' },
  { id: 'antena', label: 'Antena' },
  { id: 'orelhas', label: 'Orelhinhas' },
  { id: 'aureola', label: 'Auréola' },
] as const

export const FACES = [
  { id: 'visor', label: 'Visor' },
  { id: 'olhos', label: 'Olhinhos' },
  { id: 'sorriso', label: 'Sorriso' },
  { id: 'oculos', label: 'Óculos escuros' },
  { id: 'bigode', label: 'Bigode' },
  { id: 'sono', label: 'Sonolento' },
  { id: 'bravo', label: 'Bravo' },
] as const

export const TOPS = [
  { id: 'nada', label: 'Nada' },
  { id: 'camiseta', label: 'Camiseta' },
  { id: 'moletom', label: 'Moletom' },
  { id: 'jaqueta', label: 'Jaqueta' },
  { id: 'terno', label: 'Terno' },
  { id: 'avental', label: 'Avental' },
  { id: 'armadura', label: 'Armadura' },
  { id: 'tunica', label: 'Túnica' },
] as const

export const EXTRAS = [
  { id: 'nada', label: 'Nada' },
  { id: 'mochila', label: 'Mochila' },
  { id: 'capa', label: 'Capa' },
  { id: 'jetpack', label: 'Jetpack' },
  { id: 'asas', label: 'Asinhas' },
  { id: 'cachecol', label: 'Cachecol' },
] as const

export const LEGS = [
  { id: 'nada', label: 'Nada' },
  { id: 'shorts', label: 'Shorts' },
  { id: 'calca', label: 'Calça' },
] as const

export const FEET = [
  { id: 'nada', label: 'Descalço' },
  { id: 'tenis', label: 'Tênis' },
  { id: 'botas', label: 'Botas' },
  { id: 'nadadeira', label: 'Pé de pato' },
] as const

export const PATTERNS = [
  { id: 'liso', label: 'Liso' },
  { id: 'listras', label: 'Listras' },
  { id: 'bolinhas', label: 'Bolinhas' },
  { id: 'xadrez', label: 'Xadrez' },
  { id: 'diagonal', label: 'Diagonal' },
] as const

type Id<T extends readonly { id: string }[]> = T[number]['id']
export type ShapeId = Id<typeof SHAPES>
export type HeadId = Id<typeof HEADS>
export type FaceId = Id<typeof FACES>
export type TopId = Id<typeof TOPS>
export type ExtraId = Id<typeof EXTRAS>
export type LegsId = Id<typeof LEGS>
export type FeetId = Id<typeof FEET>
export type PatternId = Id<typeof PATTERNS>

export type Look = {
  v: 2
  shape: ShapeId
  head: HeadId
  face: FaceId
  top: TopId
  extra: ExtraId
  legs: LegsId
  feet: FeetId
  pattern: PatternId
  // cores: corpo do boneco, roupa, calça, detalhes (chapéu, gravata, estampa) e olhos/visor
  skin: string
  main: string
  pants: string
  second: string
  eyes: string
}

// o que vai pra cada aba do provador
export const SLOTS = [
  { key: 'head', label: 'Cabeça', options: HEADS },
  { key: 'face', label: 'Rosto', options: FACES },
  { key: 'top', label: 'Roupa', options: TOPS },
  { key: 'extra', label: 'Extra', options: EXTRAS },
  { key: 'legs', label: 'Pernas', options: LEGS },
  { key: 'feet', label: 'Pés', options: FEET },
] as const

export const COLOR_KEYS = [
  { key: 'skin', label: 'Corpo' },
  { key: 'main', label: 'Roupa' },
  { key: 'pants', label: 'Calça' },
  { key: 'second', label: 'Detalhes' },
  { key: 'eyes', label: 'Olhos' },
] as const

// paleta rápida (dá pra escolher qualquer cor no seletor também)
export const SWATCHES = ['#f2efe9', '#d9d4cc', '#8b8f98', '#2a2b2f', '#121316', '#e8c9a8', '#b98a63', '#6d4a33', '#e5484d', '#f2994a', '#f5c84c', '#5ebd6e', '#2f9e8f', '#4aa8ff', '#3b5bdb', '#7b61ff', '#d66bd0', '#ff8fab']

// ---------- visuais prontos (arquétipos originais) ----------

const base: Look = {
  v: 2,
  shape: 'padrao',
  head: 'nenhum',
  face: 'visor',
  top: 'nada',
  extra: 'nada',
  legs: 'nada',
  feet: 'nada',
  pattern: 'liso',
  skin: '#e9e4dc',
  main: '#4aa8ff',
  pants: '#2a2b2f',
  second: '#d9b27c',
  eyes: '#0b0d12',
}

export const PRESETS: { id: string; name: string; look: Look }[] = [
  { id: 'astronauta', name: 'Astronauta', look: { ...base, head: 'capacete', face: 'olhos', top: 'jaqueta', extra: 'jetpack', legs: 'calca', feet: 'botas', skin: '#f2efe9', main: '#f2efe9', pants: '#e4e1db', second: '#f2994a', eyes: '#121316' } },
  { id: 'chef', name: 'Chef', look: { ...base, head: 'chef', face: 'bigode', top: 'avental', legs: 'calca', feet: 'botas', pattern: 'xadrez', skin: '#e8c9a8', main: '#f2efe9', pants: '#2a2b2f', second: '#e5484d', eyes: '#121316' } },
  { id: 'mago', name: 'Mago', look: { ...base, head: 'mago', face: 'sono', top: 'tunica', extra: 'capa', feet: 'botas', pattern: 'bolinhas', skin: '#d9d4cc', main: '#3b5bdb', pants: '#2a2b2f', second: '#f5c84c', eyes: '#121316' } },
  { id: 'cavaleiro', name: 'Cavaleiro', look: { ...base, head: 'elmo', face: 'visor', top: 'armadura', extra: 'capa', legs: 'calca', feet: 'botas', skin: '#8b8f98', main: '#c8ccd3', pants: '#5c6068', second: '#e5484d', eyes: '#121316' } },
  { id: 'viking', name: 'Viking', look: { ...base, shape: 'fofinho', head: 'viking', face: 'bigode', top: 'jaqueta', extra: 'capa', legs: 'calca', feet: 'botas', skin: '#e8c9a8', main: '#6d4a33', pants: '#3a2c22', second: '#a33a32', eyes: '#121316' } },
  { id: 'detetive', name: 'Detetive', look: { ...base, head: 'fedora', face: 'bravo', top: 'jaqueta', legs: 'calca', feet: 'botas', skin: '#d9d4cc', main: '#b98a63', pants: '#2a2b2f', second: '#2a2b2f', eyes: '#121316' } },
  { id: 'skatista', name: 'Skatista', look: { ...base, shape: 'esguio', head: 'bone', face: 'sorriso', top: 'moletom', extra: 'mochila', legs: 'shorts', feet: 'tenis', pattern: 'listras', skin: '#b98a63', main: '#5ebd6e', pants: '#3b5bdb', second: '#f2efe9', eyes: '#121316' } },
  { id: 'mergulhador', name: 'Mergulhador', look: { ...base, head: 'nenhum', face: 'oculos', top: 'camiseta', legs: 'shorts', feet: 'nadadeira', pattern: 'listras', skin: '#e8c9a8', main: '#f2efe9', pants: '#f2994a', second: '#3b5bdb', eyes: '#4aa8ff' } },
  { id: 'realeza', name: 'Realeza', look: { ...base, shape: 'fofinho', head: 'coroa', face: 'sorriso', top: 'tunica', extra: 'capa', feet: 'botas', pattern: 'liso', skin: '#f2efe9', main: '#7b61ff', pants: '#2a2b2f', second: '#f5c84c', eyes: '#121316' } },
  { id: 'robo', name: 'Robô', look: { ...base, head: 'antena', face: 'visor', top: 'armadura', extra: 'jetpack', legs: 'calca', feet: 'botas', skin: '#8b8f98', main: '#d9d4cc', pants: '#8b8f98', second: '#4aa8ff', eyes: '#4aa8ff' } },
  { id: 'executivo', name: 'Executivo', look: { ...base, shape: 'esguio', head: 'cartola', face: 'oculos', top: 'terno', legs: 'calca', feet: 'botas', skin: '#e9e4dc', main: '#2a2b2f', pants: '#2a2b2f', second: '#e5484d', eyes: '#121316' } },
  { id: 'anjinho', name: 'Anjinho', look: { ...base, head: 'aureola', face: 'sono', top: 'tunica', extra: 'asas', skin: '#f2efe9', main: '#f2efe9', pants: '#f2efe9', second: '#f5c84c', eyes: '#121316' } },
  { id: 'dj', name: 'DJ', look: { ...base, head: 'fones', face: 'oculos', top: 'jaqueta', extra: 'cachecol', legs: 'calca', feet: 'tenis', pattern: 'diagonal', skin: '#6d4a33', main: '#121316', pants: '#2a2b2f', second: '#d66bd0', eyes: '#d66bd0' } },
  { id: 'gatinho', name: 'Gatinho', look: { ...base, shape: 'fofinho', head: 'orelhas', face: 'sorriso', top: 'moletom', legs: 'calca', feet: 'tenis', pattern: 'liso', skin: '#f2994a', main: '#ff8fab', pants: '#f2efe9', second: '#f2efe9', eyes: '#121316' } },
  { id: 'inverno', name: 'Inverno', look: { ...base, head: 'gorro', face: 'olhos', top: 'jaqueta', extra: 'cachecol', legs: 'calca', feet: 'botas', pattern: 'listras', skin: '#e9e4dc', main: '#2f9e8f', pants: '#2a2b2f', second: '#e5484d', eyes: '#121316' } },
]

// ---------- normalização ----------

type Legacy = { body?: string; trim?: string; visor?: string; extra?: string }

const pick = <T extends readonly { id: string }[]>(list: T, v: unknown, fb: Id<T>): Id<T> => (list.some((o) => o.id === v) ? (v as Id<T>) : fb)
const hex = (v: unknown, fb: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : fb)

// sem nada escolhido o boneco veste as cores do ambiente; versões antigas (cor + acessório) viram o formato novo
export function resolveLook(raw: unknown, theme: Theme): Look {
  const d: Look = { ...base, skin: theme.avatar.body, second: theme.avatar.trim }
  if (!raw || typeof raw !== 'object') return d
  const r = raw as Partial<Look> & Legacy
  if (r.v !== 2) {
    const head = pick(HEADS, r.extra, 'nenhum')
    return { ...d, skin: hex(r.body, d.skin), second: hex(r.trim, d.second), eyes: hex(r.visor, d.eyes), head }
  }
  return {
    v: 2,
    shape: pick(SHAPES, r.shape, d.shape),
    head: pick(HEADS, r.head, d.head),
    face: pick(FACES, r.face, d.face),
    top: pick(TOPS, r.top, d.top),
    extra: pick(EXTRAS, r.extra, d.extra),
    legs: pick(LEGS, r.legs, d.legs),
    feet: pick(FEET, r.feet, d.feet),
    pattern: pick(PATTERNS, r.pattern, d.pattern),
    skin: hex(r.skin, d.skin),
    main: hex(r.main, d.main),
    pants: hex(r.pants, d.pants),
    second: hex(r.second, d.second),
    eyes: hex(r.eyes, d.eyes),
  }
}

// ---------- sortear: peças aleatórias com cores que combinam ----------

function hsl(h: number, s: number, l: number) {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

export function randomLook(): Look {
  const any = <T extends readonly { id: string }[]>(list: T, emptyChance = 0): Id<T> => (Math.random() < emptyChance ? list[0].id : list[Math.floor(Math.random() * list.length)].id) as Id<T>
  const h = Math.random() * 360
  const skins = ['#f2efe9', '#e8c9a8', '#b98a63', '#6d4a33', '#d9d4cc', '#8b8f98']
  return {
    v: 2,
    shape: any(SHAPES),
    head: any(HEADS, 0.15),
    face: any(FACES),
    top: any(TOPS, 0.1),
    extra: any(EXTRAS, 0.4),
    legs: any(LEGS, 0.15),
    feet: any(FEET, 0.15),
    pattern: any(PATTERNS, 0.4),
    skin: skins[Math.floor(Math.random() * skins.length)],
    main: hsl(h, 0.55 + Math.random() * 0.3, 0.45 + Math.random() * 0.15),
    pants: Math.random() < 0.5 ? hsl(h + 180, 0.35, 0.3) : '#2a2b2f',
    second: hsl(h + 150 + Math.random() * 60, 0.7, 0.6),
    eyes: Math.random() < 0.75 ? '#121316' : hsl(h + 40, 0.8, 0.6),
  }
}
