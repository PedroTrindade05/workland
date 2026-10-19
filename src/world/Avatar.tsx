import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Theme } from '../themes'
import { useUI } from '../store'
import { resolveLook } from '../avatar/look'
import { ARM_C, ARM_L, AvatarCtx, LEG_L, TORSO_Y, makeMats, measure, type Anim, type Hook } from './avatarKit'
import { Extra, Face, HeadItem, Hips, Pants, Shoes, Sleeve, Top } from './AvatarParts'

export type AvatarRig = { animate: (dt: number, speed: number, grounded: boolean) => void }

// manequim liso de acabamento acetinado; roupa e acessórios vêm do provador
// (raw = visual de outra pessoa num encontro; sem ele, o seu)
export const Avatar = forwardRef<AvatarRig, { theme: Theme; visible: boolean; raw?: unknown }>(function Avatar({ theme, visible, raw }, ref) {
  const armL = useRef<THREE.Group>(null!)
  const armR = useRef<THREE.Group>(null!)
  const legL = useRef<THREE.Group>(null!)
  const legR = useRef<THREE.Group>(null!)
  const torso = useRef<THREE.Group>(null!)
  const head = useRef<THREE.Group>(null!)
  const jelly = useRef<THREE.Group>(null!)
  const anim = useRef<Anim>({ t: 0, phase: 0, speed: 0, grounded: true, air: 0, blink: 1, jelly: 0 })
  const st = useRef({ jv: 0, nod: 0, nodV: 0, lastSpeed: 0, nextBlink: 3 })
  const hooks = useRef(new Set<Hook>())
  const onFrame = useCallback((fn: Hook) => {
    hooks.current.add(fn)
    return () => void hooks.current.delete(fn)
  }, [])

  const own = useUI((s) => s.settings.avatar)
  const look = useMemo(() => resolveLook(raw === undefined ? own : raw, theme), [raw, own, theme])
  const d = useMemo(() => measure(look.shape), [look.shape])
  const m = useMemo(() => makeMats(look), [look.skin, look.main, look.pants, look.second, look.eyes, look.pattern])
  useEffect(() => () => Object.values(m).forEach((x) => x.dispose()), [m])
  const ctx = useMemo(() => ({ look, d, m, onFrame }), [look, d, m, onFrame])
  // de túnica o passo é mais curto, senão a perna atravessa o pano
  const stride = look.top === 'tunica' ? 0.5 : 1
  const strideRef = useRef(stride)
  strideRef.current = stride

  useImperativeHandle(ref, () => ({
    animate(dt, speed, grounded) {
      const a = anim.current
      const s = st.current
      a.t += dt
      a.phase += dt * speed * 1.9
      const amt = Math.min(1, speed / 4) * 0.75
      const sw = Math.sin(a.phase) * amt
      const k = 1 - Math.exp(-dt * 12)
      const air = grounded ? 0 : 1
      const legK = strideRef.current
      armL.current.rotation.x += ((air ? -0.5 : sw) - armL.current.rotation.x) * k
      armR.current.rotation.x += ((air ? -0.5 : -sw) - armR.current.rotation.x) * k
      legL.current.rotation.x += ((air ? 0.35 * legK : -sw * legK) - legL.current.rotation.x) * k
      legR.current.rotation.x += ((air ? -0.2 * legK : sw * legK) - legR.current.rotation.x) * k
      // respiração parado, quique andando
      torso.current.position.y = 0.98 + Math.abs(Math.cos(a.phase)) * amt * 0.04 + Math.sin(a.t * 2.1) * 0.004 * (1 - amt)

      // pousou: o corpo amassa e volta balançando, tipo gelatina
      if (grounded && !a.grounded) s.jv -= Math.min(1.8, 0.4 + a.air * 1.6)
      a.air = grounded ? 0 : a.air + dt
      a.grounded = grounded
      a.speed = speed
      s.jv += (-140 * (a.jelly - (grounded ? 0 : 0.05)) - 9 * s.jv) * dt
      a.jelly = THREE.MathUtils.clamp(a.jelly + s.jv * dt, -0.22, 0.2)
      jelly.current.scale.set(1 - a.jelly * 0.5, 1 + a.jelly, 1 - a.jelly * 0.5)

      // a cabeça atrasa um pouco quando arranca ou freia
      const acc = (speed - s.lastSpeed) / Math.max(dt, 1e-3)
      s.lastSpeed = speed
      s.nodV += (-90 * (s.nod - THREE.MathUtils.clamp(-acc * 0.012, -0.22, 0.22)) - 10 * s.nodV) * dt
      s.nod += s.nodV * dt
      head.current.rotation.x = s.nod

      // piscar de vez em quando
      s.nextBlink -= dt
      if (s.nextBlink < 0) s.nextBlink = 2.5 + Math.random() * 3.5
      a.blink = s.nextBlink < 0.12 ? 0.12 : 1

      for (const fn of hooks.current) fn(a, dt)
    },
  }))

  return (
    <AvatarCtx.Provider value={ctx}>
      <group visible={visible} userData={{ avatar: true }}>
        <group ref={jelly}>
          {([-1, 1] as const).map((side) => (
            <group key={side} ref={side < 0 ? legL : legR} position={[side * d.hipX, 0.92, 0]}>
              <mesh position-y={-d.legC} material={m.skin} castShadow>
                <capsuleGeometry args={[d.legR, LEG_L, 6, 12]} />
              </mesh>
              <Pants />
              <Shoes />
            </group>
          ))}
          <group ref={torso} position-y={0.98}>
            <mesh position-y={TORSO_Y} material={m.skin} castShadow>
              <capsuleGeometry args={[d.torsoR, d.torsoL, 8, 16]} />
            </mesh>
            {look.top === 'nada' && look.legs === 'nada' && (
              <mesh position-y={d.domeLow - 0.04} material={m.trim}>
                <torusGeometry args={[Math.sqrt(d.torsoR ** 2 - 0.0016), 0.012, 8, 32]} />
              </mesh>
            )}
            <Hips />
            <Top />
            <Extra />
            {([-1, 1] as const).map((side) => (
              <group key={side} ref={side < 0 ? armL : armR} position={[side * d.shoulderX, d.armY, 0]}>
                <mesh position-y={ARM_C} material={m.skin} castShadow>
                  <capsuleGeometry args={[d.armR, ARM_L, 6, 12]} />
                </mesh>
                <Sleeve />
              </group>
            ))}
            <group ref={head} position-y={d.headY} scale={d.head}>
              <mesh material={m.skin} castShadow>
                <sphereGeometry args={[0.13, 24, 16]} />
              </mesh>
              <Face />
              <HeadItem />
            </group>
          </group>
        </group>
      </group>
    </AvatarCtx.Provider>
  )
})
