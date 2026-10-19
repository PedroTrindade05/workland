import { memo, useEffect, useMemo, useState } from 'react'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { pc, type FsItem, type FsListing } from '../pc'
import { useUI } from '../store'
import type { Item } from '../rooms'
import { canvasTexture, drawCard, kindOf as fileKind, label, loadImage } from '../textures'
import { useHoverable, useHovered } from '../interact'
import { openInside } from '../inside'
import type { Theme } from '../themes'

// estante: os arquivos de uma pasta nas prateleiras; pasta abre ali mesmo, arquivo abre aqui dentro
const COLS = 6
const ROWS = 3
const CARD = 0.62
const PITCH_X = 0.7
const SHELF_Y = [0.55, 1.35, 2.15]

const Card = memo(function Card({ file, slot, theme, onEnter }: { file: FsItem | 'up'; slot: number; theme: Theme; onEnter: (p: string | null) => void }) {
  const tex = useMemo(() => canvasTexture(256, 256), [])
  const up = file === 'up'
  const id = `shelf:${up ? 'up' : file.path}`
  const hovered = useHovered(id)
  useEffect(() => {
    let alive = true
    if (up) return void drawCard(tex, 'Voltar', theme, { tag: '←' })
    const kind = fileKind(file.ext, file.isDir)
    drawCard(tex, file.name, theme, { tag: file.isDir ? '▢' : (file.ext || '?').toUpperCase().slice(0, 4) })
    const paint = (src: string | null, cover: boolean) => {
      if (src) loadImage(src).then((img) => alive && drawCard(tex, file.name, theme, { icon: img, cover })).catch(() => {})
    }
    const icon = () => pc.icon(file.path, file.isDir ? 'dir' : file.ext).then((i) => paint(i, false))
    if (kind === 'image') pc.thumb(file.path).then((t) => void (t ? paint(t, true) : icon()))
    else icon()
    return () => {
      alive = false
    }
  }, [file, tex, theme, up])
  useEffect(() => () => tex.dispose(), [tex])
  const handlers = useHoverable(
    up
      ? { id, title: 'Voltar', verb: 'Subir uma pasta', run: () => onEnter(null) }
      : {
          id,
          title: file.name,
          verb: file.isDir ? 'Abrir a pasta na estante' : 'Abrir aqui dentro',
          run: () => (file.isDir ? onEnter(file.path) : openInside(() => pc.open(file.path), file.name)),
          alt: { verb: 'Mostrar no Explorer', run: () => pc.reveal(file.path) },
        },
  )
  const col = slot % COLS
  const row = Math.floor(slot / COLS)
  return (
    <mesh {...handlers} position={[(col - (COLS - 1) / 2) * PITCH_X, SHELF_Y[ROWS - 1 - row] + CARD / 2 + 0.02, 0.12]} scale={hovered ? 1.08 : 1}>
      <planeGeometry args={[CARD, CARD]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} />
    </mesh>
  )
})

export function Shelf({ item }: { item: Item }) {
  const places = useUI((s) => s.places)
  const theme = useUI((s) => s.theme)
  const root = String(item.props.folder || places.find((p) => p.key === 'documents')?.path || '')
  const [dir, setDir] = useState(root)
  const [listing, setListing] = useState<FsListing | null>(null)
  useEffect(() => setDir(root), [root])
  useEffect(() => {
    if (!dir) return
    let alive = true
    pc.list(dir).then((l) => alive && setListing(l))
    return () => {
      alive = false
    }
  }, [dir])
  const inSub = dir !== root
  const files: (FsItem | 'up')[] = [...(inSub ? (['up'] as const) : []), ...(listing?.items ?? [])].slice(0, COLS * ROWS)
  const name = dir.split(/[\\/]/).filter(Boolean).pop() ?? 'Pasta'
  const title = useMemo(() => label(name, { color: theme.card.text, w: 1024, h: 140, size: 54, weight: 400 }), [name, theme])
  const wood = '#2b2622'
  return (
    <group>
      {/* armação */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * (COLS * PITCH_X)) / 2 + s * 0.05, 1.45, 0]} castShadow>
          <boxGeometry args={[0.06, 2.9, 0.42]} />
          <meshStandardMaterial color={wood} roughness={0.6} />
        </mesh>
      ))}
      {[...SHELF_Y, 2.9].map((y) => (
        <mesh key={y} position={[0, y, 0]} castShadow receiveShadow>
          <boxGeometry args={[COLS * PITCH_X + 0.16, 0.05, 0.42]} />
          <meshStandardMaterial color={wood} roughness={0.6} />
        </mesh>
      ))}
      <RoundedBox args={[COLS * PITCH_X + 0.16, 2.9, 0.03]} radius={0.01} position={[0, 1.45, -0.2]} receiveShadow>
        <meshStandardMaterial color="#1d1a17" roughness={0.8} />
      </RoundedBox>
      <mesh position={[0, 3.25, 0]}>
        <planeGeometry args={[3, 0.41]} />
        <meshBasicMaterial map={title} transparent depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {files.map((f, i) => (
        <Card key={f === 'up' ? 'up' : f.path} file={f} slot={i} theme={theme} onEnter={(p) => setDir(p ?? listing?.parent ?? root)} />
      ))}
    </group>
  )
}
