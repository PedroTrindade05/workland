// Chamadas diretas ao user32 (via koffi): listar janelas, encaixar o app real em cima do telão 3D
// (o encaixe por cima fica em overlay(); o repasse de mouse e teclado abaixo é do modo antigo, com a janela atrás)
const koffi = require('koffi')

const user32 = koffi.load('user32.dll')
const dwmapi = koffi.load('dwmapi.dll')
const gdi32 = koffi.load('gdi32.dll')
const kernel32 = koffi.load('kernel32.dll')

const RECT = koffi.struct('RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' })
const POINT = koffi.struct('POINT', { x: 'int32', y: 'int32' })
const WINDOWPLACEMENT = koffi.struct('WINDOWPLACEMENT', {
  length: 'uint',
  flags: 'uint',
  showCmd: 'uint',
  ptMinPosition: POINT,
  ptMaxPosition: POINT,
  rcNormalPosition: RECT,
})

const SetWindowPos = user32.func('bool __stdcall SetWindowPos(intptr hWnd, intptr after, int X, int Y, int cx, int cy, uint flags)')
const GetWindowRect = user32.func('bool __stdcall GetWindowRect(intptr hWnd, _Out_ RECT *rect)')
const GetClientRect = user32.func('bool __stdcall GetClientRect(intptr hWnd, _Out_ RECT *rect)')
const ClientToScreen = user32.func('bool __stdcall ClientToScreen(intptr hWnd, _Inout_ POINT *pt)')
const ScreenToClient = user32.func('bool __stdcall ScreenToClient(intptr hWnd, _Inout_ POINT *pt)')
const GetWindowPlacement = user32.func('bool __stdcall GetWindowPlacement(intptr hWnd, _Inout_ WINDOWPLACEMENT *wp)')
const ShowWindow = user32.func('bool __stdcall ShowWindow(intptr hWnd, int cmd)')
const SetForegroundWindow = user32.func('bool __stdcall SetForegroundWindow(intptr hWnd)')
const BringWindowToTop = user32.func('bool __stdcall BringWindowToTop(intptr hWnd)')
const IsIconic = user32.func('bool __stdcall IsIconic(intptr hWnd)')
const IsZoomed = user32.func('bool __stdcall IsZoomed(intptr hWnd)')
const IsWindow = user32.func('bool __stdcall IsWindow(intptr hWnd)')
const IsWindowVisible = user32.func('bool __stdcall IsWindowVisible(intptr hWnd)')
const GetWindowLongW = user32.func('long __stdcall GetWindowLongW(intptr hWnd, int idx)')
const GetWindow = user32.func('intptr __stdcall GetWindow(intptr hWnd, uint cmd)')
const GetClassNameW = user32.func('int __stdcall GetClassNameW(intptr hWnd, _Out_ uint16 *buf, int max)')
const GetWindowTextW = user32.func('int __stdcall GetWindowTextW(intptr hWnd, _Out_ uint16 *buf, int max)')
const keybd_event = user32.func('void __stdcall keybd_event(uint8 vk, uint8 scan, uint flags, uintptr extra)')
const PostMessageW = user32.func('bool __stdcall PostMessageW(intptr hWnd, uint msg, uintptr wParam, intptr lParam)')
const ChildWindowFromPointEx = user32.func('intptr __stdcall ChildWindowFromPointEx(intptr hWnd, POINT pt, uint flags)')
const MapWindowPoints = user32.func('int __stdcall MapWindowPoints(intptr from, intptr to, _Inout_ POINT *pts, uint n)')
const GetWindowThreadProcessId = user32.func('uint __stdcall GetWindowThreadProcessId(intptr hWnd, _Out_ uint32 *pid)')
const AttachThreadInput = user32.func('bool __stdcall AttachThreadInput(uint a, uint b, bool attach)')
const GetKeyboardState = user32.func('bool __stdcall GetKeyboardState(_Out_ uint8 *state)')
const SetKeyboardState = user32.func('bool __stdcall SetKeyboardState(uint8 *state)')
const MapVirtualKeyW = user32.func('uint __stdcall MapVirtualKeyW(uint code, uint type)')
const SetWindowRgn = user32.func('int __stdcall SetWindowRgn(intptr hWnd, intptr rgn, bool redraw)')
const GetWindowRgnBox = user32.func('int __stdcall GetWindowRgnBox(intptr hWnd, _Out_ RECT *rect)')
const GetForegroundWindow = user32.func('intptr __stdcall GetForegroundWindow()')
const GetWindowDpiAwarenessContext = user32.func('intptr __stdcall GetWindowDpiAwarenessContext(intptr hWnd)')
const SetThreadDpiAwarenessContext = user32.func('intptr __stdcall SetThreadDpiAwarenessContext(intptr ctx)')
const EnumWindowsProc = koffi.proto('bool __stdcall EnumWindowsProc(intptr hwnd, intptr lParam)')
const EnumWindows = user32.func('bool __stdcall EnumWindows(EnumWindowsProc *cb, intptr lParam)')
const DwmGetWindowAttribute = dwmapi.func('long __stdcall DwmGetWindowAttribute(intptr hwnd, uint attr, _Out_ RECT *pv, uint size)')
const DwmGetCloaked = dwmapi.func('long __stdcall DwmGetWindowAttribute(intptr hwnd, uint attr, _Out_ uint32 *pv, uint size)')
const CreateRectRgn = gdi32.func('intptr __stdcall CreateRectRgn(int x1, int y1, int x2, int y2)')
const CombineRgn = gdi32.func('int __stdcall CombineRgn(intptr dest, intptr a, intptr b, int mode)')
const DeleteObject = gdi32.func('bool __stdcall DeleteObject(intptr obj)')
const GetCurrentThreadId = kernel32.func('uint __stdcall GetCurrentThreadId()')
const OpenProcess = kernel32.func('intptr __stdcall OpenProcess(uint access, bool inherit, uint pid)')
const CloseHandle = kernel32.func('bool __stdcall CloseHandle(intptr h)')
const QueryFullProcessImageNameW = kernel32.func('bool __stdcall QueryFullProcessImageNameW(intptr proc, uint flags, _Out_ uint16 *buf, _Inout_ uint32 *size)')

