// Ponte com o macOS (via koffi): listar janelas (CoreGraphics), apps instalados, ícones e o que está tocando.
// Usar um app "de dentro" do telão funciona diferente do Windows: em vez de esconder a janela atrás do
// Workland e mandar mouse/teclado, a janela real vem pra frente encaixada exatamente em cima do telão
// (Acessibilidade). Clicar fora dela, ou Option+Q, devolve a janela pro lugar e volta pro mundo.
const koffi = require('koffi')
const { app, nativeImage, systemPreferences } = require('electron')
const path = require('path')
const fs = require('fs/promises')
const os = require('os')
const { execFile, spawn } = require('child_process')

const CF = koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')
const CG = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics')
const AX = koffi.load('/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices')

const CGPoint = koffi.struct('CGPoint', { x: 'double', y: 'double' })
const CGSize = koffi.struct('CGSize', { width: 'double', height: 'double' })

const CFArrayGetCount = CF.func('long CFArrayGetCount(void *a)')
const CFArrayGetValueAtIndex = CF.func('void *CFArrayGetValueAtIndex(void *a, long i)')
const CFDictionaryGetValue = CF.func('void *CFDictionaryGetValue(void *d, void *k)')
const CFStringCreateWithCString = CF.func('void *CFStringCreateWithCString(void *alloc, const char *s, uint32 enc)')
const CFStringGetCString = CF.func('bool CFStringGetCString(void *s, _Out_ uint8 *buf, long size, uint32 enc)')
const CFNumberGetValue = CF.func('bool CFNumberGetValue(void *n, int type, _Out_ double *out)')
const CFBooleanGetValue = CF.func('bool CFBooleanGetValue(void *b)')
const CFRetain = CF.func('void *CFRetain(void *x)')
const CFRelease = CF.func('void CFRelease(void *x)')
// symbol() devolve o endereço da variável global; o CFBoolean é o valor guardado nela
const kCFBooleanTrue = koffi.decode(CF.symbol('kCFBooleanTrue', 'void *'), 'void *')
const kCFBooleanFalse = koffi.decode(CF.symbol('kCFBooleanFalse', 'void *'), 'void *')

const CGWindowListCopyWindowInfo = CG.func('void *CGWindowListCopyWindowInfo(uint32 opt, uint32 rel)')

const AXUIElementCreateApplication = AX.func('void *AXUIElementCreateApplication(int pid)')
const AXUIElementCopyAttributeValue = AX.func('int AXUIElementCopyAttributeValue(void *el, void *attr, _Out_ void **out)')
const AXUIElementSetAttributeValue = AX.func('int AXUIElementSetAttributeValue(void *el, void *attr, void *value)')
const AXUIElementPerformAction = AX.func('int AXUIElementPerformAction(void *el, void *action)')
const AXUIElementSetMessagingTimeout = AX.func('int AXUIElementSetMessagingTimeout(void *el, float secs)')
const AXValueCreatePoint = AX.func('void *AXValueCreate(int type, CGPoint *p)')
const AXValueCreateSize = AX.func('void *AXValueCreate(int type, CGSize *s)')
const AXValueGetPoint = AX.func('bool AXValueGetValue(void *v, int type, _Out_ CGPoint *p)')
const AXValueGetSize = AX.func('bool AXValueGetValue(void *v, int type, _Out_ CGSize *s)')
// privada, mas estável há anos: liga o elemento de Acessibilidade ao número da janela (CGWindowID)
const AXUIElementGetWindow = AX.func('int _AXUIElementGetWindow(void *el, _Out_ uint32 *wid)')

