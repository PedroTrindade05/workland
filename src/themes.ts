// Ambientes: o salão é o mesmo, muda tudo em volta (céu, chão, luz, materiais, cenário).

export type ThemeId = 'escritorio' | 'galeria' | 'orbita'

export type Theme = {
  id: ThemeId
  name: string
  tagline: string
  preview: string
  dark: boolean
  sky: { top: string; mid: string; horizon: string; sun?: { dir: [number, number, number]; color: string; size: number } }
  fog: { color: string; near: number; far: number }
  floor: { color: string; roughness: number; metalness: number; mirror: number }
  wall: { color: string; opacity: number; roughness: number; metalness: number }
  accent: string
  card: { bg: string; border: string; text: string; sub: string }
  light: {
    hemiSky: string
    hemiGround: string
    hemi: number
    sun: string
    sunIntensity: number
    sunPos: [number, number, number]
  }
  env: { key: string; fill: string; intensity: number }
  bloom: number
  // AgX segura melhor o brilho à noite; de dia o neutro mantém o branco branco
  tone: 'agx' | 'neutral'
  exposure: number
  avatar: { body: string; trim: string }
  // cenário realista: céu de foto (HDRI), piso com material de verdade e teto que a câmera não atravessa
  real?: {
    sky?: { lo: string; hi: string; env?: string }
    floor: 'parquet' | 'deck' | 'concrete'
    floorRadius: number
    ceiling: number
    // direção do sol (casada com o sol da foto, quando tem)
    sunDir: [number, number, number]
    // luz de dentro (reflexos): cor do forro e do piso, força da foto, até onde vão as janelas e onde começa a claraboia (rad)
    interior?: { ceil: string; floor: string; gain: number; win: number; sky: number }
  }
}

export const THEMES: Theme[] = [
  {
    id: 'escritorio',
    name: 'Escritório',
    tagline: 'cobertura de luxo no fim de tarde',
    preview: 'linear-gradient(160deg,#3a2a22 0%,#8a5a3c 45%,#f0b47a 100%)',
    dark: true,
    sky: { top: '#5d6f8f', mid: '#c48b6b', horizon: '#f2b27a' },
    fog: { color: '#c9a27e', near: 400, far: 3000 },
    floor: { color: '#6b4a33', roughness: 0.5, metalness: 0, mirror: 0 },
    wall: { color: '#1d1a18', opacity: 1, roughness: 0.4, metalness: 0.3 },
    accent: '#d9b27c',
    card: { bg: 'rgba(26,22,20,0.88)', border: 'rgba(217,178,124,0.35)', text: '#f6efe6', sub: '#a8988a' },
    // sol um pouco acima do da foto (15° em vez de 7,6°) pra desenhar sombras compridas no piso
    light: { hemiSky: '#ffe2c2', hemiGround: '#9a6a44', hemi: 0.45, sun: '#ffbe85', sunIntensity: 9, sunPos: [68, 24, 57] },
    env: { key: '#ffcf96', fill: '#8a98b8', intensity: 1 },
    bloom: 0.6,
    tone: 'agx',
    exposure: 1.12,
    avatar: { body: '#e9e4dc', trim: '#d9b27c' },
    real: {
      sky: { lo: 'world/env/office_sky_4k.jpg', hi: 'world/env/office_sky_6k.jpg', env: 'world/env/office_1k.hdr' },
      floor: 'parquet',
      floorRadius: 46.6,
      ceiling: 12,
      sunDir: [0.76, 0.132, 0.636],
    },
  },
  {
    id: 'galeria',
    name: 'Galeria',
    tagline: 'museu de arte com jardim, meio-dia',
    preview: 'linear-gradient(160deg,#f6f4f0 0%,#d9d6d0 50%,#6f9a5a 100%)',
    dark: false,
    sky: { top: '#5b8fd0', mid: '#a9c6e6', horizon: '#e4ecf2' },
    fog: { color: '#dfe7ee', near: 400, far: 3000 },
    floor: { color: '#b8b5af', roughness: 0.4, metalness: 0, mirror: 0 },
    wall: { color: '#ece9e4', opacity: 1, roughness: 0.85, metalness: 0 },
    accent: '#1c1c1e',
    card: { bg: 'rgba(255,255,255,0.97)', border: 'rgba(0,0,0,0.1)', text: '#141416', sub: '#5f5c57' },
    // sol alto da foto (66°): entra pelas claraboias e desenha as faixas dos brises no piso
    light: { hemiSky: '#eef3f8', hemiGround: '#a39e96', hemi: 0.45, sun: '#fff6e8', sunIntensity: 8, sunPos: [26, 73, 19] },
    env: { key: '#ffffff', fill: '#dfe6ee', intensity: 0.85 },
    bloom: 0.2,
    // de dia o neutro mantém o branco da parede branco
    tone: 'neutral',
    exposure: 1.0,
    avatar: { body: '#2a2a2c', trim: '#c9c3b8' },
    real: {
      sky: { lo: 'world/env/gallery_sky_4k.jpg', hi: 'world/env/gallery_sky_6k.jpg' },
      floor: 'concrete',
      floorRadius: 46.2,
      ceiling: 9,
      sunDir: [0.33, 0.913, 0.24],
      // janelas até ~9° (vidro do chão ao forro); a claraboia do meio só pesa perto do zênite
      interior: { ceil: '#d6d3cd', floor: '#8c8984', gain: 1.5, win: 0.16, sky: 1.2 },
    },
  },
  {
    id: 'orbita',
    name: 'Órbita',
    tagline: 'deck de observação de uma estação espacial',
    preview: 'linear-gradient(160deg,#02030a 0%,#0b1636 55%,#3fb6d9 100%)',
    dark: true,
    sky: { top: '#000000', mid: '#02040c', horizon: '#071226' },
    fog: { color: '#02040a', near: 300, far: 2400 },
    floor: { color: '#0d1117', roughness: 0.28, metalness: 0.85, mirror: 0.55 },
    wall: { color: '#0b0f16', opacity: 1, roughness: 0.3, metalness: 0.8 },
    accent: '#67e1ff',
    card: { bg: 'rgba(8,16,26,0.85)', border: 'rgba(103,225,255,0.35)', text: '#e8f7ff', sub: '#6f8ea0' },
    light: { hemiSky: '#3a6b9a', hemiGround: '#05070a', hemi: 0.25, sun: '#fff6ea', sunIntensity: 3.4, sunPos: [-74, 29, 42] },
    env: { key: '#bfe9ff', fill: '#1c3b66', intensity: 1.0 },
    bloom: 1.0,
    tone: 'agx',
    exposure: 1.0,
    avatar: { body: '#dfe6ec', trim: '#67e1ff' },
    real: { floor: 'deck', floorRadius: 36, ceiling: 19, sunDir: [-0.82, 0.32, 0.47] },
  },
]

export const themeById = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0]
