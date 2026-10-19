// Palco de apresentação (telão + púlpito) e plateia. O palco fica de frente pro +z, como os outros objetos.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { currentRoom, useRooms, type Item } from '../rooms'
import { useUI } from '../store'
import { useHoverable } from '../interact'
import { glow } from '../textures'
import { PresentScreen } from '../present/Screen'
import { usePresent } from '../present/state'
import { useMeet } from '../meet/net'
import { ViewerReactions } from '../meet/RemotePlayers'

export const SCREEN = { w: 12, h: 6.75, y: 4.95, z: -5 }

// o telão do palco da sala atual, pra câmera do "assistir" enquadrar
export const stageScreen: { group: THREE.Object3D | null; w: number; h: number } = { group: null, w: SCREEN.w, h: SCREEN.h }

// ---------- altura do chão: em cima do palco você fica a 50 cm (o degrau da frente fica no meio) ----------

let stages: Item[] = []
const refreshStages = () => (stages = currentRoom()?.items.filter((i) => i.kind === 'stage') ?? [])
useRooms.subscribe(refreshStages)
refreshStages()

export function groundAt(x: number, z: number) {
  let y = 0
  for (const it of stages) {
    // ponto no espaço do palco (frente = +z, borda da frente em z = 0)
    const dx = (x - it.x) / it.scale
    const dz = (z - it.z) / it.scale
    const c = Math.cos(it.rotY)
    const s = Math.sin(it.rotY)
    const lx = dx * c - dz * s
    const lz = dx * s + dz * c
    if (Math.abs(lx) <= 7 && lz <= 0 && lz >= -6) y = Math.max(y, it.y + 0.5 * it.scale)
    else if (Math.abs(lx) <= 1.6 && lz > 0 && lz <= 0.7) y = Math.max(y, it.y + 0.26 * it.scale)
  }
  return y
}

const platformMat = new THREE.MeshStandardMaterial({ color: '#1a1c21', roughness: 0.55, metalness: 0.2 })
const frameMat = new THREE.MeshStandardMaterial({ color: '#0c0d10', roughness: 0.35, metalness: 0.6 })
const blackMat = new THREE.MeshBasicMaterial({ color: '#050608' })

export function Stage({ item }: { item: Item }) {
  const theme = useUI((s) => s.theme)
  const watching = useUI((s) => s.watching)
  const mine = useMeet((s) => s.status !== 'on' || s.presenter === s.me)
  const screen = useRef<THREE.Group>(null!)
  useEffect(() => {
    const g = screen.current
    stageScreen.group = g
    return () => {
      if (stageScreen.group === g) stageScreen.group = null
    }
  }, [])
  const screenHover = useHoverable({
    id: `stage:${item.id}`,
    title: 'Telão',
    verb: watching ? 'Sair do telão' : 'Assistir',
    run: () => useUI.getState().setWatching(!useUI.getState().watching),
  })
  const podiumHover = useHoverable({
    id: `podium:${item.id}`,
    title: 'Púlpito',
    verb: mine ? 'Escolher o que mostrar' : 'Ver quem apresenta',
    run: () => usePresent.getState().setMenu(true),
  })
  const accent = useMemo(() => glow(theme.accent, 2.2), [theme.accent])
  const legH = SCREEN.y - SCREEN.h / 2 - 0.5
  return (
    <group>
      {/* palco com degrau e fita de luz na borda */}
      <RoundedBox args={[14, 0.5, 6]} radius={0.06} smoothness={2} position={[0, 0.25, -3]} material={platformMat} receiveShadow castShadow />
      <mesh position={[0, 0.13, 0.35]} material={platformMat} receiveShadow>
        <boxGeometry args={[3.2, 0.26, 0.7]} />
      </mesh>
      <mesh position={[0, 0.5, 0.005]}>
        <boxGeometry args={[13.9, 0.025, 0.025]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>

      {/* telão de LED em pé no palco */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (SCREEN.w / 2 - 1.2), 0.5 + legH / 2, SCREEN.z - 0.2]} material={frameMat} castShadow>
          <boxGeometry args={[0.35, legH, 0.35]} />
        </mesh>
      ))}
      <group ref={screen} position={[0, SCREEN.y, SCREEN.z]} {...screenHover}>
        <mesh position-z={-0.17} material={frameMat} castShadow>
          <boxGeometry args={[SCREEN.w + 0.3, SCREEN.h + 0.3, 0.3]} />
        </mesh>
        <mesh material={blackMat}>
          <planeGeometry args={[SCREEN.w, SCREEN.h]} />
        </mesh>
        <mesh position={[0, -SCREEN.h / 2 - 0.1, 0.02]}>
          <boxGeometry args={[SCREEN.w * 0.3, 0.02, 0.02]} />
          <meshBasicMaterial color={accent} toneMapped={false} />
        </mesh>
        <PresentScreen w={SCREEN.w} h={SCREEN.h} />
        <ViewerReactions w={SCREEN.w} h={SCREEN.h} />
      </group>

      {/* púlpito de quem apresenta */}
      <group position={[4.7, 0.5, -1.3]} rotation-y={-0.35} {...podiumHover}>
        <RoundedBox args={[0.8, 1.05, 0.5]} radius={0.04} smoothness={2} position-y={0.525} material={frameMat} castShadow />
        <RoundedBox args={[0.92, 0.05, 0.62]} radius={0.02} smoothness={2} position={[0, 1.08, 0.04]} rotation-x={0.28} material={platformMat} />
        <mesh position={[0, 0.7, 0.252]}>
          <boxGeometry args={[0.5, 0.02, 0.005]} />
          <meshBasicMaterial color={accent} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

