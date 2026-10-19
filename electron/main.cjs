// Processo principal: abre a janela do mundo e faz a ponte com o Windows
// (atalhos da Área de Trabalho, apps do menu Iniciar, janelas abertas, status do sistema).
const { app, BrowserWindow, Menu, ipcMain, shell, desktopCapturer, nativeImage, screen, dialog, protocol, net } = require('electron')
const { pathToFileURL } = require('url')

// wlfile://local/C:/caminho -> arquivo local (fundo, quadros, plugins), com CORS liberado pra virar textura
protocol.registerSchemesAsPrivileged([{ scheme: 'wlfile', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true, bypassCSP: true } }])
const win32 = require('./win32.cjs')
const path = require('path')
const fs = require('fs/promises')
const fsWatch = require('fs').watch
const os = require('os')
const { execFile, spawn } = require('child_process')

const DEV = process.argv.includes('--dev')
// testes automáticos: renderiza fora da tela, sem abrir janela na frente de ninguém
const OFFSCREEN = process.env.WORKLAND_HIDDEN === '1'
const DEBUG_PORT = process.env.WORKLAND_DEBUG_PORT
// o teste escondido não pode mexer no Workland que estiver aberto de verdade
// (WORKLAND_PROFILE dá outro perfil de teste, pra abrir dois Worklands escondidos num encontro)
const TEST_PROFILE = /^[\w-]{1,40}$/.test(process.env.WORKLAND_PROFILE || '') ? process.env.WORKLAND_PROFILE : 'workland-test'
if (OFFSCREEN) app.setPath('userData', path.join(app.getPath('appData'), TEST_PROFILE))
// encontro na rede: o vídeo da tela ao vivo vai direto entre os PCs com o IP de verdade (sem depender de mDNS)
const disabledFeatures = ['WebRtcHideLocalIpsWithMdns']
if (DEBUG_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', DEBUG_PORT)
  // em teste a janela fica atrás de outras: não pausar a renderização
  disabledFeatures.push('CalculateNativeWinOcclusion')
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
}
app.commandLine.appendSwitch('disable-features', disabledFeatures.join(','))

let win

function createWindow() {
  // sem menu: o Alt não pode abrir barra nenhuma
  Menu.setApplicationMenu(null)
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    show: false,
    backgroundColor: '#8fc6ff',
    autoHideMenuBar: true,
    title: 'Workland',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      webviewTag: true,
      // som ambiente toca sem precisar de clique antes
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,
      offscreen: OFFSCREEN,
    },
  })
  if (OFFSCREEN) {
    win.setContentSize(1536, 794)
    win.webContents.setFrameRate(60)
  } else {
    win.maximize()
    win.once('ready-to-show', () => win.show())
  }
  watchShortcuts()
  // o furo de 3px acompanha o tamanho da janela
  if (!OFFSCREEN) {
    const hole = () => win && !win.isDestroyed() && win32.setHole(worklandHwnd())
    win.once('ready-to-show', () => setTimeout(hole, 50))
    for (const ev of ['resize', 'maximize', 'unmaximize', 'restore', 'move', 'enter-full-screen', 'leave-full-screen']) win.on(ev, () => setTimeout(hole, 30))
  }
  // saiu do Workland (outro app ou fechou): as janelas usadas por dentro voltam como estavam
  win.on('blur', () => win32.restoreTouched())
  win.on('close', () => win32.restoreTouched())
  if (DEV) win.loadURL('http://localhost:5199')
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') win.setFullScreen(!win.isFullScreen())
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools()
  })
}

// clicar no atalho com o app aberto só traz a janela pra frente
if (!OFFSCREEN && !app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })
  app.whenReady().then(() => {
    protocol.handle('wlfile', async (req) => {
      const p = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, ''))
      const res = await net.fetch(pathToFileURL(p).toString())
      const headers = new Headers(res.headers)
      headers.set('Access-Control-Allow-Origin', '*')
      return new Response(res.body, { status: res.status, headers })
    })
    ensureExamplePlugin().catch(() => {})
    createWindow()
    setupUpdates().catch((err) => console.warn('[update]', err?.message))
  })
}
app.on('window-all-closed', () => app.quit())
app.on('will-quit', () => win32.restoreTouched())

