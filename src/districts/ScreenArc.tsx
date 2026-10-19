import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { pc, type WinEntry } from '../pc'
import { player, useUI, type ScreenPose } from '../store'
import { HALL, arcPoint, metersToDeg } from '../layout'
import type { Item } from '../rooms'
import { canvasTexture, drawCard, label, loadImage } from '../textures'
import { drag, useHoverable, useHovered } from '../interact'
import { carriedPose, dropCarried, enterWindow, screenObjects } from '../inside'
import type { ThreeEvent } from '@react-three/fiber'
import { ArcWall } from '../world/ArcWall'
import type { Theme } from '../themes'

const R = 24
const SPAN = 76
const COLS = 4
const ROWS = 2
const W = 6.7
const MAX_H = 3.75
const PITCH = 7.6
const ROW = 4.3
const Y0 = 2.45
// fora do painel a tela fica do tamanho de um monitor grande
const FREE_W = 3.2
const CARRY_DIST = 2.6

// transmissão ao vivo de uma janela via desktopCapturer
function useWindowStream(id: string, on: boolean, hi: boolean) {
  const [state, setState] = useState<{ tex: THREE.VideoTexture; aspect: number } | null>(null)
  useEffect(() => {
    if (!on || !pc.native) return
    let stream: MediaStream | null = null
    let video: HTMLVideoElement | null = null
    let t: THREE.VideoTexture | null = null
    let alive = true
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: id, maxWidth: hi ? 2560 : 1280, maxHeight: hi ? 1600 : 800, maxFrameRate: hi ? 60 : 24 } },
      } as unknown as MediaStreamConstraints)
      .then((s) => {
        if (!alive) return s.getTracks().forEach((tr) => tr.stop())
        stream = s
        video = document.createElement('video')
        video.muted = true
        video.srcObject = s
        video.onloadedmetadata = () => {
          if (!alive || !video) return
          t = new THREE.VideoTexture(video)
          t.colorSpace = THREE.SRGBColorSpace
          // texto nítido de perto: sem mipmap borrando
          t.generateMipmaps = false
          t.minFilter = THREE.LinearFilter
          setState({ tex: t, aspect: video.videoWidth / Math.max(video.videoHeight, 1) })
        }
        video.play().catch(() => {})
      })
      .catch(() => {})
    return () => {
      alive = false
      stream?.getTracks().forEach((tr) => tr.stop())
      if (video) video.srcObject = null
      t?.dispose()
      setState(null)
    }
  }, [id, on, hi])
  return state
}

// segurar o clique numa tela: depois de um instante (ou arrastando) ela vem junto
const hold = { id: null as string | null, timer: 0 }
function startHold(id: string) {
  clearTimeout(hold.timer)
  hold.id = id
  hold.timer = window.setTimeout(() => {
    if (hold.id !== id) return
    drag.moved = true
    useUI.getState().carry(id, true)
  }, 260)
}
function endHold() {
  clearTimeout(hold.timer)
  hold.id = null
}
window.addEventListener('pointerup', endHold)
// começou a arrastar a câmera em cima de uma tela: pega ela na hora
window.addEventListener('pointermove', (e) => {
  if (hold.id && e.buttons && drag.moved && !useUI.getState().carrying) {
    const id = hold.id
    endHold()
    useUI.getState().carry(id, true)
  }
})

const tmp = new THREE.Vector3()
const fwd = new THREE.Vector3()
const pPos = new THREE.Vector3()
const pQuat = new THREE.Quaternion()
const pScale = new THREE.Vector3()
const wantPos = new THREE.Vector3()

function angleLerp(a: number, b: number, k: number) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a))
  return a + d * k
}

