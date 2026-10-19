import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { useUI } from '../store'
import { useRooms, type Item } from '../rooms'
import { canvasTexture, glow, label, loadImage } from '../textures'
import { useHoverable, useHovered, useNear } from '../interact'
import { pc } from '../pc'
import { goToRoom } from './rooms-nav'

const str = (v: unknown, d: string) => (typeof v === 'string' && v ? v : d)

// ---------- planta ----------

export function Plant({ item }: { item: Item }) {
  const kind = str(item.props.kind, 'folhas')
  const leaves = useMemo(() => {
    let s = item.id.split('').reduce((a, c) => a + c.charCodeAt(0), 7)
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    return Array.from({ length: 14 }, (_, i) => ({ a: (i / 14) * Math.PI * 2 + r(), tilt: 0.35 + r() * 0.5, len: 0.55 + r() * 0.45, y: 0.62 + r() * 0.15 }))
  }, [item.id])
  return (
    <group>
      <mesh position-y={0.3} castShadow receiveShadow>
        <cylinderGeometry args={[0.32, 0.24, 0.6, 28]} />
        <meshStandardMaterial color="#e8e2d8" roughness={0.6} />
      </mesh>
      <mesh position-y={0.58}>
        <cylinderGeometry args={[0.29, 0.29, 0.04, 28]} />
        <meshStandardMaterial color="#3b2a20" roughness={1} />
      </mesh>
      {kind === 'folhas' &&
        leaves.map((l, i) => (
          <mesh key={'l' + i} position={[Math.sin(l.a) * 0.18, l.y + 0.35 * l.len, Math.cos(l.a) * 0.18]} rotation={[Math.cos(l.a) * l.tilt, 0, -Math.sin(l.a) * l.tilt]} scale={[0.09, l.len * 0.5, 0.03]} castShadow>
            <sphereGeometry args={[1, 12, 10]} />
            <meshStandardMaterial color={i % 3 ? '#2f7d4a' : '#3f9a5c'} roughness={0.7} />
          </mesh>
        ))}
      {kind === 'cacto' && (
        <group position-y={0.6}>
          <mesh position-y={0.45} castShadow>
            <capsuleGeometry args={[0.13, 0.7, 8, 16]} />
            <meshStandardMaterial color="#4f8a53" roughness={0.8} />
          </mesh>
          <mesh position={[0.2, 0.55, 0]} rotation-z={-0.5} castShadow>
            <capsuleGeometry args={[0.07, 0.3, 6, 12]} />
            <meshStandardMaterial color="#4f8a53" roughness={0.8} />
          </mesh>
        </group>
      )}
      {kind === 'arvore' && (
        <group position-y={0.6}>
          <mesh position-y={0.6} castShadow>
            <cylinderGeometry args={[0.04, 0.06, 1.2, 8]} />
            <meshStandardMaterial color="#5a4030" roughness={1} />
          </mesh>
          <mesh position-y={1.35} castShadow>
            <icosahedronGeometry args={[0.55, 1]} />
            <meshStandardMaterial color="#3d8a50" roughness={0.8} flatShading />
          </mesh>
        </group>
      )}
    </group>
  )
}

// ---------- luminária ----------

export function Lamp({ item }: { item: Item }) {
  const color = str(item.props.color, '#ffd9a8')
  return (
    <group>
      <mesh position-y={0.02} castShadow>
        <cylinderGeometry args={[0.25, 0.28, 0.04, 32]} />
        <meshStandardMaterial color="#1b1d22" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position-y={0.85} castShadow>
        <cylinderGeometry args={[0.018, 0.018, 1.7, 8]} />
        <meshStandardMaterial color="#1b1d22" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position-y={1.75} castShadow>
        <cylinderGeometry args={[0.18, 0.32, 0.36, 32, 1, true]} />
        <meshStandardMaterial color="#efe8dc" roughness={0.8} side={THREE.DoubleSide} emissive={color} emissiveIntensity={0.5} />
      </mesh>
      <mesh position-y={1.68}>
        <sphereGeometry args={[0.08, 16, 12]} />
        <meshBasicMaterial color={glow(color, 3)} toneMapped={false} />
      </mesh>
    </group>
  )
}

