import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Environment, Lightformer, MeshReflectorMaterial } from '@react-three/drei'
import { Bloom, EffectComposer, ToneMapping, Vignette, SMAA } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { player, useUI } from '../store'
import { useRooms } from '../rooms'
import { drag } from '../interact'
import { glow, loadImage } from '../textures'
import { pc } from '../pc'
import { HALL } from '../layout'
import type { Theme } from '../themes'

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

// ---------- céu ----------

export function Sky({ theme }: { theme: Theme }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color() },
          mid: { value: new THREE.Color() },
          horizon: { value: new THREE.Color() },
          sunDir: { value: new THREE.Vector3(0, 1, 0) },
          sunColor: { value: new THREE.Color() },
          sunSize: { value: 0 },
        },
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
        fragmentShader: `
          uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunSize;
          varying vec3 vP;
          void main(){
            vec3 d = normalize(vP);
            float h = d.y;
            vec3 col = mix(horizon, mid, smoothstep(-0.02, 0.22, h));
            col = mix(col, top, smoothstep(0.18, 0.85, h));
            if (sunSize > 0.0) {
              float s = max(dot(d, normalize(sunDir)), 0.0);
              col += sunColor * (pow(s, 6.0) * 0.25 + pow(s, 60.0) * 0.45);
              col += sunColor * smoothstep(cos(sunSize * 1.15), cos(sunSize), s) * 1.6;
            }
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [],
  )
  useLayoutEffect(() => {
    const u = mat.uniforms
    u.top.value.set(theme.sky.top)
    u.mid.value.set(theme.sky.mid)
    u.horizon.value.set(theme.sky.horizon)
    u.sunSize.value = theme.sky.sun ? theme.sky.sun.size : 0
    if (theme.sky.sun) {
      u.sunDir.value.set(...theme.sky.sun.dir)
      u.sunColor.value.set(theme.sky.sun.color)
    }
  }, [theme, mat])
  const ref = useRef<THREE.Mesh>(null!)
  useFrame(({ camera }) => ref.current.position.copy(camera.position))
  return (
    <mesh ref={ref} material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[1500, 48, 24]} />
    </mesh>
  )
}

// ---------- luz ----------

export function Lights({ theme }: { theme: Theme }) {
  const quality = useUI((st) => st.quality)
  const sun = useRef<THREE.DirectionalLight>(null!)
  const target = useMemo(() => new THREE.Object3D(), [])
  const [sx, sy, sz] = theme.light.sunPos
  useFrame(() => {
    const p = player.pos
    sun.current.position.set(p.x + sx, sy, p.z + sz)
    target.position.set(p.x, 0, p.z)
    target.updateMatrixWorld()
  })
  return (
    <>
      <hemisphereLight args={[theme.light.hemiSky, theme.light.hemiGround, theme.light.hemi]} />
      <directionalLight
        ref={sun}
        intensity={theme.light.sunIntensity}
        color={theme.light.sun}
        target={target}
        castShadow={quality !== 'leve'}
        shadow-mapSize={quality === 'alta' ? [2048, 2048] : [1024, 1024]}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-camera-far={260}
        shadow-bias={-0.0003}
        shadow-normalBias={0.03}
      />
      <primitive object={target} />
      {/* reflexos suaves sem baixar HDR nenhum: o mapa é montado aqui mesmo */}
      <Environment resolution={256} frames={1} key={theme.id}>
        <color attach="background" args={[theme.sky.mid]} />
        {/* luzes no alto: o piso brilhoso reflete o horizonte, que fica escuro */}
        <Lightformer form="rect" intensity={2 * theme.env.intensity} color={theme.env.key} position={[0, 14, -4]} rotation-x={Math.PI / 2} scale={[22, 10, 1]} />
        <Lightformer form="rect" intensity={0.8 * theme.env.intensity} color={theme.env.fill} position={[-12, 9, 4]} rotation={[Math.PI / 4, Math.PI / 2, 0]} scale={[16, 4, 1]} />
        <Lightformer form="rect" intensity={0.8 * theme.env.intensity} color={theme.env.fill} position={[12, 9, 4]} rotation={[Math.PI / 4, -Math.PI / 2, 0]} scale={[16, 4, 1]} />
        <Lightformer form="ring" intensity={1.5 * theme.env.intensity} color={theme.env.key} position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={8} />
      </Environment>
    </>
  )
}

// ---------- piso do salão ----------

function woodTexture() {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 1024
  const g = c.getContext('2d')!
  const r = rng(9)
  const plank = 64
  for (let y = 0; y < 1024; y += plank) {
    let x = -Math.floor(r() * 300)
    while (x < 1024) {
      const len = 260 + r() * 300
      const l = 34 + r() * 10
      g.fillStyle = `hsl(${26 + r() * 6}, ${22 + r() * 8}%, ${l}%)`
      g.fillRect(x, y, len, plank)
      g.globalAlpha = 0.08
      for (let k = 0; k < 7; k++) {
        g.fillStyle = r() > 0.5 ? '#000' : '#fff'
        g.fillRect(x, y + r() * plank, len, 1 + r() * 2)
      }
      g.globalAlpha = 1
      g.fillStyle = 'rgba(0,0,0,0.45)'
      g.fillRect(x, y, 2, plank)
      x += len
    }
    g.fillStyle = 'rgba(0,0,0,0.5)'
    g.fillRect(0, y, 1024, 2)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(6, 6)
  t.anisotropy = 8
  return t
}

// modo simples: clicou no chão, o avatar anda até lá
const walkClick = (e: ThreeEvent<MouseEvent>) => {
  const ui = useUI.getState()
  if (ui.settings.controls !== 'simples' || ui.focus || ui.panel === 'avatar' || drag.moved || useRooms.getState().build || document.pointerLockElement) return
  e.stopPropagation()
  player.walkTo = { x: e.point.x, z: e.point.z }
}

export function Floor({ theme }: { theme: Theme }) {
  const quality = useUI((st) => st.quality)
  const wood = useMemo(() => (theme.id === 'lago' ? woodTexture() : null), [theme.id])
  const f = theme.floor
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow onClick={walkClick}>
        <circleGeometry args={[HALL.floor, 128]} />
        {f.mirror > 0 && quality === 'alta' ? (
          <MeshReflectorMaterial
            key={theme.id}
            color={f.color}
            roughness={f.roughness}
            metalness={f.metalness}
            mirror={f.mirror}
            blur={[180, 60]}
            mixBlur={0.7}
            mixStrength={f.mirror * 1.15}
            mixContrast={1.15}
            resolution={512}
            depthScale={0.6}
            minDepthThreshold={0.3}
            maxDepthThreshold={1.2}
            envMapIntensity={theme.dark ? 0.12 : 0.45}
          />
        ) : (
          <meshStandardMaterial
            color={wood ? '#ffffff' : f.color}
            map={wood}
            // sem espelho: brilho vem do mapa de ambiente
            roughness={f.mirror > 0 ? Math.max(0.12, f.roughness * 0.6) : f.roughness}
            metalness={f.mirror > 0 ? Math.max(f.metalness, 0.55) : f.metalness}
            envMapIntensity={f.mirror > 0 ? (theme.dark ? 0.2 : 0.9) : 1}
          />
        )}
      </mesh>
      {/* anéis discretos no piso */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.004}>
        <ringGeometry args={[2.9, 2.94, 128]} />
        <meshBasicMaterial color={theme.accent} transparent opacity={0.55} toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.004}>
        <ringGeometry args={[HALL.walk + 0.6, HALL.walk + 0.63, 192]} />
        <meshBasicMaterial color={theme.accent} transparent opacity={0.35} toneMapped={false} />
      </mesh>
      {/* borda do piso */}
      <mesh position-y={-0.25}>
        <cylinderGeometry args={[HALL.floor, HALL.floor - 0.4, 0.5, 128, 1, true]} />
        <meshStandardMaterial color={theme.wall.color} roughness={0.4} metalness={0.5} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

// ---------- pós-processamento ----------

export function Effects({ theme }: { theme: Theme }) {
  const quality = useUI((st) => st.quality)
  if (quality === 'leve') return null
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <SMAA />
      <Bloom mipmapBlur intensity={theme.bloom} luminanceThreshold={theme.bloom ? 1.0 : 10} luminanceSmoothing={0.2} radius={0.7} />
      <Vignette offset={0.3} darkness={theme.dark ? 0.4 : 0.25} />
      <ToneMapping mode={theme.tone === 'neutral' ? ToneMappingMode.NEUTRAL : ToneMappingMode.AGX} />
    </EffectComposer>
  )
}

// ---------- cenários ----------

function windowsTexture(cols: number, rows: number, seed: number) {
  const c = document.createElement('canvas')
  c.width = cols * 8
  c.height = rows * 8
  const g = c.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, c.width, c.height)
  const r = rng(seed)
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const v = r()
      if (v < 0.42) continue
      g.fillStyle = v > 0.93 ? '#9fc4ff' : v > 0.6 ? '#ffd29a' : '#5a4632'
      g.fillRect(x * 8 + 2, y * 8 + 2, 4, 5)
    }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.magFilter = THREE.NearestFilter
  return t
}

function City() {
  const towers = useRef<THREE.InstancedMesh>(null!)
  const lights = useRef<THREE.InstancedMesh>(null!)
  const data = useMemo(() => {
    const r = rng(77)
    return Array.from({ length: 520 }, () => {
      const a = r() * Math.PI * 2
      const d = 70 + Math.pow(r(), 0.7) * 520
      const w = 8 + r() * 18
      const h = 30 + Math.pow(r(), 2.2) * 200 * (d < 160 ? 0.6 : 1)
      return { x: Math.sin(a) * d, z: Math.cos(a) * d, w, dz: 8 + r() * 18, h, rot: r() * Math.PI }
    })
  }, [])
  const tex = useMemo(() => windowsTexture(16, 48, 5), [])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    let li = 0
    data.forEach((b, i) => {
      q.setFromAxisAngle(up, b.rot)
      m.compose(new THREE.Vector3(b.x, -140 + b.h / 2, b.z), q, new THREE.Vector3(b.w, b.h, b.dz))
      towers.current.setMatrixAt(i, m)
      if (b.h > 150 && li < 60) {
        m.compose(new THREE.Vector3(b.x, -140 + b.h + 1.2, b.z), q, new THREE.Vector3(1, 1, 1))
        lights.current.setMatrixAt(li++, m)
      }
    })
    lights.current.count = li
    towers.current.instanceMatrix.needsUpdate = true
    lights.current.instanceMatrix.needsUpdate = true
    towers.current.computeBoundingSphere()
    lights.current.computeBoundingSphere()
  }, [data])
  const blink = useRef<THREE.MeshBasicMaterial>(null!)
  useFrame(({ clock }) => {
    blink.current.opacity = Math.sin(clock.elapsedTime * 2.2) > 0.2 ? 1 : 0.15
  })
  return (
    <group>
      <instancedMesh ref={towers} args={[undefined, undefined, data.length]}>
        <boxGeometry />
        <meshStandardMaterial color="#07080c" roughness={0.6} metalness={0.4} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={1.6} />
      </instancedMesh>
      <instancedMesh ref={lights} args={[undefined, undefined, 60]}>
        <sphereGeometry args={[0.9, 8, 8]} />
        <meshBasicMaterial ref={blink} color={glow('#ff3b30', 3)} transparent toneMapped={false} />
      </instancedMesh>
      <mesh position-y={-140} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[900, 32]} />
        <meshBasicMaterial color="#1a1220" />
      </mesh>
    </group>
  )
}

function Railing({ theme }: { theme: Theme }) {
  return (
    <group>
      <mesh position-y={0.6}>
        <cylinderGeometry args={[HALL.floor - 0.3, HALL.floor - 0.3, 1.2, 160, 1, true]} />
        <meshPhysicalMaterial color="#9fb3c8" transparent opacity={0.12} roughness={0.05} metalness={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position-y={1.2} rotation-x={-Math.PI / 2}>
        <torusGeometry args={[HALL.floor - 0.3, 0.045, 8, 220]} />
        <meshStandardMaterial color={theme.accent} metalness={0.9} roughness={0.25} />
      </mesh>
    </group>
  )
}

function LightPosts({ theme, count = 16, r = 31, h = 5.5 }: { theme: Theme; count?: number; r?: number; h?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.PI / count
      m.makeTranslation(Math.sin(a) * r, h / 2, Math.cos(a) * r)
      ref.current.setMatrixAt(i, m)
    }
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [count, r, h])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <boxGeometry args={[0.08, h, 0.08]} />
      <meshBasicMaterial color={glow(theme.accent, 3)} toneMapped={false} />
    </instancedMesh>
  )
}

function Terraco({ theme }: { theme: Theme }) {
  return (
    <>
      <City />
      <Railing theme={theme} />
      <LightPosts theme={theme} />
    </>
  )
}

function Galeria() {
  const pillars = useRef<THREE.InstancedMesh>(null!)
  const slabs = useRef<THREE.InstancedMesh>(null!)
  const N = 28
  const slabData = useMemo(() => {
    const r = rng(31)
    return Array.from({ length: 22 }, () => {
      const a = r() * Math.PI * 2
      const d = 110 + r() * 300
      return { x: Math.sin(a) * d, z: Math.cos(a) * d, w: 20 + r() * 60, h: 12 + r() * 40, rot: r() * Math.PI }
    })
  }, [])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2
      q.setFromAxisAngle(up, -a)
      m.compose(new THREE.Vector3(Math.sin(a) * 44, 14, Math.cos(a) * 44), q, new THREE.Vector3(1.4, 28, 3.2))
      pillars.current.setMatrixAt(i, m)
    }
    slabData.forEach((s, i) => {
      q.setFromAxisAngle(up, s.rot)
      m.compose(new THREE.Vector3(s.x, s.h / 2, s.z), q, new THREE.Vector3(s.w, s.h, 2.5))
      slabs.current.setMatrixAt(i, m)
    })
    for (const im of [pillars.current, slabs.current]) {
      im.instanceMatrix.needsUpdate = true
      im.computeBoundingSphere()
    }
  }, [slabData])
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow>
        <circleGeometry args={[1200, 64]} />
        <meshStandardMaterial color="#cfc9bf" roughness={0.9} />
      </mesh>
      <instancedMesh ref={pillars} args={[undefined, undefined, N]} castShadow receiveShadow>
        <boxGeometry />
        <meshStandardMaterial color="#f4f1ec" roughness={0.8} />
      </instancedMesh>
      {/* anel no topo das colunas */}
      <mesh position-y={29}>
        <cylinderGeometry args={[46, 46, 2.4, 128, 1, true]} />
        <meshStandardMaterial color="#f4f1ec" roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
      <mesh position-y={29}>
        <cylinderGeometry args={[42.4, 42.4, 2.4, 128, 1, true]} />
        <meshStandardMaterial color="#e9e5df" roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
      <mesh position-y={30.2} rotation-x={-Math.PI / 2} castShadow>
        <ringGeometry args={[42.4, 46, 128]} />
        <meshStandardMaterial color="#f4f1ec" roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
      <instancedMesh ref={slabs} args={[undefined, undefined, slabData.length]} castShadow receiveShadow>
        <boxGeometry />
        <meshStandardMaterial color="#efebe5" roughness={0.85} />
      </instancedMesh>
      {/* esculturas */}
      <mesh position={[-60, 9, -70]} castShadow>
        <sphereGeometry args={[9, 64, 32]} />
        <meshStandardMaterial color="#d8d8d8" metalness={1} roughness={0.08} />
      </mesh>
      <mesh position={[75, 7, 40]} rotation={[0.4, 0.3, 0]} castShadow>
        <torusGeometry args={[7, 1.6, 32, 96]} />
        <meshStandardMaterial color="#1c1c1e" metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  )
}

function Stars() {
  const geo = useMemo(() => {
    const r = rng(3)
    const n = 6000
    const pos = new Float32Array(n * 3)
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1
      const t = r() * Math.PI * 2
      const s = Math.sqrt(1 - u * u)
      pos.set([s * Math.cos(t) * 1300, u * 1300, s * Math.sin(t) * 1300], i * 3)
      const b = 0.5 + r() * 0.5
      const warm = r()
      col.set([b * (warm > 0.8 ? 1 : 0.8), b * 0.9, b * (warm < 0.3 ? 1 : 0.85)], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return g
  }, [])
  const ref = useRef<THREE.Points>(null!)
  useFrame(({ camera }) => ref.current.position.copy(camera.position))
  return (
    <points ref={ref} geometry={geo} frustumCulled={false}>
      <pointsMaterial size={2.2} sizeAttenuation={false} vertexColors fog={false} toneMapped={false} />
    </points>
  )
}

function Planet() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        fog: false,
        uniforms: { light: { value: new THREE.Vector3(-0.6, 0.35, 0.7).normalize() } },
        vertexShader:
          'varying vec3 vN; varying vec3 vW; varying vec3 vL; void main(){ vN = normalize(normalMatrix*normal); vL = position; vec4 w = modelMatrix*vec4(position,1.0); vW = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }',
        fragmentShader: `
          uniform vec3 light; varying vec3 vN; varying vec3 vW; varying vec3 vL;
          void main(){
            vec3 n = normalize(vN);
            float lat = normalize(vL).y;
            float bands = sin(lat*28.0 + sin(lat*9.0)*1.5)*0.5+0.5;
            vec3 base = mix(vec3(0.05,0.16,0.35), vec3(0.18,0.42,0.62), bands);
            base = mix(base, vec3(0.85,0.9,0.95), smoothstep(0.82,0.95,abs(lat)));
            float d = max(dot(n, light), 0.0);
            vec3 col = base * (0.04 + d*1.2);
            float rim = pow(1.0 - max(dot(n, normalize(vW)),0.0), 3.0);
            col += vec3(0.35,0.75,1.0) * rim * (0.25 + d) * 1.4;
            gl_FragColor = vec4(col,1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [],
  )
  return (
    <group position={[-500, -40, -900]}>
      <mesh material={mat}>
        <sphereGeometry args={[380, 96, 64]} />
      </mesh>
      <mesh rotation={[1.25, 0.2, 0.3]}>
        <ringGeometry args={[480, 700, 128]} />
        <meshBasicMaterial color="#9ec9e6" transparent opacity={0.16} side={THREE.DoubleSide} fog={false} depthWrite={false} />
      </mesh>
    </group>
  )
}