const SWP = { NOSIZE: 0x1, NOMOVE: 0x2, NOZORDER: 0x4, NOACTIVATE: 0x10 }
const SW = { SHOWMINNOACTIVE: 7, SHOWNOACTIVATE: 4, RESTORE: 9, SHOWMAXIMIZED: 3 }

function hwndOf(sourceId) {
  const m = /^window:(\d+):/.exec(sourceId || '')
  return m ? Number(m[1]) : 0
}

function readWide(fn, h) {
  const buf = Buffer.alloc(1024)
  const n = fn(h, buf, 512)
  return buf.toString('utf16le', 0, n * 2)
}

// mede na escala da própria janela (app antigo enxerga coordenadas "virtuais")
function inWindowDpi(h, fn) {
  const prev = SetThreadDpiAwarenessContext(GetWindowDpiAwarenessContext(h))
  try {
    return fn()
  } finally {
    if (prev) SetThreadDpiAwarenessContext(prev)
  }
}

// ---------- quais janelas aparecem no salão ----------

// janelas do próprio Windows que não são apps
const SYSTEM_CLASSES = new Set(['Windows.UI.Core.CoreWindow', 'Shell_TrayWnd', 'Progman', 'WorkerW', 'XamlExplorerHostIslandWindow'])

function isRealHwnd(h) {
  if (!h || !IsWindow(h) || !IsWindowVisible(h)) return false
  if (GetWindowLongW(h, -20) & 0x80) return false
  if (GetWindow(h, 4)) return false
  if (SYSTEM_CLASSES.has(readWide(GetClassNameW, h))) return false
  const cloaked = [0]
  if (DwmGetCloaked(h, 14, cloaked, 4) === 0 && cloaked[0]) return false
  if (IsIconic(h)) return true
  const r = {}
  GetWindowRect(h, r)
  return r.right - r.left >= 240 && r.bottom - r.top >= 160
}
const isRealWindow = (sourceId) => isRealHwnd(hwndOf(sourceId))