// ---------- sofá, mesa, tapete ----------

export function Sofa({ item }: { item: Item }) {
  const color = str(item.props.color, '#4a4f5c')
  const mat = <meshStandardMaterial color={color} roughness={0.85} />
  return (
    <group>
      <RoundedBox args={[2.4, 0.42, 0.95]} radius={0.12} position={[0, 0.36, 0]} castShadow receiveShadow>
        {mat}
      </RoundedBox>
      <RoundedBox args={[2.4, 0.6, 0.25]} radius={0.1} position={[0, 0.78, -0.38]} castShadow>
        {mat}
      </RoundedBox>
      {[-1.12, 1.12].map((x) => (
        <RoundedBox key={x} args={[0.22, 0.5, 0.95]} radius={0.08} position={[x, 0.6, 0]} castShadow>
          {mat}
        </RoundedBox>
      ))}
      {[-1, 1].map((x) =>
        [-0.35, 0.35].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.07, z]}>
            <cylinderGeometry args={[0.03, 0.03, 0.14, 8]} />
            <meshStandardMaterial color="#1b1d22" metalness={0.8} roughness={0.3} />
          </mesh>
        )),
      )}
    </group>
  )
}

export function Desk({ item }: { item: Item }) {
  const color = str(item.props.color, '#2a2622')
  return (
    <group>
      <RoundedBox args={[2.2, 0.06, 0.9]} radius={0.02} position={[0, 0.75, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.5} />
      </RoundedBox>
      {[-1, 1].map((x) => (
        <mesh key={x} position={[x * 1.0, 0.37, 0]} castShadow>
          <boxGeometry args={[0.05, 0.74, 0.8]} />
          <meshStandardMaterial color="#1b1d22" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
    </group>
  )
}

export function Rug({ item }: { item: Item }) {
  const color = str(item.props.color, '#3a3f4a')
  const round = !!item.props.round
  const tex = useMemo(() => {
    const t = canvasTexture(512, 512)
    const g = (t.image as HTMLCanvasElement).getContext('2d')!
    g.fillStyle = color
    g.fillRect(0, 0, 512, 512)
    g.strokeStyle = 'rgba(255,255,255,0.18)'
    g.lineWidth = 6
    if (round) {
      g.beginPath()
      g.arc(256, 256, 220, 0, Math.PI * 2)
      g.stroke()
    } else g.strokeRect(28, 28, 456, 456)
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},0.03)`
      g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2)
    }
    t.needsUpdate = true
    return t
  }, [color, round])
  return (
    <mesh position-y={0.012} rotation-x={-Math.PI / 2} receiveShadow>
      {round ? <circleGeometry args={[1.6, 64]} /> : <planeGeometry args={[3.2, 2.2]} />}
      <meshStandardMaterial map={tex} roughness={1} />
    </mesh>
  )
}

// ---------- escultura ----------

export function Sculpture({ item }: { item: Item }) {
  const shape = str(item.props.shape, 'no')
  const ref = useRef<THREE.Mesh>(null!)
  useFrame((_, dt) => void (ref.current.rotation.y += dt * 0.2))
  return (
    <group>
      <mesh position-y={0.45} castShadow receiveShadow>
        <boxGeometry args={[0.7, 0.9, 0.7]} />
        <meshStandardMaterial color="#e9e5df" roughness={0.7} />
      </mesh>
      <mesh ref={ref} position-y={1.45} castShadow>
        {shape === 'esfera' ? <sphereGeometry args={[0.45, 48, 32]} /> : shape === 'anel' ? <torusGeometry args={[0.4, 0.1, 24, 64]} /> : <torusKnotGeometry args={[0.3, 0.09, 160, 20]} />}
        <meshStandardMaterial color="#d9d9d9" metalness={1} roughness={0.12} />
      </mesh>
    </group>
  )
}

// ---------- quadro com imagem sua ----------

export function Frame({ item }: { item: Item }) {
  const path = str(item.props.image, '')
  const [tex, setTex] = useState<THREE.Texture | null>(null)
  const [aspect, setAspect] = useState(1.4)
  useEffect(() => {
    if (!path) return setTex(null)
    let alive = true
    loadImage(pc.fileUrl(path))
      .then((img) => {
        if (!alive) return
        const t = new THREE.Texture(img)
        t.colorSpace = THREE.SRGBColorSpace
        t.needsUpdate = true
        setAspect(img.width / Math.max(1, img.height))
        setTex(t)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [path])
  const h = 1.3
  const w = Math.min(3, h * aspect)
  const hint = useMemo(() => label('escolha uma imagem (B, editar)', { color: '#8b8a86', w: 1024, h: 120, size: 40 }), [])
  return (
    <group>
      <mesh position-z={-0.04} castShadow>
        <boxGeometry args={[w + 0.14, h + 0.14, 0.06]} />
        <meshStandardMaterial color="#1a1a1c" roughness={0.4} metalness={0.3} />
      </mesh>
      <mesh>
        <planeGeometry args={[w, h]} />
        {/* sem imagem: passe-partout claro com a dica, em vez de um buraco preto */}
        {tex ? <meshBasicMaterial map={tex} toneMapped={false} /> : <meshStandardMaterial color="#ecebe7" roughness={0.9} />}
      </mesh>
      {!tex && (
        <mesh position-z={0.003}>
          <planeGeometry args={[w * 0.9, (w * 0.9 * 120) / 1024]} />
          <meshBasicMaterial map={hint} transparent toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}

// ---------- portal pra outra sala ----------

export function Portal({ item }: { item: Item }) {
  const rooms = useRooms((s) => s.rooms)
  const theme = useUI((s) => s.theme)
  const target = rooms.find((r) => r.id === item.props.room)
  const name = target?.name ?? 'Escolha a sala (B, editar)'
  const tex = useMemo(() => label(name, { color: theme.card.text, w: 1024, h: 140, size: 56, weight: 400 }), [name, theme])
  const swirl = useRef<THREE.Mesh>(null!)
  useFrame((_, dt) => void (swirl.current.rotation.z += dt * 0.8))
  const go = () => (target ? goToRoom(target.id) : useRooms.getState().setBuild(true))
  const id = `portal:${item.id}`
  const handlers = useHoverable({ id, title: name, verb: target ? 'Entrar no portal' : 'Escolher sala', run: go })
  const hovered = useHovered(id)
  useNear({ id: `portal-near:${item.id}`, x: item.x, z: item.z, r: 2.4, title: name, verb: target ? 'Entrar no portal' : 'Escolher sala', run: go })
  return (
    <group>
      <mesh position-y={1.6}>
        <torusGeometry args={[1.1, 0.06, 16, 96]} />
        <meshBasicMaterial color={glow(theme.accent, hovered ? 4 : 2.5)} toneMapped={false} />
      </mesh>
      <mesh ref={swirl} position-y={1.6} {...handlers}>
        <circleGeometry args={[1.05, 64]} />
        <meshBasicMaterial color={theme.accent} transparent opacity={hovered ? 0.4 : 0.22} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* nome sempre virado pra quem olha, de qualquer lado */}
      <Billboard position-y={3.0} lockX lockZ>
        <mesh>
          <planeGeometry args={[3, 0.41]} />
          <meshBasicMaterial map={tex} transparent depthWrite={false} />
        </mesh>
      </Billboard>
      <mesh position-y={0.01} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.9, 1.15, 64]} />
        <meshBasicMaterial color={glow(theme.accent, 1.5)} toneMapped={false} transparent opacity={0.6} />
      </mesh>
    </group>
  )
}
