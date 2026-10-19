import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBox } from '@react-three/drei'
import { FLOOR, SH, TORSO_Y, neckR, useAvatar, useAvatarFrame } from './avatarKit'

// cápsula que vai de "top" até "bottom" (em y)
function Capsule({ r, top, bottom, material }: { r: number; top: number; bottom: number; material: THREE.Material }) {
  return (
    <mesh position-y={(top + bottom) / 2} material={material}>
      <capsuleGeometry args={[r, Math.max(0.001, top - bottom - 2 * r), 4, 12]} />
    </mesh>
  )
}

// metade de cima de uma esfera (cúpulas de chapéu e capacete)
const dome = (r: number) => <sphereGeometry args={[r, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />

// ---------- cabeça (coordenadas da cabeça de raio 0.13; o formato do corpo escala tudo) ----------

export function HeadItem() {
  const { look, m } = useAvatar()
  const bob = useRef<THREE.Group>(null!)
  useAvatarFrame((a) => {
    const g = bob.current
    if (!g) return
    // pompom, antena e auréola balançam com o passo e com o pulo
    g.rotation.x = Math.sin(a.phase * 2) * Math.min(1, a.speed / 4) * 0.22 - a.jelly * 1.6
    if (look.head === 'aureola') g.position.y = 0.24 + Math.sin(a.t * 2) * 0.01
  })
  switch (look.head) {
    case 'bone':
      return (
        <group position-y={0.08}>
          <mesh scale={[1, 0.6, 1]} material={m.second}>
            {dome(0.135)}
          </mesh>
          <mesh position={[0, 0, 0.13]} rotation-x={-0.15} material={m.second}>
            <boxGeometry args={[0.2, 0.012, 0.14]} />
          </mesh>
        </group>
      )
    case 'gorro':
      return (
        <group position-y={0.06}>
          <mesh material={m.second}>
            {dome(0.138)}
          </mesh>
          <mesh rotation-x={Math.PI / 2} material={m.mainPlain}>
            <torusGeometry args={[0.134, 0.024, 8, 32]} />
          </mesh>
          <group ref={bob} position-y={0.12}>
            <mesh position-y={0.03} material={m.mainPlain}>
              <sphereGeometry args={[0.042, 12, 10]} />
            </mesh>
          </group>
        </group>
      )
    case 'cartola':
      return (
        <group position-y={0.095}>
          <mesh position-y={0.115} material={SH.dark}>
            <cylinderGeometry args={[0.096, 0.1, 0.22, 24]} />
          </mesh>
          <mesh position-y={0.03} material={m.second}>
            <cylinderGeometry args={[0.102, 0.102, 0.035, 24]} />
          </mesh>
          <mesh position-y={0.006} material={SH.dark}>
            <cylinderGeometry args={[0.18, 0.18, 0.012, 32]} />
          </mesh>
        </group>
      )
    case 'fedora':
      return (
        <group position-y={0.085}>
          <mesh position-y={0.065} scale={[1, 1, 0.9]} material={m.second}>
            <cylinderGeometry args={[0.085, 0.112, 0.12, 24]} />
          </mesh>
          <mesh position-y={0.018} scale={[1, 1, 0.9]} material={m.mainPlain}>
            <cylinderGeometry args={[0.114, 0.114, 0.026, 24]} />
          </mesh>
          <mesh rotation-x={-0.06} material={m.second}>
            <cylinderGeometry args={[0.2, 0.2, 0.01, 32]} />
          </mesh>
        </group>
      )
    case 'chef':
      return (
        <group position-y={0.08}>
          <mesh position-y={0.07} material={SH.white}>
            <cylinderGeometry args={[0.1, 0.105, 0.14, 24]} />
          </mesh>
          {[
            [-0.045, 0],
            [0.045, 0],
            [0, 0.045],
            [0, -0.045],
          ].map(([x, z], i) => (
            <mesh key={i} position={[x, 0.17, z]} material={SH.white}>
              <sphereGeometry args={[0.075, 16, 12]} />
            </mesh>
          ))}
        </group>
      )
    case 'mago':
      return (
        <group position-y={0.08}>
          <mesh material={m.mainPlain}>
            <cylinderGeometry args={[0.22, 0.22, 0.012, 32]} />
          </mesh>
          <mesh position-y={0.02} material={m.second}>
            <cylinderGeometry args={[0.12, 0.125, 0.035, 24]} />
          </mesh>
          <mesh position-y={0.12} material={m.mainPlain}>
            <cylinderGeometry args={[0.065, 0.125, 0.22, 20]} />
          </mesh>
          {/* a ponta caída do chapéu */}
          <group position-y={0.225} rotation-z={-0.5}>
            <mesh position-y={0.085} material={m.mainPlain}>
              <coneGeometry args={[0.066, 0.17, 20]} />
            </mesh>
          </group>
        </group>
      )
    case 'coroa':
      return (
        <group position-y={0.1}>
          <mesh position-y={0.03} material={SH.gold}>
            <cylinderGeometry args={[0.102, 0.096, 0.06, 24, 1, true]} />
          </mesh>
          {Array.from({ length: 6 }, (_, i) => {
            const a = (i / 6) * Math.PI * 2
            return (
              <mesh key={i} position={[Math.sin(a) * 0.1, 0.08, Math.cos(a) * 0.1]} material={SH.gold}>
                <coneGeometry args={[0.022, 0.05, 8]} />
              </mesh>
            )
          })}
          {[-0.05, 0, 0.05].map((x) => (
            <mesh key={x} position={[x, 0.03, Math.sqrt(0.0104 - x * x)]} material={m.second}>
              <sphereGeometry args={[0.013, 10, 8]} />
            </mesh>
          ))}
        </group>
      )
    case 'capacete':
      return (
        <group>
          <mesh material={SH.glass} renderOrder={2}>
            <sphereGeometry args={[0.205, 32, 20]} />
          </mesh>
          <mesh position-y={-0.165} rotation-x={Math.PI / 2} material={SH.white}>
            <torusGeometry args={[0.15, 0.036, 12, 32]} />
          </mesh>
          <mesh position-y={-0.135} rotation-x={Math.PI / 2} material={m.second}>
            <torusGeometry args={[0.165, 0.01, 6, 32]} />
          </mesh>
        </group>
      )
    case 'elmo':
      return (
        <group>
          <mesh position-y={-0.01} material={SH.metal}>
            <cylinderGeometry args={[0.146, 0.14, 0.2, 24]} />
          </mesh>
          <mesh position-y={0.09} material={SH.metal}>
            {dome(0.146)}
          </mesh>
          <mesh position={[0, 0.025, 0.143]} material={SH.dark}>
            <boxGeometry args={[0.17, 0.018, 0.02]} />
          </mesh>
          <mesh position={[0, -0.03, 0.143]} material={SH.dark}>
            <boxGeometry args={[0.014, 0.07, 0.02]} />
          </mesh>
          <group position={[0, 0.22, -0.02]} rotation-x={-0.6}>
            <mesh position-y={0.07} material={m.second}>
              <capsuleGeometry args={[0.032, 0.12, 4, 8]} />
            </mesh>
          </group>
        </group>
      )
    case 'viking':
      return (
        <group position-y={0.05}>
          <mesh material={SH.metal}>
            {dome(0.142)}
          </mesh>
          <mesh rotation-x={Math.PI / 2} material={m.second}>
            <torusGeometry args={[0.14, 0.018, 8, 32]} />
          </mesh>
          <mesh position={[0, -0.035, 0.137]} material={SH.metal}>
            <boxGeometry args={[0.022, 0.08, 0.016]} />
          </mesh>
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 0.12, 0.06, 0]} rotation-z={-s * 0.95}>
              <mesh position-y={0.075} material={SH.ivory}>
                <coneGeometry args={[0.032, 0.15, 12]} />
              </mesh>
            </group>
          ))}
        </group>
      )
    case 'fones':
      return (
        <group>
          <mesh rotation-z={Math.PI / 2} material={SH.dark}>
            <torusGeometry args={[0.15, 0.018, 8, 32, Math.PI]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position-x={s * 0.14} rotation-z={Math.PI / 2} material={m.second}>
              <cylinderGeometry args={[0.06, 0.06, 0.05, 20]} />
            </mesh>
          ))}
        </group>
      )
    case 'antena':
      return (
        <group ref={bob} position-y={0.12}>
          <mesh position-y={0.1} material={SH.dark}>
            <cylinderGeometry args={[0.006, 0.006, 0.2, 6]} />
          </mesh>
          <mesh position-y={0.21} material={m.trim}>
            <sphereGeometry args={[0.03, 12, 10]} />
          </mesh>
        </group>
      )
    case 'orelhas':
      return (
        <>
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 0.078, 0.095, 0]} rotation-z={-s * 0.35}>
              <mesh position-y={0.045} scale={[1, 1, 0.45]} material={m.skin}>
                <coneGeometry args={[0.052, 0.1, 12]} />
              </mesh>
              <mesh position={[0, 0.038, 0.016]} scale={[1, 1, 0.3]} material={m.second}>
                <coneGeometry args={[0.03, 0.065, 12]} />
              </mesh>
            </group>
          ))}
        </>
      )
    case 'aureola':
      return (
        <group ref={bob} position-y={0.24}>
          <mesh rotation-x={Math.PI / 2} material={SH.halo}>
            <torusGeometry args={[0.1, 0.012, 8, 40]} />
          </mesh>
        </group>
      )
    default:
      return null
  }
}