function Station({ theme }: { theme: Theme }) {
  const struts = useRef<THREE.InstancedMesh>(null!)
  const N = 16
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const one = new THREE.Vector3(1, 1, 1)
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2
      q.setFromAxisAngle(up, a)
      m.compose(new THREE.Vector3(Math.sin(a) * 35, 8.5, Math.cos(a) * 35), q, one)
      struts.current.setMatrixAt(i, m)
    }
    struts.current.instanceMatrix.needsUpdate = true
    struts.current.computeBoundingSphere()
  }, [])
  return (
    <group>
      <mesh position-y={17} rotation-x={-Math.PI / 2}>
        <torusGeometry args={[35, 1.1, 24, 220]} />
        <meshStandardMaterial color="#1a2029" metalness={0.9} roughness={0.3} />
      </mesh>
      <mesh position-y={16.2} rotation-x={-Math.PI / 2}>
        <torusGeometry args={[34, 0.08, 8, 220]} />
        <meshBasicMaterial color={glow(theme.accent, 3)} toneMapped={false} />
      </mesh>
      <instancedMesh ref={struts} args={[undefined, undefined, N]}>
        <boxGeometry args={[0.7, 17, 0.7]} />
        <meshStandardMaterial color="#1a2029" metalness={0.9} roughness={0.3} />
      </instancedMesh>
      <mesh position-y={-1.5}>
        <cylinderGeometry args={[HALL.floor, HALL.floor * 0.55, 3, 128, 1]} />
        <meshStandardMaterial color="#0c1016" metalness={0.9} roughness={0.35} />
      </mesh>
      <LightPosts theme={theme} count={24} r={33} h={1.6} />
    </group>
  )
}