function worklandHwnd() {
  return Number(win.getNativeWindowHandle().readBigUInt64LE(0))
}

// ---------- utilidades ----------

function run(file, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, maxBuffer: 32 * 1024 * 1024, ...opts }, (err, stdout) =>
      resolve(err ? '' : stdout),
    )
  })
}

function ps(script) {
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script])
}

async function walk(dir, out = [], depth = 0) {
  if (depth > 4) return out
  let entries = []
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) await walk(full, out, depth + 1)
    else if (/\.(lnk|url)$/i.test(e.name)) out.push(full)
  }
  return out
}

const iconCache = new Map()
async function iconFor(p, key = p) {
  if (iconCache.has(key)) return iconCache.get(key)
  let url = null
  try {
    const img = await app.getFileIcon(p, { size: 'large' })
    if (!img.isEmpty()) url = img.toDataURL()
  } catch {}
  iconCache.set(key, url)
  return url
}

const JUNK = /(uninstall|desinstal|remover|readme|leia-me|help|ajuda|documenta|manual|license|licen|release notes|website|site da web|support)/i

// ---------- apps ----------

let appsCache = null
async function listApps() {
  if (appsCache) return appsCache
  const startDirs = [
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft\\Windows\\Start Menu\\Programs'),
    path.join(process.env.APPDATA || '', 'Microsoft\\Windows\\Start Menu\\Programs'),
  ]
  const links = (await Promise.all(startDirs.map((d) => walk(d)))).flat()
  const byName = new Map()
  for (const l of links) byName.set(path.basename(l).replace(/\.(lnk|url)$/i, '').toLowerCase(), l)

  // Get-StartApps lista o que aparece no menu Iniciar, inclusive apps da Store
  const raw = await ps('[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress')
  let list = []
  try {
    const parsed = JSON.parse(raw)
    list = (Array.isArray(parsed) ? parsed : [parsed]).map((a) => ({ name: a.Name, appId: a.AppID }))
  } catch {
    list = links.map((l) => ({ name: path.basename(l).replace(/\.(lnk|url)$/i, ''), appId: null, link: l }))
  }

  const seen = new Set()
  const apps = []
  for (const a of list) {
    if (!a.name || JUNK.test(a.name)) continue
    const k = a.name.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    const link = a.link || byName.get(k) || null
    if (a.appId && /^https?:/i.test(a.appId)) continue
    apps.push({ id: a.appId || link, name: a.name, appId: a.appId, link, icon: null })
  }
  apps.sort((x, y) => x.name.localeCompare(y.name, 'pt-BR'))

  const appx = apps.some((a) => a.appId?.includes('!')) ? await appxPackages() : new Map()
  for (const a of apps) if (a.appId?.includes('!')) a.icon = await appxLogo(a.appId, appx).catch(() => null)
  appsCache = apps
  return apps
}

// ícones grandes chegam depois, pra lista aparecer rápido
let appIconsCache = null
async function listAppIcons() {
  if (appIconsCache) return appIconsCache
  const apps = await listApps()
  const want = new Map()
  for (const a of apps) {
    if (a.icon) continue
    const p = a.link || knownPath(a.appId)
    if (p) want.set(a, p)
  }
  const big = await jumboIcons([...new Set(want.values())])
  const out = {}
  for (const [a, p] of want) {
    const icon = big.get(p) || (await iconFor(p))
    if (icon) out[a.id] = a.icon = icon
  }
  appIconsCache = out
  return out
}
// cache em disco: na próxima abertura a lista aparece na hora e atualiza por trás
const CACHE = () => path.join(app.getPath('userData'), 'apps-cache.json')
let diskCache
async function readCache() {
  if (diskCache !== undefined) return diskCache
  try {
    diskCache = JSON.parse(await fs.readFile(CACHE(), 'utf8'))
  } catch {
    diskCache = null
  }
  return diskCache
}
let refreshing = null
function refreshCache() {
  if (!refreshing)
    refreshing = (async () => {
      const apps = await listApps()
      const icons = await listAppIcons()
      const json = JSON.stringify({ apps, icons })
      // mudou desde o cache: avisa a tela pra trocar sem reiniciar
      if (diskCache && JSON.stringify(diskCache) !== json && win && !win.isDestroyed()) win.webContents.send('apps:updated', { apps, icons })
      await fs.writeFile(CACHE(), json).catch(() => {})
      return { apps, icons }
    })()
  return refreshing
}