const UTF8 = 0x08000100
const cfs = (s) => CFStringCreateWithCString(null, s, UTF8)
const K = {
  num: cfs('kCGWindowNumber'),
  pid: cfs('kCGWindowOwnerPID'),
  owner: cfs('kCGWindowOwnerName'),
  name: cfs('kCGWindowName'),
  layer: cfs('kCGWindowLayer'),
  alpha: cfs('kCGWindowAlpha'),
  onscreen: cfs('kCGWindowIsOnscreen'),
  bounds: cfs('kCGWindowBounds'),
  W: cfs('Width'),
  H: cfs('Height'),
  windows: cfs('AXWindows'),
  position: cfs('AXPosition'),
  size: cfs('AXSize'),
  minimized: cfs('AXMinimized'),
  frontmost: cfs('AXFrontmost'),
  main: cfs('AXMain'),
  raise: cfs('AXRaise'),
}

function cfString(ref) {
  if (!ref) return ''
  const buf = Buffer.alloc(2048)
  return CFStringGetCString(ref, buf, buf.length, UTF8) ? buf.toString('utf8', 0, buf.indexOf(0)) : ''
}
function cfNumber(ref) {
  if (!ref) return 0
  const out = [0]
  CFNumberGetValue(ref, 13, out)
  return out[0]
}

// alguns apps (WhatsApp) trazem marca invisível de direção do texto no nome
const clean = (s) => (s || '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim()

function idOf(sourceId) {
  const m = /^window:(\d+):/.exec(sourceId || '')
  return m ? Number(m[1]) : 0
}

function run(file, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { maxBuffer: 32 * 1024 * 1024, ...opts }, (err, stdout) => resolve(err ? '' : stdout))
  })
}

// ---------- apps rodando: pid -> pacote .app (o caminho do executável às vezes é um clone temporário) ----------

let running = new Map()
async function refreshRunning() {
  const raw = await run('lsappinfo', ['list'])
  const next = new Map()
  let cur = null
  for (const line of raw.split('\n')) {
    const head = /^\s*\d+\) "(.*)" ASN:/.exec(line)
    if (head) cur = { name: head[1] }
    const bp = /^\s*bundle path="(.*)"/.exec(line)
    if (bp && cur) cur.bundle = bp[1]
    const pid = /^\s*pid = (\d+)/.exec(line)
    if (pid && cur) next.set(Number(pid[1]), cur)
  }
  running = next
}

// ---------- quais janelas aparecem no salão ----------

const NOT_APPS = new Set(['Window Server', 'Dock', 'Control Center', 'Central de Controle', 'Notification Center', 'Central de Notificações', 'SystemUIServer', 'Spotlight', 'WindowManager', 'Screenshot', 'Captura de Tela'])

function rawWindows() {
  // na tela e sem elementos da mesa (papel de parede, ícones do Finder); camada 0 = janelas normais
  const arr = CGWindowListCopyWindowInfo(1 | 16, 0)
  if (!arr) return []
  const out = []
  try {
    const n = CFArrayGetCount(arr)
    for (let i = 0; i < n; i++) {
      const d = CFArrayGetValueAtIndex(arr, i)
      if (cfNumber(CFDictionaryGetValue(d, K.layer)) !== 0) continue
      if (cfNumber(CFDictionaryGetValue(d, K.alpha)) <= 0) continue
      const b = CFDictionaryGetValue(d, K.bounds)
      const w = cfNumber(CFDictionaryGetValue(b, K.W))
      const h = cfNumber(CFDictionaryGetValue(b, K.H))
      if (w < 240 || h < 160) continue
      out.push({
        wid: cfNumber(CFDictionaryGetValue(d, K.num)),
        pid: cfNumber(CFDictionaryGetValue(d, K.pid)),
        owner: cfString(CFDictionaryGetValue(d, K.owner)),
        name: cfString(CFDictionaryGetValue(d, K.name)),
      })
    }
  } finally {
    CFRelease(arr)
  }
  return out
}

