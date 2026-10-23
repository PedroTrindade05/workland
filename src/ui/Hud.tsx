import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { pc, type UpdateInfo } from '../pc'
import { spawnWebScreen, teleport, useUI } from '../store'
import { goToKind } from '../objects/nav'
import { useCurrentRoom, useRooms } from '../rooms'
import { BuildBar, ItemEditor, Onboarding, Panels } from './Panels'
import { THEMES } from '../themes'
import { normalizeUrl } from '../objects/web'
import { enterWindow, launchApp, leaveWindow, openShortcut } from '../inside'
import { PresentBar } from './PresentBar'
import { useMeet } from '../meet/net'

// ---------- ícones (traço fino) ----------

const ICONS: Record<string, ReactNode> = {
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </>
  ),
  folder: <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />,
  screen: (
    <>
      <rect x="3" y="4.5" width="18" height="12" rx="1.5" />
      <path d="M8 20h8M12 16.5V20" />
    </>
  ),
  pulse: <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 13l9 5 9-5" />
    </>
  ),
  build: (
    <>
      <path d="M4 20h16" />
      <path d="M6 20V10l6-5 6 5v10" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  rooms: (
    <>
      <rect x="3" y="4" width="8" height="7" rx="1.5" />
      <rect x="13" y="4" width="8" height="7" rx="1.5" />
      <rect x="3" y="13" width="8" height="7" rx="1.5" />
      <path d="M13 16.5h8M17 13v7" />
    </>
  ),
  scenes: <path d="M5 4l14 8-14 8z" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5" />
      <circle cx="17" cy="9.5" r="2.4" />
      <path d="M16.5 14.6c2.4.2 4 1.7 4.5 4.4" />
    </>
  ),
  shirt: <path d="M9 3.5 4 6l-1.5 4.5 3 1.2V20.5h13V11.7l3-1.2L20 6l-5-2.5c-.6 1.5-1.6 2.3-3 2.3S9.6 5 9 3.5z" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2.1-2.4 3.6M12 17h.01" />
    </>
  ),
}

// texto que dá pra ler em cima da cor de destaque (tema Galeria tem destaque escuro)
function onAccent(hex: string) {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16)
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
  return lum > 0.5 ? '#111' : '#f6f5f2'
}

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </svg>
  )
}


export const DOCK = [
  { key: '1', icon: 'globe', name: 'Navegador', run: () => spawnWebScreen('https://www.google.com') },
  { key: '2', icon: 'search', name: 'Buscar', run: () => useUI.getState().setCmdOpen(true) },
  { key: '3', icon: 'grid', name: 'Atalhos', run: () => goToKind('shortcut-wall') },
  { key: '4', icon: 'screen', name: 'Telas', run: () => goToKind('screen-wall') },
  { key: '5', icon: 'pulse', name: 'Sistema', run: () => goToKind('system-panel') },
]

function Prompt() {
  const hover = useUI((s) => s.hover)
  const near = useUI((s) => s.near)
  const t = hover ?? near
  if (!t) return null
  return (
    <div className="prompt" key={t.id}>
      <span className="prompt-main">
        <kbd>E</kbd>
        <b>{t.verb}</b>
        <span className="prompt-title">{t.title}</span>
      </span>
      {t.grab && (
        <span className="prompt-alt">
          <kbd>G</kbd>
          {t.grab.verb}
        </span>
      )}
      {t.alt && (
        <span className="prompt-alt">
          <kbd>F</kbd>
          {t.alt.verb}
        </span>
      )}
    </div>
  )
}

function Toast() {
  const toast = useUI((s) => s.toast)
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!toast) return
    setShow(true)
    const t = setTimeout(() => setShow(false), 2400)
    return () => clearTimeout(t)
  }, [toast])
  if (!toast || !show) return null
  return (
    <div className="toast" key={toast.n}>
      {toast.text}
    </div>
  )
}

