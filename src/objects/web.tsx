import { createElement, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { pc } from '../pc'
import { useUI } from '../store'
import { useRooms, type Item } from '../rooms'
import { label } from '../textures'

// telas web de verdade (webview do Electron) penduradas no mundo: sites e plugins
const PX_W = 1280
const PX_H = 760
const UNITS_W = 3.6
const FACTOR = (UNITS_W * 400) / PX_W
const UNITS_H = (PX_H / PX_W) * UNITS_W
const BASE_Y = 0.75

type WebviewEl = HTMLElement & { goBack(): void; reload(): void; canGoBack(): boolean; loadURL(u: string): Promise<void>; focus(): void }

export function normalizeUrl(raw: string) {
  const t = raw.trim()
  if (/^(https?|wlfile):\/\//i.test(t)) return t
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(t)) return `https://${t}`
  return `https://www.google.com/search?q=${encodeURIComponent(t)}`
}

const wp = new THREE.Vector3()
const wq = new THREE.Quaternion()
const wn = new THREE.Vector3()
const to = new THREE.Vector3()

function WebPanel({ item, src, editable }: { item: Item; src: string; editable: boolean }) {
  const build = useRooms((s) => s.build)
  const theme = useUI((s) => s.theme)
  const [visible, setVisible] = useState(true)
  const [addr, setAddr] = useState(src)
  const view = useRef<WebviewEl | null>(null)
  const group = useRef<THREE.Group>(null!)
  const tick = useRef(0)
  useEffect(() => setAddr(src), [src])

  // o HTML fica por cima do 3D: esconde quando está de costas, longe, no modo construção ou no provador (tamparia o boneco)
  useFrame(({ camera }, dt) => {
    tick.current -= dt
    if (tick.current > 0) return
    tick.current = 0.15
    group.current.getWorldPosition(wp)
    group.current.getWorldQuaternion(wq)
    wn.set(0, 0, 1).applyQuaternion(wq)
    to.copy(camera.position).sub(wp).setY(0)
    const ui = useUI.getState()
    const show = !build && to.length() < 40 && to.normalize().dot(wn) > 0.15 && !ui.focus && ui.panel !== 'avatar'
    if (show !== visible) setVisible(show)
  })

  useEffect(() => {
    const el = view.current
    if (!el || !pc.native || !editable) return
    const nav = (e: Event) => {
      const url = (e as unknown as { url: string }).url
      setAddr(url)
      useRooms.getState().update(item.id, { props: { ...item.props, url } } as never, false)
    }
    el.addEventListener('did-navigate', nav)
    el.addEventListener('did-navigate-in-page', nav)
    return () => {
      el.removeEventListener('did-navigate', nav)
      el.removeEventListener('did-navigate-in-page', nav)
    }
  }, [item.id, item.props, editable])

  const go = (u: string) => {
    const url = normalizeUrl(u)
    setAddr(url)
    if (pc.native) view.current?.loadURL(url).catch(() => {})
  }

  const initial = useRef(src).current
  const frame = pc.native
    ? createElement('webview', { ref: view, src: initial, allowpopups: 'true', style: { width: '100%', flex: 1, background: '#fff' } })
    : createElement('iframe', { src: initial, style: { width: '100%', flex: 1, border: 0, background: '#fff' } })
  const placeholder = useMemo(() => label(editable ? addr.replace(/^https?:\/\//, '') : 'plugin', { color: theme.card.sub, w: 1024, h: 140, size: 44 }), [addr, editable, theme])

  return (
    <group ref={group}>
      <mesh position={[0, (BASE_Y + UNITS_H) / 2, -0.09]} castShadow>
        <boxGeometry args={[0.08, BASE_Y + UNITS_H, 0.08]} />
        <meshStandardMaterial color="#1b1d22" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, BASE_Y + UNITS_H / 2, -0.03]} castShadow>
        <boxGeometry args={[UNITS_W + 0.1, UNITS_H + 0.1, 0.04]} />
        <meshStandardMaterial color="#15171c" />
      </mesh>
      {!visible && (
        <mesh position={[0, BASE_Y + UNITS_H / 2, 0.001]}>
          <planeGeometry args={[UNITS_W * 0.8, UNITS_W * 0.8 * (140 / 1024)]} />
          <meshBasicMaterial map={placeholder} transparent />
        </mesh>
      )}
      <Html transform distanceFactor={FACTOR} position={[0, BASE_Y + UNITS_H / 2, 0.01]} zIndexRange={[20, 0]} style={{ display: visible ? 'block' : 'none' }}>
        <div className="webscreen" style={{ width: PX_W, height: PX_H }} onPointerDown={(e) => e.stopPropagation()}>
          {editable && (
            <form
              className="webscreen-bar"
              onSubmit={(e) => {
                e.preventDefault()
                go(addr)
              }}
            >
              <button type="button" title="Voltar" onClick={() => view.current?.canGoBack() && view.current.goBack()}>
                ←
              </button>
              <button type="button" title="Recarregar" onClick={() => view.current?.reload()}>
                ↻
              </button>
              <input value={addr} onChange={(e) => setAddr(e.target.value)} spellCheck={false} />
              <button type="button" title="Abrir no navegador" onClick={() => pc.openUrl(addr)}>
                ↗
              </button>
            </form>
          )}
          {frame}
        </div>
      </Html>
    </group>
  )
}

export function Site({ item }: { item: Item }) {
  return <WebPanel item={item} src={normalizeUrl(String(item.props.url || 'https://www.google.com'))} editable />
}

export function Plugin({ item }: { item: Item }) {
  const plugins = useUI((s) => s.plugins)
  const p = plugins.find((x) => x.id === item.props.plugin)
  if (!p) return <WebPanel key="none" item={item} src="about:blank" editable={false} />
  return <WebPanel key={p.id} item={item} src={p.url} editable={false} />
}