function exePathOf(h) {
  const pid = [0]
  GetWindowThreadProcessId(h, pid)
  const proc = OpenProcess(0x1000, false, pid[0])
  if (!proc) return null
  try {
    const buf = Buffer.alloc(2048)
    const size = [1024]
    return QueryFullProcessImageNameW(proc, 0, buf, size) ? buf.toString('utf16le', 0, size[0] * 2) : null
  } finally {
    CloseHandle(proc)
  }
}

// todas as janelas de app, inclusive minimizadas (o capturador do Chromium ignora as minimizadas)
function listWindows(skip) {
  const out = []
  const cb = koffi.register((h) => {
    if (h !== skip && isRealHwnd(h)) {
      const name = readWide(GetWindowTextW, h)
      if (name) out.push({ id: `window:${h}:0`, name, minimized: IsIconic(h), exe: exePathOf(h) })
    }
    return true
  }, koffi.pointer(EnumWindowsProc))
  try {
    EnumWindows(cb, 0)
  } finally {
    koffi.unregister(cb)
  }
  return out
}

// ---------- trazer pra frente (fora do mundo) ----------

// o Windows só deixa trocar o foco se a gente "apertar" uma tecla antes
function forceForeground(h) {
  if (SetForegroundWindow(h)) return
  keybd_event(0x12, 0, 0, 0)
  keybd_event(0x12, 0, 2, 0)
  SetForegroundWindow(h)
  BringWindowToTop(h)
}

function focus(sourceId) {
  const h = hwndOf(sourceId)
  if (!h || !IsWindow(h)) return false
  if (IsIconic(h)) ShowWindow(h, SW.RESTORE)
  forceForeground(h)
  return true
}

// ---------- o furo: um quadradinho de 3px no canto do Workland ----------
// Com a janela recortada, os apps atrás não se acham "cobertos" e continuam desenhando
// (senão o telão congela), e a rodinha do mouse dos apps Chromium passa por ele.

const hole = { hwnd: 0, x: 0, y: 0 }

function setHole(worklandHwnd) {
  const wr = {}
  const cr = {}
  const pt = { x: 0, y: 0 }
  GetWindowRect(worklandHwnd, wr)
  GetClientRect(worklandHwnd, cr)
  ClientToScreen(worklandHwnd, pt)
  // ponto do furo, em coordenadas de tela: dentro da área visível, no cantinho de baixo à direita
  const hx = pt.x + cr.right - 4
  const hy = pt.y + cr.bottom - 4
  const rgn = CreateRectRgn(0, 0, wr.right - wr.left, wr.bottom - wr.top)
  const cut = CreateRectRgn(hx - wr.left - 1, hy - wr.top - 1, hx - wr.left + 2, hy - wr.top + 2)
  CombineRgn(rgn, rgn, cut, 4)
  DeleteObject(cut)
  SetWindowRgn(worklandHwnd, rgn, true)
  Object.assign(hole, { hwnd: worklandHwnd, x: hx, y: hy })
}

// ---------- usar o app no telão ----------

// janelas que a gente mexeu (restaurou/moveu) pra devolver como estavam ao sair do Workland
const touched = new Map()

function remember(h) {
  if (touched.has(h)) return
  const wp = { length: koffi.sizeof(WINDOWPLACEMENT) }
  GetWindowPlacement(h, wp)
  touched.set(h, wp)
}

