// O conteúdo do telão do palco: PDF, imagem, vídeo, janela ao vivo ou site, sempre cabendo sem deformar.
import { createElement, useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { pc } from '../pc'
import { useUI } from '../store'
import { useRooms } from '../rooms'
import { label } from '../textures'
import { useStreams } from '../meet/rtc'
import { canControl, presentSite, srcUrl, usePresent, type Present } from './state'

type Tex = { tex: THREE.Texture; aspect: number }

// resolução das páginas conforme a qualidade escolhida
const PAGE_PX = { leve: [1280, 720], equilibrada: [1920, 1080], alta: [2560, 1440] } as const

// guarda poucas texturas prontas (página atual, a seguinte, a anterior...)
function lru<T extends { tex: THREE.Texture } | null>(max: number) {
  const m = new Map<string, Promise<T>>()
  const get = (key: string, make: () => Promise<T>) => {
    let p = m.get(key)
    if (p) {
      m.delete(key)
      m.set(key, p)
      return p
    }
    p = make()
    m.set(key, p)
    p.catch(() => m.delete(key))
    while (m.size > max) {
      const [k, old] = m.entries().next().value as [string, Promise<T>]
      m.delete(k)
      old.then((t) => t?.tex.dispose()).catch(() => {})
    }
    return p
  }
  const clear = () => {
    for (const p of m.values()) p.then((t) => t?.tex.dispose()).catch(() => {})
    m.clear()
  }
  return Object.assign(get, { clear })
}
const pages = lru<Tex>(5)
const images = lru<Tex>(8)
let pdfUsed = false

// parou ou trocou de tipo: devolve a memória da GPU (páginas e imagens prontas) e fecha o PDF
usePresent.subscribe((s, prev) => {
  const kind = s.state?.kind
  if (kind === prev.state?.kind && kind) return
  if (kind !== 'pdf') {
    pages.clear()
    if (pdfUsed) import('./pdf').then((m) => m.closeAll())
  }
  if (kind !== 'media') images.clear()
})

function pdfPage(url: string, i: number, w: number, h: number) {
  pdfUsed = true
  return pages(`${url}#${i}@${w}`, async () => {
    const c = await (await import('./pdf')).renderPage(url, i, w, h)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return { tex, aspect: c.width / c.height }
  })
}

function image(url: string) {
  return images(url, () =>
    new Promise<Tex>((resolve, reject) => {
      const loader = new THREE.TextureLoader()
      loader.setCrossOrigin('anonymous')
      loader.load(
        url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace
          tex.anisotropy = 4
          const img = tex.image as HTMLImageElement
          resolve({ tex, aspect: img.width / Math.max(1, img.height) })
        },
        undefined,
        reject,
      )
    }),
  )
}

// cabe no telão sem deformar (a sobra fica com o fundo preto)
function Fit({ t, w, h }: { t: Tex | null; w: number; h: number }) {
  if (!t) return null
  const wide = t.aspect > w / h
  return (
    <mesh key={t.tex.uuid} position-z={0.012}>
      <planeGeometry args={[wide ? w : h * t.aspect, wide ? w / t.aspect : h]} />
      <meshBasicMaterial map={t.tex} toneMapped={false} />
    </mesh>
  )
}

// texto no telão (fundo sempre preto: cor fixa, a de destaque do tema pode ser escura)
function Message({ text, sub, w }: { text: string; sub?: string; w: number }) {
  const tex = label(text, { color: '#f4f2ee', w: 1600, h: 300, size: 110, weight: 300, sub, subColor: '#8d939c' })
  return (
    <mesh position-z={0.012}>
      <planeGeometry args={[w * 0.7, w * 0.7 * (300 / 1600)]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} />
    </mesh>
  )
}

// ---------- PDF ----------

