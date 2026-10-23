// Galeria: museu de arte contemporânea de pé-direito alto, com o jardim (foto HDRI) lá fora.
// O sol do meio-dia entra pelas claraboias com brises e desenha faixas no concreto polido.
// Os quadros são abstratos gerados aqui mesmo (nada de obra de ninguém), todos num atlas só:
// quadros, molduras, fachos de luz e etiquetas viram 4 draw calls no total.
import { Suspense, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { modelUrl } from './assets'
import { useUI } from '../store'

const R = 46 // parede de fora
const H = 9 // pé-direito
const SLOT = [29, 34] // anel de claraboia com brises
const OCULUS = 10.5 // claraboia redonda do meio
const WELL = 1.3 // altura do poço das claraboias
const D = Math.PI / 180

// ponto no círculo virado pro centro (0° = norte); o +z local aponta pro centro
const at = (deg: number, r: number) => ({ x: Math.sin(deg * D) * r, z: -Math.cos(deg * D) * r, rotY: -deg * D })
// trecho de cilindro entre dois ângulos do mesmo jeito que at() conta
const arc = (center: number, half: number) => [Math.PI - (center + half) * D, 2 * half * D] as const

// vãos de vidro (com escultura) e trechos de parede (com quadros)
const BAYS = [45, 135, 225, 315]
const BAY_HALF = 20
const WALLS = [0, 90, 180, 270]
const WALL_HALF = 25
// paredes soltas que separam os vãos, uma em cada borda de vidro
const FINS = BAYS.flatMap((c) => [c - BAY_HALF, c + BAY_HALF])
const FIN = { r0: 38.8, r1: R - 0.15, h: 5.2, t: 0.32 }

const plaster = new THREE.MeshStandardMaterial({ color: '#f2f0ec', roughness: 0.92, side: THREE.DoubleSide })
const ceilingMat = new THREE.MeshStandardMaterial({ color: '#f4f2ee', roughness: 0.95 })
const gap = new THREE.MeshStandardMaterial({ color: '#37352f', roughness: 0.8 })
const steel = new THREE.MeshStandardMaterial({ color: '#1c1d1f', metalness: 0.7, roughness: 0.38 })
const glass = new THREE.MeshStandardMaterial({ color: '#dbe8ee', roughness: 0.03, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false })
const leather = new THREE.MeshStandardMaterial({ color: '#2a2420', roughness: 0.62 })

function useInstances(ref: RefObject<THREE.InstancedMesh>, mats: THREE.Matrix4[]) {
  useLayoutEffect(() => {
    const im = ref.current!
    mats.forEach((m, i) => im.setMatrixAt(i, m))
    im.instanceMatrix.needsUpdate = true
    im.computeBoundingSphere()
  }, [ref, mats])
}
const place = (x: number, y: number, z: number, rotY = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(sx, sy, sz))

// ---------- paredes e vidro ----------

function Shell() {
  const mullions = useRef<THREE.InstancedMesh>(null!)
  const mullionMats = useMemo(() => {
    const out: THREE.Matrix4[] = []
    for (const c of BAYS) {
      const n = Math.round((2 * BAY_HALF * D * R) / 3.2)
      for (let i = 1; i < n; i++) {
        const p = at(c - BAY_HALF + (i / n) * 2 * BAY_HALF, R)
        out.push(place(p.x, H / 2, p.z, p.rotY))
      }
    }
    return out
  }, [])
  useInstances(mullions, mullionMats)
  const fins = useRef<THREE.InstancedMesh>(null!)
  const finMats = useMemo(
    () =>
      FINS.map((deg) => {
        const p = at(deg, (FIN.r0 + FIN.r1) / 2)
        return place(p.x, FIN.h / 2, p.z, p.rotY)
      }),
    [],
  )
  useInstances(fins, finMats)
  return (
    <group>
      {WALLS.map((c) => (
        <group key={c}>
          <mesh position-y={H / 2} material={plaster} castShadow receiveShadow>
            <cylinderGeometry args={[R, R, H, 40, 1, true, ...arc(c, WALL_HALF)]} />
          </mesh>
          {/* friso escuro no pé da parede (a parede "flutua" do piso) */}
          <mesh position-y={0.04} material={gap}>
            <cylinderGeometry args={[R - 0.02, R - 0.02, 0.08, 40, 1, true, ...arc(c, WALL_HALF)]} />
          </mesh>
        </group>
      ))}
      {BAYS.map((c) => (
        <group key={c}>
          <mesh position-y={H / 2} material={glass} renderOrder={2}>
            <cylinderGeometry args={[R, R, H, 40, 1, true, ...arc(c, BAY_HALF)]} />
          </mesh>
          {[0.05, H - 0.05].map((y) => (
            <mesh key={y} position-y={y} material={steel}>
              <cylinderGeometry args={[R - 0.04, R - 0.04, 0.1, 40, 1, true, ...arc(c, BAY_HALF)]} />
            </mesh>
          ))}
        </group>
      ))}
      <instancedMesh ref={mullions} args={[undefined, steel, mullionMats.length]} castShadow>
        <boxGeometry args={[0.06, H, 0.14]} />
      </instancedMesh>
      <instancedMesh ref={fins} args={[undefined, plaster, FINS.length]} castShadow receiveShadow>
        <boxGeometry args={[FIN.t, FIN.h, FIN.r1 - FIN.r0]} />
      </instancedMesh>
    </group>
  )
}

// ---------- forro com claraboias e brises ----------

function Ceiling() {
  const slotFins = useRef<THREE.InstancedMesh>(null!)
  const slotMats = useMemo(() => {
    const out: THREE.Matrix4[] = []
    const mid = (SLOT[0] + SLOT[1]) / 2
    for (let deg = 0; deg < 360; deg += 2.5) {
      const p = at(deg, mid)
      out.push(place(p.x, H + WELL / 2, p.z, p.rotY))
    }
    return out
  }, [])
  useInstances(slotFins, slotMats)
  // brises paralelos na claraboia do meio, cada um do tamanho da corda
  const louvers = useRef<THREE.InstancedMesh>(null!)
  const louverMats = useMemo(() => {
    const out: THREE.Matrix4[] = []
    for (let x = -OCULUS + 0.75; x < OCULUS; x += 1.05) {
      const len = 2 * Math.sqrt(Math.max(0, OCULUS * OCULUS - x * x))
      out.push(place(x, H + WELL / 2, 0, 0, 1, 1, len))
    }
    return out
  }, [])
  useInstances(louvers, louverMats)
  return (
    <group>
      {/* forro branco (olhando pra baixo), com o anel da claraboia aberto */}
      {[
        [OCULUS, SLOT[0]],
        [SLOT[1], R + 0.3],
      ].map(([a, b]) => (
        <mesh key={a} position-y={H} rotation-x={Math.PI / 2} material={ceilingMat} castShadow receiveShadow>
          <ringGeometry args={[a, b, 160, 1]} />
        </mesh>
      ))}
      {/* poços das claraboias */}
      {[OCULUS, SLOT[0], SLOT[1]].map((r) => (
        <mesh key={r} position-y={H + WELL / 2} material={plaster} castShadow receiveShadow>
          <cylinderGeometry args={[r, r, WELL, 128, 1, true]} />
        </mesh>
      ))}
      <instancedMesh ref={slotFins} args={[undefined, plaster, slotMats.length]} castShadow>
        <boxGeometry args={[0.1, WELL, SLOT[1] - SLOT[0]]} />
      </instancedMesh>
      <instancedMesh ref={louvers} args={[undefined, plaster, louverMats.length]} castShadow>
        <boxGeometry args={[0.1, WELL, 1]} />
      </instancedMesh>
      {/* vidro em cima das claraboias */}
      <mesh position-y={H + WELL} rotation-x={Math.PI / 2} material={glass}>
        <circleGeometry args={[OCULUS, 96]} />
      </mesh>
      <mesh position-y={H + WELL} rotation-x={Math.PI / 2} material={glass}>
        <ringGeometry args={[SLOT[0], SLOT[1], 160, 1]} />
      </mesh>
      {/* trilho de luz que acompanha as paredes de quadros */}
      <mesh position-y={H - 0.03} rotation-x={Math.PI / 2} material={steel}>
        <torusGeometry args={[TRACK_R, 0.035, 6, 220]} />
      </mesh>
    </group>
  )
}

// ---------- quadros ----------

type Frame = 'wrap' | 'black' | 'oak'
type Piece = { m: THREE.Matrix4; w: number; h: number; frame: Frame; style: number; seed: number; spot: THREE.Vector3 }
const TRACK_R = 41

// onde vai cada quadro: 3 por trecho de parede e 1 em cada face das paredes soltas
function layout(): Piece[] {
  const out: Piece[] = []
  let k = 0
  const frames: Frame[] = ['wrap', 'black', 'wrap', 'oak', 'black', 'wrap']
  const spotAt = (deg: number) => {
    const p = at(deg, TRACK_R)
    return new THREE.Vector3(p.x, H - 0.12, p.z)
  }
  for (const c of WALLS)
    for (const [off, w, h] of [
      [-15.5, 3.9, 2.8],
      [0, 5.6, 3.7],
      [15.5, 3.1, 3.9],
    ]) {
      const p = at(c + off, R - 0.06)
      out.push({ m: place(p.x, 1.15 + h / 2, p.z, p.rotY), w, h, frame: frames[k % 6], style: k % 8, seed: 11 + k * 7, spot: spotAt(c + off) })
      k++
    }
  for (const deg of FINS)
    for (const side of [1, -1]) {
      const r = (FIN.r0 + FIN.r1) / 2 + 0.6
      const p = at(deg, r)
      // sai da face da parede solta, de frente pro vão vizinho
      const nx = Math.cos(deg * D) * side
      const nz = Math.sin(deg * D) * side
      const off = FIN.t / 2 + 0.01
      const [w, h] = k % 2 ? [2.7, 3.4] : [3.4, 2.5]
      out.push({
        m: place(p.x + nx * off, 1.25 + h / 2, p.z + nz * off, p.rotY + (side * Math.PI) / 2),
        w,
        h,
        frame: frames[(k + 3) % 6],
        style: k % 8,
        seed: 11 + k * 7,
        spot: spotAt(deg + side * 3.2),
      })
      k++
    }
  return out
}

const PALETTES = [
  ['#e9e3d6', '#c2462f', '#1f3a5f', '#e0b04a', '#1c1c1c'],
  ['#f1ece4', '#2d5d62', '#d7a37a', '#8a3b2e', '#20211f'],
  ['#ebe7e0', '#3a4a8a', '#e6b8a2', '#f2d16b', '#141414'],
  ['#1b1d22', '#c8a96a', '#e9e4d8', '#6f2f2f', '#3f6c73'],
  ['#efe9df', '#d4572d', '#4c7a5a', '#e9c46a', '#262626'],
  ['#20242b', '#7fb3c8', '#e4ded2', '#d1495b', '#edae49'],
]

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

// um abstrato no retângulo (x, y, w, h) do atlas
function paint(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, style: number, seed: number) {
  const r = rng(seed)
  const pal = PALETTES[seed % PALETTES.length]
  const pick = () => pal[1 + Math.floor(r() * (pal.length - 1))]
  g.save()
  g.beginPath()
  g.rect(x, y, w, h)
  g.clip()
  g.translate(x, y)
  g.fillStyle = pal[0]
  g.fillRect(0, 0, w, h)
  if (style === 0) {
    // campos de cor empilhados, bordas desfocadas
    g.fillStyle = pal[3]
    g.fillRect(0, 0, w, h)
    g.filter = `blur(${w * 0.012}px)`
    const n = 2 + Math.floor(r() * 2)
    for (let i = 0; i < n; i++) {
      g.fillStyle = pick()
      g.globalAlpha = 0.9
      g.fillRect(w * 0.08, h * (0.06 + (i * 0.88) / n), w * 0.84, (h * 0.88) / n - h * 0.05)
    }
  } else if (style === 1) {
    // geometria: círculos, meias-luas e barras
    for (let i = 0; i < 6; i++) {
      g.fillStyle = pick()
      const cx = r() * w
      const cy = r() * h
      const rad = (0.12 + r() * 0.3) * Math.min(w, h)
      g.beginPath()
      if (r() > 0.5) g.arc(cx, cy, rad, 0, Math.PI * 2)
      else g.arc(cx, cy, rad, r() * Math.PI, r() * Math.PI + Math.PI)
      g.fill()
    }
    g.fillStyle = pal[4]
    g.fillRect(w * (0.1 + r() * 0.6), 0, w * 0.025, h)
  } else if (style === 2) {
    // linhas que ondulam sobre fundo escuro
    g.fillStyle = pal[4]
    g.fillRect(0, 0, w, h)
    const a = pick()
    const b = pick()
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = i % 2 ? a : b
      g.globalAlpha = 0.25 + r() * 0.6
      g.lineWidth = 1 + r() * 2.5
      g.beginPath()
      const f = 1.5 + r() * 2
      const ph = r() * 6
      for (let px = 0; px <= w; px += 6) {
        const py = h * (0.15 + (i / 70) * 0.7) + Math.sin((px / w) * Math.PI * f + ph) * h * 0.08
        if (px) g.lineTo(px, py)
        else g.moveTo(px, py)
      }
      g.stroke()
    }
  } else if (style === 3) {
    // grade irregular com poucos campos coloridos
    const cols = [0, ...Array.from({ length: 3 }, () => 0.15 + r() * 0.7).sort(), 1]
    const rows = [0, ...Array.from({ length: 3 }, () => 0.15 + r() * 0.7).sort(), 1]
    for (let i = 0; i < cols.length - 1; i++)
      for (let j = 0; j < rows.length - 1; j++)
        if (r() < 0.28) {
          g.fillStyle = pick()
          g.fillRect(cols[i] * w, rows[j] * h, (cols[i + 1] - cols[i]) * w, (rows[j + 1] - rows[j]) * h)
        }
    g.fillStyle = pal[4]
    const lw = Math.min(w, h) * 0.018
    for (const c of cols.slice(1, -1)) g.fillRect(c * w - lw / 2, 0, lw, h)
    for (const c of rows.slice(1, -1)) g.fillRect(0, c * h - lw / 2, w, lw)
  } else if (style === 4) {
    // manchas de luz que se misturam
    g.fillStyle = pal[4]
    g.fillRect(0, 0, w, h)
    g.globalCompositeOperation = 'screen'
    for (let i = 0; i < 5; i++) {
      const cx = r() * w
      const cy = r() * h
      const rad = (0.3 + r() * 0.4) * Math.max(w, h)
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rad)
      gr.addColorStop(0, pick())
      gr.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = gr
      g.fillRect(0, 0, w, h)
    }
  } else if (style === 5) {
    // pinceladas horizontais de uma cor só
    const base = pick()
    g.fillStyle = base
    g.fillRect(0, 0, w, h)
    for (let i = 0; i < 420; i++) {
      g.fillStyle = r() > 0.5 ? pal[0] : pal[4]
      g.globalAlpha = 0.04 + r() * 0.1
      g.fillRect(r() * w - w * 0.2, r() * h, w * (0.2 + r() * 0.5), 2 + r() * h * 0.03)
    }
  } else if (style === 6) {
    // anéis concêntricos tortos (curvas de nível)
    const cx = w * (0.3 + r() * 0.4)
    const cy = h * (0.3 + r() * 0.4)
    const c1 = pick()
    for (let i = 26; i > 0; i--) {
      g.fillStyle = i % 2 ? c1 : pal[0]
      g.beginPath()
      for (let t = 0; t <= 64; t++) {
        const a = (t / 64) * Math.PI * 2
        const rr = i * Math.max(w, h) * 0.03 * (1 + 0.12 * Math.sin(a * 3 + i * 0.4) + 0.06 * Math.sin(a * 5 - i))
        const px = cx + Math.cos(a) * rr
        const py = cy + Math.sin(a) * rr
        if (t) g.lineTo(px, py)
        else g.moveTo(px, py)
      }
      g.fill()
    }
  } else {
    // um campo de cor com uma faixa vertical fina
    g.fillStyle = pick()
    g.fillRect(0, 0, w, h)
    g.fillStyle = pal[0]
    g.fillRect(w * (0.3 + r() * 0.4), 0, w * 0.018, h)
  }
  g.restore()
}

