// O pessoal do encontro no mundo: cada um com o boneco do provador, nome em cima e as reações subindo.
import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { player, useUI } from '../store'
import { FONT, label } from '../textures'
import type { Theme } from '../themes'
import { Avatar, type AvatarRig } from '../world/Avatar'
import { poses, reactions, tickPose, useMeet } from './net'

const REACT_FOR = 2600

const emoji = (e: string) => label(e, { color: '#ffffff', w: 160, h: 160, size: 120 })

// crachá do tamanho do nome (pílula escura, texto claro; quem apresenta ganha um ponto verde)
const TAG_H = 0.03
function nameTag(name: string, live: boolean) {
  const h = 72
  const c = document.createElement('canvas')
  const g = c.getContext('2d')!
  g.font = `600 34px ${FONT}`
  const dot = live ? 26 : 0
  const w = Math.ceil(g.measureText(name).width) + 48 + dot
  c.width = w
  c.height = h
  g.fillStyle = 'rgba(12,13,16,0.66)'
  g.beginPath()
  g.roundRect(0, 0, w, h, h / 2)
  g.fill()
  if (live) {
    g.fillStyle = '#3ecf6e'
    g.beginPath()
    g.arc(28, h / 2, 7, 0, Math.PI * 2)
    g.fill()
  }
  g.font = `600 34px ${FONT}`
  g.fillStyle = '#f4f2ee'
  g.textBaseline = 'middle'
  g.fillText(name, 24 + dot, h / 2 + 1)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return { tex, aspect: w / h }
}

// reação mais recente de alguém: sobe e some
function Reaction({ id, y }: { id: string; y: number }) {
  const sprite = useRef<THREE.Sprite>(null!)
  const mat = useRef<THREE.SpriteMaterial>(null!)
  const shown = useRef('')
  useFrame(() => {
    const now = performance.now()
    let r: (typeof reactions)[number] | undefined
    for (let i = reactions.length - 1; i >= 0; i--) if (reactions[i].id === id) (r = reactions[i]), (i = -1)
    const age = r ? now - r.at : Infinity
    const on = age < REACT_FOR
    sprite.current.visible = on
    if (!on || !r) return
    if (shown.current !== r.e + r.at) {
      shown.current = r.e + r.at
      mat.current.map = emoji(r.e)
      mat.current.needsUpdate = true
    }
    const k = age / REACT_FOR
    sprite.current.position.y = y + k * 0.6
    sprite.current.scale.setScalar(0.07 * Math.min(1, age / 160))
    mat.current.opacity = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25
  })
  return (
    <sprite ref={sprite} visible={false}>
      <spriteMaterial ref={mat} transparent depthWrite={false} toneMapped={false} sizeAttenuation={false} />
    </sprite>
  )
}

const Remote = memo(function Remote({ id, theme }: { id: string; theme: Theme }) {
  const peer = useMeet((s) => s.peers[id])
  const presenting = useMeet((s) => s.presenter === id)
  const root = useRef<THREE.Group>(null!)
  const rig = useRef<AvatarRig>(null!)
  const sm = useRef({ x: 0, y: 0, z: 0, yaw: 0, init: false })
  const name = peer?.name ?? ''
  const tag = useMemo(() => nameTag(name, presenting), [name, presenting])
  useEffect(() => () => tag.tex.dispose(), [tag])
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const p = poses.get(id)
    root.current.visible = !!p
    if (!p) return
    const [x, y, z, yaw, speed, grounded] = p
    const s = sm.current
    if (!s.init) Object.assign(s, { x, y, z, yaw, init: true })
    // chega suave na última posição recebida (12 por segundo)
    const k = 1 - Math.exp(-dt * 12)
    s.x += (x - s.x) * k
    s.y += (y - s.y) * k
    s.z += (z - s.z) * k
    s.yaw += Math.atan2(Math.sin(yaw - s.yaw), Math.cos(yaw - s.yaw)) * k
    root.current.position.set(s.x, s.y, s.z)
    root.current.rotation.y = s.yaw
    rig.current?.animate(dt, speed, grounded > 0.5)
  })
  return (
    <group ref={root} visible={false}>
      <Avatar ref={rig} theme={theme} visible raw={peer?.look ?? null} />
      {/* nome com tamanho fixo na tela, como em jogo */}
      <sprite position-y={2.2} scale={[TAG_H * tag.aspect, TAG_H, 1]}>
        <spriteMaterial key={tag.tex.uuid} map={tag.tex} transparent depthWrite={false} toneMapped={false} sizeAttenuation={false} />
      </sprite>
      <Reaction id={id} y={2.6} />
    </group>
  )
})

// suas reações aparecem em cima de você também (3ª pessoa)
function MyReaction() {
  const g = useRef<THREE.Group>(null!)
  const me = useMeet((s) => s.me)
  useFrame(() => g.current.position.copy(player.pos))
  return <group ref={g}>{me && <Reaction id={me} y={2.45} />}</group>
}

// reações de quem assiste pelo navegador sobem pelo pé do telão (coordenadas do telão)
const POOL = 10
export function ViewerReactions({ w, h }: { w: number; h: number }) {
  const sprites = useRef<(THREE.Sprite | null)[]>([])
  const shown = useRef<string[]>([])
  useFrame(() => {
    const now = performance.now()
    const peers = useMeet.getState().peers
    let n = 0
    for (let i = reactions.length - 1; i >= 0 && n < POOL; i--) {
      const r = reactions[i]
      const age = now - r.at
      if (age > REACT_FOR) break
      if (!peers[r.id]?.viewer) continue
      const s = sprites.current[n]
      if (!s) continue
      const mat = s.material as THREE.SpriteMaterial
      const key = r.e + r.at
      if (shown.current[n] !== key) {
        shown.current[n] = key
        mat.map = emoji(r.e)
        mat.needsUpdate = true
      }
      // cada reação numa altura do telão, espalhadas pela largura
      const k = age / REACT_FOR
      const x = ((((r.at * 7919) % 1000) + 1000) % 1000) / 1000
      s.position.set((x - 0.5) * w * 0.85, -h / 2 + 0.5 + k * h * 0.45, 0.3)
      s.scale.setScalar(0.9 * Math.min(1, age / 160))
      mat.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3
      s.visible = true
      n++
    }
    for (let i = n; i < POOL; i++) if (sprites.current[i]) sprites.current[i]!.visible = false
  })
  return (
    <>
      {Array.from({ length: POOL }, (_, i) => (
        <sprite key={i} ref={(s) => (sprites.current[i] = s)} visible={false}>
          <spriteMaterial transparent depthWrite={false} toneMapped={false} />
        </sprite>
      ))}
    </>
  )
}

export function RemotePlayers() {
  const ids = useMeet((s) =>
    Object.values(s.peers)
      .filter((p) => !p.viewer)
      .map((p) => p.id)
      .join(','),
  )
  const on = useMeet((s) => s.status === 'on')
  const theme = useUI((s) => s.theme)
  useFrame((_, dt) => tickPose(Math.min(dt, 0.1)))
  if (!on) return null
  return (
    <>
      {ids
        .split(',')
        .filter(Boolean)
        .map((id) => (
          <Remote key={id} id={id} theme={theme} />
        ))}
      <MyReaction />
    </>
  )
}
