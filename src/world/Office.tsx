// Escritório de luxo: cobertura com pele de vidro, forro de nogueira, colunas e salas de estar com móveis de verdade.
// O salão (onde ficam os objetos de cada pessoa) é o mesmo; isto é a arquitetura em volta.
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { modelUrl, usePbr } from './assets'

const R = 46 // pele de vidro
const H = 12 // pé-direito
const COL_R = 38.5
const D = Math.PI / 180

// ponto no círculo virado pro centro (0° = norte)
const at = (deg: number, r: number) => ({ x: Math.sin(deg * D) * r, z: -Math.cos(deg * D) * r, rotY: -deg * D })

const bronze = new THREE.MeshStandardMaterial({ color: '#3b3029', metalness: 0.85, roughness: 0.32 })
const slab = new THREE.MeshStandardMaterial({ color: '#2a2725', roughness: 0.8 })
const plaster = new THREE.MeshStandardMaterial({ color: '#ebe6de', roughness: 0.88 })
const glass = new THREE.MeshStandardMaterial({ color: '#d6e6ec', roughness: 0.03, metalness: 0, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false })
const warm = (k: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd6a0').multiplyScalar(k), toneMapped: false })
const cove = warm(2.2)
const downlight = warm(3)

// ---------- forro ----------

function Ceiling() {
  // veio na escala de verdade: um ladrilho a cada ~2,6 m
  const wood = usePbr('walnut', [36, 36], 8)
  const lights = useRef<THREE.InstancedMesh>(null!)
  const spots = useMemo(() => {
    const out: [number, number][] = []
    for (const [r, n] of [[17, 22], [29, 34]] as const) for (let i = 0; i < n; i++) out.push([Math.sin((i / n) * Math.PI * 2) * r, Math.cos((i / n) * Math.PI * 2) * r])
    return out
  }, [])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    spots.forEach(([x, z], i) => lights.current.setMatrixAt(i, m.makeTranslation(x, H - 0.01, z)))
    lights.current.instanceMatrix.needsUpdate = true
    lights.current.computeBoundingSphere()
  }, [spots])
  return (
    <group>
      {/* forro de nogueira (olhando pra baixo) com um rebaixo redondo no meio */}
      <mesh position-y={H} rotation-x={Math.PI / 2} receiveShadow>
        <ringGeometry args={[10, R + 0.6, 128, 1]} />
        <meshStandardMaterial {...wood} color="#9a7a62" roughness={1} side={THREE.FrontSide} />
      </mesh>
      {/* claraboia: vidro com caixilho em cruz, o céu da foto aparece por ela */}
      <mesh position-y={H + 1.2} rotation-x={Math.PI / 2} material={glass}>
        <circleGeometry args={[10, 96]} />
      </mesh>
      {[0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4].map((a) => (
        <mesh key={a} position-y={H + 1.15} rotation-y={a} material={bronze}>
          <boxGeometry args={[20, 0.12, 0.14]} />
        </mesh>
      ))}
      <mesh position-y={H + 0.6} material={plaster}>
        <cylinderGeometry args={[10, 10, 1.2, 96, 1, true]} />
      </mesh>
      {/* sancas de luz quente: no rebaixo e junto do vidro */}
      <mesh position-y={H + 1.15} rotation-x={Math.PI / 2} material={cove}>
        <torusGeometry args={[9.85, 0.06, 6, 128]} />
      </mesh>
      <mesh position-y={H - 0.08} rotation-x={Math.PI / 2} material={cove}>
        <torusGeometry args={[44.4, 0.05, 6, 192]} />
      </mesh>
      <instancedMesh ref={lights} args={[undefined, downlight, spots.length]} rotation-x={0}>
        <cylinderGeometry args={[0.16, 0.16, 0.02, 20]} />
      </instancedMesh>
    </group>
  )
}

// ---------- fachada de vidro com caixilho de bronze ----------

