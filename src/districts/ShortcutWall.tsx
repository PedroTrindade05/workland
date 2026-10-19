import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { pc, type Shortcut } from '../pc'
import { useUI } from '../store'
import { arcPoint, metersToDeg } from '../layout'
import type { Item } from '../rooms'
import { canvasTexture, drawCard, initials, loadImage } from '../textures'
import { useHoverable, useHovered } from '../interact'
import { openShortcut } from '../inside'
import { ArcWall } from '../world/ArcWall'
import type { Theme } from '../themes'

const R = 24
const SPAN = 100
const PITCH = 2.3
const ROW = 2.35
const SIZE = 1.9
const Y0 = 1.55

// fileiras equilibradas e centralizadas no arco (a de baixo na altura dos olhos)
function placeAll(n: number) {
  const maxCols = Math.floor((SPAN * Math.PI * R) / 180 / PITCH)
  const rows = Math.max(1, Math.ceil(n / maxCols))
  const perRow = Math.ceil(n / rows)
  return Array.from({ length: n }, (_, i) => {
    const row = Math.floor(i / perRow)
    const inRow = Math.min(perRow, n - row * perRow)
    const col = i % perRow
    const deg = metersToDeg((col - (inRow - 1) / 2) * PITCH, R)
    return { ...arcPoint(R, deg, 0.4), y: Y0 + (rows - 1 - row) * ROW, rows }
  })
}

const Tile = memo(function Tile({ item, pos, theme }: { item: Shortcut; pos: { x: number; y: number; z: number; rotY: number }; theme: Theme }) {
  const tex = useMemo(() => canvasTexture(256, 256), [])
  const id = `sc:${item.id}`
  const hovered = useHovered(id)
  const ref = useRef<THREE.Group>(null!)

  useEffect(() => {
    let alive = true
    drawCard(tex, item.name, theme, { tag: initials(item.name) })
    if (item.icon)
      loadImage(item.icon)
        .then((img) => alive && drawCard(tex, item.name, theme, { icon: img }))
        .catch(() => {})
    return () => {
      alive = false
    }
  }, [item, tex, theme])
  useEffect(() => () => tex.dispose(), [tex])

  const handlers = useHoverable({
    id,
    title: item.name,
    verb: 'Abrir aqui dentro',
    run: () => openShortcut(item),
    alt: { verb: 'Abrir fora do mundo', run: () => pc.openShortcut(item.path) },
  })

  // levanta um pouco quando está na mira
  useFrame((_, dt) => {
    const g = ref.current
    const s = hovered ? 1.08 : 1
    const z = hovered ? 0.3 : 0
    if (Math.abs(g.scale.x - s) < 0.001 && Math.abs(g.position.z - z) < 0.001) return
    const k = 1 - Math.exp(-dt * 14)
    g.scale.x += (s - g.scale.x) * k
    g.scale.y = g.scale.z = g.scale.x
    g.position.z += (z - g.position.z) * k
  })

  return (
    <group position={[pos.x, pos.y, pos.z]} rotation-y={pos.rotY}>
      <group ref={ref}>
        <mesh {...handlers}>
          <planeGeometry args={[SIZE, SIZE]} />
          <meshBasicMaterial map={tex} transparent toneMapped={false} />
        </mesh>
        {hovered && (
          <mesh position-z={-0.02}>
            <planeGeometry args={[SIZE + 0.1, SIZE + 0.1]} />
            <meshBasicMaterial color={theme.accent} toneMapped={false} transparent opacity={0.9} />
          </mesh>
        )}
      </group>
    </group>
  )
})

export function ShortcutWall({ item }: { item: Item }) {
  const shortcuts = useUI((s) => s.shortcuts)
  const theme = useUI((s) => s.theme)
  const spots = useMemo(() => placeAll(shortcuts.length), [shortcuts.length])
  const rows = spots[0]?.rows ?? 1
  const height = Y0 + (rows - 1) * ROW + SIZE / 2 + 0.6
  return (
    <group>
      <ArcWall r={R} span={SPAN} title={String(item.props.title || 'Atalhos')} theme={theme} height={height} sub={shortcuts.length ? `${shortcuts.length} na sua Área de Trabalho` : 'nenhum atalho na Área de Trabalho'} />
      {shortcuts.map((s, i) => (
        <Tile key={s.id} item={s} pos={spots[i]} theme={theme} />
      ))}
    </group>
  )
}