const pidOf = new Map()
async function listWindows() {
  const list = rawWindows().filter((w) => w.pid !== process.pid && !NOT_APPS.has(w.owner))
  if (list.some((w) => !running.has(w.pid))) await refreshRunning()
  return list.map((w) => {
    pidOf.set(w.wid, w.pid)
    const r = running.get(w.pid)
    const owner = clean(r?.name || w.owner)
    const title = clean(w.name)
    // sem título (ou sem permissão de Gravação de Tela) fica o nome do app; título que já cita o app fica como está
    const name = !title ? owner : title.includes(owner) ? title : `${title} - ${owner}`
    return { id: `window:${w.wid}:0`, name, minimized: false, exe: r?.bundle?.endsWith('.app') ? r.bundle : null }
  })
}

// ---------- Acessibilidade: achar, mover e trazer a janela ----------

const trusted = (prompt = false) => systemPreferences.isTrustedAccessibilityClient(prompt)

function axGet(el, attr) {
  const out = [null]
  return AXUIElementCopyAttributeValue(el, attr, out) === 0 ? out[0] : null
}

// elemento da janela (precisa de CFRelease) e do app dono
function axWindow(wid) {
  const pid = pidOf.get(wid)
  if (!pid || !trusted()) return null
  const appEl = AXUIElementCreateApplication(pid)
  if (!appEl) return null
  AXUIElementSetMessagingTimeout(appEl, 1)
  const arr = axGet(appEl, K.windows)
  let found = null
  if (arr) {
    for (let i = 0, n = CFArrayGetCount(arr); i < n; i++) {
      const el = CFArrayGetValueAtIndex(arr, i)
      const id = [0]
      if (AXUIElementGetWindow(el, id) === 0 && id[0] === wid) {
        found = CFRetain(el)
        break
      }
    }
    CFRelease(arr)
  }
  if (!found) {
    CFRelease(appEl)
    return null
  }
  return { el: found, app: appEl, pid }
}
const freeWin = (w) => {
  CFRelease(w.el)
  CFRelease(w.app)
}

function frameOf(el) {
  const p = axGet(el, K.position)
  const s = axGet(el, K.size)
  const pos = { x: 0, y: 0 }
  const size = { width: 0, height: 0 }
  if (p) AXValueGetPoint(p, 1, pos), CFRelease(p)
  if (s) AXValueGetSize(s, 2, size), CFRelease(s)
  return { x: pos.x, y: pos.y, width: size.width, height: size.height }
}

function setFrame(el, r) {
  const p = AXValueCreatePoint(1, { x: r.x, y: r.y })
  const s = AXValueCreateSize(2, { width: r.width, height: r.height })
  // posição, tamanho e posição de novo: o tamanho pode ser cortado na borda da tela
  AXUIElementSetAttributeValue(el, K.position, p)
  AXUIElementSetAttributeValue(el, K.size, s)
  AXUIElementSetAttributeValue(el, K.position, p)
  CFRelease(p)
  CFRelease(s)
}

function bringFront(w) {
  AXUIElementSetAttributeValue(w.el, K.minimized, kCFBooleanFalse)
  AXUIElementPerformAction(w.el, K.raise)
  AXUIElementSetAttributeValue(w.el, K.main, kCFBooleanTrue)
  AXUIElementSetAttributeValue(w.app, K.frontmost, kCFBooleanTrue)
}

// sem Acessibilidade: abre o app pelo Launch Services (vem pra frente com a janela de sempre)
function activateApp(wid) {
  const r = running.get(pidOf.get(wid))
  if (r?.bundle?.endsWith('.app')) spawn('open', ['-a', r.bundle], { detached: true, stdio: 'ignore' }).unref()
}

// ---------- trazer pra frente (fora do mundo) ----------

function focus(sourceId) {
  const wid = idOf(sourceId)
  restoreTouched()
  const w = axWindow(wid)
  if (w) {
    bringFront(w)
    freeWin(w)
  } else activateApp(wid)
  return true
}

// ---------- usar o app no telão ----------

// janelas que a gente mexeu, pra devolver como estavam
const touched = new Map()
let overlay = 0
let asked = false