ipcMain.handle('apps:list', async () => {
  const c = await readCache()
  if (c?.apps?.length) {
    refreshCache()
    return c.apps
  }
  return (await refreshCache()).apps
})
ipcMain.handle('apps:icons', async () => {
  const c = await readCache()
  if (c?.icons) return c.icons
  return (await refreshCache()).icons
})

// "{GUID}\app.exe" do Get-StartApps aponta pra pastas conhecidas
const KNOWN = {
  '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}': 'C:\\Windows\\System32',
  '{D65231B0-B2F1-4857-A4CE-A8E7C6EA7D27}': 'C:\\Windows\\SysWOW64',
  '{F38BF404-1D43-42F2-9305-67DE0B28FC23}': 'C:\\Windows',
  '{6D809377-6AF0-444B-8957-A3773F02200E}': process.env.ProgramFiles || 'C:\\Program Files',
  '{7C5A40EF-A0FB-4BFC-874A-C0F2E0B9FA8E}': process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
}
function knownPath(appId) {
  if (!appId || !/\.exe$/i.test(appId)) return null
  const m = /^(\{[0-9A-F-]+\})\\(.*)$/i.exec(appId)
  if (!m) return path.isAbsolute(appId) ? appId : null
  const base = KNOWN[m[1].toUpperCase()]
  return base ? path.join(base, m[2]) : null
}

// ícones de 256px via shell (num PowerShell à parte, que não derruba o app se algo falhar)
async function jumboIcons(paths) {
  const out = new Map()
  if (!paths.length) return out
  const list = path.join(os.tmpdir(), `workland-icons-${process.pid}.txt`)
  await fs.writeFile(list, paths.join('\r\n'), 'utf8')
  const script = path.join(__dirname, 'icons.ps1').replace('app.asar', 'app.asar.unpacked')
  const raw = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-List', list], {
    timeout: 60000,
  })
  for (const line of raw.split(/\r?\n/)) {
    const i = line.lastIndexOf('\t')
    if (i > 0) out.set(line.slice(0, i), `data:image/png;base64,${line.slice(i + 1)}`)
  }
  fs.unlink(list).catch(() => {})
  return out
}

async function appxPackages() {
  const raw = await ps(
    '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-AppxPackage | Select-Object PackageFamilyName,InstallLocation | ConvertTo-Json -Compress',
  )
  const map = new Map()
  try {
    for (const p of JSON.parse(raw)) if (p.InstallLocation) map.set(p.PackageFamilyName, p.InstallLocation)
  } catch {}
  return map
}