// deixa a janela pronta pra ser usada de dentro: aberta (sem roubar o foco), logo atrás do Workland
function prepare(sourceId) {
  const h = hwndOf(sourceId)
  if (!h || !IsWindow(h)) return false
  remember(h)
  if (hole.hwnd) SetWindowPos(h, hole.hwnd, 0, 0, 0, 0, SWP.NOMOVE | SWP.NOSIZE | SWP.NOACTIVATE)
  if (IsIconic(h) || IsZoomed(h)) ShowWindow(h, SW.SHOWNOACTIVATE)
  if (hole.hwnd) SetWindowPos(h, hole.hwnd, 0, 0, 0, 0, SWP.NOMOVE | SWP.NOSIZE | SWP.NOACTIVATE)
  return true
}

// devolve tudo como estava (chamado quando o Workland perde o foco ou fecha;
// nessa hora o Windows não deixa a gente roubar o foco de ninguém)
function restoreTouched() {
  for (const [h, wp] of touched) {
    if (!IsWindow(h)) continue
    const n = wp.rcNormalPosition
    if (!IsIconic(h)) {
      SetWindowPos(h, 0, n.left, n.top, n.right - n.left, n.bottom - n.top, SWP.NOZORDER | SWP.NOACTIVATE)
      SetWindowPos(h, 0, n.left, n.top, n.right - n.left, n.bottom - n.top, SWP.NOZORDER | SWP.NOACTIVATE)
    }
    if (wp.showCmd === 2) ShowWindow(h, SW.SHOWMINNOACTIVE)
    else if (wp.showCmd === 3) ShowWindow(h, SW.SHOWMAXIMIZED)
  }
  touched.clear()
}

// onde fica a área útil (cliente) dentro do retângulo da janela
function frameOf(h) {
  const wr = {}
  const cr = {}
  const pt = { x: 0, y: 0 }
  GetWindowRect(h, wr)
  GetClientRect(h, cr)
  ClientToScreen(h, pt)
  return { offX: pt.x - wr.left, offY: pt.y - wr.top, extraW: wr.right - wr.left - cr.right, extraH: wr.bottom - wr.top - cr.bottom }
}

// deixa a área útil da janela com o tamanho exato (pixels físicos) de onde ela aparece no Workland,
// logo atrás dele: o app se redesenha nesse tamanho e a imagem fica 1:1, nítida.
// Devolve quanto cortar da imagem capturada (moldura visível) pra sobrar só a área útil.
function fit(sourceId, rect) {
  const h = hwndOf(sourceId)
  if (!h || !IsWindow(h)) return null
  remember(h)
  if (IsIconic(h) || IsZoomed(h)) ShowWindow(h, SW.SHOWNOACTIVATE)
  const flags = SWP.NOACTIVATE | (hole.hwnd ? 0 : SWP.NOZORDER)
  // várias vezes: trocar de monitor muda a escala e as bordas do app
  for (let i = 0; i < 3; i++) {
    const f = frameOf(h)
    SetWindowPos(h, hole.hwnd, rect.x - f.offX, rect.y - f.offY, rect.width + f.extraW, rect.height + f.extraH, flags)
  }
  const fr = {}
  if (DwmGetWindowAttribute(h, 9, fr, koffi.sizeof(RECT)) !== 0) GetWindowRect(h, fr)
  const pt = { x: 0, y: 0 }
  const cr = {}
  ClientToScreen(h, pt)
  GetClientRect(h, cr)
  const W = Math.max(1, fr.right - fr.left)
  const H = Math.max(1, fr.bottom - fr.top)
  return {
    left: Math.max(0, (pt.x - fr.left) / W),
    top: Math.max(0, (pt.y - fr.top) / H),
    right: Math.max(0, (fr.right - (pt.x + cr.right)) / W),
    bottom: Math.max(0, (fr.bottom - (pt.y + cr.bottom)) / H),
    width: cr.right,
    height: cr.bottom,
  }
}

// ---------- a janela de verdade por cima do telão ----------
// A área útil do app fica exatamente onde o telão aparece no Workland (pixel a pixel)
// e o resto da janela (barra de título, bordas, sombra) é cortado com uma região.

const over = { h: 0, pid: 0, seen: false }

