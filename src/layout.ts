// O salão é um círculo; cada seção é um arco de parede virado pro centro.
// Ângulos em graus estilo bússola: 0 = norte (-z), 90 = leste (+x).
//
//                  Atalhos (N)
//        Telas (O)    [ centro ]    (aberto pro cenário)
//                   Sistema (S)

export const HALL = { radius: 24, walk: 31, floor: 34 }

export type Section = { key: string; name: string; center: number; span: number; r: number }

export const SECTIONS = {
  shortcuts: { key: 'shortcuts', name: 'Atalhos', center: 0, span: 100, r: 24 },
  system: { key: 'system', name: 'Sistema', center: 180, span: 40, r: 24 },
  screens: { key: 'screens', name: 'Telas', center: 270, span: 76, r: 24 },
} satisfies Record<string, Section>

const D = Math.PI / 180

// ponto no círculo + rotação pra encarar o centro
export function polar(deg: number, r: number) {
  const a = deg * D
  return { x: Math.sin(a) * r, z: -Math.cos(a) * r, rotY: -a }
}

// grade sobre um arco: colunas espaçadas por "pitch" metros
export function arcGrid(sec: Section, cols: number, rows: number, pitch: number, rowPitch: number, y0: number, i: number) {
  const col = i % cols
  const row = Math.floor(i / cols)
  const deg = sec.center + ((col - (cols - 1) / 2) * pitch) / (sec.r * D)
  const p = polar(deg, sec.r - 0.35)
  return { ...p, y: y0 + (rows - 1 - row) * rowPitch, deg }
}

export function colsFor(sec: Section, pitch: number) {
  return Math.floor((sec.span * D * sec.r) / pitch)
}

export function sectionAt(x: number, z: number) {
  let deg = (Math.atan2(x, -z) / D + 360) % 360
  if (Math.hypot(x, z) < 4) return 'Centro'
  for (const s of Object.values(SECTIONS)) {
    let d = Math.abs(deg - s.center)
    if (d > 180) d = 360 - d
    if (d < s.span / 2 + 12) return s.name
  }
  return 'Salão'
}

// ponto de onde se olha bem uma seção (pra teleportar)
export function viewpoint(sec: Section, dist = 9) {
  const p = polar(sec.center, sec.r - dist)
  // olhar pro arco = virar pro ângulo da seção
  return { x: p.x, z: p.z, yaw: Math.PI - sec.center * D }
}

// ---------- arcos locais (paredes que viram objetos) ----------
// O arco passa pela origem do objeto e curva pra frente (+z), com o centro do círculo em (0,0,r).
// Assim a parede funciona em qualquer lugar onde o objeto for colocado.
export function arcPoint(r: number, deg: number, inset = 0) {
  const a = deg * D
  const rr = r - inset
  return { x: rr * Math.sin(a), z: r - rr * Math.cos(a), rotY: -a }
}
export const metersToDeg = (m: number, r: number) => m / (r * D)
