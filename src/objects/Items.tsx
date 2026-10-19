import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useCurrentRoom, useRooms, type Item } from '../rooms'
import { useUI } from '../store'
import { drag } from '../interact'
import { REGISTRY } from './registry'

// grupo de cada objeto, pra caixa de seleção e pra achar paredes
export const itemGroups = new Map<string, THREE.Object3D>()

// ---------- arrastar no modo construção ----------

const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const hit = new THREE.Vector3()
const ndc = new THREE.Vector2()
const moving = { id: '', ox: 0, oz: 0, active: false }
let startDrag: ((it: Item, e: PointerEvent) => void) | null = null

function BuildDrag() {
  const { camera, gl, raycaster } = useThree()
  useEffect(() => {
    const el = gl.domElement
    const floorAt = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      return raycaster.ray.intersectPlane(floor, hit)
    }
    const move = (e: PointerEvent) => {
      if (!moving.active || !(e.buttons & 1)) return
      const p = floorAt(e)
      if (!p) return
      // grade de 25 cm (segure Alt pra mover livre)
      const snap = (v: number) => (e.altKey ? v : Math.round(v * 4) / 4)
      useRooms.getState().update(moving.id, { x: snap(p.x + moving.ox), z: snap(p.z + moving.oz) }, false)
    }
    const up = () => {
      moving.active = false
      drag.building = false
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    startDrag = (it, e) => {
      const p = floorAt(e)
      if (!p) return
      useRooms.getState().checkpoint()
      Object.assign(moving, { id: it.id, ox: it.x - p.x, oz: it.z - p.z, active: true })
      drag.building = true
    }
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [camera, gl, raycaster])
  return null
}

// ---------- caixa em volta do objeto selecionado ----------

function Selection() {
  const selected = useRooms((s) => s.selected)
  const theme = useUI((s) => s.theme)
  const box = useMemo(() => new THREE.Box3(), [])
  const helper = useMemo(() => new THREE.Box3Helper(box, new THREE.Color(theme.accent).multiplyScalar(2)), [box, theme.accent])
  useFrame(() => {
    const g = selected ? itemGroups.get(selected) : undefined
    helper.visible = !!g
    if (g) box.setFromObject(g).expandByScalar(0.08)
  })
  useEffect(() => () => helper.dispose(), [helper])
  return <primitive object={helper} />
}

// ---------- cada objeto ----------

const ItemNode = memo(function ItemNode({ item }: { item: Item }) {
  const ref = useRef<THREE.Group>(null!)
  const Comp = REGISTRY[item.kind]
  useEffect(() => {
    itemGroups.set(item.id, ref.current)
    return () => void itemGroups.delete(item.id)
  }, [item.id])

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (!useRooms.getState().build || e.nativeEvent.button !== 0) return
    e.stopPropagation()
    useRooms.getState().select(item.id)
    startDrag?.(item, e.nativeEvent)
  }
  const onPointerOver = (e: ThreeEvent<PointerEvent>) => {
    if (!useRooms.getState().build) return
    e.stopPropagation()
    document.body.style.cursor = 'grab'
  }
  const onPointerOut = () => {
    if (useRooms.getState().build) document.body.style.cursor = ''
  }

  if (!Comp) return null
  return (
    <group ref={ref} position={[item.x, item.y, item.z]} rotation-y={item.rotY} scale={item.scale} onPointerDown={onPointerDown} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      <Comp item={item} />
    </group>
  )
})

export function Items() {
  const room = useCurrentRoom()
  const focusMode = useUI((s) => s.focusMode)
  const items = room?.items ?? []
  // modo foco: só as telas ficam
  const shown = focusMode ? items.filter((i) => i.kind === 'screen-wall' || i.kind === 'site') : items
  return (
    <>
      {shown.map((it) => (
        <ItemNode key={it.id} item={it} />
      ))}
      <BuildDrag />
      <Selection />
    </>
  )
}
