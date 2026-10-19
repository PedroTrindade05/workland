// Ambientes: o salão é o mesmo, muda tudo em volta (céu, chão, luz, materiais, cenário).

export type ThemeId = 'terraco' | 'galeria' | 'orbita' | 'lago'

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
}

export const THEMES: Theme[] = [
  {
    id: 'terraco',
    name: 'Terraço',
    tagline: 'cobertura no alto da cidade, à noite',
    preview: 'linear-gradient(160deg,#070a14 0%,#1a1f3d 55%,#a9773f 100%)',
    dark: true,
    sky: { top: '#03050b', mid: '#0d1226', horizon: '#3b2a3f' },
    fog: { color: '#120f1d', near: 90, far: 620 },
    floor: { color: '#0a0b0e', roughness: 0.32, metalness: 0.4, mirror: 0.75 },
    wall: { color: '#101219', opacity: 1, roughness: 0.25, metalness: 0.6 },
    accent: '#d9b27c',
    card: { bg: 'rgba(22,24,32,0.86)', border: 'rgba(217,178,124,0.35)', text: '#f3ede4', sub: '#9a917f' },
    light: { hemiSky: '#5a6699', hemiGround: '#1a1410', hemi: 0.55, sun: '#ffd9a8', sunIntensity: 0.9, sunPos: [30, 50, 20] },
    env: { key: '#ffcf96', fill: '#4a5a9c', intensity: 0.9 },
    bloom: 1.1,
    tone: 'neutral',
    exposure: 1.0,
    avatar: { body: '#e9e4dc', trim: '#d9b27c' },
  },
  {
    id: 'galeria',
    name: 'Galeria',
    tagline: 'arquitetura minimalista, luz do dia',
    preview: 'linear-gradient(160deg,#f4f2ee 0%,#dcdad5 55%,#9aa4ad 100%)',
    dark: false,
    sky: { top: '#7fa6cf', mid: '#c9d9e8', horizon: '#ede9e2', sun: { dir: [0.5, 0.55, 0.4], color: '#fff6e6', size: 0.012 } },
    fog: { color: '#ece9e4', near: 120, far: 700 },
    floor: { color: '#b9b2a7', roughness: 0.4, metalness: 0.0, mirror: 0.3 },
    wall: { color: '#e6e1d9', opacity: 1, roughness: 0.85, metalness: 0 },
    accent: '#1c1c1e',
    card: { bg: 'rgba(255,255,255,0.97)', border: 'rgba(0,0,0,0.1)', text: '#141416', sub: '#5f5c57' },
    light: { hemiSky: '#e9f0f7', hemiGround: '#9d9488', hemi: 0.65, sun: '#fff1da', sunIntensity: 2.3, sunPos: [45, 60, 35] },
    env: { key: '#ffffff', fill: '#dfe6ee', intensity: 0.8 },
    bloom: 0,
    tone: 'neutral',
    exposure: 1.0,
    avatar: { body: '#2a2a2c', trim: '#c9c3b8' },
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
    light: { hemiSky: '#3a6b9a', hemiGround: '#05070a', hemi: 0.5, sun: '#dff4ff', sunIntensity: 1.6, sunPos: [-60, 40, -30] },
    env: { key: '#bfe9ff', fill: '#1c3b66', intensity: 1.0 },
    bloom: 1.3,
    tone: 'neutral',
    exposure: 1.0,
    avatar: { body: '#dfe6ec', trim: '#67e1ff' },
  },
  {
    id: 'lago',
    name: 'Lago',
    tagline: 'deck de madeira sobre a água, pôr do sol',
    preview: 'linear-gradient(170deg,#2b3a67 0%,#e07a5f 60%,#ffc48a 100%)',
    dark: false,
    sky: { top: '#2a3966', mid: '#e98a63', horizon: '#ffcf96', sun: { dir: [0, 0.05, -1], color: '#ffd6a0', size: 0.03 } },
    fog: { color: '#e9a27c', near: 120, far: 900 },
    floor: { color: '#8a5e3c', roughness: 0.62, metalness: 0, mirror: 0 },
    wall: { color: '#2b2522', opacity: 1, roughness: 0.55, metalness: 0.1 },
    accent: '#ffb27a',
    card: { bg: 'rgba(32,26,24,0.86)', border: 'rgba(255,178,122,0.4)', text: '#fff1e4', sub: '#bfa08c' },
    light: { hemiSky: '#ffc9a3', hemiGround: '#3b2a24', hemi: 0.75, sun: '#ffb380', sunIntensity: 2.2, sunPos: [0, 14, -80] },
    env: { key: '#ffb380', fill: '#5a6aa0', intensity: 0.9 },
    bloom: 0.7,
    tone: 'neutral',
    exposure: 1.0,
    avatar: { body: '#f2ebe3', trim: '#ffb27a' },
  },
]

export const themeById = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0]