// versão nova já baixada por trás: avisa no canto, a pessoa reinicia quando quiser.
// Some enquanto usa um app no telão, mas continua montado pra lembrar do "Depois".
function UpdateNotice({ hidden }: { hidden: boolean }) {
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [later, setLater] = useState(false)
  const [restarting, setRestarting] = useState(false)
  useEffect(() => {
    pc.updateStatus().then((u) => u && setUpdate(u), () => {})
    return pc.onUpdate(setUpdate)
  }, [])
  if (!update || later || hidden) return null
  return (
    <div className="update">
      <span className="update-dot" />
      <span>Versão {update.version} pronta, reinicie quando quiser</span>
      <button
        className="primary"
        disabled={restarting}
        onClick={() => {
          setRestarting(true)
          pc.installUpdate().then((ok) => !ok && setRestarting(false), () => setRestarting(false))
        }}
      >
        {restarting ? 'Reiniciando...' : 'Reiniciar'}
      </button>
      <button className="update-later" onClick={() => setLater(true)} title="Ela entra sozinha quando você fechar o Workland">
        Depois
      </button>
    </div>
  )
}

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10_000)
    return () => clearInterval(id)
  }, [])
  return <>{now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</>
}

function Crosshair() {
  const view = useUI((s) => s.view)
  const hover = useUI((s) => !!s.hover)
  const locked = useUI((s) => s.locked)
  const dressing = useUI((s) => s.panel === 'avatar')
  if (view !== 'first' || dressing) return null
  return (
    <>
      <div className={`crosshair ${hover ? 'on' : ''}`} />
      {!locked && <div className="lock-hint">clique pra mirar com o mouse · Esc solta</div>}
    </>
  )
}

// ---------- usando um app de dentro do telão ----------
// O app de verdade fica por cima do Workland, com a área útil exatamente em cima do telão
// (a barra de título e as bordas são cortadas). Mouse e teclado vão direto pra ele, sem repasse.
// Clicar fora dele, Alt+Q, trocar de app ou fechar o app volta pro mundo.
function RealWindow() {
  const focus = useUI((s) => s.focus)
  const rect = focus?.phase === 'on' ? focus.rect : undefined
  const winId = focus?.winId
  const on = !!rect && !!winId

  useEffect(() => pc.onOverlayEnded(() => leaveWindow()), [])
  // encaixa (e reencaixa se o Workland mudar de tamanho)
  useEffect(() => {
    if (!rect || !winId) return
    const t = setTimeout(() => pc.overlay(winId, { x: rect.x, y: rect.y, width: rect.w, height: rect.h }), 60)
    return () => clearTimeout(t)
  }, [winId, rect?.x, rect?.y, rect?.w, rect?.h]) // eslint-disable-line react-hooks/exhaustive-deps
  // saiu do telão (Esc no mundo, Sair, outra tela): a janela volta pro lugar dela
  useEffect(() => {
    if (!on) return
    return () => void pc.overlayEnd()
  }, [on, winId])
  return null
}

function UsingBar() {
  const focus = useUI((s) => s.focus)
  if (!focus) return null
  return (
    <div className="focusbar">
      {focus.icon ? <img src={focus.icon} alt="" /> : <span className="dot" />}
      {focus.phase === 'in' && <>Indo pra {focus.title}...</>}
      {focus.phase === 'on' && (
        <>
          Usando <b>{focus.title}</b>
          <span className="sep" />
          clique fora do app ou <kbd>Alt</kbd>+<kbd>Q</kbd> volta pro mundo
        </>
      )}
      {focus.phase === 'out' && <>Voltando...</>}
      {focus.phase !== 'out' && (
        <>
          <button
            onClick={async () => {
              const id = focus.winId
              await pc.overlayEnd()
              leaveWindow()
              pc.focus(id)
            }}
          >
            Abrir fora
          </button>
          <button className="primary" onClick={() => leaveWindow()}>
            Sair
          </button>
        </>
      )}
    </div>
  )
}

// ---------- seletor de ambientes ----------

