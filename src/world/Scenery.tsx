import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useLoader, useThree, type ThreeEvent } from '@react-three/fiber'
import { Environment, Lightformer, MeshReflectorMaterial } from '@react-three/drei'
import { Bloom, EffectComposer, N8AO, ToneMapping, Vignette, SMAA } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { player, useUI } from '../store'
import { useRooms } from '../rooms'
import { drag } from '../interact'
import { loadImage } from '../textures'
import { pc } from '../pc'
import { HALL } from '../layout'
import type { Theme } from '../themes'
import { assetUrl, usePbr } from './assets'
import { Office } from './Office'
import { Station } from './Station'
import { Gallery } from './Gallery'

// ---------- céu ----------

// céu de foto 360°: vira o fundo da cena (4k padrão, 6k na qualidade Alta)
function PhotoSky({ url }: { url: string }) {
  const tex = useLoader(THREE.TextureLoader, assetUrl(url))
  const { scene } = useThree()
  useLayoutEffect(() => {
    tex.mapping = THREE.EquirectangularReflectionMapping
    tex.colorSpace = THREE.SRGBColorSpace
    scene.background = tex
    // a foto já vem tratada: compensa o tone mapping de cinema que vem depois
    scene.backgroundIntensity = 1.35
    return () => {
      if (scene.background === tex) scene.background = null
      scene.backgroundIntensity = 1
    }
  }, [tex, scene])
  return null
}

export function Sky({ theme }: { theme: Theme }) {
  const quality = useUI((st) => st.quality)
  const photo = theme.real?.sky
  if (photo)
    return (
      <Suspense fallback={<GradientSky theme={theme} />}>
        <PhotoSky url={quality === 'alta' ? photo.hi : photo.lo} />
      </Suspense>
    )
  // o espaço desenha o próprio céu (Via Láctea e estrelas)
  if (theme.id === 'orbita') return null
  return <GradientSky theme={theme} />
}

function GradientSky({ theme }: { theme: Theme }) {
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
        shadow-mapSize={quality === 'alta' || theme.real ? [2048, 2048] : [1024, 1024]}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-camera-far={260}
        shadow-bias={-0.0003}
        shadow-normalBias={0.03}
      />
      <primitive object={target} />
      {theme.real?.sky ? (
        <Suspense fallback={<StudioEnv theme={theme} />}>
          <InteriorEnv url={theme.real.sky.lo} theme={theme} />
        </Suspense>
      ) : (
        <StudioEnv theme={theme} />
      )}
    </>
  )
}