function pidOf(h) {
  const pid = [0]
  GetWindowThreadProcessId(h, pid)
  return pid[0]
}

// corta a janela na área útil, no máximo do tamanho pedido (app com tamanho mínimo maior fica cortado, não vaza)
function clipToClient(h, maxW, maxH) {
  const wrP = {}
  GetWindowRect(h, wrP)
  inWindowDpi(h, () => {
    const wr = {}
    const cr = {}
    const pt = { x: 0, y: 0 }
    GetWindowRect(h, wr)
    GetClientRect(h, cr)
    ClientToScreen(h, pt)
    // app antigo enxerga coordenadas "virtuais": converte o tamanho pedido pra escala dele
    const k = (wr.right - wr.left) / Math.max(1, wrP.right - wrP.left)
    const x = pt.x - wr.left
    const y = pt.y - wr.top
    const w = Math.min(cr.right, Math.round(maxW * k))
    const hh = Math.min(cr.bottom, Math.round(maxH * k))
    SetWindowRgn(h, CreateRectRgn(x, y, x + w, y + hh), true)
  })
}

// rect em pixels físicos da tela; activate = trazer pro primeiro plano (no teste escondido não)
function overlay(sourceId, rect, activate) {
  const h = hwndOf(sourceId)
  if (!h || !IsWindow(h)) return null
  if (over.h && over.h !== h) endOverlay()
  remember(h)
  if (IsIconic(h) || IsZoomed(h)) ShowWindow(h, SW.SHOWNOACTIVATE)
  SetWindowRgn(h, 0, false)
  // várias vezes: trocar de monitor muda a escala e as bordas do app
  for (let i = 0; i < 3; i++) {
    const f = frameOf(h)
    SetWindowPos(h, 0, rect.x - f.offX, rect.y - f.offY, rect.width + f.extraW, rect.height + f.extraH, SWP.NOACTIVATE)
  }
  clipToClient(h, rect.width, rect.height)
  if (over.h !== h) Object.assign(over, { h, pid: pidOf(h), seen: false })
  if (activate) forceForeground(h)
  return placed(h)
}

// onde a área visível do app ficou (pixels físicos), pra conferir o encaixe
function placed(h) {
  const pt = { x: 0, y: 0 }
  const cr = {}
  const wr = {}
  const box = {}
  ClientToScreen(h, pt)
  GetClientRect(h, cr)
  GetWindowRect(h, wr)
  const clip = GetWindowRgnBox(h, box) ? { x: wr.left + box.left, y: wr.top + box.top, width: box.right - box.left, height: box.bottom - box.top } : null
  return { client: { x: pt.x, y: pt.y, width: cr.right, height: cr.bottom }, clip }
}

// quem está em primeiro plano agora: o app (ou um menu/diálogo dele), o Workland, outro app, ou o app fechou
function overlayState(worklandHwnd) {
  if (!over.h) return 'none'
  if (!IsWindow(over.h)) return 'gone'
  const fg = GetForegroundWindow()
  if (!fg) return 'app'
  if (fg === worklandHwnd) return over.seen ? 'workland' : 'app'
  if (fg === over.h || pidOf(fg) === over.pid) {
    over.seen = true
    return 'app'
  }
  return 'other'
}
const overlayActive = () => !!over.h

// tira o corte e devolve a janela pro lugar e tamanho de antes
function endOverlay() {
  const h = over.h
  over.h = 0
  if (!h || !IsWindow(h)) return
  SetWindowRgn(h, 0, true)
  const wp = touched.get(h)
  if (!wp) return
  touched.delete(h)
  const n = wp.rcNormalPosition
  SetWindowPos(h, 0, n.left, n.top, n.right - n.left, n.bottom - n.top, SWP.NOZORDER | SWP.NOACTIVATE)
  if (wp.showCmd === 2) ShowWindow(h, SW.SHOWMINNOACTIVE)
  else if (wp.showCmd === 3) ShowWindow(h, SW.SHOWMAXIMIZED)
}

