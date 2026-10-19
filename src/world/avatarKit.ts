import { createContext, useContext, useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { Look, ShapeId } from '../avatar/look'
import { patternTexture } from '../avatar/patterns'

// ---------- medidas de cada formato de corpo ----------

export const TORSO_Y = 0.32
export const ARM_L = 0.52
export const ARM_C = -0.3
export const LEG_L = 0.78
// pé no chão: a perna vai do quadril (0.92) até 1 cm do piso
export const FLOOR = -0.92

const SHAPE: Record<ShapeId, { torsoR: number; torsoL: number; armR: number; legR: number; head: number; hipX: number }> = {
  esguio: { torsoR: 0.15, torsoL: 0.38, armR: 0.048, legR: 0.066, head: 0.95, hipX: 0.1 },
  padrao: { torsoR: 0.17, torsoL: 0.36, armR: 0.055, legR: 0.075, head: 1, hipX: 0.11 },
  fofinho: { torsoR: 0.235, torsoL: 0.26, armR: 0.078, legR: 0.1, head: 1.18, hipX: 0.13 },
}

export function measure(shape: ShapeId) {
  const s = SHAPE[shape]
  const torsoTop = TORSO_Y + s.torsoL / 2 + s.torsoR
  const legC = 0.52 - s.legR
  return {
    ...s,
    torsoTop,
    // centro da cúpula de baixo do tronco (onde a calça começa)
    domeLow: TORSO_Y - s.torsoL / 2,
    headY: torsoTop + 0.13 * s.head - 0.02,
    armY: torsoTop - 0.12,
    shoulderX: s.torsoR + s.armR + 0.025,
    legC,
    legTop: -legC + LEG_L / 2 + s.legR,
    legBottom: -legC - LEG_L / 2 - s.legR,
    armTop: ARM_C + ARM_L / 2 + s.armR,
    armBottom: ARM_C - ARM_L / 2 - s.armR,
  }
}
export type Dims = ReturnType<typeof measure>

// raio do tronco a "drop" metros abaixo do topo (gola, cachecol)
export const neckR = (d: Dims, drop: number) => Math.sqrt(Math.max(0.0004, d.torsoR ** 2 - (d.torsoR - drop) ** 2))

// ---------- materiais: os fixos são um só pra todo mundo, os de cor mudam com o visual ----------

export const SH = {
  dark: new THREE.MeshStandardMaterial({ color: '#17181c', roughness: 0.45, metalness: 0.3 }),
  metal: new THREE.MeshStandardMaterial({ color: '#c3c8cf', roughness: 0.28, metalness: 0.9 }),
  gold: new THREE.MeshStandardMaterial({ color: '#e2b24f', roughness: 0.22, metalness: 1, side: THREE.DoubleSide }),
  white: new THREE.MeshStandardMaterial({ color: '#f6f4ef', roughness: 0.75 }),
  ivory: new THREE.MeshStandardMaterial({ color: '#efe4cc', roughness: 0.5 }),
  hair: new THREE.MeshStandardMaterial({ color: '#2e2621', roughness: 0.8 }),
  glass: new THREE.MeshStandardMaterial({ color: '#e6f6ff', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.18, depthWrite: false }),
  flame: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb04a').multiplyScalar(3), toneMapped: false }),
  halo: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd36b').multiplyScalar(2.2), toneMapped: false }),
}

export function makeMats(look: Look) {
  const tex = patternTexture(look.pattern, look.main, look.second)
  const cloth = (side: THREE.Side) => new THREE.MeshStandardMaterial({ color: tex ? '#ffffff' : look.main, map: tex, roughness: 0.85, side })
  return {
    skin: new THREE.MeshPhysicalMaterial({ color: look.skin, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 }),
    cloth: cloth(THREE.FrontSide),
    clothDouble: cloth(THREE.DoubleSide),
    mainPlain: new THREE.MeshStandardMaterial({ color: look.main, roughness: 0.8 }),
    armor: new THREE.MeshStandardMaterial({ color: look.main, roughness: 0.3, metalness: 0.85 }),
    pants: new THREE.MeshStandardMaterial({ color: look.pants, roughness: 0.85 }),
    boots: new THREE.MeshStandardMaterial({ color: new THREE.Color(look.pants).lerp(new THREE.Color('#000000'), 0.45), roughness: 0.6 }),
    second: new THREE.MeshStandardMaterial({ color: look.second, roughness: 0.6 }),
    secondDouble: new THREE.MeshStandardMaterial({ color: look.second, roughness: 0.6, side: THREE.DoubleSide }),
    trim: new THREE.MeshBasicMaterial({ color: look.second, toneMapped: false }),
    eyes: new THREE.MeshPhysicalMaterial({ color: look.eyes, roughness: 0.1, metalness: 0.4, clearcoat: 1 }),
  }
}
export type Mats = ReturnType<typeof makeMats>

// ---------- animação compartilhada com as peças que se mexem (capa, pompom, chama, piscar...) ----------

export type Anim = { t: number; phase: number; speed: number; grounded: boolean; air: number; blink: number; jelly: number }
export type Hook = (a: Anim, dt: number) => void
type Ctx = { look: Look; d: Dims; m: Mats; onFrame: (fn: Hook) => () => void }
export const AvatarCtx = createContext<Ctx>(null!)
export const useAvatar = () => useContext(AvatarCtx)

export function useAvatarFrame(fn: Hook) {
  const { onFrame } = useAvatar()
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => onFrame((a, dt) => ref.current(a, dt)), [onFrame])
}
