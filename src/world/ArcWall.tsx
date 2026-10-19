import { useMemo } from 'react'
import * as THREE from 'three'
import { arcPoint } from '../layout'
import { glow, label } from '../textures'
import type { Theme } from '../themes'

const D = Math.PI / 180

// parede curva (em coordenadas do objeto): passa pela origem e curva pra frente,
// com filetes de luz em cima e embaixo e o título
export function ArcWall({ r, span, theme, height, title, sub }: { r: number; span: number; theme: Theme; height: number; title: string; sub?: string }) {
  const len = span * D
  const tex = useMemo(
    () => label(title.toUpperCase(), { color: theme.card.text, w: 1024, h: 200, size: 64, weight: 300, spacing: 22, sub, subColor: theme.card.sub }),
    [title, theme, sub],
  )
  const t = arcPoint(r, 0, 0.4)
  return (
    <group>
      <mesh position={[0, height / 2, r]} receiveShadow castShadow>
        <cylinderGeometry args={[r + 0.12, r + 0.12, height, 96, 1, true, Math.PI - len / 2, len]} />
        <meshStandardMaterial color={theme.wall.color} roughness={theme.wall.roughness} metalness={theme.wall.metalness} side={THREE.DoubleSide} />
      </mesh>
      {[0.05, height].map((y) => (
        <mesh key={y} position={[0, y, r]} rotation={[-Math.PI / 2, 0, Math.PI / 2 - len / 2]}>
          <torusGeometry args={[r - 0.02, 0.022, 6, 96, len]} />
          <meshBasicMaterial color={glow(theme.accent, 2)} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[t.x, height + 1.3, t.z]}>
        <planeGeometry args={[9, 1.76]} />
        <meshBasicMaterial map={tex} transparent depthWrite={false} />
      </mesh>
    </group>
  )
}
