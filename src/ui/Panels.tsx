import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { pc } from '../pc'
import { inFront, useUI, type Ambient, type Settings } from '../store'
import { TEMPLATES, currentRoom, useCurrentRoom, useRooms, type Item, type ItemKind } from '../rooms'
import { CATALOG, CATEGORIES, kindOf, type Category, type Field } from '../objects/catalog'
import { THEMES, type ThemeId } from '../themes'
import { goToRoom } from '../objects/rooms-nav'
import { goToItem } from '../objects/nav'
import { runScene, sceneFromOpenWindows, useScenes, type Scene } from '../scenes'
import { Wardrobe } from './Wardrobe'
import { MeetPanel } from './MeetPanel'
import './panels.css'

const isTyping = () => {
  const el = document.activeElement
  return !!el && ['INPUT', 'TEXTAREA', 'SELECT', 'WEBVIEW', 'IFRAME'].includes(el.tagName)
}

// ---------- editor de propriedades (usado no modo construção e ao apertar E numa nota) ----------

function FieldInput({ item, field }: { item: Item; field: Field }) {
  const setProps = useRooms((s) => s.setProps)
  const shortcuts = useUI((s) => s.shortcuts)
  const plugins = useUI((s) => s.plugins)
  const rooms = useRooms((s) => s.rooms)
  const value = item.props[field.key]
  const [draft, setDraft] = useState(String(value ?? ''))
  useEffect(() => setDraft(String(value ?? '')), [value])
  const commit = (v: unknown) => setProps(item.id, { [field.key]: v })
  switch (field.type) {
    case 'text':
    case 'url':
      return <input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => commit(draft)} onKeyDown={(e) => e.key === 'Enter' && commit(draft)} />
    case 'textarea':
      return <textarea rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => commit(draft)} />
    case 'color':
      return <input type="color" value={String(value || '#ffffff')} onChange={(e) => commit(e.target.value)} />
    case 'toggle':
      return <input type="checkbox" checked={!!value} onChange={(e) => commit(e.target.checked)} />
    case 'select':
      return (
        <select value={String(value ?? '')} onChange={(e) => commit(e.target.value)}>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    case 'folder':
    case 'image':
      return (
        <button className="pick" onClick={async () => commit((await (field.type === 'folder' ? pc.pickFolder() : pc.pickImage())) ?? value)}>
          {value ? String(value).split(/[\\/]/).pop() : field.type === 'folder' ? 'Escolher pasta' : 'Escolher imagem'}
        </button>
      )
    case 'shortcut':
      return (
        <select value={String(value ?? '')} onChange={(e) => commit(e.target.value)}>
          <option value="">Escolha...</option>
          {shortcuts.map((s) => (
            <option key={s.id} value={s.path}>
              {s.name}
            </option>
          ))}
        </select>
      )
    case 'room':
      return (
        <select value={String(value ?? '')} onChange={(e) => commit(e.target.value)}>
          <option value="">Escolha...</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      )
    case 'plugin':
      return (
        <span className="row">
          <select value={String(value ?? '')} onChange={(e) => commit(e.target.value)}>
            <option value="">Escolha...</option>
            {plugins.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button className="pick" onClick={() => pc.openPlugins()}>
            Pasta
          </button>
        </span>
      )
  }
}

function PropsEditor({ item }: { item: Item }) {
  const k = kindOf(item.kind)
  if (!k.fields?.length) return <p className="muted">Esse objeto não tem o que configurar.</p>
  return (
    <div className="fields">
      {k.fields.map((f) => (
        <label key={f.key}>
          <span>{f.label}</span>
          <FieldInput item={item} field={f} />
        </label>
      ))}
    </div>
  )
}