function ThemePicker() {
  const open = useUI((s) => s.themeOpen)
  const current = useUI((s) => s.themeId)
  const set = useUI((s) => s.setTheme)
  const quality = useUI((s) => s.quality)
  const setQuality = useUI((s) => s.setQuality)
  const close = () => useUI.getState().setThemeOpen(false)
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open])
  if (!open) return null
  return (
    <div className="modal" onPointerDown={close}>
      <div className="themes" onPointerDown={(e) => e.stopPropagation()}>
        <header>
          <h2>Ambiente</h2>
          <p>O salão é o mesmo, muda tudo em volta.</p>
        </header>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`theme-card ${t.id === current ? 'on' : ''}`}
              onClick={() => {
                set(t.id)
                useRooms.getState().setRoomTheme(useRooms.getState().roomId, t.id)
              }}
            >
              <span className="theme-preview" style={{ background: t.preview }}>
                <span className="theme-accent" style={{ background: t.accent }} />
              </span>
              <span className="theme-text">
                <b>{t.name}</b>
                <small>{t.tagline}</small>
              </span>
            </button>
          ))}
        </div>
        <div className="quality">
          <span>
            <b>Qualidade gráfica</b>
            <small>{QUALITY_HINT[quality]}</small>
          </span>
          <div className="segmented">
            {(['leve', 'equilibrada', 'alta'] as const).map((q) => (
              <button key={q} className={q === quality ? 'on' : ''} onClick={() => setQuality(q)}>
                {q[0].toUpperCase() + q.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const QUALITY_HINT = {
  leve: 'sem pós-processamento nem sombras, pra máquinas modestas',
  equilibrada: 'brilho e sombras, reflexo do ambiente no piso',
  alta: 'reflexo em tempo real e mais resolução, pede placa de vídeo',
}

// ---------- barra de comando ----------

type Result = { key: string; icon: string | null; glyph?: string; title: string; sub: string; run: () => void; go?: () => void }

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

function CommandBar() {
  const open = useUI((s) => s.cmdOpen)
  const setOpen = useUI((s) => s.setCmdOpen)
  const shortcuts = useUI((s) => s.shortcuts)
  const apps = useUI((s) => s.apps)
  const places = useUI((s) => s.places)
  const windows = useUI((s) => s.windows)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setSel(0)
      if (document.pointerLockElement) document.exitPointerLock()
      setTimeout(() => input.current?.focus(), 0)
    }
  }, [open])

  const results = useMemo<Result[]>(() => {
    const raw = q.trim()
    const f = fold(raw)
    const out: Result[] = []
    const looksUrl = /^https?:\/\//i.test(raw) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(raw)
    if (looksUrl) out.push({ key: 'url', icon: null, glyph: '↗', title: normalizeUrl(raw), sub: 'Abrir numa tela aqui no salão', run: () => spawnWebScreen(normalizeUrl(raw)) })
    windows
      .filter((w) => f && fold(w.name).includes(f))
      .forEach((w) =>
        out.push({ key: `w:${w.id}`, icon: w.icon, glyph: '▣', title: w.name, sub: 'Janela aberta · Enter entra na tela', run: () => enterWindow(w.id), go: () => goToKind('screen-wall') }),
      )
    shortcuts
      .filter((s) => !f || fold(s.name).includes(f))
      .forEach((s) =>
        out.push({ key: `s:${s.id}`, icon: s.icon ?? null, glyph: '◇', title: s.name, sub: 'Atalho · Enter abre aqui dentro', run: () => openShortcut(s), go: () => goToKind('shortcut-wall') }),
      )
    // fora dos atalhos, o resto só aparece quando você digita
    if (f) {
      places
        .filter((p) => fold(p.name).includes(f))
        .forEach((p) => out.push({ key: `p:${p.key}`, icon: null, glyph: '▤', title: p.name, sub: 'Pasta · abre no Explorer', run: () => pc.open(p.path) }))
      const known = new Set(shortcuts.map((s) => fold(s.name)))
      apps
        .filter((a) => fold(a.name).includes(f) && !known.has(fold(a.name)))
        .slice(0, 20)
        .forEach((a) => out.push({ key: `a:${a.id}`, icon: a.icon, glyph: '◇', title: a.name, sub: 'App do menu Iniciar · Enter abre aqui dentro', run: () => launchApp(a) }))
    }
    if (f && !looksUrl)
      out.push({ key: 'search', icon: null, glyph: '⌕', title: `Pesquisar "${raw}"`, sub: 'Abre uma tela do Google na sua frente', run: () => spawnWebScreen(normalizeUrl(raw)) })
    return out.slice(0, 9)
  }, [q, shortcuts, apps, places, windows])

  if (!open) return null
  const pick = (r: Result | undefined, goThere: boolean) => {
    if (!r) return
    setOpen(false)
    if (goThere && r.go) r.go()
    else r.run()
  }
  return (
    <div className="modal top" onPointerDown={() => setOpen(false)}>
      <div className="cmd" onPointerDown={(e) => e.stopPropagation()}>
        <div className="cmd-input">
          <Icon name="search" />
          <input
            ref={input}
            value={q}
            placeholder="Atalho, app, janela ou site"
            spellCheck={false}
            onChange={(e) => {
              setQ(e.target.value)
              setSel(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false)
              if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => Math.min(s + 1, results.length - 1)))
              if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(s - 1, 0)))
              if (e.key === 'Enter') pick(results[sel], false)
              if (e.key === 'Tab') (e.preventDefault(), pick(results[sel], true))
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="cmd-list">
          {results.map((r, i) => (
            <button key={r.key} className={i === sel ? 'on' : ''} onMouseEnter={() => setSel(i)} onClick={() => pick(r, false)}>
              {r.icon ? <img src={r.icon} alt="" /> : <span className="glyph">{r.glyph}</span>}
              <span className="cmd-text">
                <b>{r.title}</b>
                <small>{r.sub}</small>
              </span>
              {r.go && (
                <span
                  className="cmd-go"
                  onClick={(e) => {
                    e.stopPropagation()
                    pick(r, true)
                  }}
                >
                  Tab · ir até
                </span>
              )}
            </button>
          ))}
          {!results.length && <div className="cmd-empty">Nada encontrado</div>}
        </div>
      </div>
    </div>
  )
}