// ---------- rosto ----------

const EYE: [number, number, number] = [0.045, 0.015, 0.117]

function Eyes() {
  const { m } = useAvatar()
  const l = useRef<THREE.Mesh>(null!)
  const r = useRef<THREE.Mesh>(null!)
  useAvatarFrame((a) => {
    l.current.scale.y = r.current.scale.y = 1.15 * a.blink
  })
  return (
    <>
      {[-1, 1].map((s) => (
        <mesh key={s} ref={s < 0 ? l : r} position={[s * EYE[0], EYE[1], EYE[2]]} scale={[1, 1.15, 0.5]} material={m.eyes}>
          <sphereGeometry args={[0.021, 12, 10]} />
        </mesh>
      ))}
    </>
  )
}

export function Face() {
  const { look, m } = useAvatar()
  // o elmo fecha o rosto
  if (look.head === 'elmo') return null
  switch (look.face) {
    case 'visor':
      return (
        <mesh position={[0, 0.02, 0.06]} scale={[1, 0.42, 0.75]} material={m.eyes}>
          <sphereGeometry args={[0.12, 24, 12]} />
        </mesh>
      )
    case 'olhos':
      return <Eyes />
    case 'sorriso':
      return (
        <>
          <Eyes />
          <mesh position={[0, -0.022, 0.121]} rotation={[-0.25, 0, Math.PI]} material={SH.dark}>
            <torusGeometry args={[0.03, 0.0065, 6, 16, Math.PI]} />
          </mesh>
        </>
      )
    case 'oculos':
      return (
        <>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.043, 0.02, 0.118]} rotation-y={s * 0.3} material={m.eyes}>
              <boxGeometry args={[0.066, 0.04, 0.018]} />
            </mesh>
          ))}
          <mesh position={[0, 0.03, 0.127]} material={SH.dark}>
            <boxGeometry args={[0.03, 0.008, 0.01]} />
          </mesh>
        </>
      )
    case 'bigode':
      return (
        <>
          <Eyes />
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.026, -0.03, 0.122]} rotation-z={s * 1.2} material={SH.hair}>
              <capsuleGeometry args={[0.013, 0.034, 4, 8]} />
            </mesh>
          ))}
        </>
      )
    case 'sono':
      return (
        <>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * EYE[0], EYE[1] - 0.004, EYE[2] + 0.004]} rotation-z={Math.PI / 2} material={SH.dark}>
              <capsuleGeometry args={[0.006, 0.026, 4, 6]} />
            </mesh>
          ))}
        </>
      )
    case 'bravo':
      return (
        <>
          <Eyes />
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.045, 0.05, 0.113]} rotation-z={s * 0.35} material={SH.dark}>
              <boxGeometry args={[0.046, 0.01, 0.012]} />
            </mesh>
          ))}
        </>
      )
    default:
      return null
  }
}

