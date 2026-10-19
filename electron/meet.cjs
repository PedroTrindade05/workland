// Encontro na rede local: um Workland vira anfitrião (HTTP + WebSocket) e os outros acham ele pela rede.
// Nada passa pela internet. Pra entrar precisa do PIN de 4 dígitos que aparece pra quem criou a sala.
//
// Mensagens (JSON):
//   cliente -> sala: hello {name, look} | pose {p} | look {look, name} | present {state} | presenter {id} | take
//                    react {e} | room {room} (só anfitrião) | rtc {to, data}
//   sala -> cliente: welcome | join | peer | leave | pose | present | presenter | react | room | rtc | bye
const http = require('http')
const dgram = require('dgram')
const os = require('os')
const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const crypto = require('crypto')
const { WebSocketServer } = require('ws')

const PORT = 47810
const DISCO = 47811
const MAX_UPLOAD = 4 * 1024 ** 3
const REACTIONS = new Set(['👏', '✋', '👍', '🔥', '😂', '❓', '❤️', '🎉'])
const TYPES = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4' }
const typeOf = (p) => TYPES[path.extname(p).slice(1).toLowerCase()] || 'application/octet-stream'

let loopback = false
let room = null

const newId = (n = 6) => crypto.randomBytes(n).toString('hex')
const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '')

// placas virtuais (Hyper-V, WSL, VirtualBox...) vão pro fim: o primeiro endereço é o que o pessoal da rede alcança
const VIRTUAL = /vEthernet|Hyper-V|WSL|VirtualBox|VMware|Loopback|Bluetooth/i
const rank = (name, ip) => (VIRTUAL.test(name) ? 10 : 0) + (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : 2)
function lanAddrs() {
  const out = []
  for (const [name, list] of Object.entries(os.networkInterfaces()))
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push({ ...a, rank: rank(name, a.address) })
  return out.sort((a, b) => a.rank - b.rank)
}

// endereço de broadcast de cada rede (192.168.0.255...) e o geral
function broadcastTargets() {
  if (loopback) return ['127.0.0.1']
  const out = new Set(['255.255.255.255'])
  for (const a of lanAddrs()) {
    const ip = a.address.split('.').map(Number)
    const mask = a.netmask.split('.').map(Number)
    out.add(ip.map((b, i) => (b | (~mask[i] & 255)) & 255).join('.'))
  }
  return [...out]
}

// ---------- sala ----------

function info(p) {
  return { id: p.id, name: p.name, look: p.look, p: p.p, host: p.host, viewer: p.viewer }
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg))
}

function broadcast(msg, except) {
  const raw = JSON.stringify(msg)
  for (const p of room.peers.values()) if (p !== except) send(p.ws, raw)
}

function hostPeer() {
  for (const p of room.peers.values()) if (p.host) return p
  return null
}

function setPresenter(id) {
  if (room.presenter === id) return
  // a tela ao vivo vem do PC de quem apresentava: trocou a vez, ela sai do telão
  if (room.present?.kind === 'window') {
    room.present = null
    broadcast({ t: 'present', state: null, by: null })
  }
  room.presenter = id
  broadcast({ t: 'presenter', id })
}

function handle(peer, m) {
  switch (m.t) {
    case 'hello': {
      peer.name = text(m.name, 40).trim() || 'Convidado'
      peer.look = m.look && JSON.stringify(m.look).length < 2000 ? m.look : null
      // assistindo pelo navegador: não tem boneco nem pega a vez
      peer.viewer = !!m.viewer && !peer.host
      peer.ready = true
      if (!room.presenter && peer.host) room.presenter = peer.id
      send(peer.ws, {
        t: 'welcome',
        id: peer.id,
        name: room.name,
        peers: [...room.peers.values()].filter((p) => p !== peer && p.ready).map(info),
        presenter: room.presenter,
        present: room.present,
        room: room.layout,
      })
      broadcast({ t: 'join', peer: info(peer) }, peer)
      return
    }
    case 'pose':
      if (!Array.isArray(m.p) || m.p.length !== 6 || !m.p.every((n) => typeof n === 'number' && Number.isFinite(n))) return
      peer.p = m.p
      return broadcast({ t: 'pose', id: peer.id, p: m.p }, peer)
    case 'look':
      if (m.look && JSON.stringify(m.look).length < 2000) peer.look = m.look
      if (typeof m.name === 'string') peer.name = text(m.name, 40).trim() || peer.name
      return broadcast({ t: 'peer', peer: info(peer) }, peer)
    case 'present':
      if (peer.id !== room.presenter) return
      if (m.state && JSON.stringify(m.state).length > 64000) return
      room.present = m.state ?? null
      return broadcast({ t: 'present', state: room.present, by: peer.id }, peer)
    case 'presenter':
      // quem está apresentando passa a vez; o anfitrião pode dar a vez pra qualquer um
      if ((peer.id === room.presenter || peer.host) && room.peers.has(m.id) && !room.peers.get(m.id).viewer) setPresenter(m.id)
      return
    case 'take':
      if (!peer.viewer && (!room.presenter || peer.host)) setPresenter(peer.id)
      return
    case 'react':
      if (REACTIONS.has(m.e)) broadcast({ t: 'react', id: peer.id, e: m.e })
      return
    case 'room':
      if (!peer.host || (m.room && JSON.stringify(m.room).length > 512000)) return
      room.layout = m.room ?? null
      return broadcast({ t: 'room', room: room.layout }, peer)
    case 'rtc': {
      const to = room.peers.get(m.to)
      if (to) send(to.ws, { t: 'rtc', from: peer.id, data: m.data })
      return
    }
  }
}