function Help({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal" onPointerDown={onClose}>
      <div className="help" onPointerDown={(e) => e.stopPropagation()}>
        <h2>Como andar por aqui</h2>
        <dl>
          <dt>
            <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd>
          </dt>
          <dd>andar, com Shift corre e Espaço pula</dd>
          <dt>mouse</dt>
          <dd>arrastar gira a câmera, roda aproxima</dd>
          <dt>
            <kbd>V</kbd>
          </dt>
          <dd>alterna 1ª e 3ª pessoa</dd>
          <dt>
            <kbd>E</kbd> ou clique
          </dt>
          <dd>abre o que está na mira</dd>
          <dt>
            <kbd>F</kbd>
          </dt>
          <dd>ação extra (abrir fora, mostrar no Explorer)</dd>
          <dt>telas</dt>
          <dd>E (ou clique) chega perto e você usa o app ali mesmo: mouse, rolagem e teclado vão pra ele. Esc volta</dd>
          <dt>
            <kbd>G</kbd> ou segurar
          </dt>
          <dd>pega uma tela e leva junto; G de novo (ou soltar o clique) larga onde você está</dd>
          <dt>
            <kbd>F</kbd> na tela solta
          </dt>
          <dd>devolve a tela pro painel dela</dd>
          <dt>
            <kbd>/</kbd>
          </dt>
          <dd>buscar qualquer coisa</dd>
          <dt>
            <kbd>T</kbd>
          </dt>
          <dd>trocar de ambiente</dd>
          <dt>
            <kbd>P</kbd>
          </dt>
          <dd>provador: chapéu, roupa, rosto e cores do seu boneco</dd>
          <dt>
            <kbd>M</kbd>
          </dt>
          <dd>encontro: cria ou entra numa sala com o pessoal da rede pra apresentar</dd>
          <dt>palco</dt>
          <dd>E no púlpito escolhe o que mostrar; PageDown/PageUp passam as páginas (setas também, assistindo)</dd>
          <dt>
            <kbd>B</kbd>
          </dt>
          <dd>modo construção: coloca, move, gira e apaga objetos; cada sala guarda o seu</dd>
          <dt>
            <kbd>1</kbd> a <kbd>5</kbd>
          </dt>
          <dd>atalhos do dock</dd>
          <dt>controle</dt>
          <dd>analógicos andam e giram, A usa, X pega tela, B volta, LB/RB trocam de sala</dd>
        </dl>
        <button className="primary" onClick={onClose}>
          Bora
        </button>
      </div>
    </div>
  )
}