// textura de tela (trama fina) por cima de tudo
function grain(g: CanvasRenderingContext2D, W: number, H_: number) {
  const n = document.createElement('canvas')
  n.width = n.height = 128
  const ng = n.getContext('2d')!
  const img = ng.createImageData(128, 128)
  const r = rng(5)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 110 + r() * 40 + ((i / 4) % 2 ? 8 : -8)
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  ng.putImageData(img, 0, 0)
  g.save()
  g.globalCompositeOperation = 'overlay'
  g.globalAlpha = 0.18
  g.fillStyle = g.createPattern(n, 'repeat')!
  g.fillRect(0, 0, W, H_)
  g.restore()
}

const ATLAS = { cols: 7, rows: 4 }
let atlasCache: { tex: THREE.CanvasTexture; size: number } | null = null
function atlas(pieces: Piece[], size: number) {
  if (atlasCache?.size === size) return atlasCache.tex
  atlasCache?.tex.dispose()
  const c = document.createElement('canvas')
  c.width = size
  c.height = size / 2
  const g = c.getContext('2d')!
  const cw = c.width / ATLAS.cols
  const ch = c.height / ATLAS.rows
  pieces.forEach((p, i) => {
    const cell = cellOf(i, p, cw, ch)
    paint(g, cell.x, cell.y, cell.w, cell.h, p.style, p.seed)
  })
  grain(g, c.width, c.height)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  atlasCache = { tex, size }
  return tex
}
// cada quadro ocupa uma célula, no formato dele (com folga pra não vazar no mipmap)
function cellOf(i: number, p: Piece, cw: number, ch: number) {
  const pad = 6
  const k = Math.min((cw - pad * 2) / p.w, (ch - pad * 2) / p.h)
  const w = p.w * k
  const h = p.h * k
  return { x: (i % ATLAS.cols) * cw + (cw - w) / 2, y: Math.floor(i / ATLAS.cols) * ch + (ch - h) / 2, w, h }
}