function PdfView({ s, w, h }: { s: Extract<Present, { kind: 'pdf' }>; w: number; h: number }) {
  const url = srcUrl(s.src)
  const quality = useUI((st) => st.quality)
  const [px, py] = PAGE_PX[quality]
  const [t, setT] = useState<Tex | null>(null)
  const [error, setError] = useState(false)
  // quem apresenta descobre quantas páginas tem e manda pra sala
  useEffect(() => {
    if (!url || !canControl()) return
    let alive = true
    import('./pdf')
      .then((m) => m.pageCount(url))
      .then((n) => alive && usePresent.getState().setCount(n))
      .catch(() => {})
    return () => void (alive = false)
  }, [url])
  useEffect(() => {
    if (!url) return
    let alive = true
    setError(false)
    pdfPage(url, s.index, px, py)
      .then((p) => {
        if (!alive) return
        setT(p)
        // já deixa a próxima pronta
        if (s.index + 1 < s.count) pdfPage(url, s.index + 1, px, py).catch(() => {})
      })
      .catch(() => alive && setError(true))
    return () => void (alive = false)
  }, [url, s.index, s.count, px, py])
  if (error) return <Message text="Não deu pra abrir o PDF" sub={s.title} w={w} />
  return t ? <Fit t={t} w={w} h={h} /> : <Message text="Carregando..." sub={s.title} w={w} />
}

// ---------- imagens e vídeos ----------

function ImageView({ url, w, h }: { url: string; w: number; h: number }) {
  const [t, setT] = useState<Tex | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let alive = true
    setError(false)
    image(url)
      .then((p) => alive && setT(p))
      .catch(() => alive && setError(true))
    return () => void (alive = false)
  }, [url])
  if (error) return <Message text="Não deu pra abrir a imagem" w={w} />
  return <Fit t={t} w={w} h={h} />
}

function videoTexture(video: HTMLVideoElement) {
  const tex = new THREE.VideoTexture(video)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.generateMipmaps = false
  tex.minFilter = THREE.LinearFilter
  return tex
}

function VideoView({ url, w, h }: { url: string; w: number; h: number }) {
  const muted = usePresent((s) => s.muted)
  const [t, setT] = useState<Tex | null>(null)
  const ref = useRef<HTMLVideoElement | null>(null)
  useEffect(() => {
    const v = document.createElement('video')
    v.crossOrigin = 'anonymous'
    v.playsInline = true
    v.preload = 'auto'
    v.src = url
    ref.current = v
    let tex: THREE.VideoTexture | null = null
    v.onloadedmetadata = () => {
      tex = videoTexture(v)
      setT({ tex, aspect: v.videoWidth / Math.max(1, v.videoHeight) })
    }
    v.muted = usePresent.getState().muted
    // sem gesto do usuário o som pode ser barrado: toca mudo nesse caso
    v.play().catch(() => {
      v.muted = true
      v.play().catch(() => {})
    })
    return () => {
      v.pause()
      v.removeAttribute('src')
      v.load()
      tex?.dispose()
      setT(null)
    }
  }, [url])
  useEffect(() => {
    if (ref.current) ref.current.muted = muted
  }, [muted])
  return <Fit t={t} w={w} h={h} />
}

// ---------- janela ao vivo ----------

function StreamView({ stream, title, w, h }: { stream: MediaStream | null; title: string; w: number; h: number }) {
  const [t, setT] = useState<Tex | null>(null)
  useEffect(() => {
    if (!stream) return
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.srcObject = stream
    let tex: THREE.VideoTexture | null = null
    v.onloadedmetadata = () => {
      tex = videoTexture(v)
      setT({ tex, aspect: v.videoWidth / Math.max(1, v.videoHeight) })
    }
    v.play().catch(() => {})
    return () => {
      v.srcObject = null
      tex?.dispose()
      setT(null)
    }
  }, [stream])
  if (!stream) return <Message text="Conectando na tela..." sub={title} w={w} />
  return <Fit t={t} w={w} h={h} />
}