function remember(wid, w) {
  if (touched.has(wid)) return
  const minimized = axGet(w.el, K.minimized)
  touched.set(wid, { frame: frameOf(w.el), minimized: !!minimized && CFBooleanGetValue(minimized) })
  if (minimized) CFRelease(minimized)
}

// guarda onde a janela estava (ela só sai do lugar quando o telão chega)
function prepare(sourceId) {
  const wid = idOf(sourceId)
  const w = axWindow(wid)
  if (!w) return false
  remember(wid, w)
  freeWin(w)
  return true
}

// rect: onde o telão aparece, em pontos de tela (mesmo sistema da Acessibilidade).
// true: a janela real está encaixada em cima do telão. false: sem permissão, o app só veio pra frente.
function fit(sourceId, rect) {
  const wid = idOf(sourceId)
  const w = axWindow(wid)
  if (!w) {
    // pede a permissão uma vez por sessão (abre o aviso do sistema) e, enquanto isso, abre o app fora
    if (!asked) asked = trusted(true) || true
    activateApp(wid)
    return false
  }
  remember(wid, w)
  overlay = wid
  AXUIElementSetAttributeValue(w.el, K.minimized, kCFBooleanFalse)
  setFrame(w.el, rect)
  bringFront(w)
  freeWin(w)
  return true
}

const isOverlaying = () => !!overlay

function restoreTouched() {
  overlay = 0
  for (const [wid, t] of touched) {
    const w = axWindow(wid)
    if (!w) continue
    if (t.frame.width && t.frame.height) setFrame(w.el, t.frame)
    if (t.minimized) AXUIElementSetAttributeValue(w.el, K.minimized, kCFBooleanTrue)
    freeWin(w)
  }
  touched.clear()
}

// no Mac a janela fica na frente, recebendo mouse e teclado de verdade: nada pra repassar
const mouse = () => false
const key = () => false
const setHole = () => {}

// ---------- apps instalados ----------

const APP_DIRS = ['/Applications', '/Applications/Utilities', '/System/Applications', '/System/Applications/Utilities', path.join(os.homedir(), 'Applications')]
const EXTRA_APPS = ['/System/Library/CoreServices/Finder.app']

async function findApps(dir, out, depth = 0) {
  let entries = []
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const full = path.join(dir, e.name)
    if (e.name.endsWith('.app')) out.push(full)
    // pastas de fornecedor (Adobe, Microsoft...) guardam o .app um nível abaixo
    else if (depth < 1 && (e.isDirectory() || e.isSymbolicLink()) && !APP_DIRS.includes(full)) await findApps(full, out, depth + 1)
  }
  return out
}

// nome traduzido como aparece no Finder (Calculadora, Notas...), numa chamada só
async function displayNames(paths) {
  const out = new Map()
  if (!paths.length) return out
  const raw = await run('mdls', ['-raw', '-name', 'kMDItemDisplayName', ...paths], { timeout: 15000 })
  const vals = raw.split('\0')
  if (vals.length >= paths.length) paths.forEach((p, i) => vals[i] && vals[i] !== '(null)' && out.set(p, vals[i].replace(/\.app$/i, '')))
  return out
}

async function listApps(junk) {
  const found = new Set()
  for (const d of APP_DIRS) for (const p of await findApps(d, [])) found.add(p)
  for (const p of EXTRA_APPS) found.add(p)
  const paths = [...found]
  const names = await displayNames(paths)
  const seen = new Set()
  const apps = []
  for (const p of paths) {
    const name = clean(names.get(p) || path.basename(p, '.app'))
    const k = name.toLowerCase()
    if (junk.test(name) || seen.has(k)) continue
    if (!name) continue
    seen.add(k)
    apps.push({ id: p, name, appId: null, link: p, icon: null })
  }
  return apps.sort((x, y) => x.name.localeCompare(y.name, 'pt-BR'))
}

// ---------- atalhos: apps fixos no Dock + o que está solto na Mesa ----------