function Facade() {
  const mullions = useRef<THREE.InstancedMesh>(null!)
  const N = Math.round((Math.PI * 2 * R) / 2.9)
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const s = new THREE.Vector3(1, 1, 1)
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2
      q.setFromAxisAngle(up, a)
      m.compose(new THREE.Vector3(Math.sin(a) * R, H / 2, Math.cos(a) * R), q, s)
      mullions.current.setMatrixAt(i, m)
    }
    mullions.current.instanceMatrix.needsUpdate = true
    mullions.current.computeBoundingSphere()
  }, [N])
  return (
    <group>
      <instancedMesh ref={mullions} args={[undefined, bronze, N]} castShadow>
        <boxGeometry args={[0.09, H, 0.24]} />
      </instancedMesh>
      <mesh position-y={H / 2} material={glass} renderOrder={2}>
        <cylinderGeometry args={[R - 0.03, R - 0.03, H, 128, 1, true]} />
      </mesh>
      {/* travessas no pé e no topo, e uma na altura do peitoril */}
      {[0.06, 1.05, H - 0.06].map((y) => (
        <mesh key={y} position-y={y} rotation-x={Math.PI / 2} material={bronze}>
          <torusGeometry args={[R, 0.06, 6, 192]} />
        </mesh>
      ))}
      {/* bordas das lajes, vistas de fora */}
      <mesh position-y={H + 0.7} material={slab}>
        <cylinderGeometry args={[R + 0.6, R + 0.6, 1.4, 128, 1, true]} />
      </mesh>
      <mesh position-y={-0.6} material={slab}>
        <cylinderGeometry args={[R + 0.6, R + 0.6, 1.2, 128, 1, true]} />
      </mesh>
    </group>
  )
}

function Columns() {
  const cols = useRef<THREE.InstancedMesh>(null!)
  const bases = useRef<THREE.InstancedMesh>(null!)
  const N = 10
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    for (let i = 0; i < N; i++) {
      const p = at(18 + (i / N) * 360, COL_R)
      cols.current.setMatrixAt(i, m.makeTranslation(p.x, H / 2, p.z))
      bases.current.setMatrixAt(i, m.makeTranslation(p.x, 0.04, p.z))
    }
    for (const im of [cols.current, bases.current]) {
      im.instanceMatrix.needsUpdate = true
      im.computeBoundingSphere()
    }
  }, [])
  return (
    <>
      <instancedMesh ref={cols} args={[undefined, plaster, N]} castShadow receiveShadow>
        <cylinderGeometry args={[0.5, 0.5, H, 32]} />
      </instancedMesh>
      <instancedMesh ref={bases} args={[undefined, bronze, N]}>
        <cylinderGeometry args={[0.56, 0.56, 0.08, 32]} />
      </instancedMesh>
    </>
  )
}

// ---------- móveis (Poly Haven) ----------

function Model({ id, position, rotY = 0, scale = 1 }: { id: string; position: [number, number, number]; rotY?: number; scale?: number }) {
  const { scene } = useGLTF(modelUrl(id))
  const obj = useMemo(() => {
    const c = scene.clone(true)
    c.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.castShadow = true
        m.receiveShadow = true
      }
    })
    return c
  }, [scene])
  return <primitive object={obj} position={position} rotation-y={rotY} scale={scale} />
}

const rugMat = new THREE.MeshStandardMaterial({ color: '#6e6155', roughness: 1 })

// sala de estar junto do vidro: duas poltronas, mesa de centro, pufe e plantas
function Lounge({ deg, r }: { deg: number; r: number }) {
  const p = at(deg, r)
  return (
    <group position={[p.x, 0, p.z]} rotation-y={p.rotY}>
      <mesh position-y={0.006} rotation-x={-Math.PI / 2} material={rugMat} receiveShadow>
        <planeGeometry args={[5.2, 3.4]} />
      </mesh>
      <Model id="coffee_table_round_01" position={[0, 0, 0]} />
      <Model id="mid_century_lounge_chair" position={[-1.55, 0, -0.1]} rotY={Math.PI / 2} />
      <Model id="modern_arm_chair_01" position={[1.6, 0, -0.1]} rotY={-Math.PI / 2} />
      <Model id="Ottoman_01" position={[0.1, 0, 1.25]} />
      <Model id="potted_plant_02" position={[-2.9, 0, -1.6]} />
      <Model id="potted_plant_04" position={[2.9, 0, -1.6]} rotY={1.2} />
    </group>
  )
}

function Furniture() {
  return (
    <>
      {[36, 108, 180, 252, 324].map((deg) => (
        <Lounge key={deg} deg={deg} r={41.5} />
      ))}
      {Array.from({ length: 10 }, (_, i) => {
        const p = at(18 + i * 36 + 4, COL_R + 1.4)
        return <Model key={i} id="potted_plant_01" position={[p.x, 0, p.z]} rotY={i} />
      })}
    </>
  )
}

export function Office() {
  return (
    <group>
      <Facade />
      <Columns />
      <Suspense fallback={null}>
        <Ceiling />
      </Suspense>
      <Suspense fallback={null}>
        <Furniture />
      </Suspense>
    </group>
  )
}