async function appxLogo(appId, appx) {
  const [family, id] = appId.split('!')
  const dir = appx.get(family)
  if (!dir) return null
  let xml = ''
  try {
    xml = await fs.readFile(path.join(dir, 'AppxManifest.xml'), 'utf8')
  } catch {
    return null
  }
  const block = new RegExp(`<Application[^>]*Id="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[\\s\\S]*?</Application>`).exec(xml)?.[0] ?? xml
  const rel = /Square44x44Logo="([^"]+)"/.exec(block)?.[1] || /Square150x150Logo="([^"]+)"/.exec(block)?.[1] || /<Logo>([^<]+)<\/Logo>/.exec(xml)?.[1]
  if (!rel) return null
  const full = path.join(dir, rel)
  const base = path.basename(full, path.extname(full)).toLowerCase()
  let files = []
  try {
    files = await fs.readdir(path.dirname(full))
  } catch {
    return null
  }
  // prefere a variante maior e sem placa colorida
  const score = (f) => {
    const n = f.toLowerCase()
    const size = Number(/targetsize-(\d+)/.exec(n)?.[1] || /scale-(\d+)/.exec(n)?.[1] || 0)
    return size + (n.includes('unplated') ? 1000 : 0) - (n.includes('contrast') || n.includes('lightunplated') ? 5000 : 0)
  }
  const pick = files.filter((f) => f.toLowerCase().startsWith(base + '.') && /\.png$/i.test(f)).sort((x, y) => score(y) - score(x))[0]
  if (!pick) return null
  const img = nativeImage.createFromPath(path.join(path.dirname(full), pick))
  return img.isEmpty() ? null : img.resize({ width: 128, height: 128 }).toDataURL()
}


ipcMain.handle('apps:launch', async (_e, a) => {
  if (a.appId) {
    spawn('explorer.exe', [`shell:AppsFolder\\${a.appId}`], { detached: true, stdio: 'ignore' }).unref()
    return true
  }
  if (a.link) return (await shell.openPath(a.link)) === ''
  return false
})

// ---------- atalhos da Área de Trabalho ----------

function shortcutDirs() {
  return [app.getPath('desktop'), path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop')]
}

async function listShortcuts() {
  const seen = new Set()
  const out = []
  for (const dir of shortcutDirs()) {
    let entries = []
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (!e.isFile() || !/\.(lnk|url)$/i.test(e.name)) continue
      const name = e.name.replace(/\.(lnk|url)$/i, '')
      const key = name.toLowerCase()
      if (key === 'workland' || seen.has(key)) continue
      seen.add(key)
      const full = path.join(dir, e.name)
      out.push({ id: full, name, path: full })
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

const shortcutIcons = new Map()
ipcMain.handle('shortcuts:list', () => listShortcuts())
ipcMain.handle('shortcuts:icons', async () => {
  const list = await listShortcuts()
  const missing = list.filter((s) => !shortcutIcons.has(s.path)).map((s) => s.path)
  if (missing.length) {
    const big = await jumboIcons(missing)
    for (const p of missing) shortcutIcons.set(p, big.get(p) || (await iconFor(p)))
  }
  return Object.fromEntries(list.map((s) => [s.id, shortcutIcons.get(s.path)]).filter(([, v]) => v))
})
ipcMain.handle('shortcuts:open', async (_e, p) => (await shell.openPath(p)) === '')

// a Área de Trabalho mudou (atalho novo, apagado, renomeado): avisa a tela
let shortcutsTimer
function watchShortcuts() {
  for (const dir of shortcutDirs()) {
    try {
      fsWatch(dir, () => {
        clearTimeout(shortcutsTimer)
        shortcutsTimer = setTimeout(() => win && !win.isDestroyed() && win.webContents.send('shortcuts:changed'), 800)
      })
    } catch {}
  }
}

// ---------- arquivos ----------

ipcMain.handle('fs:places', () => {
  const p = (k) => {
    try {
      return app.getPath(k)
    } catch {
      return null
    }
  }
  return [
    { key: 'desktop', name: 'Área de Trabalho', path: p('desktop') },
    { key: 'downloads', name: 'Downloads', path: p('downloads') },
    { key: 'documents', name: 'Documentos', path: p('documents') },
    { key: 'pictures', name: 'Imagens', path: p('pictures') },
    { key: 'music', name: 'Músicas', path: p('music') },
    { key: 'videos', name: 'Vídeos', path: p('videos') },
    { key: 'home', name: os.userInfo().username, path: os.homedir() },
  ].filter((x) => x.path)
})

const HIDDEN = /^(\.|desktop\.ini$|thumbs\.db$|ntuser|NTUSER|\$)/
ipcMain.handle('fs:list', async (_e, dir) => {
  let entries = []
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch (err) {
    return { dir, items: [], error: String(err.code || err) }
  }
  const items = []
  for (const e of entries) {
    if (HIDDEN.test(e.name)) continue
    const full = path.join(dir, e.name)
    let size = 0
    let mtime = 0
    let isDir = e.isDirectory()
    try {
      const st = await fs.stat(full)
      size = st.size
      mtime = st.mtimeMs
      isDir = st.isDirectory()
    } catch {
      continue
    }
    items.push({ name: e.name, path: full, isDir, size, mtime, ext: isDir ? '' : path.extname(e.name).slice(1).toLowerCase() })
  }
  items.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, 'pt-BR') : a.isDir ? -1 : 1))
  return { dir, parent: path.dirname(dir) === dir ? null : path.dirname(dir), items }
})

// pedidos de ícone grande chegam em rajada (uma página de caixotes): junta e extrai de uma vez
const bigCache = new Map()
let batch = null
function bigIconLater(p) {
  if (bigCache.has(p)) return bigCache.get(p)
  if (!batch) {
    batch = { paths: [], waiters: new Map() }
    setTimeout(async () => {
      const b = batch
      batch = null
      const got = await jumboIcons(b.paths)
      for (const [k, res] of b.waiters) res(got.get(k) || null)
    }, 120)
  }
  const promise = new Promise((res) => batch.waiters.set(p, res))
  batch.paths.push(p)
  bigCache.set(p, promise)
  return promise
}

ipcMain.handle('fs:icon', async (_e, p, ext) => {
  // exe/lnk/url têm ícone próprio, o resto compartilha pelo tipo
  const perFile = !ext || ['exe', 'lnk', 'url', 'ico'].includes(ext)
  if (perFile && ext) return (await bigIconLater(p)) || iconFor(p)
  if (ext === 'dir') return (await bigIconLater(p)) || iconFor(p, 'ext:dir')
  if (!byExt.has(ext)) byExt.set(ext, bigIconLater(p))
  return (await byExt.get(ext)) || iconFor(p, `ext:${ext}`)
})
const byExt = new Map()

// miniatura só de imagem comum (a API de miniatura do shell derruba o processo em alguns arquivos)
ipcMain.handle('fs:thumb', async (_e, p) => {
  if (!/\.(png|jpe?g|webp|gif|bmp)$/i.test(p)) return null
  try {
    const st = await fs.stat(p)
    if (st.size > 25 * 1024 * 1024) return null
    const img = nativeImage.createFromPath(p)
    if (img.isEmpty()) return null
    const { width, height } = img.getSize()
    const s = 320 / Math.max(width, height)
    return (s < 1 ? img.resize({ width: Math.round(width * s), height: Math.round(height * s) }) : img).toDataURL()
  } catch {
    return null
  }
})

ipcMain.handle('fs:open', async (_e, p) => (await shell.openPath(p)) === '')
ipcMain.handle('fs:reveal', (_e, p) => shell.showItemInFolder(p))
ipcMain.handle('web:open', (_e, url) => shell.openExternal(url))

// ---------- música tocando (controles de mídia do Windows) ----------

let mediaBusy = null
ipcMain.handle('media', async (_e, cmd) => {
  // um de cada vez: o PowerShell leva ~1s
  if (mediaBusy && cmd === 'status') return mediaBusy
  const script = path.join(__dirname, 'media.ps1').replace('app.asar', 'app.asar.unpacked')
  mediaBusy = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Cmd', cmd], { timeout: 15000 })
    .then((out) => {
      try {
        return JSON.parse(out.trim() || 'null')
      } catch {
        return null
      }
    })
    .finally(() => setTimeout(() => (mediaBusy = null), 0))
  return mediaBusy
})

// ---------- escolher arquivos e pastas ----------

ipcMain.handle('pick:folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
  return r.canceled ? null : r.filePaths[0]
})
ipcMain.handle('pick:image', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }] })
  return r.canceled ? null : r.filePaths[0]
})
ipcMain.handle('pick:media', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Imagem ou vídeo 360', extensions: ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm'] }] })
  return r.canceled ? null : r.filePaths[0]
})