// ---------- página de assistir ----------

const DIST = path.join(__dirname, '..', 'dist', 'assets')
let viewerHtml = null
async function viewerPage() {
  if (viewerHtml) return viewerHtml
  const [html, files] = await Promise.all([fsp.readFile(path.join(__dirname, 'viewer.html'), 'utf8'), fsp.readdir(DIST).catch(() => [])])
  // nome do pedaço do pdf.js muda a cada build
  const chunk = files.find((f) => /^pdf-[\w-]+\.js$/.test(f)) ?? ''
  return (viewerHtml = html.replace('__PDF_CHUNK__', chunk))
}

// ---------- arquivos da apresentação (PDF, imagens, vídeos) ----------

function register(file) {
  const id = newId(8)
  room.files.set(id, file)
  return id
}

async function serveFile(req, res, f) {
  const size = f.size ?? (await fsp.stat(f.path)).size
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '')
  const head = { 'Content-Type': f.type, 'Accept-Ranges': 'bytes' }
  if (range) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2])
    let end = range[1] && range[2] ? Number(range[2]) : size - 1
    start = Math.max(0, start)
    end = Math.min(size - 1, end)
    if (start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` })
      return res.end()
    }
    res.writeHead(206, { ...head, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 })
    return fs.createReadStream(f.path, { start, end }).pipe(res)
  }
  res.writeHead(200, { ...head, 'Content-Length': size })
  fs.createReadStream(f.path).pipe(res)
}

function receiveFile(req, res) {
  const id = newId(8)
  const name = decodeURIComponent(text(req.headers['x-name'], 300)) || id
  const dest = path.join(room.dir, id)
  let size = 0
  const out = fs.createWriteStream(dest)
  req.on('data', (chunk) => {
    size += chunk.length
    if (size > MAX_UPLOAD) {
      req.destroy()
      out.destroy()
    }
  })
  req.pipe(out)
  out.on('finish', () => {
    room.files.set(id, { path: dest, type: typeOf(name), size, name })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ id }))
  })
  out.on('error', () => {
    res.writeHead(500)
    res.end()
  })
}

function onHttp(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-name, range')
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges')
  if (req.method === 'OPTIONS') return res.writeHead(204).end()
  const u = new URL(req.url, 'http://sala')
  // página de assistir pelo navegador (o PIN vai no link ou é pedido na página)
  if (u.pathname === '/' || u.pathname === '/assistir') {
    return viewerPage()
      .then((html) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(html)
      })
      .catch(() => res.writeHead(500).end())
  }
  // o pdf.js que já vem no Workland, pra página desenhar os PDFs
  const lib = /^\/app\/(pdf[\w.-]*\.m?js)$/.exec(u.pathname)
  if (lib) return serveFile(req, res, { path: path.join(DIST, lib[1]), type: 'text/javascript; charset=utf-8' }).catch(() => res.writeHead(404).end())
  if (u.pathname === '/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ app: 'workland', name: room.name, by: room.by }))
  }
  if (u.searchParams.get('pin') !== room.pin) return res.writeHead(403).end()
  if (u.pathname === '/files' && req.method === 'POST') return receiveFile(req, res)
  const m = /^\/files\/([a-f0-9]+)$/.exec(u.pathname)
  const f = m && room.files.get(m[1])
  if (f && req.method === 'GET') return serveFile(req, res, f).catch(() => res.writeHead(500).end())
  res.writeHead(404).end()
}

// ---------- criar / encerrar ----------

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve(server.address().port)
    })
  })
}

async function host({ name, by }) {
  if (room) await stop()
  const dir = path.join(os.tmpdir(), 'workland-meet', newId(4))
  await fsp.mkdir(dir, { recursive: true })
  room = { name: text(name, 60) || 'Apresentação', by: text(by, 40), pin: String(crypto.randomInt(1000, 10000)), token: newId(12), peers: new Map(), files: new Map(), dir, presenter: null, present: null, layout: null }
  const server = http.createServer(onHttp)
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 })
  server.on('upgrade', (req, socket, head) => {
    const q = new URL(req.url, 'http://sala').searchParams
    if (q.get('pin') !== room?.pin) return socket.destroy()
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, q.get('host') === room.token))
  })
  wss.on('connection', (ws, _req, isHost) => {
    const peer = { ws, id: newId(4), name: 'Convidado', look: null, p: null, host: !!isHost, ready: false }
    room.peers.set(peer.id, peer)
    ws.on('message', (data, binary) => {
      if (binary) return
      try {
        handle(peer, JSON.parse(data.toString()))
      } catch {}
    })
    ws.on('close', () => {
      if (!room) return
      room.peers.delete(peer.id)
      broadcast({ t: 'leave', id: peer.id })
      if (room.presenter === peer.id) setPresenter(hostPeer()?.id ?? null)
    })
  })
  // no teste escondido fica só no próprio PC (sem aviso do firewall)
  const bindTo = loopback ? '127.0.0.1' : undefined
  const port = await listen(server, PORT, bindTo).catch(() => listen(server, 0, bindTo))
  const udp = dgram.createSocket({ type: 'udp4', reuseAddr: true })
  udp.on('message', (msg, rinfo) => {
    if (msg.toString() !== 'WL?' || !room) return
    udp.send(JSON.stringify({ app: 'workland', name: room.name, by: room.by, port, people: [...room.peers.values()].filter((p) => p.ready).length }), rinfo.port, rinfo.address)
  })
  // porta da descoberta ocupada: a sala funciona igual, só não aparece na lista (entra pelo endereço)
  await new Promise((resolve) => {
    udp.once('error', resolve)
    udp.bind(DISCO, bindTo, resolve)
  })
  udp.on('error', () => {})
  Object.assign(room, { server, wss, udp, port })
  return { port, pin: room.pin, token: room.token, name: room.name, ips: loopback ? ['127.0.0.1'] : lanAddrs().map((a) => a.address) }
}

async function stop() {
  const r = room
  if (!r) return
  room = null
  for (const p of r.peers.values()) {
    send(p.ws, { t: 'bye' })
    p.ws.close(4000, 'encerrado')
  }
  r.wss?.close()
  r.server?.close()
  try {
    r.udp?.close()
  } catch {}
  await fsp.rm(r.dir, { recursive: true, force: true }).catch(() => {})
}

// procura salas: manda "WL?" em broadcast e espera as respostas (resposta a broadcast não pede firewall)
async function discover(ms = 1400) {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true })
  const found = new Map()
  sock.on('message', (msg, rinfo) => {
    try {
      const d = JSON.parse(msg.toString())
      if (d.app !== 'workland' || !Number.isInteger(d.port)) return
      found.set(`${rinfo.address}:${d.port}`, { ip: rinfo.address, port: d.port, name: text(d.name, 60), by: text(d.by, 40), people: Number(d.people) || 0 })
    } catch {}
  })
  await new Promise((resolve) => {
    sock.once('error', resolve)
    sock.bind(0, loopback ? '127.0.0.1' : undefined, resolve)
  })
  sock.on('error', () => {})
  if (!loopback) sock.setBroadcast(true)
  const ask = () => {
    for (const t of broadcastTargets()) sock.send('WL?', DISCO, t, () => {})
  }
  ask()
  await new Promise((r) => setTimeout(r, ms / 2))
  ask()
  await new Promise((r) => setTimeout(r, ms / 2))
  sock.close()
  return [...found.values()]
}

// arquivo da apresentação: quem é anfitrião só registra o caminho; convidado manda pro anfitrião
function share({ file, base, pin }) {
  const name = path.basename(file)
  return fsp.stat(file).then((st) => {
    if (room && /^http:\/\/127\.0\.0\.1:/.test(base) && Number(new URL(base).port) === room.port) return { id: register({ path: file, type: typeOf(file), size: st.size, name }) }
    return new Promise((resolve, reject) => {
      const req = http.request(`${base}/files?pin=${encodeURIComponent(pin)}`, { method: 'POST', headers: { 'Content-Type': typeOf(file), 'Content-Length': st.size, 'x-name': encodeURIComponent(name) } }, (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => (res.statusCode === 200 ? resolve(JSON.parse(body)) : reject(new Error(`HTTP ${res.statusCode}`))))
      })
      req.on('error', reject)
      fs.createReadStream(file).pipe(req)
    })
  })
}

function setup({ ipcMain, app, testMode }) {
  loopback = !!testMode
  ipcMain.handle('meet:host', (_e, opts) => host(opts || {}))
  ipcMain.handle('meet:stop', () => stop())
  ipcMain.handle('meet:discover', () => discover())
  ipcMain.handle('meet:share', (_e, opts) => share(opts))
  app.on('will-quit', () => void stop())
}

module.exports = { setup }
