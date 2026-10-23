// Órbita: deck de observação de uma estação espacial. Terra com as texturas da NASA (domínio público),
// céu com Via Láctea, cúpula de vidro com costelas de casco, painéis solares e um módulo acoplado.
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import type { Theme } from '../themes'
import { glow } from '../textures'
import { assetUrl, usePbr } from './assets'

const RIM = 36.4 // borda do deck
const TOP = 19 // altura do anel do topo da cúpula
const HUB = 5

// ---------- céu: preto com Via Láctea e estrelas ----------

// Via Láctea calculada uma vez numa textura (ruído no pixel a cada quadro pesava na GPU integrada)
function hash(x: number, y: number, z: number) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453
  return n - Math.floor(n)
}
function noise(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z)
  let fx = x - ix, fy = y - iy, fz = z - iz
  fx = fx * fx * (3 - 2 * fx)
  fy = fy * fy * (3 - 2 * fy)
  fz = fz * fz * (3 - 2 * fz)
  const l = (a: number, b: number, t: number) => a + (b - a) * t
  return l(
    l(l(hash(ix, iy, iz), hash(ix + 1, iy, iz), fx), l(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), fx), fy),
    l(l(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), fx), l(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), fx), fy),
    fz,
  )
}
function fbm(x: number, y: number, z: number, oct: number) {
  let s = 0, a = 0.5
  for (let i = 0; i < oct; i++) {
    s += a * noise(x, y, z)
    x *= 2.03; y *= 2.03; z *= 2.03
    a *= 0.5
  }
  return s
}
const AXIS = new THREE.Vector3(0.35, 0.82, -0.45).normalize()
let galaxy: THREE.Texture | null = null
function galaxyTexture() {
  if (galaxy) return galaxy
  const W = 1024, H = 512
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const img = g.createImageData(W, H)
  for (let y = 0; y < H; y++) {
    const el = (0.5 - (y + 0.5) / H) * Math.PI
    const ce = Math.cos(el), se = Math.sin(el)
    for (let x = 0; x < W; x++) {
      const az = ((x + 0.5) / W - 0.5) * Math.PI * 2
      const dx = ce * Math.cos(az), dy = se, dz = ce * Math.sin(az)
      const band = Math.exp(-(((dx * AXIS.x + dy * AXIS.y + dz * AXIS.z) * 3.2) ** 2))
      let r = 0, gg = 0, b = 0
      if (band > 0.01) {
        const dust = fbm(dx * 6, dy * 6, dz * 6, 5)
        const lanes = Math.min(1, Math.max(0, (fbm(dx * 11 + 3, dy * 11 + 3, dz * 11 + 3, 4) - 0.45) / 0.3))
        const core = band * band * 0.05 * dust * (1 - lanes * 0.8)
        const glowA = band * (0.012 + 0.03 * dust)
        r = glowA * 0.75 + core
        gg = glowA * 0.8 + core * 0.86
        b = glowA + core * 0.7
      }
      // guarda em sRGB com ganho (valores muito baixos sumiriam em 8 bits)
      const i = (y * W + x) * 4
      img.data[i] = Math.min(255, Math.pow(r * 6, 1 / 2.2) * 255)
      img.data[i + 1] = Math.min(255, Math.pow(gg * 6, 1 / 2.2) * 255)
      img.data[i + 2] = Math.min(255, Math.pow(b * 6, 1 / 2.2) * 255)
      img.data[i + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  galaxy = new THREE.CanvasTexture(c)
  galaxy.colorSpace = THREE.SRGBColorSpace
  return galaxy
}

const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: { tex: { value: null as THREE.Texture | null } },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
  fragmentShader: `
    uniform sampler2D tex; varying vec3 vP;
    void main(){
      vec3 d = normalize(vP);
      vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);
      gl_FragColor = vec4(texture2D(tex, uv).rgb / 6.0, 1.0);
      #include <colorspace_fragment>
    }`,
})

function Stars() {
  const geo = useMemo(() => {
    let s = 7
    const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
    const n = 9000
    const pos = new Float32Array(n * 3)
    const col = new Float32Array(n * 3)
    const size = new Float32Array(n)
    const axis = new THREE.Vector3(0.35, 0.82, -0.45).normalize()
    const v = new THREE.Vector3()
    for (let i = 0; i < n; i++) {
      // mais estrelas perto da faixa da galáxia
      do {
        const u = r() * 2 - 1
        const t = r() * Math.PI * 2
        const q = Math.sqrt(1 - u * u)
        v.set(q * Math.cos(t), u, q * Math.sin(t))
      } while (Math.abs(v.dot(axis)) > 0.35 && r() < 0.6)
      pos.set([v.x * 1300, v.y * 1300, v.z * 1300], i * 3)
      const b = Math.pow(r(), 3)
      const temp = r()
      col.set(temp < 0.15 ? [1, 0.82, 0.68] : temp > 0.85 ? [0.7, 0.82, 1] : [1, 0.97, 0.94], i * 3)
      size[i] = 0.6 + b * 2.6
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.setAttribute('size', new THREE.BufferAttribute(size, 1))
    return g
  }, [])
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        fog: false,
        vertexColors: true,
        uniforms: { dpr: { value: Math.min(2, window.devicePixelRatio) } },
        vertexShader: 'attribute float size; uniform float dpr; varying vec3 vC; varying float vS; void main(){ vC = color; vS = size; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); p.z = p.w * 0.9999; gl_Position = p; gl_PointSize = size * dpr; }',
        fragmentShader: 'varying vec3 vC; varying float vS; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC * (0.5 + vS * 0.6), a); }',
      }),
    [],
  )
  const ref = useRef<THREE.Group>(null!)
  useMemo(() => (skyMat.uniforms.tex.value = galaxyTexture()), [])
  useFrame(({ camera }) => ref.current.position.copy(camera.position))
  return (
    <group ref={ref}>
      <mesh material={skyMat} renderOrder={-10} frustumCulled={false}>
        <sphereGeometry args={[1400, 48, 24]} />
      </mesh>
      <points geometry={geo} material={mat} frustumCulled={false} renderOrder={-9} />
    </group>
  )
}

