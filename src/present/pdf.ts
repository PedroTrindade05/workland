// PDF da apresentação desenhado com o pdf.js (módulo carregado só quando alguém abre um PDF)
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const docs = new Map<string, Promise<pdfjs.PDFDocumentProxy>>()

function open(url: string) {
  let p = docs.get(url)
  if (!p) {
    p = pdfjs.getDocument({ url, isEvalSupported: false }).promise
    docs.set(url, p)
    // só os dois últimos PDFs ficam abertos
    if (docs.size > 2) {
      const [old, doc] = docs.entries().next().value as [string, Promise<pdfjs.PDFDocumentProxy>]
      docs.delete(old)
      doc.then((d) => d.destroy()).catch(() => {})
    }
    p.catch(() => docs.delete(url))
  }
  return p
}

export function closeAll() {
  for (const p of docs.values()) p.then((d) => d.destroy()).catch(() => {})
  docs.clear()
}

export async function pageCount(url: string) {
  return (await open(url)).numPages
}

// página n (0 = primeira) cabendo em maxW x maxH pixels, fundo branco
export async function renderPage(url: string, n: number, maxW: number, maxH: number) {
  const doc = await open(url)
  const page = await doc.getPage(Math.min(doc.numPages, n + 1))
  const base = page.getViewport({ scale: 1 })
  const vp = page.getViewport({ scale: Math.min(maxW / base.width, maxH / base.height) })
  const c = document.createElement('canvas')
  c.width = Math.round(vp.width)
  c.height = Math.round(vp.height)
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, c.width, c.height)
  await page.render({ canvasContext: g, viewport: vp }).promise
  page.cleanup()
  return c
}