function WindowView({ s, w, h }: { s: Extract<Present, { kind: 'window' }>; w: number; h: number }) {
  const mine = usePresent((st) => !!st.winId)
  const stream = useStreams((st) => (mine ? st.local : st.remote))
  return <StreamView stream={stream} title={s.title} w={w} h={h} />
}

// ---------- site ----------

type WebviewEl = HTMLElement & { loadURL(u: string): Promise<void>; getURL(): string }
const PX_W = 1600
const wp = new THREE.Vector3()
const wq = new THREE.Quaternion()
const wn = new THREE.Vector3()
const to = new THREE.Vector3()

function SiteView({ s, w, h }: { s: Extract<Present, { kind: 'site' }>; w: number; h: number }) {
  const build = useRooms((st) => st.build)
  const [visible, setVisible] = useState(true)
  const view = useRef<WebviewEl | null>(null)
  const group = useRef<THREE.Group>(null!)
  const tick = useRef(0)
  const first = useRef(s.url).current
  // o HTML fica por cima do 3D: some de costas, longe, construindo, no provador ou usando um app
  useFrame(({ camera }, dt) => {
    tick.current -= dt
    if (tick.current > 0) return
    tick.current = 0.15
    group.current.getWorldPosition(wp)
    group.current.getWorldQuaternion(wq)
    wn.set(0, 0, 1).applyQuaternion(wq)
    to.copy(camera.position).sub(wp).setY(0)
    const ui = useUI.getState()
    const show = !build && to.length() < 70 && to.normalize().dot(wn) > 0.15 && !ui.focus && ui.panel !== 'avatar'
    if (show !== visible) setVisible(show)
  })
  // quem apresenta navega e a sala acompanha; quem assiste segue o endereço
  useEffect(() => {
    const el = view.current
    if (!el || !pc.native) return
    const nav = (e: Event) => {
      const url = (e as unknown as { url: string }).url
      const cur = usePresent.getState().state
      if (canControl() && cur?.kind === 'site' && cur.url !== url) presentSite(url)
    }
    el.addEventListener('did-navigate', nav)
    return () => el.removeEventListener('did-navigate', nav)
  }, [])
  useEffect(() => {
    const el = view.current
    if (!el || !pc.native) return
    try {
      if (el.getURL() !== s.url) el.loadURL(s.url).catch(() => {})
    } catch {}
  }, [s.url])
  const PX_H = Math.round((PX_W * h) / w)
  const frame = pc.native
    ? createElement('webview', { ref: view, src: first, style: { width: '100%', height: '100%', background: '#fff' } })
    : createElement('iframe', { src: first, style: { width: '100%', height: '100%', border: 0, background: '#fff' } })
  return (
    <group ref={group}>
      {!visible && <Message text={s.title} sub="site" w={w} />}
      <Html transform distanceFactor={(w * 400) / PX_W} position-z={0.02} zIndexRange={[20, 0]} style={{ display: visible ? 'block' : 'none' }}>
        <div className="stage-site" style={{ width: PX_W, height: PX_H }} onPointerDown={(e) => e.stopPropagation()}>
          {frame}
        </div>
      </Html>
    </group>
  )
}

// ---------- telão ----------

export function PresentScreen({ w, h }: { w: number; h: number }) {
  const s = usePresent((st) => st.state)
  const busy = usePresent((st) => st.busy)
  if (busy) return <Message text={busy} w={w} />
  if (!s) return <Message text="Apresentação" sub="E NO PÚLPITO PRA MOSTRAR ALGO" w={w} />
  switch (s.kind) {
    case 'pdf':
      return <PdfView s={s} w={w} h={h} />
    case 'media': {
      const slide = s.slides[s.index]
      if (!slide) return null
      const url = srcUrl(slide.src)
      return slide.video ? <VideoView key={url} url={url} w={w} h={h} /> : <ImageView url={url} w={w} h={h} />
    }
    case 'window':
      return <WindowView s={s} w={w} h={h} />
    case 'site':
      return <SiteView key="site" s={s} w={w} h={h} />
  }
}
