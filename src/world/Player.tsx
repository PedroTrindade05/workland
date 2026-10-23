import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { currentTarget, nearby, player, useUI, wardrobe } from '../store'
import { HALL } from '../layout'
import { currentRoom, useRooms } from '../rooms'
import { gamepadStep } from '../input/gamepad'
import { drag } from '../interact'
import { dropCarried, leaveWindow, screenObjects } from '../inside'
import { groundAt, stageScreen } from '../objects/stage'
import { Avatar, type AvatarRig } from './Avatar'

const SECTION_NAMES: Record<string, string> = { 'shortcut-wall': 'Atalhos', 'screen-wall': 'Telas', 'system-panel': 'Sistema' }

const WALK = 4.2
const RUN = 8.5
const JUMP = 5.2
const GRAVITY = 16
const EYE = 1.68
// largura do painel do provador (css .wardrobe), pra câmera deixar o boneco do lado livre
const WARDROBE_PX = 440

const tmp = new THREE.Vector3()
const look = new THREE.Vector3()
const sPos = new THREE.Vector3()
const sQuat = new THREE.Quaternion()
const sScale = new THREE.Vector3()
const sNormal = new THREE.Vector3()
const sRight = new THREE.Vector3()
const sCorner = new THREE.Vector3()

// provador: quanto a câmera anda pro lado pra o boneco ficar no espaço livre ao lado do painel
function dressPan(camera: THREE.PerspectiveCamera, el: HTMLElement, D: number) {
  const perPx = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * D) / Math.max(1, el.clientHeight)
  return ((Math.min(WARDROBE_PX, el.clientWidth * 0.45) + 16) / 2) * perPx
}

const ray = new THREE.Raycaster()
const rayFrom = new THREE.Vector3()
const rayDir = new THREE.Vector3()
const rayBall = new THREE.Sphere()

// provador: procura um lado em que nada (tela, parede, vaso) fique entre a câmera e o boneco
function clearSide(scene: THREE.Scene, camera: THREE.Camera, avatar: THREE.Object3D, p: THREE.Vector3, start: number, D: number, pan: number) {
  // só o que está visível e perto entra na conta. Céu, piso e anéis do salão envolvem o boneco e testariam
  // todos os triângulos em cada raio (o céu sozinho leva ~60 ms): ficam de fora, a câmera já não sai do salão
  const near: THREE.Object3D[] = []
  const reach = Math.hypot(D, pan) + 0.6
  const collect = (o: THREE.Object3D) => {
    if (!o.visible || o === avatar) return
    const m = o as THREE.Mesh
    if (m.isMesh) {
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere()
      rayBall.copy(m.geometry.boundingSphere!).applyMatrix4(m.matrixWorld)
      if ((m as THREE.InstancedMesh).isInstancedMesh || (rayBall.radius < 15 && Math.hypot(rayBall.center.x - p.x, rayBall.center.z - p.z) - rayBall.radius < reach)) near.push(m)
    }
    for (const c of o.children) collect(c)
  }
  collect(scene)
  ray.camera = camera
  let best = start
  let bestFree = -1
  for (let i = 0; i < 16; i++) {
    const yaw = start + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 8)
    const ax = Math.sin(yaw)
    const az = Math.cos(yaw)
    const cx = p.x + ax * D + az * pan
    const cz = p.z + az * D - ax * pan
    if (Math.hypot(cx, cz) > HALL.floor - 0.8) continue
    const dist = Math.hypot(cx - p.x, cz - p.z)
    // corredor da largura do boneco: raios dos ombros, do peito e das pernas até a câmera
    const sx = -(cz - p.z) / dist
    const sz = (cx - p.x) / dist
    let free = Infinity
    for (const h of [0.45, 1.05, 1.6])
      for (const o of [-0.32, 0, 0.32]) {
        rayFrom.set(p.x + sx * o, h, p.z + sz * o)
        rayDir.set(cx, 1.15, cz).sub(rayFrom)
        const len = rayDir.length()
        ray.set(rayFrom, rayDir.normalize())
        ray.far = len
        const hit = ray.intersectObjects(near, false)[0]
        if (hit) free = Math.min(free, (hit.distance / len) * dist)
      }
    if (free === Infinity) return { yaw, zoom: D }
    if (free > bestFree) (bestFree = free), (best = yaw)
  }
  // nenhum lado livre: fica no mais aberto e chega mais perto
  return { yaw: best, zoom: THREE.MathUtils.clamp(bestFree - 0.4, 1.5, D) }
}