// apresentação: um PDF, ou várias imagens e vídeos (na ordem do nome)
ipcMain.handle('pick:pdf', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'PDF', extensions: ['pdf'] }] })
  return r.canceled ? null : r.filePaths[0]
})
ipcMain.handle('pick:slides', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Imagens e vídeos', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm', 'mov', 'm4v'] }] })
  return r.canceled ? [] : r.filePaths.sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))
})

// ---------- encontro na rede (apresentações com o pessoal) ----------

require('./meet.cjs').setup({ ipcMain, app, testMode: OFFSCREEN })

// ---------- exportar / importar o setup inteiro ----------

ipcMain.handle('setup:export', async (_e, data) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: 'meu-workland.json', filters: [{ name: 'Setup do Workland', extensions: ['json'] }] })
  if (r.canceled || !r.filePath) return false
  await fs.writeFile(r.filePath, JSON.stringify(data, null, 2), 'utf8')
  return true
})
ipcMain.handle('setup:import', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Setup do Workland', extensions: ['json'] }] })
  if (r.canceled) return null
  try {
    return JSON.parse(await fs.readFile(r.filePaths[0], 'utf8'))
  } catch {
    return null
  }
})

// ---------- abrir programa pelo .exe (cenas de trabalho) ----------

ipcMain.handle('exe:launch', async (_e, p) => {
  try {
    spawn(p, [], { detached: true, stdio: 'ignore', cwd: path.dirname(p) }).unref()
    return true
  } catch {
    return (await shell.openPath(p)) === ''
  }
})