// ---------- roupa (coordenadas do tronco) ----------

const LONG_SLEEVES = new Set(['moletom', 'jaqueta', 'terno', 'armadura', 'tunica'])

export function Top() {
  const { look, d, m } = useAvatar()
  const R = d.torsoR + 0.012
  // casca da roupa: cúpula dos ombros + corpo, aberta embaixo com a barra um pouco solta (fica por cima da calça)
  const shellGeo = useMemo(() => {
    const top = TORSO_Y + d.torsoL / 2
    const pts = [new THREE.Vector2(R + 0.008, d.domeLow - 0.05)]
    // pontos a cada ~3,5 cm no corpo também, senão a estampa estica (o v da textura anda por ponto, não por distância)
    const n = Math.max(2, Math.round((top - d.domeLow + 0.015) / 0.035))
    for (let i = 0; i <= n; i++) pts.push(new THREE.Vector2(R, d.domeLow - 0.015 + ((top - d.domeLow + 0.015) * i) / n))
    for (let i = 1; i <= 8; i++) {
      const a = (i / 8) * (Math.PI / 2)
      pts.push(new THREE.Vector2(R * Math.cos(a), top + R * Math.sin(a)))
    }
    return new THREE.LatheGeometry(pts, 20)
  }, [R, d])
  useEffect(() => () => shellGeo.dispose(), [shellGeo])
  // sombra fica com o corpo por baixo (mesma silhueta)
  const shell = (mat: THREE.Material = m.cloth) => <mesh geometry={shellGeo} material={mat} />
  const collarY = d.torsoTop - 0.05
  switch (look.top) {
    case 'camiseta':
      return shell()
    case 'moletom':
      return (
        <>
          {shell()}
          {/* capuz caído nas costas */}
          <mesh position-y={d.torsoTop - 0.035} rotation-x={-Math.PI / 2} material={m.cloth}>
            <torusGeometry args={[neckR(d, 0.035) + 0.03, 0.05, 8, 20, Math.PI]} />
          </mesh>
          <mesh position={[0, TORSO_Y - d.torsoL * 0.32, R - 0.004]} material={m.mainPlain}>
            <boxGeometry args={[d.torsoR * 1.2, 0.1, 0.02]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.03, collarY - 0.1, R + 0.004]} material={m.second}>
              <capsuleGeometry args={[0.006, 0.07, 4, 6]} />
            </mesh>
          ))}
        </>
      )
    case 'jaqueta':
      return (
        <>
          {shell()}
          <mesh position-y={collarY} rotation-x={Math.PI / 2} material={m.mainPlain}>
            <torusGeometry args={[neckR(d, 0.05) + 0.012, 0.03, 8, 28]} />
          </mesh>
          <mesh position={[0, TORSO_Y + 0.02, R + 0.002]} material={m.second}>
            <boxGeometry args={[0.012, d.torsoL + 0.12, 0.008]} />
          </mesh>
        </>
      )
    case 'terno':
      return (
        <>
          {shell()}
          <mesh position={[0, TORSO_Y + d.torsoL * 0.2, R + 0.001]} material={SH.white}>
            <boxGeometry args={[0.08, d.torsoL * 0.75, 0.008]} />
          </mesh>
          <mesh position={[0, TORSO_Y + d.torsoL * 0.12, R + 0.008]} material={m.second}>
            <boxGeometry args={[0.032, d.torsoL * 0.7, 0.01]} />
          </mesh>
          <mesh position={[0, TORSO_Y + d.torsoL * 0.5, R + 0.01]} material={m.second}>
            <boxGeometry args={[0.042, 0.034, 0.016]} />
          </mesh>
        </>
      )
    case 'avental':
      return (
        <>
          <mesh position={[0, TORSO_Y - 0.12, d.torsoR + 0.012]} material={m.cloth} castShadow>
            <boxGeometry args={[d.torsoR * 1.5, d.torsoL + d.torsoR * 2.2, 0.014]} />
          </mesh>
          <mesh position-y={collarY - 0.02} rotation-x={Math.PI / 2} material={m.mainPlain}>
            <torusGeometry args={[neckR(d, 0.07) + 0.005, 0.008, 6, 28]} />
          </mesh>
        </>
      )
    case 'armadura':
      return (
        <>
          {shell(m.armor)}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * d.shoulderX, d.armY + 0.015, 0]} rotation-z={-s * 0.35} material={m.armor}>
              {dome(d.armR * 2.3)}
            </mesh>
          ))}
          <mesh position-y={TORSO_Y - d.torsoL / 2 + 0.02} rotation-x={Math.PI / 2} material={m.second}>
            <torusGeometry args={[R + 0.002, 0.018, 8, 32]} />
          </mesh>
        </>
      )
    case 'tunica':
      return (
        <>
          {shell()}
          {/* saia até o tornozelo, aberta embaixo */}
          <mesh position-y={TORSO_Y - d.torsoL / 2 - 0.42} material={m.clothDouble} castShadow>
            <cylinderGeometry args={[R + 0.002, R + 0.17, 0.86, 24, 1, true]} />
          </mesh>
          <mesh position-y={TORSO_Y - d.torsoL / 2 + 0.02} rotation-x={Math.PI / 2} material={m.second}>
            <torusGeometry args={[R + 0.004, 0.012, 6, 32]} />
          </mesh>
        </>
      )
    default:
      return null
  }
}