// ---------- Terra ----------

const EARTH_R = 2100
const EARTH_POS = new THREE.Vector3(-1500, -1500, -2600)

function Earth({ sunDir }: { sunDir: THREE.Vector3 }) {
  const [day, night, clouds] = useLoader(THREE.TextureLoader, ['earth_day', 'earth_night', 'earth_clouds'].map((n) => assetUrl(`world/tex/${n}.jpg`)))
  const mats = useMemo(() => {
    day.colorSpace = THREE.SRGBColorSpace
    night.colorSpace = THREE.SRGBColorSpace
    for (const t of [day, night, clouds]) t.anisotropy = 8
    clouds.wrapS = THREE.RepeatWrapping
    const shared = 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }'
    const surface = new THREE.ShaderMaterial({
      fog: false,
      uniforms: { day: { value: day }, night: { value: night }, clouds: { value: clouds }, sun: { value: sunDir }, t: { value: 0 } },
      vertexShader: shared,
      fragmentShader: `
        uniform sampler2D day, night, clouds; uniform vec3 sun; uniform float t;
        varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){
          vec3 n = normalize(vN);
          float d = dot(n, sun);
          float lit = smoothstep(-0.08, 0.35, d);
          vec3 base = texture2D(day, vUv).rgb;
          float cl = texture2D(clouds, vUv + vec2(t, 0.0)).r;
          vec3 col = mix(base, vec3(0.95), cl * 0.9) * max(d, 0.0) * 2.2;
          // oceano: reflexo do sol
          float ocean = smoothstep(0.02, 0.12, base.b - base.r) * (1.0 - cl);
          vec3 hv = normalize(sun + vV);
          col += vec3(1.0, 0.85, 0.6) * pow(max(dot(n, hv), 0.0), 90.0) * ocean * 3.0 * step(0.0, d);
          // luzes das cidades do lado da noite
          col += texture2D(night, vUv).rgb * vec3(1.0, 0.72, 0.42) * 1.6 * (1.0 - lit) * (1.0 - cl * 0.8);
          // céu azul visto de cima, mais forte na borda iluminada
          float rim = pow(1.0 - max(dot(n, vV), 0.0), 2.2);
          col += vec3(0.25, 0.55, 1.0) * rim * smoothstep(-0.25, 0.5, d) * 1.4;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    })
    // camada de atmosfera: brilho azul no contorno
    const air = new THREE.ShaderMaterial({
      fog: false,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      uniforms: { sun: { value: sunDir } },
      vertexShader: shared,
      fragmentShader: `
        uniform vec3 sun; varying vec3 vN; varying vec3 vV; varying vec2 vUv;
        void main(){
          vec3 n = normalize(vN);
          float edge = pow(clamp(1.0 + dot(n, vV) * 1.0, 0.0, 1.0), 3.0);
          float lit = smoothstep(-0.35, 0.45, dot(n, sun));
          gl_FragColor = vec4(vec3(0.3, 0.6, 1.0) * edge * (0.25 + lit) * 1.6, 1.0);
        }`,
    })
    return { surface, air }
  }, [day, night, clouds, sunDir])
  useLayoutEffect(() => () => (mats.surface.dispose(), mats.air.dispose()), [mats])
  const earth = useRef<THREE.Mesh>(null!)
  useFrame((_, dt) => {
    earth.current.rotation.y += dt * 0.004
    mats.surface.uniforms.t.value += dt * 0.0006
  })
  return (
    <group position={EARTH_POS}>
      <mesh ref={earth} material={mats.surface} rotation={[0.35, 2.2, 0.1]}>
        <sphereGeometry args={[EARTH_R, 160, 96]} />
      </mesh>
      <mesh material={mats.air} scale={1.035}>
        <sphereGeometry args={[EARTH_R, 96, 48]} />
      </mesh>
    </group>
  )
}

// sol: núcleo pequeno e estourado (o bloom espalha) + halo largo e fraco; gradiente com ruído pra não formar degraus
function radial(stops: [number, number][]) {
  const S = 512
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const img = g.createImageData(S, S)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const r = Math.hypot(x - S / 2 + 0.5, y - S / 2 + 0.5) / (S / 2)
      let v = 0
      for (let i = 1; i < stops.length; i++)
        if (r <= stops[i][0]) {
          const [r0, v0] = stops[i - 1]
          const [r1, v1] = stops[i]
          v = v0 + (v1 - v0) * ((r - r0) / (r1 - r0))
          break
        }
      const i = (y * S + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
      img.data[i + 3] = Math.max(0, Math.min(255, v * 255 + (Math.random() - 0.5) * 2))
    }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function Sun({ sunDir }: { sunDir: THREE.Vector3 }) {
  const core = useMemo(() => radial([[0, 1], [0.5, 1], [1, 0]]), [])
  const halo = useMemo(() => radial([[0, 0.5], [0.08, 0.28], [0.3, 0.06], [1, 0]]), [])
  const ref = useRef<THREE.Group>(null!)
  useFrame(({ camera }) => ref.current.position.copy(camera.position).addScaledVector(sunDir, 1200))
  return (
    <group ref={ref}>
      <sprite scale={[22, 22, 1]} renderOrder={-7}>
        <spriteMaterial map={core} color={glow('#fffaf2', 12)} transparent depthWrite={false} fog={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <sprite scale={[520, 520, 1]} renderOrder={-8}>
        <spriteMaterial map={halo} color={glow('#ffeedd', 0.9)} transparent depthWrite={false} fog={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </sprite>
    </group>
  )
}

// ---------- estação ----------

// perfil da cúpula: da borda do deck até o anel do topo (quarto de elipse)
function domeCurve() {
  const pts: THREE.Vector2[] = []
  for (let i = 0; i <= 32; i++) {
    const t = (i / 32) * (Math.PI / 2)
    pts.push(new THREE.Vector2(HUB + (RIM - HUB) * Math.cos(t), 1.6 + (TOP - 1.6) * Math.sin(t)))
  }
  return pts
}

function Structure({ theme }: { theme: Theme }) {
  const hull = usePbr('hull', [6, 1], 4)
  const hullWall = usePbr('hull', [40, 1], 4)
  const ribs = useRef<THREE.InstancedMesh>(null!)
  const N = 16
  const { ribGeo, glassGeo } = useMemo(() => {
    const prof = domeCurve()
    const curve = new THREE.CatmullRomCurve3(prof.map((p) => new THREE.Vector3(p.x, p.y, 0)))
    return { ribGeo: new THREE.TubeGeometry(curve, 48, 0.32, 8, false), glassGeo: new THREE.LatheGeometry(prof, 96) }
  }, [])
  const hullMat = useMemo(() => new THREE.MeshStandardMaterial({ ...hull, color: '#c4cad2', metalness: 1, roughness: 0.9 }), [hull])
  const wallMat = useMemo(() => new THREE.MeshStandardMaterial({ ...hullWall, color: '#b4bac2', metalness: 1, roughness: 0.9, side: THREE.DoubleSide }), [hullWall])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    for (let i = 0; i < N; i++) ribs.current.setMatrixAt(i, m.makeRotationY((i / N) * Math.PI * 2))
    ribs.current.instanceMatrix.needsUpdate = true
    ribs.current.computeBoundingSphere()
  }, [])
  const strip = glow(theme.accent, 2.6)
  return (
    <group>
      {/* parede baixa em volta do deck */}
      <mesh position-y={0.8} material={wallMat} receiveShadow>
        <cylinderGeometry args={[RIM, RIM, 1.6, 128, 1, true]} />
      </mesh>
      <mesh position-y={1.6} rotation-x={-Math.PI / 2} material={hullMat}>
        <ringGeometry args={[RIM - 0.4, RIM + 0.5, 128]} />
      </mesh>
      <mesh position-y={1.45} rotation-x={Math.PI / 2}>
        <torusGeometry args={[RIM - 0.45, 0.04, 6, 192]} />
        <meshBasicMaterial color={strip} toneMapped={false} />
      </mesh>
      {/* costelas da cúpula e o vidro entre elas */}
      <instancedMesh ref={ribs} args={[ribGeo, hullMat, N]} castShadow />
      <mesh geometry={glassGeo} renderOrder={2}>
        <meshStandardMaterial color="#cfe0ea" roughness={0.05} metalness={0} transparent opacity={0.05} side={THREE.BackSide} depthWrite={false} />
      </mesh>
      {/* anel do topo */}
      <mesh position-y={TOP} rotation-x={Math.PI / 2} material={hullMat} castShadow>
        <torusGeometry args={[HUB, 0.7, 16, 64]} />
      </mesh>
      <mesh position-y={TOP + 0.4} rotation-x={Math.PI / 2}>
        <circleGeometry args={[HUB, 48]} />
        <meshStandardMaterial color="#20252c" metalness={0.9} roughness={0.4} side={THREE.DoubleSide} />
      </mesh>
      <mesh position-y={TOP - 0.55} rotation-x={Math.PI / 2}>
        <torusGeometry args={[HUB - 0.45, 0.05, 6, 96]} />
        <meshBasicMaterial color={strip} toneMapped={false} />
      </mesh>
    </group>
  )
}

// painéis solares em duas treliças e um módulo acoplado, vistos pela cúpula
function Outside() {
  const solar = usePbr('solar', [6, 2], 4)
  const truss = usePbr('hull', [20, 1], 4)
  const solarMat = useMemo(() => new THREE.MeshStandardMaterial({ ...solar, metalness: 1, roughness: 0.6, side: THREE.DoubleSide }), [solar])
  const trussMat = useMemo(() => new THREE.MeshStandardMaterial({ ...truss, color: '#9aa1aa', metalness: 1, roughness: 0.8 }), [truss])
  const hab = usePbr('hull', [10, 3], 4)
  const habMat = useMemo(() => new THREE.MeshStandardMaterial({ ...hab, color: '#d8dce1', metalness: 1, roughness: 0.85 }), [hab])
  const arm = (deg: number) => (
    <group key={deg} rotation-y={(deg * Math.PI) / 180} position-y={24}>
      <mesh position={[0, 0, -130]} rotation-x={Math.PI / 2} material={trussMat} castShadow>
        <boxGeometry args={[2.2, 200, 2.2]} />
      </mesh>
      {[70, 110, 150, 190].map((z) => (
        <group key={z} position={[0, 0, -z]}>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 17, 0, 0]} rotation={[-Math.PI / 2, 0, 0.25 * s]} material={solarMat} castShadow>
              <planeGeometry args={[30, 34]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
  return (
    <group>
      {arm(60)}
      {arm(-115)}
      {/* módulo habitável acoplado */}
      <group position={[70, 6, 95]} rotation={[0, -0.6, Math.PI / 2]}>
        <mesh material={habMat} castShadow>
          <cylinderGeometry args={[9, 9, 70, 48]} />
        </mesh>
        {[-35, 35].map((y) => (
          <mesh key={y} position-y={y} scale={[1, 0.45, 1]} material={habMat}>
            <sphereGeometry args={[9, 32, 16]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

export function Station({ theme }: { theme: Theme }) {
  const sunDir = useMemo(() => new THREE.Vector3(...(theme.real?.sunDir ?? [-0.8, 0.3, 0.5])).normalize(), [theme])
  return (
    <>
      <Stars />
      <Sun sunDir={sunDir} />
      <Suspense fallback={null}>
        <Earth sunDir={sunDir} />
      </Suspense>
      <Suspense fallback={null}>
        <Structure theme={theme} />
        <Outside />
      </Suspense>
    </>
  )
}