const WM = { MOVE: 0x200, LDOWN: 0x201, LUP: 0x202, LDBL: 0x203, RDOWN: 0x204, RUP: 0x205, RDBL: 0x206, MDOWN: 0x207, MUP: 0x208, WHEEL: 0x20a, HWHEEL: 0x20e, KEYDOWN: 0x100, KEYUP: 0x101, CHAR: 0x102 }
const MK = { 0: 0x1, 1: 0x10, 2: 0x2 }
const held = new Map()
const lp = (x, y) => ((y & 0xffff) << 16) | (x & 0xffff)

// u,v (0..1, origem no canto de cima) da imagem capturada -> ponto na tela (pixels físicos)
function physicalPointOf(h, u, v) {
  const fr = {}
  if (DwmGetWindowAttribute(h, 9, fr, koffi.sizeof(RECT)) !== 0) GetWindowRect(h, fr)
  return { x: fr.left + u * (fr.right - fr.left), y: fr.top + v * (fr.bottom - fr.top) }
}

// ponto físico -> ponto na escala da janela
function toWindowScale(h, p) {
  const wrP = {}
  GetWindowRect(h, wrP)
  return inWindowDpi(h, () => {
    const wrL = {}
    GetWindowRect(h, wrL)
    const s = (wrP.right - wrP.left) / Math.max(1, wrL.right - wrL.left)
    return { x: Math.round(wrL.left + (p.x - wrP.left) / s), y: Math.round(wrL.top + (p.y - wrP.top) / s) }
  })
}

// janela filha mais funda naquele ponto (apps Win32 clássicos têm controles filhos)
function targetAt(h, screenPt) {
  return inWindowDpi(h, () => {
    let cur = h
    const pt = { ...screenPt }
    ScreenToClient(cur, pt)
    for (let i = 0; i < 8; i++) {
      const child = ChildWindowFromPointEx(cur, pt, 0x1 | 0x2 | 0x4)
      if (!child || child === cur) break
      MapWindowPoints(cur, child, pt, 1)
      cur = child
    }
    return { hwnd: cur, x: pt.x, y: pt.y }
  })
}

// u,v sobre a área útil (é o que a imagem nítida mostra) -> ponto na tela (pixels físicos)
function clientPointOf(h, u, v) {
  const pt = { x: 0, y: 0 }
  const cr = {}
  ClientToScreen(h, pt)
  GetClientRect(h, cr)
  return { x: pt.x + u * cr.right, y: pt.y + v * cr.bottom }
}
const physOf = (h, ev) => (ev.space === 'client' ? clientPointOf(h, ev.u, ev.v) : physicalPointOf(h, ev.u, ev.v))

// a rodinha dos apps Chromium só vale se o ponto estiver "em cima" deles:
// encosta o ponto da janela no furo do Workland (ela continua escondida atrás)
function underHole(h, p) {
  if (!hole.hwnd) return null
  remember(h)
  if (IsZoomed(h)) ShowWindow(h, SW.SHOWNOACTIVATE)
  const wr = {}
  GetWindowRect(h, wr)
  const dx = Math.round(hole.x - p.x)
  const dy = Math.round(hole.y - p.y)
  if (dx || dy) SetWindowPos(h, hole.hwnd, wr.left + dx, wr.top + dy, 0, 0, SWP.NOSIZE | SWP.NOACTIVATE)
  return { x: hole.x, y: hole.y }
}

let lastKeyTarget = 0