export function Hud() {
  const section = useUI((s) => s.section)
  const build = useRooms((s) => s.build)
  const room = useCurrentRoom()
  const ready = useRooms((s) => s.ready)
  const view = useUI((s) => s.view)
  const focus = useUI((s) => s.focus)
  const theme = useUI((s) => s.theme)
  const apps = useUI((s) => s.apps)
  // provador aberto: a tela fica só pro boneco e pro painel
  const dressing = useUI((s) => s.panel === 'avatar')
  // assistindo o telão: some o dock, fica só a barra da apresentação
  const watching = useUI((s) => s.watching)
  const meetOn = useMeet((s) => s.status === 'on')
  const [help, setHelp] = useState(() => {
    try {
      return useRooms.getState().ready && !localStorage.getItem('workland.seenHelp2')
    } catch {
      return true
    }
  })
  const closeHelp = () => {
    setHelp(false)
    try {
      localStorage.setItem('workland.seenHelp2', '1')
    } catch {}
  }

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el && ['INPUT', 'TEXTAREA', 'SELECT', 'WEBVIEW', 'IFRAME'].includes(el.tagName)) return
      const ui = useUI.getState()
      if (ui.focus || !useRooms.getState().ready) return
      if (e.key === 'Escape' && ui.panel) return ui.setPanel(null)
      if (e.key === 'Escape' && ui.watching) return ui.setWatching(false)
      if (e.key === '/' || (e.ctrlKey && e.key.toLowerCase() === 'k')) {
        e.preventDefault()
        ui.setCmdOpen(true)
        return
      }
      if (ui.cmdOpen || ui.themeOpen || ui.panel || ui.editItem) return
      const k = e.key.toLowerCase()
      if (k === 'b' && !e.ctrlKey) {
        if (document.pointerLockElement) document.exitPointerLock()
        useRooms.getState().setBuild(!useRooms.getState().build)
        return
      }
      if (useRooms.getState().build) return
      if (k === 'h') setHelp((h) => !h)
      if (k === 'p') ui.setPanel('avatar')
      if (k === 'm') ui.setPanel('meet')
      if (k === 't') {
        if (document.pointerLockElement) document.exitPointerLock()
        ui.setThemeOpen(true)
      }
      const slot = DOCK.find((s) => s.key === e.key)
      if (slot && !e.ctrlKey && !e.altKey) slot.run()
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [])

  return (
    <div className={`hud ${theme.dark ? 'dark' : 'light'} ${focus ? 'focused' : ''}`} style={{ ['--accent' as string]: theme.accent, ['--on-accent' as string]: onAccent(theme.accent) }}>
      <div className="brand">
        <span className="mark" />
        <span className="word">workland</span>
        <span className="meta">
          {room && section !== room.name ? `${room.name} · ${section}` : section} · <Clock />
        </span>
        {!pc.native && <span className="chip warn">navegador: dados de exemplo</span>}
        {pc.native && !apps.length && <span className="chip">lendo seus apps...</span>}
      </div>
      <Crosshair />
      <RealWindow />
      <UsingBar />
      {!focus && !dressing && <Prompt />}
      <Toast />
      <UpdateNotice hidden={!!focus || dressing} />
      {!focus && !build && ready && !dressing && <PresentBar low={watching} />}
      {!focus && !build && ready && !dressing && !watching && (
        <nav className="dock">
          {DOCK.map((s) => (
            <button key={s.key} onClick={s.run} title={`${s.name} (${s.key})`}>
              <Icon name={s.icon} />
              <span>{s.name}</span>
            </button>
          ))}
          <i className="dock-sep" />
          <button
            onClick={() => {
              if (document.pointerLockElement) document.exitPointerLock()
              useRooms.getState().setBuild(true)
            }}
            title="Modo construção (B)"
          >
            <Icon name="build" />
            <span>Construir</span>
          </button>
          <button onClick={() => useUI.getState().setPanel('rooms')} title="Salas">
            <Icon name="rooms" />
            <span>Salas</span>
          </button>
          <button onClick={() => useUI.getState().setPanel('scenes')} title="Cenas de trabalho">
            <Icon name="scenes" />
            <span>Cenas</span>
          </button>
          <button onClick={() => useUI.getState().setPanel('meet')} title="Encontro com o pessoal na rede (M)" className={meetOn ? 'live' : ''}>
            <Icon name="users" />
            <span>Encontro</span>
          </button>
          <i className="dock-sep" />
          <button onClick={() => useUI.getState().toggleView()} title="Alternar visão (V)">
            <Icon name="eye" />
            <span>{view === 'first' ? '1ª pessoa' : '3ª pessoa'}</span>
          </button>
          <button onClick={() => useUI.getState().setThemeOpen(true)} title="Ambiente (T)">
            <Icon name="layers" />
            <span>{theme.name}</span>
          </button>
          <button onClick={() => useUI.getState().setPanel('avatar')} title="Provador (P)">
            <Icon name="shirt" />
            <span>Provador</span>
          </button>
          <button onClick={() => useUI.getState().setPanel('settings')} title="Ajustes">
            <Icon name="gear" />
            <span>Ajustes</span>
          </button>
          <button onClick={() => setHelp(true)} title="Ajuda (H)">
            <Icon name="help" />
            <span>Ajuda</span>
          </button>
        </nav>
      )}
      <BuildBar />
      <CommandBar />
      <ThemePicker />
      <ItemEditor />
      <Panels />
      <Onboarding />
      {help && <Help onClose={closeHelp} />}
    </div>
  )
}