const FRAME_COLOR: Record<Frame, string> = { wrap: '#e9e4da', black: '#161616', oak: '#a27c55' }

function paintedGeometry(pieces: Piece[], size: number) {
  const cw = size / ATLAS.cols
  const ch = size / 2 / ATLAS.rows
  const fronts: THREE.BufferGeometry[] = []
  const bodies: THREE.BufferGeometry[] = []
  const pools: THREE.BufferGeometry[] = []
  const labels: THREE.BufferGeometry[] = []
  const col = new THREE.Color()
  const tint = (geo: THREE.BufferGeometry, hex: string) => {
    col.set(hex)
    const n = geo.attributes.position.count
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) col.toArray(arr, i * 3)
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
    return geo
  }
  pieces.forEach((p, i) => {
    const cell = cellOf(i, p, cw, ch)
    const depth = p.frame === 'wrap' ? 0.045 : 0.04
    // na moldura de carvalho a pintura fica na frente do passe-partout
    const face = p.frame === 'oak' ? depth + 0.016 : depth + 0.002
    // a pintura (frente) com o UV da célula dela no atlas
    const front = new THREE.PlaneGeometry(p.w, p.h)
    const uv = front.attributes.uv as THREE.BufferAttribute
    for (let k = 0; k < uv.count; k++) {
      const u = (cell.x + uv.getX(k) * cell.w) / size
      const v = 1 - (cell.y + (1 - uv.getY(k)) * cell.h) / (size / 2)
      uv.setXY(k, u, v)
    }
    front.translate(0, 0, face)
    fronts.push(front.applyMatrix4(p.m))
    // corpo: lateral da tela, moldura preta fina ou moldura de carvalho com passe-partout
    if (p.frame === 'oak') {
      bodies.push(tint(new THREE.BoxGeometry(p.w + 0.5, p.h + 0.5, 0.05).translate(0, 0, 0.025), FRAME_COLOR.oak).applyMatrix4(p.m))
      bodies.push(tint(new THREE.BoxGeometry(p.w + 0.38, p.h + 0.38, 0.01).translate(0, 0, depth + 0.006), '#f3f0ea').applyMatrix4(p.m))
    } else {
      const b = p.frame === 'black' ? 0.05 : 0
      bodies.push(tint(new THREE.BoxGeometry(p.w + b, p.h + b, depth).translate(0, 0, depth / 2), FRAME_COLOR[p.frame]).applyMatrix4(p.m))
    }
    // facho do spot na parede, um pouco maior que o quadro e puxado pra cima
    pools.push(new THREE.PlaneGeometry(p.w + 2.2, p.h + 2.6).translate(0, 0.45, 0.004).applyMatrix4(p.m))
    // etiqueta ao lado, na altura dos olhos
    const side = p.w / 2 + 0.35 + (p.frame === 'oak' ? 0.25 : 0)
    const lift = 1.45 - p.m.elements[13] // elements[13] = altura do centro do quadro
    labels.push(new THREE.PlaneGeometry(0.2, 0.13).translate(side, lift, 0.006).applyMatrix4(p.m))
  })
  const merge = (list: THREE.BufferGeometry[]) => {
    const g = mergeGeometries(list)!
    list.forEach((x) => x.dispose())
    return g
  }
  return { front: merge(fronts), body: merge(bodies), pool: merge(pools), label: merge(labels) }
}

function poolTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  // facho de spot: mais forte em cima (perto da luz), cai em elipse
  const gr = g.createRadialGradient(128, 110, 0, 128, 128, 128)
  gr.addColorStop(0, 'rgba(255,244,228,0.95)')
  gr.addColorStop(0.45, 'rgba(255,240,220,0.45)')
  gr.addColorStop(1, 'rgba(255,240,220,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 256, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
function labelTexture() {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 84
  const g = c.getContext('2d')!
  g.fillStyle = '#f7f6f3'
  g.fillRect(0, 0, 128, 84)
  g.fillStyle = '#2a2a2a'
  g.fillRect(12, 14, 70, 7)
  g.fillStyle = '#8a8884'
  for (const [y, w] of [
    [32, 96],
    [44, 84],
    [56, 60],
  ])
    g.fillRect(12, y, w, 4)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function Art() {
  const quality = useUI((s) => s.quality)
  const size = quality === 'leve' ? 2048 : 4096
  const pieces = useMemo(layout, [])
  const tex = useMemo(() => atlas(pieces, size), [pieces, size])
  const geo = useMemo(() => paintedGeometry(pieces, size), [pieces, size])
  useLayoutEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo])
  const mats = useMemo(
    () => ({
      front: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82 }),
      body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }),
      pool: new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: true }),
      label: new THREE.MeshStandardMaterial({ map: labelTexture(), roughness: 0.7 }),
    }),
    [tex],
  )
  useLayoutEffect(
    () => () => {
      mats.front.dispose()
      mats.body.dispose()
      mats.pool.map?.dispose()
      mats.pool.dispose()
      mats.label.map?.dispose()
      mats.label.dispose()
    },
    [mats],
  )
  // um spot no trilho mirando cada quadro
  const spots = useRef<THREE.InstancedMesh>(null!)
  const spotMats = useMemo(() => {
    const tmp = new THREE.Object3D()
    const target = new THREE.Vector3()
    return pieces.map((p) => {
      tmp.position.copy(p.spot)
      target.setFromMatrixPosition(p.m)
      tmp.lookAt(target)
      tmp.updateMatrix()
      return tmp.matrix.clone()
    })
  }, [pieces])
  useInstances(spots, spotMats)
  const spotGeo = useMemo(() => new THREE.CylinderGeometry(0.06, 0.075, 0.24, 14).rotateX(Math.PI / 2).translate(0, 0, 0.08), [])
  return (
    <group>
      <mesh geometry={geo.front} material={mats.front} receiveShadow />
      <mesh geometry={geo.body} material={mats.body} castShadow receiveShadow />
      <mesh geometry={geo.pool} material={mats.pool} renderOrder={1} />
      <mesh geometry={geo.label} material={mats.label} />
      <instancedMesh ref={spots} args={[spotGeo, steel, pieces.length]} />
    </group>
  )
}