function mouse(sourceId, ev) {
  const h = hwndOf(sourceId)
  if (!h || !IsWindow(h)) return false
  const flags = [...held.values()].reduce((a, b) => a | b, 0)
  if (ev.type === 'wheel') {
    const p0 = physOf(h, ev)
    const phys = underHole(h, p0) ?? p0
    const sp = toWindowScale(h, phys)
    const t = targetAt(h, sp)
    const delta = Math.max(-32768, Math.min(32767, Math.round(ev.delta)))
    return PostMessageW(t.hwnd, ev.horizontal ? WM.HWHEEL : WM.WHEEL, ((delta & 0xffff) * 0x10000 + flags) >>> 0, lp(sp.x, sp.y))
  }
  const sp = toWindowScale(h, physOf(h, ev))
  const t = targetAt(h, sp)
  if (ev.type === 'move') return PostMessageW(t.hwnd, WM.MOVE, flags, lp(t.x, t.y))
  const b = ev.button ?? 0
  if (ev.type === 'down' || ev.type === 'dbl') {
    held.set(b, MK[b] ?? 0)
    // o clique decide quem recebe o teclado depois (campo de texto filho, por exemplo)
    lastKeyTarget = t.hwnd
    const msg = b === 2 ? (ev.type === 'dbl' ? WM.RDBL : WM.RDOWN) : b === 1 ? WM.MDOWN : ev.type === 'dbl' ? WM.LDBL : WM.LDOWN
    return PostMessageW(t.hwnd, msg, flags | (MK[b] ?? 0), lp(t.x, t.y))
  }
  if (ev.type === 'up') {
    held.delete(b)
    const msg = b === 2 ? WM.RUP : b === 1 ? WM.MUP : WM.LUP
    return PostMessageW(t.hwnd, msg, flags & ~(MK[b] ?? 0), lp(t.x, t.y))
  }
  return false
}

const mod = { saved: null, tid: 0, attached: false, timer: 0 }
function endModifiers() {
  clearTimeout(mod.timer)
  if (!mod.saved) return
  SetKeyboardState(mod.saved)
  if (mod.attached) AttachThreadInput(GetCurrentThreadId(), mod.tid, false)
  mod.saved = null
  mod.attached = false
}

// texto vai como WM_CHAR; teclas especiais e atalhos como WM_KEYDOWN/UP.
// Atalhos com Ctrl/Alt/Shift: junta a fila de entrada com a do app por um instante
// pra ele enxergar o modificador (GetKeyState).
function key(sourceId, ev) {
  const h = hwndOf(sourceId)
  if (!h || !IsWindow(h)) return false
  const sameApp = lastKeyTarget && IsWindow(lastKeyTarget) && GetWindowThreadProcessId(lastKeyTarget, null) === GetWindowThreadProcessId(h, null)
  const target = sameApp ? lastKeyTarget : h
  if (ev.type === 'char') {
    for (const ch of ev.text) PostMessageW(target, WM.CHAR, ch.codePointAt(0), 1)
    return true
  }
  const scan = MapVirtualKeyW(ev.vk, 0)
  const lParam = (1 | (scan << 16) | (ev.extended ? 1 << 24 : 0) | (ev.down ? 0 : 0xc0000000)) | 0
  if (!(ev.ctrl || ev.alt || ev.shift)) return PostMessageW(target, ev.down ? WM.KEYDOWN : WM.KEYUP, ev.vk, lParam)
  const me = GetCurrentThreadId()
  const tid = GetWindowThreadProcessId(target, null)
  if (!mod.saved || mod.tid !== tid) {
    endModifiers()
    mod.tid = tid
    mod.attached = !!(tid && tid !== me && AttachThreadInput(me, tid, true))
    mod.saved = Buffer.alloc(256)
    GetKeyboardState(mod.saved)
  }
  const state = Buffer.from(mod.saved)
  if (ev.ctrl) state[0x11] = state[0xa2] = 0x80
  if (ev.alt) state[0x12] = state[0xa4] = 0x80
  if (ev.shift) state[0x10] = state[0xa0] = 0x80
  SetKeyboardState(state)
  PostMessageW(target, ev.down ? WM.KEYDOWN : WM.KEYUP, ev.vk, lParam)
  clearTimeout(mod.timer)
  mod.timer = setTimeout(endModifiers, 80)
  return true
}

module.exports = { isRealWindow, listWindows, focus, setHole, prepare, fit, restoreTouched, mouse, key, overlay, overlayState, overlayActive, endOverlay, placed, hwndOf }
