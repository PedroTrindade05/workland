import { useEffect, useMemo, useRef, useState } from 'react'
import { useUI, wardrobe } from '../store'
import { COLOR_KEYS, PATTERNS, PRESETS, SHAPES, SLOTS, SWATCHES, randomLook, resolveLook, type Look } from '../avatar/look'
import './wardrobe.css'

type Tab = 'prontos' | (typeof SLOTS)[number]['key'] | 'cores'
const TABS: { id: Tab; label: string }[] = [{ id: 'prontos', label: 'Prontos' }, ...SLOTS.filter((s) => s.key !== 'feet').map((s) => ({ id: s.key as Tab, label: s.label })), { id: 'cores', label: 'Cores' }]

const same = (a: Look, b: Look) => (Object.keys(a) as (keyof Look)[]).every((k) => a[k] === b[k])

// ---------- provador: painel do lado, boneco de verdade no mundo (a câmera vem pra frente dele) ----------

export function Wardrobe() {
  const raw = useUI((s) => s.settings.avatar)
  const theme = useUI((s) => s.theme)
  const look = useMemo(() => resolveLook(raw, theme), [raw, theme])
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const saved = localStorage.getItem('workland.wardrobeTab')
      return TABS.find((t) => t.id === saved)?.id ?? 'prontos'
    } catch {
      return 'prontos'
    }
  })
  // desfazer: visuais anteriores desta abertura do provador
  const [hist, setHist] = useState<(Look | null)[]>([])
  const colorStart = useRef(false)

  const commit = (next: Look | null, hop = true) => {
    // guarda o visual de agora antes de trocar (o setHist roda depois)
    const prev = useUI.getState().settings.avatar
    setHist((h) => [...h.slice(-29), prev])
    useUI.getState().setSettings({ avatar: next })
    if (hop) wardrobe.hop = true
  }
  const change = (patch: Partial<Look>) => commit({ ...look, ...patch })
  const undo = () => {
    if (!hist.length) return
    useUI.getState().setSettings({ avatar: hist[hist.length - 1] })
    setHist((h) => h.slice(0, -1))
    wardrobe.hop = true
  }
  const shuffle = () => commit(randomLook())
  const close = () => useUI.getState().setPanel(null)
  const pickTab = (t: Tab) => {
    setTab(t)
    try {
      localStorage.setItem('workland.wardrobeTab', t)
    } catch {}
  }

  // R sorteia, Ctrl+Z desfaz (Esc fecha, quem cuida é o Hud)
  const keys = useRef({ shuffle, undo })
  keys.current = { shuffle, undo }
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) && (el as HTMLInputElement).type !== 'color') return
      // Cmd no Mac, Ctrl no Windows
      const mod = e.ctrlKey || e.metaKey
      if (e.key.toLowerCase() === 'r' && !mod) keys.current.shuffle()
      if (e.key.toLowerCase() === 'z' && mod) keys.current.undo()
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [])

  const preset = PRESETS.find((p) => same(p.look, look))
  const status = !raw ? 'Boneco padrão, nas cores do ambiente' : preset ? `Visual: ${preset.name}` : 'Visual seu'

  const options = (key: (typeof SLOTS)[number]['key']) => {
    const slot = SLOTS.find((s) => s.key === key)!
    return (
      <div className="wd-grid">
        {slot.options.map((o) => (
          <button key={o.id} className={look[key] === o.id ? 'on' : ''} onClick={() => look[key] !== o.id && change({ [key]: o.id })}>
            {o.label}
          </button>
        ))}
      </div>
    )
  }

  return (
    <aside className="wardrobe" onPointerDown={(e) => e.stopPropagation()}>
      <header>
        <div>
          <h2>Provador</h2>
          <small>{status}</small>
        </div>
        <button className="primary" onClick={close}>
          Pronto
        </button>
      </header>
      <nav className="wd-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => pickTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="wd-body">
        {tab === 'prontos' && (
          <div className="wd-grid presets">
            {PRESETS.map((p) => (
              <button key={p.id} className={preset?.id === p.id ? 'on' : ''} onClick={() => !same(p.look, look) && commit(p.look)}>
                <span className="dots">
                  {[p.look.main, p.look.second, p.look.skin].map((c, i) => (
                    <i key={i} style={{ background: c }} />
                  ))}
                </span>
                {p.name}
              </button>
            ))}
          </div>
        )}
        {tab === 'legs' && (
          <>
            <h3>Pernas</h3>
            {options('legs')}
            <h3>Pés</h3>
            {options('feet')}
          </>
        )}
        {tab !== 'prontos' && tab !== 'legs' && tab !== 'cores' && options(tab)}
        {tab === 'cores' && (
          <>
            <h3>Formato do corpo</h3>
            <div className="wd-seg">
              {SHAPES.map((o) => (
                <button key={o.id} className={look.shape === o.id ? 'on' : ''} onClick={() => look.shape !== o.id && change({ shape: o.id })}>
                  {o.label}
                </button>
              ))}
            </div>
            <h3>Estampa da roupa</h3>
            <div className="wd-seg">
              {PATTERNS.map((o) => (
                <button key={o.id} className={look.pattern === o.id ? 'on' : ''} onClick={() => look.pattern !== o.id && change({ pattern: o.id })}>
                  {o.label}
                </button>
              ))}
            </div>
            {COLOR_KEYS.map((c) => (
              <div key={c.key} className="wd-color">
                <h3>{c.label}</h3>
                <div className="swatches">
                  {SWATCHES.map((hex) => (
                    <button key={hex} className={look[c.key] === hex ? 'on' : ''} style={{ background: hex }} title={hex} onClick={() => look[c.key] !== hex && change({ [c.key]: hex })} />
                  ))}
                  <label className="custom" title="Outra cor" style={{ background: SWATCHES.includes(look[c.key]) ? undefined : look[c.key] }}>
                    <input
                      type="color"
                      value={look[c.key]}
                      // arrastando no seletor a cor muda ao vivo; o desfazer guarda só o começo
                      onFocus={() => (colorStart.current = true)}
                      onChange={(e) => {
                        const next = { ...look, [c.key]: e.target.value }
                        if (colorStart.current) {
                          colorStart.current = false
                          commit(next, false)
                        } else useUI.getState().setSettings({ avatar: next })
                      }}
                    />
                  </label>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
      <footer>
        <button onClick={shuffle} title="Sortear (R)">
          Sortear
        </button>
        <button onClick={undo} disabled={!hist.length} title="Desfazer (Ctrl+Z)">
          Desfazer
        </button>
        <button onClick={() => raw && commit(null)} disabled={!raw}>
          Padrão
        </button>
        <span className="hint">arraste o boneco pra girar · rodinha aproxima</span>
      </footer>
    </aside>
  )
}