const Screen = memo(function Screen({ win, i, theme }: { win: WinEntry; i: number; theme: Theme }) {
  // a primeira janela fica no meio, na altura dos olhos
  const slot = (i < COLS ? COLS : 0) + [1, 2, 0, 3][i % COLS]
  const col = slot % COLS
  const row = Math.floor(slot / COLS)
  const home = { ...arcPoint(R, metersToDeg((col - (COLS - 1) / 2) * PITCH, R), 0.35), y: Y0 + (ROWS - 1 - row) * ROW }
  const pose = useUI((s) => s.poses[win.id] as ScreenPose | undefined)
  const focused = useUI((s) => s.focus?.winId === win.id)
  const using = useUI((s) => s.focus?.winId === win.id && s.focus.phase === 'on')
  const [inView, setInView] = useState(false)
  const lastSeen = useRef(0)
  const live = useWindowStream(win.id, (inView || focused) && !win.minimized, false)
  const card = useMemo(() => canvasTexture(512, 288), [])
  const title = useMemo(() => label(win.name, { color: theme.card.sub, w: 1024, h: 72, size: 30, weight: 400 }), [win.name, theme])
  const id = `win:${win.id}`
  const hovered = useHovered(id)
  const group = useRef<THREE.Group>(null!)
  const placed = useRef(false)

  const aspect = live?.aspect ?? 16 / 9
  const h = Math.min(MAX_H, W / aspect)
  const w = h * aspect
  const mode = pose?.mode ?? 'home'
  const freeScale = FREE_W / w

  // posição: no painel, nas mãos (na frente da câmera) ou largada no salão
  const clock = useRef(0)
  useFrame(({ camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const g = group.current
    let ry = home.rotY
    let sc = 1
    if (mode === 'carried') {
      camera.getWorldDirection(fwd)
      const flat = Math.hypot(fwd.x, fwd.z) || 1
      const fx = fwd.x / flat
      const fz = fwd.z / flat
      if (useUI.getState().view === 'first') wantPos.set(player.pos.x + fx * CARRY_DIST, 1.55 + fwd.y * CARRY_DIST, player.pos.z + fz * CARRY_DIST)
      // em 3ª pessoa vai um pouco à direita e mais alta, pra não ficar atrás do avatar
      else wantPos.set(player.pos.x + fx * 2.8 - fz * 1.5, 2.05, player.pos.z + fz * 2.8 + fx * 1.5)
      wantPos.y = THREE.MathUtils.clamp(wantPos.y, 1.0, 3.4)
      const r = Math.hypot(wantPos.x, wantPos.z)
      if (r > HALL.walk + 2) wantPos.multiplyScalar((HALL.walk + 2) / r).setY(THREE.MathUtils.clamp(wantPos.y, 1.0, 3.4))
      ry = Math.atan2(camera.position.x - wantPos.x, camera.position.z - wantPos.z)
      sc = freeScale
      carriedPose.x = wantPos.x
      carriedPose.y = wantPos.y
      carriedPose.z = wantPos.z
      carriedPose.rotY = ry
    } else if (mode === 'free' && pose) {
      wantPos.set(pose.x, pose.y, pose.z)
      ry = pose.rotY
      sc = freeScale
    } else wantPos.set(home.x, home.y, home.z)

    // solta/carregada vem em coordenadas do mundo: converte pro espaço do arco (que também é um objeto móvel)
    if (mode !== 'home' && g.parent) {
      g.parent.updateWorldMatrix(true, false)
      g.parent.matrixWorld.decompose(pPos, pQuat, pScale)
      g.parent.worldToLocal(wantPos)
      ry -= new THREE.Euler().setFromQuaternion(pQuat, 'YXZ').y
      sc /= pScale.x || 1
    }

    if (!placed.current) {
      g.position.copy(wantPos)
      g.rotation.y = ry
      g.scale.setScalar(sc)
      placed.current = true
    } else {
      const k = 1 - Math.exp(-dt * (mode === 'carried' ? 16 : 7))
      g.position.lerp(wantPos, k)
      g.rotation.y = angleLerp(g.rotation.y, ry, k)
      g.scale.setScalar(THREE.MathUtils.lerp(g.scale.x, sc, k))
    }

    // só transmite o que dá pra ver (com uma folga pra não piscar)
    clock.current -= dt
    if (clock.current > 0) return
    clock.current = 0.4
    g.getWorldPosition(tmp).sub(camera.position)
    const d = tmp.length()
    const visible = mode === 'carried' || (d < 60 && fwd.copy(camera.getWorldDirection(fwd)).dot(tmp.normalize()) > 0.25)
    const now = performance.now()
    if (visible) lastSeen.current = now
    const want = visible || now - lastSeen.current < 4000
    if (want !== inView) setInView(want)
  })

  useEffect(() => {
    let alive = true
    const sub = win.minimized ? 'minimizada · E pra usar aqui' : undefined
    drawCard(card, win.name, theme, { tag: '▶', sub })
    if (win.icon) loadImage(win.icon).then((img) => alive && drawCard(card, win.name, theme, { icon: img, sub }))
    return () => {
      alive = false
    }
  }, [win, card, theme])
  useEffect(() => () => card.dispose(), [card])
  useEffect(() => {
    screenObjects.set(win.id, { group: group.current, w, h })
    return () => void screenObjects.delete(win.id)
  }, [win.id, w, h])

  // a janela fechou: não pode ficar "nas mãos"
  useEffect(
    () => () => {
      if (useUI.getState().carrying?.id === win.id) useUI.getState().sendHome(win.id)
    },
    [win.id],
  )

  const ui = useUI.getState
  const handlers = useHoverable({
    id,
    title: win.name,
    verb: win.minimized ? 'Usar aqui (ela volta em segundo plano)' : 'Usar aqui dentro',
    run: () => enterWindow(win.id),
    grab: mode === 'carried' ? { verb: 'Soltar aqui', run: dropCarried } : { verb: 'Pegar e levar', run: () => ui().carry(win.id, false) },
    alt:
      mode === 'home'
        ? { verb: 'Trazer pra frente, fora do mundo', run: () => pc.focus(win.id) }
        : {
            verb: 'Devolver ao painel',
            run: () => {
              ui().sendHome(win.id)
              ui().say(`${win.name} voltou pro painel`)
            },
          },
  })

  return (
    <group ref={group}>
      <mesh position-z={-0.04} castShadow={mode !== 'home'}>
        <planeGeometry args={[w + 0.12, h + 0.12]} />
        <meshBasicMaterial color={hovered || focused || mode === 'carried' ? theme.accent : '#000000'} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh {...(using ? {} : { ...handlers, onPointerDown: (e: ThreeEvent<PointerEvent>) => (e.stopPropagation(), startHold(win.id)) })} position-z={0.01}>
        <planeGeometry args={[w, h]} />
        {live ? <meshBasicMaterial map={live.tex} toneMapped={false} /> : <meshBasicMaterial map={card} toneMapped={false} />}
      </mesh>
      <mesh position={[0, -h / 2 - 0.28, 0]}>
        <planeGeometry args={[w, w * (72 / 1024)]} />
        <meshBasicMaterial map={title} transparent depthWrite={false} />
      </mesh>
    </group>
  )
})

export function ScreenArc({ item }: { item: Item }) {
  void item
  const windows = useUI((s) => s.windows)
  const theme = useUI((s) => s.theme)
  const shown = useMemo(() => windows.slice(0, COLS * ROWS), [windows])
  const height = Y0 + ROW + MAX_H / 2 + 0.5
  return (
    <group>
      <ArcWall r={R} span={SPAN} title="Telas" theme={theme} height={height} sub={shown.length ? `${windows.length} janelas abertas, ao vivo` : 'nenhuma janela aberta'} />
      {shown.map((w, i) => (
        <Screen key={w.id} win={w} i={i} theme={theme} />
      ))}
    </group>
  )
}