function typingNow() {
  const el = document.activeElement
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'WEBVIEW' || el.tagName === 'IFRAME')
}

export function Player() {
  const { camera, gl, events, scene } = useThree()
  const theme = useUI((s) => s.theme)
  const view = useUI((s) => s.view)
  // provador aberto: o boneco aparece de frente, mesmo em 1ª pessoa
  const dressing = useUI((s) => s.panel === 'avatar')
  const root = useRef<THREE.Group>(null!)
  const rig = useRef<AvatarRig>(null!)
  const keys = useRef(new Set<string>())
  const st = useRef({ dist: 4.6, vy: 0, grounded: true, vx: 0, vz: 0, scan: 0 })
  const cam = useRef({ pos: new THREE.Vector3(0, 3, 12), look: new THREE.Vector3(0, 1.5, 0), target: new THREE.Vector3(0, 1.5, 6) })

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (typingNow() || useUI.getState().cmdOpen || useUI.getState().themeOpen) return
      const k = e.key.toLowerCase()
      const ui = useUI.getState()
      if (k === 'escape' && ui.focus) return leaveWindow()
      if (ui.focus || ui.panel === 'avatar') return
      // assistindo o telão: andar sai do modo assistir
      if (ui.watching && ['w', 'a', 's', 'd', 'arrowup', 'arrowdown'].includes(k)) ui.setWatching(false)
      keys.current.add(k)
      if (k === ' ') e.preventDefault()
      if (e.repeat) return
      // no modo construção as teclas são da barra de construção
      if (useRooms.getState().build) return
      if (k === 'e') currentTarget()?.run()
      if (k === 'f') currentTarget()?.alt?.run()
      // G: carregando alguma tela, solta onde está; senão pega a da mira
      if (k === 'g') {
        if (ui.carrying) dropCarried()
        else currentTarget()?.grab?.run()
      }
      if (k === 'v') ui.toggleView()
    }
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase())
    const blur = () => keys.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)

    // arrastar gira a câmera; em 1ª pessoa, clicar no vazio prende o mouse
    const el = gl.domElement
    let downAt: { x: number; y: number } | null = null
    const pd = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY }
      drag.moved = false
      ;(document.activeElement as HTMLElement | null)?.blur?.()
    }
    const pm = (e: PointerEvent) => {
      const ui = useUI.getState()
      if (ui.focus) return
      const locked = document.pointerLockElement === el
      if (!locked) {
        if (!downAt || !e.buttons) return
        if (!drag.moved && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) {
          drag.moved = true
          el.setPointerCapture(e.pointerId)
        }
        if (!drag.moved) return
      }
      // arrastando um objeto no modo construção: a câmera fica parada
      if (drag.building) return
      // no provador arrastar gira o boneco
      if (ui.panel === 'avatar') {
        wardrobe.spin += e.movementX * 0.012
        return
      }
      const first = ui.view === 'first'
      player.camYaw -= e.movementX * (first ? 0.0024 : 0.005)
      player.pitch = THREE.MathUtils.clamp(player.pitch + e.movementY * (first ? 0.0022 : 0.0035), first ? -1.4 : -0.25, first ? 1.4 : 1.25)
    }
    const pu = (e: PointerEvent) => {
      const wasDrag = drag.moved
      downAt = null
      // segurou o clique numa tela pra carregar: soltar o botão solta a tela
      if (useUI.getState().carrying?.byMouse) dropCarried()
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      const ui = useUI.getState()
      // 1ª pessoa no modo jogo: clicar no vazio prende o mouse pra mirar
      if (!wasDrag && ui.view === 'first' && ui.settings.controls === 'jogo' && !ui.hover && !ui.focus && !ui.panel && !useRooms.getState().build && document.pointerLockElement !== el) el.requestPointerLock()
    }
    const wheel = (e: WheelEvent) => {
      if (useUI.getState().panel === 'avatar') {
        wardrobe.zoom = THREE.MathUtils.clamp(wardrobe.zoom * (1 + e.deltaY * 0.001), 1.5, 4.5)
        return
      }
      if (useUI.getState().view === 'third' && !useUI.getState().focus) st.current.dist = THREE.MathUtils.clamp(st.current.dist * (1 + e.deltaY * 0.001), 1.8, 16)
    }
    const lockChange = () => useUI.getState().setLocked(document.pointerLockElement === el)
    const ctx = (e: Event) => e.preventDefault()
    el.addEventListener('pointerdown', pd)
    el.addEventListener('pointermove', pm)
    el.addEventListener('pointerup', pu)
    el.addEventListener('wheel', wheel, { passive: true })
    el.addEventListener('contextmenu', ctx)
    document.addEventListener('pointerlockchange', lockChange)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      el.removeEventListener('pointerdown', pd)
      el.removeEventListener('pointermove', pm)
      el.removeEventListener('pointerup', pu)
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('contextmenu', ctx)
      document.removeEventListener('pointerlockchange', lockChange)
    }
  }, [gl])

  // saiu da 1ª pessoa: solta o mouse e ajeita o ângulo
  useEffect(() => {
    if (view === 'third') {
      if (document.pointerLockElement) document.exitPointerLock()
      player.pitch = THREE.MathUtils.clamp(player.pitch, -0.25, 1.25)
    }
  }, [view])

  // abriu o provador: o boneco vira pra câmera e para de andar
  useEffect(() => {
    if (!dressing) return
    if (document.pointerLockElement) document.exitPointerLock()
    keys.current.clear()
    player.walkTo = null
    // tela carregada fica onde está, senão ela segue a câmera e tampa o boneco
    if (useUI.getState().carrying) dropCarried()
    // o boneco vira pro lado em que a câmera já está (em 1ª pessoa, pra frente de quem olha), desde que não tenha nada no caminho
    const D = 2.9
    const start = useUI.getState().view === 'first' ? player.camYaw + Math.PI : player.camYaw
    const side = clearSide(scene, camera, root.current, player.pos, start, D, dressPan(camera as THREE.PerspectiveCamera, gl.domElement, D))
    player.yaw = side.yaw
    wardrobe.zoom = side.zoom
    wardrobe.spin = 0
    useUI.getState().setHover(null)
    useUI.getState().setWatching(false)
  }, [dressing])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = st.current
    const p = player.pos
    const k = keys.current
    const ui = useUI.getState()
    const focus = ui.focus
    // usando um app, no provador ou assistindo o telão o boneco não anda
    const watch = ui.watching && !focus ? stageScreen.group : null
    const frozen = !!focus || dressing || !!watch

    if (player.pendingTeleport) {
      const t = player.pendingTeleport
      p.set(t.x, 0, t.z)
      s.vy = s.vx = s.vz = 0
      if (t.yaw !== undefined) {
        player.yaw = t.yaw
        player.camYaw = t.yaw + Math.PI
      }
      player.pendingTeleport = null
    }

    // ---------- movimento ----------
    if (!frozen) {
      if (k.has('arrowleft')) player.camYaw += dt * 2
      if (k.has('arrowright')) player.camYaw -= dt * 2
    }
    const fx = -Math.sin(player.camYaw)
    const fz = -Math.cos(player.camYaw)
    let ix = 0
    let iz = 0
    if (!frozen) {
      if (k.has('w') || k.has('arrowup')) (ix += fx), (iz += fz)
      if (k.has('s') || k.has('arrowdown')) (ix -= fx), (iz -= fz)
      if (k.has('d')) (ix += -fz), (iz += fx)
      if (k.has('a')) (ix -= -fz), (iz -= fx)
    }
    // controle de videogame
    const pad = gamepadStep(dt, fx, fz)
    if (!frozen) {
      ix += pad.ix
      iz += pad.iz
    }
    // modo simples: clicou no chão, anda até lá (qualquer tecla de andar cancela)
    if (ix || iz) player.walkTo = null
    else if (player.walkTo && !frozen) {
      const dx = player.walkTo.x - p.x
      const dz = player.walkTo.z - p.z
      const dd = Math.hypot(dx, dz)
      if (dd < 0.3) player.walkTo = null
      else (ix = dx / dd), (iz = dz / dd)
    }
    const len = Math.hypot(ix, iz)
    const speed = k.has('shift') || pad.run ? RUN : WALK
    const accel = 1 - Math.exp(-dt * (s.grounded ? 12 : 4))
    s.vx += ((len ? (ix / len) * speed : 0) - s.vx) * accel
    s.vz += ((len ? (iz / len) * speed : 0) - s.vz) * accel
    p.x += s.vx * dt
    p.z += s.vz * dt
    // o salão é redondo
    const r = Math.hypot(p.x, p.z)
    if (r > HALL.walk) {
      p.x *= HALL.walk / r
      p.z *= HALL.walk / r
    }
    if (s.grounded && k.has(' ') && !frozen) {
      s.vy = JUMP
      s.grounded = false
    }
    // provador: cada peça nova ganha um pulinho
    if (wardrobe.hop) {
      wardrobe.hop = false
      if (s.grounded) (s.vy = 2.6), (s.grounded = false)
    }
    // chão pode ser o palco: andando, sobe o degrau sozinho; saindo pela borda, cai
    const floorY = groundAt(p.x, p.z)
    if (s.grounded && p.y < floorY && floorY - p.y <= 0.6) p.y = floorY
    s.vy -= GRAVITY * dt
    p.y += s.vy * dt
    if (p.y <= floorY) {
      p.y = floorY
      s.vy = 0
      s.grounded = true
    } else if (p.y > floorY + 0.02) s.grounded = false
    player.grounded = s.grounded

    const hs = Math.hypot(s.vx, s.vz)
    player.speed = hs
    if (hs > 0.3) {
      let d = Math.atan2(s.vx, s.vz) - player.yaw
      d = Math.atan2(Math.sin(d), Math.cos(d))
      player.yaw += d * (1 - Math.exp(-dt * 12))
    }
    // em 1ª pessoa o corpo acompanha a câmera (no provador ele fica virado pra você)
    if (view === 'first' && !dressing) player.yaw = player.camYaw + Math.PI
    // fechou o provador: o giro volta devagar
    if (!dressing && wardrobe.spin) wardrobe.spin = Math.abs(wardrobe.spin) < 0.01 ? 0 : wardrobe.spin * Math.exp(-dt * 8)
    root.current.position.copy(p)
    root.current.rotation.y = player.yaw + wardrobe.spin
    rig.current?.animate(dt, hs, s.grounded)

    // ---------- câmera ----------
    const c = cam.current
    let wantPos: THREE.Vector3
    let wantLook: THREE.Vector3
    let rate = 18
    // usando um app: a câmera para de frente pro telão, enquadrando ele inteiro
    const so = focus && focus.phase !== 'out' ? screenObjects.get(focus.winId) : watch ? { group: watch, w: stageScreen.w, h: stageScreen.h } : undefined
    if (so) {
      so.group.updateWorldMatrix(true, false)
      so.group.matrixWorld.decompose(sPos, sQuat, sScale)
      sNormal.set(0, 0, 1).applyQuaternion(sQuat)
      const cam_ = camera as THREE.PerspectiveCamera
      const tan = Math.tan(THREE.MathUtils.degToRad(cam_.fov / 2)) * 2
      const d = Math.max((so.h * sScale.y) / (0.86 * tan), (so.w * sScale.x) / (0.92 * tan * cam_.aspect))
      wantPos = tmp.copy(sPos).addScaledVector(sNormal, d)
      wantLook = look.copy(sPos)
      rate = 5
    } else if (dressing) {
      // provador: câmera de frente pro boneco, deslocada pra ele aparecer ao lado do painel
      const ax = Math.sin(player.yaw)
      const az = Math.cos(player.yaw)
      const D = wardrobe.zoom
      const pan = dressPan(camera as THREE.PerspectiveCamera, gl.domElement, D)
      wantLook = look.set(p.x + az * pan, 0.95 + (D - 2.9) * 0.08, p.z - ax * pan)
      wantPos = tmp.set(wantLook.x + ax * D, 1.15 + (D - 2.9) * 0.12, wantLook.z + az * D)
      rate = 6
    } else if (view === 'first') {
      wantPos = tmp.set(p.x, p.y + EYE, p.z)
      const cp = Math.cos(player.pitch)
      wantLook = look.set(wantPos.x + fx * cp, wantPos.y - Math.sin(player.pitch), wantPos.z + fz * cp)
      rate = 40
    } else {
      c.target.lerp(look.set(p.x, p.y + 1.55, p.z), 1 - Math.exp(-dt * 16))
      const cp = Math.cos(player.pitch)
      const dx = Math.sin(player.camYaw) * cp
      const dz = Math.cos(player.camYaw) * cp
      // não deixa a câmera sair do piso do salão
      const R = HALL.floor - 1
      const a = dx * dx + dz * dz
      const b = 2 * (c.target.x * dx + c.target.z * dz)
      const cc = c.target.x ** 2 + c.target.z ** 2 - R * R
      const dist = a > 1e-4 ? Math.min(s.dist, (-b + Math.sqrt(Math.max(0, b * b - 4 * a * cc))) / (2 * a)) : s.dist
      const ceiling = (ui.theme.real?.ceiling ?? Infinity) - 0.6
      wantPos = tmp.set(c.target.x + dx * dist, THREE.MathUtils.clamp(c.target.y + Math.sin(player.pitch) * dist, 0.25, ceiling), c.target.z + dz * dist)
      wantLook = c.target
      rate = 30
    }
    const kk = 1 - Math.exp(-dt * rate)
    c.pos.lerp(wantPos, kk)
    c.look.lerp(wantLook, kk)
    if (focus?.phase === 'on' && so) {
      c.pos.copy(wantPos)
      c.look.copy(wantLook)
    }
    camera.position.copy(c.pos)
    camera.lookAt(c.look)
    if (focus?.phase === 'in' && (!so || (c.pos.distanceTo(wantPos) < 0.02 && c.look.distanceTo(wantLook) < 0.02))) ui.setFocus({ ...focus, phase: so ? 'on' : 'out' })
    if (focus?.phase === 'out' && c.pos.distanceTo(wantPos) < 0.08) ui.setFocus(null)
    // parado de frente pro telão: mede onde ele aparece na tela pra imagem nítida ir por cima
    if (focus?.phase === 'on' && so) {
      camera.updateMatrixWorld()
      sRight.set(1, 0, 0).applyQuaternion(sQuat)
      const r = gl.domElement.getBoundingClientRect()
      let x0 = Infinity
      let y0 = Infinity
      let x1 = -Infinity
      let y1 = -Infinity
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        sCorner.copy(sPos).addScaledVector(sRight, (sx * so.w * sScale.x) / 2)
        sCorner.y += (sy * so.h * sScale.y) / 2
        sCorner.project(camera)
        const px = r.left + ((sCorner.x + 1) / 2) * r.width
        const py = r.top + ((1 - sCorner.y) / 2) * r.height
        x0 = Math.min(x0, px)
        x1 = Math.max(x1, px)
        y0 = Math.min(y0, py)
        y1 = Math.max(y1, py)
      }
      const rect = { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) }
      const old = focus.rect
      if (!old || old.x !== rect.x || old.y !== rect.y || old.w !== rect.w || old.h !== rect.h) ui.setFocus({ ...focus, rect })
    }

    // ---------- mira e proximidade ----------
    s.scan -= dt
    if (s.scan <= 0) {
      s.scan = 0.1
      if (!frozen && !drag.moved) events.update?.()
      let best = null
      let bestD = Infinity
      for (const it of nearby.values()) {
        const d = Math.hypot(it.x - p.x, it.z - p.z)
        if (d < it.r && d < bestD) (best = it), (bestD = d)
      }
      if (ui.near?.id !== best?.id) ui.setNear(best)
      // a seção é a parede pra onde a câmera está olhando (as paredes podem estar em qualquer lugar)
      const room = currentRoom()
      camera.getWorldDirection(tmp)
      const fl = Math.hypot(tmp.x, tmp.z) || 1
      let name = room?.name ?? 'Workland'
      let best_ = 0.55
      for (const it of room?.items ?? []) {
        const label = SECTION_NAMES[it.kind]
        if (!label) continue
        const vx = it.x - p.x
        const vz = it.z - p.z
        const d = Math.hypot(vx, vz) || 1
        if (d > 45) continue
        const score = (vx * tmp.x + vz * tmp.z) / (d * fl)
        if (score > best_) (best_ = score), (name = label)
      }
      if (ui.section !== name) ui.setSection(name)
    }
    void state
  })

  return (
    <>
      <WalkMarker />
      <group ref={root}>
        <Avatar ref={rig} theme={theme} visible={view === 'third' || dressing} />
      </group>
    </>
  )
}

// anelzinho onde você clicou pra andar
function WalkMarker() {
  const theme = useUI((s) => s.theme)
  const ref = useRef<THREE.Mesh>(null!)
  useFrame(({ clock }) => {
    const w = player.walkTo
    ref.current.visible = !!w
    if (!w) return
    ref.current.position.set(w.x, 0.03, w.z)
    ref.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 6) * 0.08)
  })
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} visible={false}>
      <ringGeometry args={[0.32, 0.4, 48]} />
      <meshBasicMaterial color={theme.accent} toneMapped={false} transparent opacity={0.9} />
    </mesh>
  )
}