// ---------- esculturas, bancos e plantas ----------

// modelo do Poly Haven ajustado pra uma altura (cada um vem numa escala)
function Statue({ id, height, deg, r, turn = 0 }: { id: string; height: number; deg: number; r: number; turn?: number }) {
  const { scene } = useGLTF(modelUrl(id))
  const obj = useMemo(() => {
    const c = scene.clone(true)
    const box = new THREE.Box3().setFromObject(c)
    const s = height / Math.max(0.01, box.max.y - box.min.y)
    c.scale.setScalar(s)
    const mid = box.getCenter(new THREE.Vector3())
    c.position.set(-mid.x * s, -box.min.y * s, -mid.z * s)
    c.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.castShadow = true
        m.receiveShadow = true
      }
    })
    return c
  }, [scene, height])
  const p = at(deg, r)
  const plinth = 1.1
  return (
    <group position={[p.x, 0, p.z]} rotation-y={p.rotY + turn}>
      <mesh position-y={plinth / 2} material={plaster} castShadow receiveShadow>
        <boxGeometry args={[1.3, plinth, 1.3]} />
      </mesh>
      <mesh position-y={0.015} material={gap}>
        <boxGeometry args={[1.28, 0.03, 1.28]} />
      </mesh>
      <primitive object={obj} position-y={plinth} />
    </group>
  )
}