// lista de tarefas tem editor próprio
function TodoEditor({ item }: { item: Item }) {
  const setProps = useRooms((s) => s.setProps)
  const tasks = (item.props.items as { text: string; done: boolean }[] | undefined) ?? []
  const [text, setText] = useState('')
  const save = (items: typeof tasks) => setProps(item.id, { items })
  return (
    <div className="todo-edit">
      <input
        className="title"
        defaultValue={String(item.props.title || 'Tarefas')}
        onBlur={(e) => setProps(item.id, { title: e.target.value })}
      />
      {tasks.map((t, i) => (
        <div key={i} className="todo-row">
          <input type="checkbox" checked={t.done} onChange={() => save(tasks.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} />
          <span className={t.done ? 'done' : ''}>{t.text}</span>
          <button onClick={() => save(tasks.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          save([...tasks, { text: text.trim(), done: false }])
          setText('')
        }}
      >
        <input placeholder="Nova tarefa e Enter" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      </form>
    </div>
  )
}

export function ItemEditor() {
  const id = useUI((s) => s.editItem)
  const room = useCurrentRoom()
  const item = room?.items.find((i) => i.id === id)
  if (!item) return null
  const close = () => useUI.getState().setEditItem(null)
  return (
    <div className="modal" onPointerDown={close}>
      <div className="sheet" onPointerDown={(e) => e.stopPropagation()}>
        <header>
          <h2>{kindOf(item.kind).name}</h2>
          <button className="primary" onClick={close}>
            Pronto
          </button>
        </header>
        {item.kind === 'todo' ? <TodoEditor item={item} /> : <PropsEditor item={item} />}
      </div>
    </div>
  )
}

// ---------- modo construção ----------

function place(kind: ItemKind) {
  const k = kindOf(kind)
  const rooms = useRooms.getState()
  const room = currentRoom()
  if (k.unique && room?.items.some((i) => i.kind === kind)) {
    const it = room.items.find((i) => i.kind === kind)!
    rooms.select(it.id)
    useUI.getState().say(`Já tem ${k.name.toLowerCase()} nesta sala: selecionei pra você`)
    return
  }
  const wall = k.category === 'Paredes'
  const id = rooms.addItem(kind, inFront(wall ? 12 : k.y ? 3.2 : 3.6, k.y), { ...(k.defaults ?? {}) })
  rooms.select(id)
}

const ICON: Record<string, string> = {
  grid: '▦', screen: '▭', pulse: '∿', clock: '◷', calendar: '▤', timer: '◔', music: '♪', cloud: '☁', note: '▨', check: '☑', image: '▣', folder: '▥', link: '↗', type: 'Aa', globe: '◍', puzzle: '✦', leaf: '❦', lamp: '◒', sofa: '▬', desk: '┳', square: '□', shape: '◆', frame: '▢', portal: '◎', stage: '▣', seats: '⋯',
}

export function BuildBar() {
  const build = useRooms((s) => s.build)
  const selected = useRooms((s) => s.selected)
  const room = useCurrentRoom()
  const item = room?.items.find((i) => i.id === selected)
  const [cat, setCat] = useState<Category>('Úteis')
  const s = useRooms.getState

  // atalhos de teclado do modo construção
  useEffect(() => {
    if (!build) return
    const down = (e: KeyboardEvent) => {
      if (isTyping()) return
      const st = s()
      const it = currentRoom()?.items.find((i) => i.id === st.selected)
      const k = e.key.toLowerCase()
      // Cmd no Mac, Ctrl no Windows
      const mod = e.ctrlKey || e.metaKey
      if (mod && k === 'z') return void (e.preventDefault(), e.shiftKey ? st.redo() : st.undo())
      if (mod && k === 'y') return void (e.preventDefault(), st.redo())
      if (k === 'escape') return void (st.selected ? st.select(null) : st.setBuild(false))
      if (!it) return
      if (mod && k === 'd') return void (e.preventDefault(), st.duplicate(it.id))
      if (k === 'delete' || k === 'backspace') return void st.remove(it.id)
      if (k === 'q') st.update(it.id, { rotY: it.rotY + Math.PI / 12 })
      if (k === 'e') st.update(it.id, { rotY: it.rotY - Math.PI / 12 })
      if (k === '+' || k === '=') st.update(it.id, { scale: Math.min(4, +(it.scale * 1.1).toFixed(3)) })
      if (k === '-') st.update(it.id, { scale: Math.max(0.2, +(it.scale / 1.1).toFixed(3)) })
      if (k === 'pageup' || k === 'r') st.update(it.id, { y: +(it.y + 0.1).toFixed(2) })
      if (k === 'pagedown' || k === 'f') st.update(it.id, { y: Math.max(0, +(it.y - 0.1).toFixed(2)) })
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [build, s])

  if (!build) return null
  const kinds = CATALOG.filter((k) => k.category === cat)
  return (
    <>
      <div className="buildbar">
        <div className="build-head">
          <b>Modo construção</b>
          <span className="muted">clique num objeto pra mover · Q/E gira · +/− tamanho · R/F altura · Del apaga · Ctrl+Z desfaz</span>
          <button className="primary" onClick={() => s().setBuild(false)}>
            Concluir
          </button>
        </div>
        <div className="build-tabs">
          {CATEGORIES.map((c) => (
            <button key={c} className={c === cat ? 'on' : ''} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>
        <div className="build-items">
          {kinds.map((k) => (
            <button key={k.kind} onClick={() => place(k.kind)} title={k.hint}>
              <span className="glyph">{ICON[k.icon] ?? '◇'}</span>
              <b>{k.name}</b>
              {k.hint && <small>{k.hint}</small>}
            </button>
          ))}
        </div>
      </div>
      {item && (
        <div className="inspector">
          <header>
            <b>{kindOf(item.kind).name}</b>
            <button title="Ir até ele" onClick={() => goToItem(item.id)}>
              ◎
            </button>
          </header>
          <div className="tools">
            <button onClick={() => s().update(item.id, { rotY: item.rotY + Math.PI / 12 })}>⟲ Girar</button>
            <button onClick={() => s().update(item.id, { rotY: item.rotY - Math.PI / 12 })}>Girar ⟳</button>
            <button onClick={() => s().update(item.id, { scale: Math.max(0.2, +(item.scale / 1.1).toFixed(3)) })}>− Menor</button>
            <button onClick={() => s().update(item.id, { scale: Math.min(4, +(item.scale * 1.1).toFixed(3)) })}>+ Maior</button>
            <button onClick={() => s().update(item.id, { y: Math.max(0, +(item.y - 0.1).toFixed(2)) })}>↓ Descer</button>
            <button onClick={() => s().update(item.id, { y: +(item.y + 0.1).toFixed(2) })}>↑ Subir</button>
            <button onClick={() => s().duplicate(item.id)}>Duplicar</button>
            <button className="danger" onClick={() => s().remove(item.id)}>
              Apagar
            </button>
          </div>
          <PropsEditor item={item} />
        </div>
      )}
    </>
  )
}

// ---------- painéis laterais ----------

function Panel({ title, children }: { title: string; children: ReactNode }) {
  const close = () => useUI.getState().setPanel(null)
  return (
    <div className="modal" onPointerDown={close}>
      <div className="sheet wide" onPointerDown={(e) => e.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button onClick={close}>Fechar</button>
        </header>
        {children}
      </div>
    </div>
  )
}

function RoomsPanel() {
  const rooms = useRooms((s) => s.rooms)
  const roomId = useRooms((s) => s.roomId)
  const [name, setName] = useState('')
  const [tpl, setTpl] = useState('escritorio')
  const [theme, setTheme] = useState<ThemeId>('terraco')
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <Panel title="Salas">
      <p className="muted">Cada sala tem seu layout e seu ambiente. Use portais (modo construção, Passagens) pra ir de uma pra outra.</p>
      <div className="list">
        {rooms.map((r) => (
          <div key={r.id} className={`list-row ${r.id === roomId ? 'on' : ''}`}>
            {editing === r.id ? (
              <input
                autoFocus
                defaultValue={r.name}
                onBlur={(e) => {
                  useRooms.getState().renameRoom(r.id, e.target.value || r.name)
                  setEditing(null)
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            ) : (
              <span>
                <b>{r.name}</b>
                <small>
                  {THEMES.find((t) => t.id === r.themeId)?.name} · {r.items.length} objetos
                </small>
              </span>
            )}
            <span className="row">
              {r.id !== roomId && (
                <button
                  className="primary"
                  onClick={() => {
                    goToRoom(r.id)
                    useUI.getState().setPanel(null)
                  }}
                >
                  Entrar
                </button>
              )}
              <button onClick={() => setEditing(r.id)}>Renomear</button>
              {rooms.length > 1 && (
                <button className="danger" onClick={() => confirm(`Apagar a sala "${r.name}"?`) && useRooms.getState().deleteRoom(r.id)}>
                  Apagar
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
      <form
        className="new-room"
        onSubmit={(e) => {
          e.preventDefault()
          const id = useRooms.getState().createRoom(name.trim() || TEMPLATES.find((t) => t.id === tpl)!.name, tpl, theme)
          goToRoom(id)
          setName('')
          useUI.getState().setPanel(null)
        }}
      >
        <b>Nova sala</b>
        <input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
        <select value={tpl} onChange={(e) => setTpl(e.target.value)}>
          {TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}: {t.desc}
            </option>
          ))}
        </select>
        <select value={theme} onChange={(e) => setTheme(e.target.value as ThemeId)}>
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button className="primary">Criar</button>
      </form>
    </Panel>
  )
}

const AMBIENTS: { value: Ambient; label: string }[] = [
  { value: 'nenhum', label: 'Silêncio' },
  { value: 'chuva', label: 'Chuva' },
  { value: 'vento', label: 'Vento' },
  { value: 'ondas', label: 'Ondas' },
  { value: 'lareira', label: 'Lareira' },
]

function ScenesPanel() {
  const scenes = useScenes((s) => s.scenes)
  const rooms = useRooms((s) => s.rooms)
  const windows = useUI((s) => s.windows)
  const [name, setName] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const edit = (sc: Scene, patch: Partial<Scene>) => useScenes.getState().save({ ...sc, ...patch })
  return (
    <Panel title="Cenas de trabalho">
      <p className="muted">Uma cena abre um conjunto de apps de uma vez, já nos telões da frente, na sala e com o som que você escolher.</p>
      <div className="list">
        {!scenes.length && <p className="muted">Nenhuma cena ainda. Abra os apps que você usa junto e salve abaixo.</p>}
        {scenes.map((sc) => (
          <div key={sc.id} className="list-row col">
            <div className="row spread">
              <span>
                <b>{sc.name}</b>
                <small>{sc.apps.map((a) => a.name).join(', ') || 'sem apps'}</small>
              </span>
              <span className="row">
                <button
                  className="primary"
                  onClick={() => {
                    runScene(sc)
                    useUI.getState().setPanel(null)
                  }}
                >
                  Rodar
                </button>
                <button onClick={() => setOpen(open === sc.id ? null : sc.id)}>Ajustar</button>
                <button className="danger" onClick={() => useScenes.getState().remove(sc.id)}>
                  Apagar
                </button>
              </span>
            </div>
            {open === sc.id && (
              <div className="fields">
                <label>
                  <span>Sala</span>
                  <select value={sc.roomId ?? ''} onChange={(e) => edit(sc, { roomId: e.target.value || undefined })}>
                    <option value="">A que estiver</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Som</span>
                  <select value={sc.ambient ?? 'nenhum'} onChange={(e) => edit(sc, { ambient: e.target.value as Ambient })}>
                    {AMBIENTS.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Modo foco (só as telas)</span>
                  <input type="checkbox" checked={!!sc.focus} onChange={(e) => edit(sc, { focus: e.target.checked })} />
                </label>
                <label>
                  <span>Apps</span>
                  <span className="chips">
                    {sc.apps.map((a) => (
                      <button key={a.exe} onClick={() => edit(sc, { apps: sc.apps.filter((x) => x.exe !== a.exe) })}>
                        {a.name} ✕
                      </button>
                    ))}
                  </span>
                </label>
              </div>
            )}
          </div>
        ))}
      </div>
      <form
        className="new-room"
        onSubmit={(e) => {
          e.preventDefault()
          const sc = sceneFromOpenWindows(name.trim() || 'Minha cena')
          if (!sc.apps.length) return useUI.getState().say('Nenhum app aberto pra salvar')
          useScenes.getState().save(sc)
          setName('')
        }}
      >
        <b>Salvar as {windows.length} janelas abertas como cena</b>
        <input placeholder="Nome (ex.: Modo dev)" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary">Salvar</button>
      </form>
      <ToggleFocus />
    </Panel>
  )
}

function ToggleFocus() {
  const focus = useUI((s) => s.focusMode)
  return (
    <div className="row spread focus-row">
      <span>
        <b>Modo foco</b>
        <small>esconde tudo menos as telas</small>
      </span>
      <button className={focus ? 'primary' : ''} onClick={() => useUI.getState().setFocusMode(!focus)}>
        {focus ? 'Desligar' : 'Ligar'}
      </button>
    </div>
  )
}

function SettingsPanel() {
  const st = useUI((s) => s.settings)
  const quality = useUI((s) => s.quality)
  const set = (p: Partial<Settings>) => useUI.getState().setSettings(p)
  const exportSetup = async () => {
    const data = { app: 'workland', version: 1, rooms: useRooms.getState().rooms, roomId: useRooms.getState().roomId, scenes: useScenes.getState().scenes, settings: st, theme: useUI.getState().themeId }
    if (await pc.exportSetup(data)) useUI.getState().say('Setup exportado')
  }
  const importSetup = async () => {
    const d = (await pc.importSetup()) as { app?: string; rooms?: unknown; roomId?: string; scenes?: unknown; settings?: Partial<Settings> } | null
    if (!d || d.app !== 'workland' || !Array.isArray(d.rooms)) return useUI.getState().say('Esse arquivo não é um setup do Workland')
    useRooms.getState().replaceAll(d.rooms as never, d.roomId)
    if (Array.isArray(d.scenes)) useScenes.getState().replaceAll(d.scenes as Scene[])
    if (d.settings) set({ ...d.settings, sky: null })
    const r = currentRoom()
    if (r) goToRoom(r.id)
    useUI.getState().say('Setup importado')
  }
  return (
    <Panel title="Ajustes">
      <section>
        <h3>Você</h3>
        <div className="fields">
          <label>
            <span>Nome</span>
            <input defaultValue={st.name} onBlur={(e) => set({ name: e.target.value })} placeholder="Como quer ser chamado" />
          </label>
          <label>
            <span>Boneco</span>
            <span className="row">
              <button className="primary" onClick={() => useUI.getState().setPanel('avatar')}>
                Abrir provador
              </button>
              <small className="muted">chapéu, rosto, roupa, cores e visuais prontos (tecla P)</small>
            </span>
          </label>
        </div>
      </section>
      <section>
        <h3>Controles</h3>
        <div className="seg big">
          <button className={st.controls === 'simples' ? 'on' : ''} onClick={() => set({ controls: 'simples' })}>
            <b>Simples</b>
            <small>clique no chão pra andar, mouse faz tudo</small>
          </button>
          <button className={st.controls === 'jogo' ? 'on' : ''} onClick={() => set({ controls: 'jogo' })}>
            <b>Jogo</b>
            <small>WASD e mira com o mouse preso</small>
          </button>
        </div>
        <p className="muted">Controle de videogame funciona nos dois: analógicos andam e giram, A usa, B volta, LB/RB trocam de sala.</p>
      </section>
      <section>
        <h3>Ambiente</h3>
        <div className="fields">
          <label>
            <span>Som</span>
            <span className="seg">
              {AMBIENTS.map((a) => (
                <button key={a.value} className={st.ambient === a.value ? 'on' : ''} onClick={() => set({ ambient: a.value })}>
                  {a.label}
                </button>
              ))}
            </span>
          </label>
          <label>
            <span>Volume</span>
            <input type="range" min={0} max={1} step={0.05} value={st.volume} onChange={(e) => set({ volume: Number(e.target.value) })} />
          </label>
          <label>
            <span>Hora real</span>
            <input type="checkbox" checked={st.realTime} onChange={(e) => set({ realTime: e.target.checked })} />
          </label>
          <label>
            <span>Fundo próprio</span>
            <span className="row">
              <button
                onClick={async () => {
                  const p = await pc.pickMedia()
                  if (p) set({ sky: { path: p, video: /\.(mp4|webm)$/i.test(p) } })
                }}
              >
                {st.sky ? st.sky.path.split(/[\\/]/).pop() : 'Escolher imagem ou vídeo 360°'}
              </button>
              {st.sky && <button onClick={() => set({ sky: null })}>Tirar</button>}
            </span>
          </label>
          <label>
            <span>Qualidade</span>
            <span className="seg">
              {(['leve', 'equilibrada', 'alta'] as const).map((q) => (
                <button key={q} className={quality === q ? 'on' : ''} onClick={() => useUI.getState().setQuality(q)}>
                  {q[0].toUpperCase() + q.slice(1)}
                </button>
              ))}
            </span>
          </label>
        </div>
      </section>
      <section>
        <h3>Setup e plugins</h3>
        <div className="row wrap">
          <button className="primary" onClick={exportSetup}>
            Exportar meu setup
          </button>
          <button onClick={importSetup}>Importar setup</button>
          <button onClick={() => pc.openPlugins()}>Abrir pasta de plugins</button>
          <button onClick={async () => useUI.getState().setPlugins(await pc.plugins())}>Recarregar plugins</button>
        </div>
        <p className="muted">Um plugin é uma pasta com manifest.json e uma página index.html. Tem um exemplo pronto, a "Frase do dia".</p>
      </section>
    </Panel>
  )
}

export function Panels() {
  const panel = useUI((s) => s.panel)
  if (panel === 'rooms') return <RoomsPanel />
  if (panel === 'scenes') return <ScenesPanel />
  if (panel === 'settings') return <SettingsPanel />
  if (panel === 'avatar') return <Wardrobe />
  if (panel === 'meet') return <MeetPanel />
  return null
}

// ---------- primeiro uso ----------

export function Onboarding() {
  const ready = useRooms((s) => s.ready)
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [tpl, setTpl] = useState('escritorio')
  const [theme, setTheme] = useState<ThemeId>('terraco')
  const [controls, setControls] = useState<'simples' | 'jogo'>('simples')
  const steps = useMemo(() => ['Oi!', 'Sua primeira sala', 'Ambiente', 'Como andar', 'Pronto'], [])
  if (ready) return null
  const finish = () => {
    useUI.getState().setSettings({ name: name.trim(), controls })
    const id = useRooms.getState().createRoom(name.trim() ? `Sala de ${name.trim()}` : 'Minha sala', tpl, theme)
    // telas de site da versão antiga viram objetos da sala
    try {
      const old = JSON.parse(localStorage.getItem('workland.webscreens') || '[]') as { url: string; x: number; z: number; rotY: number }[]
      for (const w of old) useRooms.getState().addItem('site', { x: w.x, y: 0, z: w.z, rotY: w.rotY }, { url: w.url })
      localStorage.removeItem('workland.webscreens')
      localStorage.setItem('workland.seenHelp2', '1')
    } catch {}
    goToRoom(id)
  }
  return (
    <div className="modal onboarding">
      <div className="sheet wide">
        <div className="steps">
          {steps.map((s, i) => (
            <span key={s} className={i === step ? 'on' : i < step ? 'done' : ''}>
              {s}
            </span>
          ))}
        </div>
        {step === 0 && (
          <div className="ob">
            <h1>Bem-vindo ao Workland</h1>
            <p>Sua área de trabalho virou um lugar. Seus atalhos, suas janelas e o que você quiser, organizado do seu jeito.</p>
            <input autoFocus placeholder="Como quer ser chamado? (opcional)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setStep(1)} />
          </div>
        )}
        {step === 1 && (
          <div className="ob">
            <h1>Escolha um ponto de partida</h1>
            <p>Dá pra mudar tudo depois no modo construção (tecla B).</p>
            <div className="cards">
              {TEMPLATES.map((t) => (
                <button key={t.id} className={tpl === t.id ? 'on' : ''} onClick={() => setTpl(t.id)}>
                  <b>{t.name}</b>
                  <small>{t.desc}</small>
                </button>
              ))}
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="ob">
            <h1>Onde fica sua sala?</h1>
            <div className="cards">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  className={theme === t.id ? 'on' : ''}
                  onClick={() => {
                    setTheme(t.id)
                    useUI.getState().setTheme(t.id)
                  }}
                >
                  <span className="theme-preview small" style={{ background: t.preview }} />
                  <b>{t.name}</b>
                  <small>{t.tagline}</small>
                </button>
              ))}
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="ob">
            <h1>Como você prefere andar?</h1>
            <div className="cards two">
              <button className={controls === 'simples' ? 'on' : ''} onClick={() => setControls('simples')}>
                <b>Simples</b>
                <small>clica no chão e vai até lá. Arrastar gira a câmera. Ótimo pra quem não joga.</small>
              </button>
              <button className={controls === 'jogo' ? 'on' : ''} onClick={() => setControls('jogo')}>
                <b>Jogo</b>
                <small>WASD pra andar, Shift corre, Espaço pula, mouse mira. Tem controle de videogame também.</small>
              </button>
            </div>
          </div>
        )}
        {step === 4 && (
          <div className="ob">
            <h1>Tudo pronto{name.trim() ? `, ${name.trim()}` : ''}</h1>
            <ul className="tips">
              <li>
                <kbd>E</kbd> ou clique usa o que estiver na mira. Nos telões, você usa o app ali mesmo
              </li>
              <li>
                <kbd>B</kbd> modo construção: coloca, move, gira e apaga qualquer coisa
              </li>
              <li>
                <kbd>/</kbd> busca qualquer app, pasta ou site
              </li>
              <li>
                <kbd>T</kbd> troca o ambiente · <kbd>V</kbd> 1ª ou 3ª pessoa
              </li>
              <li>
                <kbd>P</kbd> provador: monte o visual do seu boneco
              </li>
              <li>Salas, Cenas e Ajustes ficam no dock lá embaixo</li>
            </ul>
          </div>
        )}
        <footer>
          {step > 0 && <button onClick={() => setStep(step - 1)}>Voltar</button>}
          <button className="primary" onClick={() => (step < 4 ? setStep(step + 1) : finish())}>
            {step < 4 ? 'Continuar' : 'Entrar'}
          </button>
        </footer>
      </div>
    </div>
  )
}