// ---------- plateia: fileiras curvas viradas pro palco (+z) ----------

const seatGeo = new THREE.BoxGeometry(0.52, 0.08, 0.48)
const backGeo = new THREE.BoxGeometry(0.52, 0.56, 0.06)
const legGeo = new THREE.CylinderGeometry(0.035, 0.05, 0.42, 8)
const legMat = new THREE.MeshStandardMaterial({ color: '#16171b', roughness: 0.4, metalness: 0.6 })
const m = new THREE.Matrix4()
const part = new THREE.Matrix4()
const q = new THREE.Quaternion()
const up = new THREE.Vector3(0, 1, 0)
const one = new THREE.Vector3(1, 1, 1)
const pos = new THREE.Vector3()

export function Seats({ item }: { item: Item }) {
  const rows = Math.max(1, Math.min(8, Number(item.props.rows) || 4))
  const cols = Math.max(2, Math.min(16, Number(item.props.cols) || 10))
  const color = String(item.props.color || '#3d4350')
  const seat = useRef<THREE.InstancedMesh>(null!)
  const back = useRef<THREE.InstancedMesh>(null!)
  const leg = useRef<THREE.InstancedMesh>(null!)
  const fabric = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.9 }), [color])
  useEffect(() => () => fabric.dispose(), [fabric])
  const n = rows * cols
  useLayoutEffect(() => {
    // arco com centro na frente (no palco); corredor no meio
    const C = 13
    let i = 0
    for (let r = 0; r < rows; r++) {
      const R = C + r * 1.25
      for (let c = 0; c < cols; c++) {
        const half = cols / 2
        const off = (c - (cols - 1) / 2) * 0.74 + (c < half ? -0.5 : 0.5)
        const a = off / R
        pos.set(Math.sin(a) * R, 0, C - Math.cos(a) * R)
        q.setFromAxisAngle(up, -a)
        m.compose(pos, q, one)
        seat.current.setMatrixAt(i, part.makeTranslation(0, 0.46, 0).premultiply(m))
        back.current.setMatrixAt(i, part.makeTranslation(0, 0.78, -0.22).premultiply(m))
        leg.current.setMatrixAt(i, part.makeTranslation(0, 0.21, 0).premultiply(m))
        i++
      }
    }
    for (const mesh of [seat.current, back.current, leg.current]) {
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    }
  }, [rows, cols])
  return (
    <group>
      {/* material por prop: trocar a cor não recria as cadeiras (as posições continuam) */}
      <instancedMesh key={`s${n}`} ref={seat} args={[seatGeo, undefined, n]} material={fabric} castShadow receiveShadow />
      <instancedMesh key={`b${n}`} ref={back} args={[backGeo, undefined, n]} material={fabric} castShadow />
      <instancedMesh key={`l${n}`} ref={leg} args={[legGeo, legMat, n]} />
    </group>
  )
}