async function dockApps() {
  const plist = path.join(os.homedir(), 'Library/Preferences/com.apple.dock.plist')
  const xml = await run('plutil', ['-convert', 'xml1', '-o', '-', plist])
  const part = xml.split('<key>persistent-others</key>')[0].split('<key>persistent-apps</key>')[1] || ''
  const out = []
  for (const m of part.matchAll(/<key>_CFURLString<\/key>\s*<string>([^<]+)<\/string>/g)) {
    try {
      const p = decodeURIComponent(new URL(m[1].replace(/&amp;/g, '&')).pathname).replace(/\/$/, '')
      if (p.endsWith('.app')) out.push(p)
    } catch {}
  }
  // nome traduzido, como no Dock (Notas, Ajustes do Sistema...)
  const names = await displayNames(out)
  return out.map((p) => ({ path: p, name: clean(names.get(p) || path.basename(p, '.app')) }))
}

// ---------- ícones grandes (QuickLook dá o ícone do app em 256px) ----------

const ICON = 160
const stubDir = path.join(os.tmpdir(), 'workland-icon-types')
async function thumb(p) {
  try {
    const img = await nativeImage.createThumbnailFromPath(p, { width: 256, height: 256 })
    return img.isEmpty() ? null : img.resize({ width: ICON, height: ICON, quality: 'best' }).toDataURL()
  } catch {
    return null
  }
}

async function jumboIcons(paths) {
  const out = new Map()
  const queue = [...paths]
  // poucos de cada vez: o QuickLook trabalha em paralelo, mas não vale afogar
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let p = queue.shift(); p; p = queue.shift()) {
        const url = await thumb(p)
        if (url) out.set(p, url)
      }
    }),
  )
  return out
}

// ícone do tipo (pdf, zip...) sem virar a miniatura do conteúdo: pede pra um arquivo vazio com a mesma extensão
async function typeIcon(ext) {
  if (!/^[\w-]{1,12}$/.test(ext)) return null
  await fs.mkdir(stubDir, { recursive: true })
  const stub = path.join(stubDir, `arquivo.${ext}`)
  await fs.writeFile(stub, '', { flag: 'a' })
  return thumb(stub)
}

// ---------- música tocando (Spotify ou Música) ----------

const MEDIA_JXA = `
function run(argv) {
  const cmd = argv[0] || 'status'
  const found = []
  for (const name of ['Spotify', 'Music']) {
    let a
    try { a = Application(name); if (!a.running()) continue } catch (e) { continue }
    let state = 'stopped'
    try { state = String(a.playerState()) } catch (e) {}
    found.push({ name, a, playing: state === 'playing', stopped: state === 'stopped' })
  }
  const s = found.find((f) => f.playing) || found.find((f) => !f.stopped)
  if (!s) return 'null'
  const a = s.a
  let playing = s.playing
  try {
    if (cmd === 'play') { a.playpause(); delay(0.25); playing = String(a.playerState()) === 'playing' }
    if (cmd === 'next') { a.nextTrack(); delay(0.5) }
    if (cmd === 'prev') { a.previousTrack(); delay(0.5) }
  } catch (e) {}
  let title = '', artist = '', art = null
  try { const t = a.currentTrack; title = t.name(); artist = t.artist(); if (s.name === 'Spotify') art = t.artworkUrl() } catch (e) {}
  return JSON.stringify({ title, artist, app: s.name, playing, art })
}`

async function media(cmd) {
  const out = await run('osascript', ['-l', 'JavaScript', '-e', MEDIA_JXA, cmd], { timeout: 15000 })
  try {
    return JSON.parse(out.trim() || 'null')
  } catch {
    return null
  }
}

module.exports = {
  listWindows,
  focus,
  setHole,
  prepare,
  fit,
  restoreTouched,
  isOverlaying,
  mouse,
  key,
  listApps,
  dockApps,
  jumboIcons,
  typeIcon,
  media,
}