// ---------- plugins: cada pasta em plugins/ com manifest.json + index.html vira um widget ----------

const PLUGINS = () => path.join(app.getPath('userData'), 'plugins')
const toUrl = (p) => 'wlfile://local/' + encodeURI(p.split(path.sep).join('/'))
const EXAMPLE_HTML = "<!doctype html><meta charset=\"utf-8\"><title>Frase do dia</title>\n<body style=\"margin:0;height:100vh;display:grid;place-items:center;background:#111317;color:#f4f2ee;font:300 44px Segoe UI,sans-serif;text-align:center;padding:60px;box-sizing:border-box\">\n<div id=\"f\"></div>\n<script>\n  // exemplo de plugin: e so uma pagina. Edite a vontade ou crie outra pasta ao lado.\n  const frases = ['Feito é melhor que perfeito.', 'Um passo de cada vez.', 'Simples é difícil, e vale a pena.', 'Descansar também é produtivo.', 'Hoje é um bom dia pra terminar algo.']\n  f.textContent = frases[new Date().getDate() % frases.length]\n</script>"

async function ensureExamplePlugin() {
  const dir = path.join(PLUGINS(), 'frase-do-dia')
  try {
    await fs.access(dir)
    return
  } catch {}
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ name: 'Frase do dia', entry: 'index.html' }, null, 2))
  await fs.writeFile(path.join(dir, 'index.html'), EXAMPLE_HTML)
}

ipcMain.handle('plugins:list', async () => {
  const out = []
  let dirs = []
  try {
    dirs = await fs.readdir(PLUGINS(), { withFileTypes: true })
  } catch {
    return out
  }
  for (const d of dirs) {
    if (!d.isDirectory()) continue
    const dir = path.join(PLUGINS(), d.name)
    try {
      const man = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'))
      out.push({ id: d.name, name: man.name || d.name, url: toUrl(path.join(dir, man.entry || 'index.html')) })
    } catch {}
  }
  return out
})
ipcMain.handle('plugins:open', async () => {
  await fs.mkdir(PLUGINS(), { recursive: true })
  return shell.openPath(PLUGINS())
})

// ---------- janelas abertas ----------

const NOT_APPS = /^(Program Manager|Configurações|Settings|Backstop Window|Input Occlusion Window|Tela de Bloqueio.*|Windows Default Lock Screen)$/
ipcMain.handle('win:list', async () => {
  const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: true })
  const icons = new Map(sources.map((s) => [s.id, s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null]))
  const all = win32.listWindows(win ? worklandHwnd() : 0).filter((w) => !NOT_APPS.test(w.name) && w.name !== 'Workland')
  return Promise.all(
    all.map(async (w) => ({
      id: w.id,
      name: w.name,
      minimized: w.minimized,
      exe: w.exe,
      icon: icons.get(w.id) ?? (w.exe ? (await bigIconLater(w.exe)) || (await iconFor(w.exe)) : null),
    })),
  )
})

ipcMain.handle('win:focus', (_e, id) => win32.focus(id))

// ---------- usar o app de dentro do telão ----------

ipcMain.handle('win:prepare', (_e, id) => win32.prepare(id))
// rect em pixels CSS dentro do Workland -> pixels físicos da tela
ipcMain.handle('win:fit', (_e, id, rect) => {
  if (!win) return null
  const cb = win.getContentBounds()
  const phys = screen.dipToScreenRect(win, { x: Math.round(cb.x + rect.x), y: Math.round(cb.y + rect.y), width: Math.round(rect.width), height: Math.round(rect.height) })
  return win32.fit(id, phys)
})
ipcMain.on('win:mouse', (_e, id, ev) => win32.mouse(id, ev))
ipcMain.on('win:key', (_e, id, ev) => win32.key(id, ev))

// ---------- sistema ----------