function Orbita({ theme }: { theme: Theme }) {
  return (
    <>
      <Stars />
      <Planet />
      <Station theme={theme} />
      <Railing theme={theme} />
    </>
  )
}

function ridgeTexture(seed: number, color: string, rough: number) {
  const c = document.createElement('canvas')
  c.width = 2048
  c.height = 256
  const g = c.getContext('2d')!
  const r = rng(seed)
  // soma de senos com fases aleatórias: cume contínuo que fecha a volta
  const waves = Array.from({ length: 6 }, (_, i) => ({ f: (i + 1) * (2 + Math.floor(r() * 3)), a: (r() * 0.5 + 0.5) / (i + 1) ** rough, p: r() * Math.PI * 2 }))
  g.fillStyle = color
  g.beginPath()
  g.moveTo(0, 256)
  for (let x = 0; x <= 2048; x += 4) {
    const t = (x / 2048) * Math.PI * 2
    let h = 0
    for (const w of waves) h += Math.sin(t * w.f + w.p) * w.a
    g.lineTo(x, 150 - h * 70)
  }
  g.lineTo(2048, 256)
  g.closePath()
  g.fill()
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  return tex
}

function Mountains() {
  const layers = useMemo(
    () => [
      { r: 900, h: 600, y: 120, color: '#d39a85', seed: 4, rough: 0.9 },
      { r: 700, h: 420, y: 60, color: '#a77482', seed: 8, rough: 1.1 },
      { r: 520, h: 260, y: 10, color: '#6f5069', seed: 15, rough: 1.3 },
    ].map((l) => ({ ...l, tex: ridgeTexture(l.seed, l.color, l.rough) })),
    [],
  )
  return (
    <group>
      {layers.map((l) => (
        <mesh key={l.r} position-y={l.y}>
          <cylinderGeometry args={[l.r, l.r, l.h, 128, 1, true]} />
          <meshBasicMaterial map={l.tex} transparent side={THREE.BackSide} fog={false} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

function Lago({ theme }: { theme: Theme }) {
  const quality = useUI((st) => st.quality)
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.9}>
        <circleGeometry args={[1400, 64]} />
        {quality === 'alta' ? (
          <MeshReflectorMaterial color="#2a3644" roughness={0.25} metalness={0.2} mirror={0.85} blur={[200, 60]} mixBlur={0.6} mixStrength={2.2} resolution={512} />
        ) : (
          <meshStandardMaterial color="#c98a74" roughness={0.18} metalness={0.85} envMapIntensity={1.2} />
        )}
      </mesh>
      <Mountains />
      {/* lanternas na beira do deck */}
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2 + Math.PI / 12
        return (
          <group key={i} position={[Math.sin(a) * 32.4, 0, Math.cos(a) * 32.4]}>
            <mesh position-y={0.7} castShadow>
              <cylinderGeometry args={[0.06, 0.08, 1.4, 8]} />
              <meshStandardMaterial color="#2b2522" />
            </mesh>
            <mesh position-y={1.55}>
              <sphereGeometry args={[0.22, 16, 12]} />
              <meshBasicMaterial color={glow('#ffc890', 3)} toneMapped={false} />
            </mesh>
          </group>
        )
      })}
      <mesh position-y={-0.45}>
        <cylinderGeometry args={[HALL.floor + 0.2, HALL.floor + 0.2, 0.9, 128, 1, true]} />
        <meshStandardMaterial color="#4a3222" roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

export function Scenery({ theme }: { theme: Theme }) {
  if (theme.id === 'terraco') return <Terraco theme={theme} />
  if (theme.id === 'galeria') return <Galeria />
  if (theme.id === 'orbita') return <Orbita theme={theme} />
  return <Lago theme={theme} />
}

// ---------- fundo próprio: imagem ou vídeo 360° escolhido pela pessoa ----------

export function CustomSky({ path, video }: { path: string; video: boolean }) {
  const [tex, setTex] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    let alive = true
    let el: HTMLVideoElement | null = null
    let t: THREE.Texture | null = null
    const url = pc.fileUrl(path)
    if (video) {
      el = document.createElement('video')
      el.crossOrigin = 'anonymous'
      el.src = url
      el.loop = true
      el.muted = true
      el.play().catch(() => {})
      t = new THREE.VideoTexture(el)
      t.colorSpace = THREE.SRGBColorSpace
      setTex(t)
    } else
      loadImage(url)
        .then((img) => {
          if (!alive) return
          t = new THREE.Texture(img)
          t.colorSpace = THREE.SRGBColorSpace
          t.needsUpdate = true
          setTex(t)
        })
        .catch(() => {})
    return () => {
      alive = false
      el?.pause()
      t?.dispose()
    }
  }, [path, video])
  const ref = useRef<THREE.Mesh>(null!)
  useFrame(({ camera }) => ref.current.position.copy(camera.position))
  return (
    <mesh ref={ref} scale={[-1, 1, 1]} renderOrder={-10}>
      <sphereGeometry args={[1400, 64, 32]} />
      <meshBasicMaterial map={tex} color={tex ? '#ffffff' : '#111'} side={THREE.BackSide} depthWrite={false} fog={false} toneMapped={false} />
    </mesh>
  )
}

// ---------- neblina e exposição seguem o tema ----------

export function Atmosphere({ theme, clear }: { theme: Theme; clear?: boolean }) {
  const { scene, gl } = useThree()
  useLayoutEffect(() => {
    // com fundo próprio a neblina some (não pode tingir a foto)
    scene.fog = new THREE.Fog(theme.fog.color, clear ? 4000 : theme.fog.near, clear ? 5000 : theme.fog.far)
    gl.toneMappingExposure = theme.exposure
  }, [theme, scene, gl, clear])
  return null
}

export function useTheme() {
  return useUI((s) => s.theme)
}