// mangas (coordenadas do braço)
export function Sleeve() {
  const { look, d, m } = useAvatar()
  if (look.top === 'camiseta') return <Capsule r={d.armR + 0.014} top={d.armTop + 0.012} bottom={-0.17} material={m.cloth} />
  if (!LONG_SLEEVES.has(look.top)) return null
  return <Capsule r={d.armR + 0.012} top={d.armTop + 0.012} bottom={d.armBottom + 0.07} material={look.top === 'armadura' ? m.armor : m.cloth} />
}

// ---------- calça: o quadril fica no tronco, as pernas da calça em cada perna ----------

export function Hips() {
  const { look, d, m } = useAvatar()
  if (look.legs === 'nada') return null
  const r = d.torsoR + 0.008
  return (
    <group position-y={d.domeLow}>
      <mesh material={m.pants}>
        <sphereGeometry args={[r, 24, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
      </mesh>
      <mesh position-y={0.02} material={m.pants}>
        <cylinderGeometry args={[r, r, 0.04, 24, 1, true]} />
      </mesh>
    </group>
  )
}

export function Pants() {
  const { look, d, m } = useAvatar()
  if (look.legs === 'shorts') return <Capsule r={d.legR + 0.016} top={d.legTop + 0.01} bottom={d.legTop - 0.32} material={m.pants} />
  if (look.legs === 'calca') return <Capsule r={d.legR + 0.013} top={d.legTop + 0.01} bottom={d.legBottom + 0.09} material={m.pants} />
  return null
}

export function Shoes() {
  const { look, d, m } = useAvatar()
  const w = d.legR * 2.5
  switch (look.feet) {
    case 'tenis':
      return (
        <>
          <RoundedBox args={[w, 0.085, 0.25]} radius={0.035} smoothness={2} position={[0, FLOOR + 0.05, 0.045]} material={m.second} />
          <mesh position={[0, FLOOR + 0.0125, 0.045]} material={SH.white}>
            <boxGeometry args={[w + 0.008, 0.025, 0.255]} />
          </mesh>
        </>
      )
    case 'botas':
      return (
        <>
          <Capsule r={d.legR + 0.02} top={FLOOR + 0.32} bottom={FLOOR + 0.02} material={m.boots} />
          <RoundedBox args={[w, 0.09, 0.24]} radius={0.035} smoothness={2} position={[0, FLOOR + 0.045, 0.04]} material={m.boots} />
        </>
      )
    case 'nadadeira':
      return (
        <>
          <RoundedBox args={[w, 0.07, 0.15]} radius={0.03} smoothness={2} position={[0, FLOOR + 0.04, 0]} material={m.second} />
          <mesh position={[0, FLOOR + 0.012, 0.16]} material={m.second}>
            <boxGeometry args={[w * 1.35, 0.016, 0.36]} />
          </mesh>
        </>
      )
    default:
      return null
  }
}

// ---------- extra (costas e pescoço) ----------

export function Extra() {
  const { look, d, m } = useAvatar()
  const moving = useRef<THREE.Group>(null!)
  const flames = useRef<THREE.Group>(null!)
  useAvatarFrame((a, dt) => {
    const g = moving.current
    const run = Math.min(1, a.speed / 6)
    const air = a.grounded ? 0 : 1
    if (g && (look.extra === 'capa' || look.extra === 'cachecol')) {
      // a capa vai pra trás quando corre ou pula; a ponta do cachecol balança pra frente
      const wave = Math.sin(a.t * 1.6 + a.phase) * 0.03
      const want = look.extra === 'capa' ? 0.1 + run * 0.55 + air * 0.35 + wave : -(run * 0.35 + air * 0.3) + wave
      g.rotation.x += (want - g.rotation.x) * (1 - Math.exp(-dt * 6))
    } else if (g && look.extra === 'asas') {
      // as pontas ficam pra trás, em V; no ar batem rápido
      const flap = a.grounded ? Math.sin(a.t * 3) * 0.12 : Math.sin(a.t * 22) * 0.5
      g.children[0].rotation.y = -0.35 - flap
      g.children[1].rotation.y = 0.35 + flap
    } else if (flames.current) {
      // chama do jetpack só no ar
      flames.current.visible = !a.grounded
      flames.current.scale.y = 0.8 + Math.random() * 0.45
    }
  })
  const back = -(d.torsoR + 0.06)
  switch (look.extra) {
    case 'mochila':
      return (
        <>
          <RoundedBox args={[d.torsoR * 1.5, 0.34, 0.14]} radius={0.045} smoothness={2} position={[0, TORSO_Y + 0.04, back]} material={m.second} />
          <RoundedBox args={[d.torsoR * 1.1, 0.13, 0.05]} radius={0.02} smoothness={2} position={[0, TORSO_Y - 0.04, back - 0.08]} material={m.second} />
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * d.torsoR * 0.5, TORSO_Y + 0.05, d.torsoR + 0.018]} material={SH.dark}>
              <boxGeometry args={[0.03, d.torsoL + 0.1, 0.012]} />
            </mesh>
          ))}
        </>
      )
    case 'capa':
      return (
        <group ref={moving} position={[0, d.torsoTop - 0.06, -d.torsoR * 0.3]}>
          <mesh position-y={-0.48} material={m.secondDouble} castShadow>
            <cylinderGeometry args={[d.torsoR * 0.8, d.torsoR + 0.16, 0.96, 16, 1, true, Math.PI / 2, Math.PI]} />
          </mesh>
        </group>
      )
    case 'jetpack':
      return (
        <group position={[0, TORSO_Y + 0.05, back]}>
          <mesh material={m.second}>
            <boxGeometry args={[0.2, 0.07, 0.08]} />
          </mesh>
          {[-1, 1].map((s) => (
            <group key={s} position-x={s * 0.065}>
              <mesh material={SH.metal}>
                <capsuleGeometry args={[0.052, 0.22, 4, 14]} />
              </mesh>
              <mesh position-y={-0.18} material={SH.dark}>
                <cylinderGeometry args={[0.03, 0.042, 0.05, 14]} />
              </mesh>
            </group>
          ))}
          <group ref={flames} position-y={-0.2} visible={false}>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * 0.065, -0.08, 0]} rotation-x={Math.PI} material={SH.flame}>
                <coneGeometry args={[0.032, 0.16, 10]} />
              </mesh>
            ))}
          </group>
        </group>
      )
    case 'asas':
      return (
        <group ref={moving} position={[0, TORSO_Y + 0.16, -d.torsoR + 0.02]}>
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh position={[s * 0.15, 0.04, -0.03]} rotation-z={s * 0.45} scale={[0.17, 0.09, 0.016]} material={m.second}>
                <sphereGeometry args={[1, 16, 10]} />
              </mesh>
            </group>
          ))}
        </group>
      )
    case 'cachecol': {
      const y = d.torsoTop - 0.06
      return (
        <>
          <mesh position-y={y} rotation-x={Math.PI / 2} material={m.second}>
            <torusGeometry args={[neckR(d, 0.06) + 0.015, 0.038, 8, 28]} />
          </mesh>
          <group ref={moving} position={[d.torsoR * 0.42, y - 0.02, neckR(d, 0.06) + 0.02]}>
            <mesh position-y={-0.12} rotation-z={0.08} material={m.second}>
              <capsuleGeometry args={[0.032, 0.19, 4, 8]} />
            </mesh>
          </group>
        </>
      )
    }
    default:
      return null
  }
}