function Plant({ deg, r }: { deg: number; r: number }) {
  const { scene } = useGLTF(modelUrl('potted_plant_01'))
  const obj = useMemo(() => {
    const c = scene.clone(true)
    c.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) m.castShadow = m.receiveShadow = true
    })
    return c
  }, [scene])
  const p = at(deg, r)
  return <primitive object={obj} position={[p.x, 0, p.z]} rotation-y={deg} />
}

function Bench({ deg }: { deg: number }) {
  const p = at(deg, 40.4)
  return (
    <group position={[p.x, 0, p.z]} rotation-y={p.rotY}>
      <mesh position-y={0.42} material={leather} castShadow receiveShadow>
        <boxGeometry args={[2.6, 0.1, 0.62]} />
      </mesh>
      {[-1.05, 1.05].map((x) => (
        <mesh key={x} position={[x, 0.19, 0]} material={steel} castShadow>
          <boxGeometry args={[0.05, 0.38, 0.56]} />
        </mesh>
      ))}
    </group>
  )
}

function Furnishings() {
  return (
    <>
      {/* um pouco fora do eixo do vão: quem chega pelo meio vê a escultura e o jardim atrás */}
      <Statue id="marble_bust_01" height={1.15} deg={BAYS[0] + 7} r={40.5} turn={Math.PI + 0.3} />
      <Statue id="horse_statue_01" height={1.5} deg={BAYS[1] - 7} r={40.5} turn={Math.PI * 0.75} />
      <Statue id="bronze_whale_statue" height={1.35} deg={BAYS[2] + 7} r={40.5} turn={Math.PI * 0.6} />
      <Statue id="bronze_ray_statue" height={1.3} deg={BAYS[3] - 7} r={40.5} turn={Math.PI * 1.2} />
      {BAYS.flatMap((c) => [c - 13, c + 13]).map((deg) => (
        <Plant key={deg} deg={deg} r={44.4} />
      ))}
    </>
  )
}

export function Gallery() {
  return (
    <group>
      <Shell />
      <Ceiling />
      <Art />
      {WALLS.map((c) => (
        <Bench key={c} deg={c} />
      ))}
      <Suspense fallback={null}>
        <Furnishings />
      </Suspense>
    </group>
  )
}