// Luz e reflexos de dentro da sala: a foto do céu só aparece na faixa das janelas (e na claraboia);
// em cima é o forro escuro e embaixo o piso. Sem isso o chão "reflete o céu" como se não tivesse teto.
const interiorMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: {
    sky: { value: null as THREE.Texture | null },
    ceil: { value: new THREE.Color() },
    floor: { value: new THREE.Color() },
    gain: { value: 2.8 },
    win: { value: 0.27 },
    top: { value: 1.36 },
  },
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize((modelMatrix * vec4(position, 1.0)).xyz); gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D sky; uniform vec3 ceil; uniform vec3 floor; uniform float gain; uniform float win; uniform float top; varying vec3 vD;
    void main(){
      vec3 d = normalize(vD);
      float el = asin(clamp(d.y, -1.0, 1.0));
      vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, el * 0.31830989 + 0.5);
      vec3 photo = texture2D(sky, uv).rgb * gain;
      // janelas: do horizonte até a altura do forro vista do meio do salão; claraboia no zênite
      float band = smoothstep(-0.06, 0.0, el) * (1.0 - smoothstep(win - 0.03, win + 0.03, el));
      float sky_ = smoothstep(top - 0.04, top + 0.04, el);
      vec3 col = el > 0.0 ? ceil : floor;
      col = mix(col, photo, max(band, sky_));
      gl_FragColor = vec4(col, 1.0);
    }`,
})

function InteriorEnv({ url, theme }: { url: string; theme: Theme }) {
  const tex = useLoader(THREE.TextureLoader, assetUrl(url))
  // escritório: forro de nogueira e taco; cada tema realista pode trocar
  const io = theme.real?.interior ?? { ceil: '#5a4535', floor: '#8a6a50', gain: 2.8, win: 0.27, sky: 1.36 }
  // material próprio, já com os valores do tema: o mapa de reflexo é desenhado uma vez só (frames=1),
  // e com um material dividido a troca de ambiente pegava a cor do anterior (reflexo marrom na Galeria)
  const mat = useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace
    const m = interiorMat.clone()
    const u = m.uniforms
    u.sky.value = tex
    u.ceil.value = new THREE.Color(io.ceil)
    u.floor.value = new THREE.Color(io.floor)
    u.gain.value = io.gain
    u.win.value = io.win
    u.top.value = io.sky
    return m
  }, [tex, io.ceil, io.floor, io.gain, io.win, io.sky])
  useEffect(() => () => mat.dispose(), [mat])
  return (
    <Environment resolution={512} frames={1} environmentIntensity={theme.env.intensity} key={theme.id + io.ceil}>
      <mesh material={mat} scale={100}>
        <sphereGeometry args={[1, 64, 32]} />
      </mesh>
    </Environment>
  )
}

// reflexos suaves sem baixar HDR nenhum: o mapa é montado aqui mesmo
function StudioEnv({ theme }: { theme: Theme }) {
  return (
    <>
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

// modo simples: clicou no chão, o avatar anda até lá
const walkClick = (e: ThreeEvent<MouseEvent>) => {
  const ui = useUI.getState()
  if (ui.settings.controls !== 'simples' || ui.focus || ui.panel === 'avatar' || drag.moved || useRooms.getState().build || document.pointerLockElement) return
  e.stopPropagation()
  player.walkTo = { x: e.point.x, z: e.point.z }
}

// piso de material de verdade (taco de madeira, placas de metal)
function RealFloor({ theme }: { theme: Theme }) {
  const real = theme.real!
  const quality = useUI((st) => st.quality)
  const kind = real.floor
  // um ladrilho de textura a cada ~2,7 m (madeira), ~2,4 m (placas) ou ~3 m (concreto)
  const n = (real.floorRadius * 2) / { parquet: 2.7, deck: 2.4, concrete: 3 }[kind]
  const maps = usePbr(kind, [n, n], quality === 'leve' ? 4 : 16)
  // madeira encerada (fosca, reflexo suave), placa de metal pintada (meio metálica) e concreto polido (brilho de cera)
  const props = {
    parquet: { roughness: 1.4, metalness: 1, envMapIntensity: 1 },
    deck: { roughness: 1.2, metalness: 0.55, envMapIntensity: 0.65 },
    concrete: { roughness: 0.55, metalness: 1, envMapIntensity: 0.9 },
  }[kind]
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow onClick={walkClick}>
      <circleGeometry args={[real.floorRadius, 160]} />
      <meshStandardMaterial {...maps} {...props} />
    </mesh>
  )
}

export function Floor({ theme }: { theme: Theme }) {
  if (theme.real)
    return (
      <Suspense fallback={<PlainFloor theme={theme} />}>
        <RealFloor theme={theme} />
      </Suspense>
    )
  return <PlainFloor theme={theme} />
}

function PlainFloor({ theme }: { theme: Theme }) {
  const quality = useUI((st) => st.quality)
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
            color={f.color}
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
      {/* oclusão de ambiente: escurece cantos e o contato dos objetos com o chão (meia resolução na Equilibrada) */}
      <N8AO halfRes quality={quality === 'alta' ? 'medium' : 'performance'} aoRadius={1.6} distanceFalloff={1.2} intensity={theme.real ? 2.4 : 1.6} />
      <SMAA />
      <Bloom mipmapBlur intensity={theme.bloom} luminanceThreshold={theme.bloom ? 1.0 : 10} luminanceSmoothing={0.2} radius={0.7} />
      <Vignette offset={0.3} darkness={theme.dark ? 0.4 : 0.25} />
      <ToneMapping mode={theme.tone === 'neutral' ? ToneMappingMode.NEUTRAL : ToneMappingMode.AGX} />
    </EffectComposer>
  )
}

// ---------- cenários ----------

export function Scenery({ theme }: { theme: Theme }) {
  if (theme.id === 'escritorio') return <Office />
  if (theme.id === 'galeria') return <Gallery />
  return <Station theme={theme} />
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