let lastCpu = os.cpus()
// disco do sistema muda devagar: lê no máximo a cada 30s
let disk = { used: 0, total: 0, at: 0 }
async function diskUsage() {
  if (Date.now() - disk.at < 30000) return disk
  try {
    const s = await fs.statfs(`${process.env.SystemDrive || 'C:'}\\`)
    disk = { total: s.blocks * s.bsize, used: (s.blocks - s.bfree) * s.bsize, at: Date.now() }
  } catch {}
  return disk
}

ipcMain.handle('sys:stats', async () => {
  const d = await diskUsage()
  const now = os.cpus()
  let idle = 0
  let total = 0
  now.forEach((c, i) => {
    const p = lastCpu[i] || c
    const t = (o) => o.user + o.nice + o.sys + o.idle + o.irq
    idle += c.times.idle - p.times.idle
    total += t(c.times) - t(p.times)
  })
  lastCpu = now
  return {
    cpu: total > 0 ? 1 - idle / total : 0,
    cpuName: now[0]?.model?.trim() ?? '',
    cores: now.length,
    memUsed: os.totalmem() - os.freemem(),
    memTotal: os.totalmem(),
    uptime: os.uptime(),
    host: os.hostname(),
    user: os.userInfo().username,
    diskUsed: d.used,
    diskTotal: d.total,
  }
})

// ---------- atualização automática ----------
// Instalado: procura versão nova nas releases do GitHub (build.publish do package.json) ao abrir e a cada 4h,
// baixa por trás e o HUD avisa. Se a pessoa só fechar o app, a versão nova entra nesse fechamento.
// Teste escondido: WORKLAND_UPDATE_FEED=http://... (feed local) ou =github (repo real), com config e cache
// próprios no perfil de teste e sem nunca instalar nada.
const UPDATE_FEED = OFFSCREEN ? process.env.WORKLAND_UPDATE_FEED : null
let updater = null
let updateReady = null

async function setupUpdates() {
  if (!UPDATE_FEED && (!app.isPackaged || OFFSCREEN)) return
  updater = require('electron-updater').autoUpdater
  if (UPDATE_FEED) {
    const cfg = path.join(app.getPath('userData'), 'update-test.yml')
    await fs.writeFile(cfg, (await testUpdateConfig()) + 'updaterCacheDirName: workland-test-updater\n')
    updater.updateConfigPath = cfg
    updater.forceDevUpdateConfig = true
    updater.autoInstallOnAppQuit = false
  }
  updater.autoDownload = true
  updater.on('update-downloaded', (info) => {
    updateReady = { version: info.version }
    if (win && !win.isDestroyed()) win.webContents.send('update:ready', updateReady)
  })
  // sem release publicada, sem internet ou GitHub fora do ar: só registra e tenta de novo na próxima
  updater.on('error', (err) => console.warn('[update]', err?.code || 'erro', String(err?.message || err).split('\n')[0]))
  const check = () => !updateReady && updater.checkForUpdates().catch(() => {})
  setTimeout(check, UPDATE_FEED ? 0 : 8000)
  setInterval(check, 4 * 3600 * 1000)
}

// config do teste sem a linha do cache (entra a do perfil de teste)
async function testUpdateConfig() {
  if (UPDATE_FEED !== 'github') return `provider: generic\nurl: ${UPDATE_FEED}\n`
  // empacotado, o package.json perde o campo build: o repo vem do app-update.yml gerado no build
  if (!app.isPackaged) {
    const { provider, owner, repo } = require('../package.json').build.publish
    return `provider: ${provider}\nowner: ${owner}\nrepo: ${repo}\n`
  }
  const real = await fs.readFile(path.join(process.resourcesPath, 'app-update.yml'), 'utf8')
  return real.replace(/^updaterCacheDirName:.*\r?\n?/m, '').replace(/\n?$/, '\n')
}

ipcMain.handle('update:status', () => updateReady)
ipcMain.handle('update:install', () => {
  if (!updater || !updateReady) return false
  if (UPDATE_FEED) {
    console.log('[update] reiniciar pedido no teste, nada foi instalado')
    return true
  }
  // fecha, instala em silêncio e abre o Workland de novo
  setImmediate(() => updater.quitAndInstall(true, true))
  return true
})
