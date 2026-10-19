// Painel do encontro: criar a sala na rede, achar a dos colegas e entrar com o PIN, ver quem está e passar a vez.
import { useEffect, useMemo, useState } from 'react'
import qrcode from 'qrcode-generator'
import { pc, type MeetFound } from '../pc'
import { teleport, useUI } from '../store'
import { currentRoom, useCurrentRoom, useRooms } from '../rooms'
import { goToRoom } from '../objects/rooms-nav'
import { resolveLook } from '../avatar/look'
import { hostMeet, joinMeet, leaveMeet, passTurn, useMeet } from '../meet/net'
import './meet.css'

const PORT = 47810

// "192.168.0.42" ou "192.168.0.42:47810"
function parseAddr(raw: string): MeetFound | null {
  const m = /^\s*(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{2,5}))?\s*$/.exec(raw)
  return m ? { ip: m[1], port: m[2] ? Number(m[2]) : PORT, name: m[1], by: '', people: 0 } : null
}

// QR code em SVG (quadradinhos escuros sobre branco, com margem pra câmera do celular ler)
function Qr({ text }: { text: string }) {
  const { d, n } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(text)
    qr.make()
    const n = qr.getModuleCount()
    let d = ''
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`
    return { d, n }
  }, [text])
  return (
    <svg className="meet-qr" viewBox={`-3 -3 ${n + 6} ${n + 6}`} role="img" aria-label="QR code do link de assistir">
      <rect x={-3} y={-3} width={n + 6} height={n + 6} rx={2} fill="#fff" />
      <path d={d} fill="#111" />
    </svg>
  )
}

// link de assistir pelo navegador: quem criou usa o endereço da rede; convidado usa o da sala em que entrou
function WatchLink() {
  const m = useMeet()
  const base = m.host && m.invite ? `http://${m.invite.ips[0] ?? '127.0.0.1'}:${m.invite.port}` : m.base
  const link = `${base}/?pin=${m.pin}`
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      useUI.getState().say('Não deu pra copiar, seleciona o link')
    }
  }
  return (
    <section className="meet-watch">
      <div>
        <h3>Assistir sem o Workland</h3>
        <p className="muted">Quem está na mesma rede abre o link no navegador, ou aponta a câmera do celular pro código. Vê o telão em tela cheia e manda reações.</p>
        <div className="meet-link">
          <code>{link}</code>
          <button className={copied ? 'primary' : ''} onClick={copy}>
            {copied ? 'Copiado' : 'Copiar link'}
          </button>
        </div>
      </div>
      <Qr text={link} />
    </section>
  )
}

function Lobby() {
  const settings = useUI((s) => s.settings)
  const error = useMeet((s) => s.error)
  const status = useMeet((s) => s.status)
  const hasStage = useCurrentRoom()?.items.some((i) => i.kind === 'stage') ?? false
  const [name, setName] = useState(`Apresentação de ${settings.name || 'todo mundo'}`)
  const [rooms, setRooms] = useState<MeetFound[] | null>(null)
  const [pick, setPick] = useState<MeetFound | null>(null)
  const [addr, setAddr] = useState('')
  const [pin, setPin] = useState('')
  const search = async () => {
    setRooms(null)
    const found = await pc.meetDiscover()
    setRooms(found)
    if (found.length === 1) setPick(found[0])
  }
  useEffect(() => {
    search()
  }, [])
  const target = pick ?? parseAddr(addr)
  const busy = status === 'connecting'
  const createRoom = () => {
    const id = useRooms.getState().createRoom('Apresentação', 'apresentacao', useUI.getState().themeId)
    goToRoom(id)
  }
  return (
    <>
      {!settings.name && (
        <section>
          <h3>Seu nome</h3>
          <input
            placeholder="Como o pessoal vai te ver (aparece em cima do boneco)"
            onBlur={(e) => e.target.value.trim() && useUI.getState().setSettings({ name: e.target.value.trim() })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </section>
      )}
      <section>
        <h3>Criar na rede do escritório</h3>
        {!hasStage && (
          <div className="meet-note">
            <span>Sua sala atual não tem palco. A de apresentação já vem com telão, púlpito e plateia.</span>
            <button onClick={createRoom}>Criar sala de apresentação</button>
          </div>
        )}
        <div className="row">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do encontro" />
          <button className="primary" disabled={busy} onClick={() => hostMeet(name.trim() || 'Apresentação')}>
            Criar encontro
          </button>
        </div>
        <p className="muted">
          {pc.platform === 'darwin'
            ? 'Na primeira vez o macOS pergunta se o Workland pode achar dispositivos na rede local: escolha Permitir.'
            : 'Na primeira vez o Windows pergunta se o Workland pode usar a rede: escolha Permitir em redes privadas.'}{' '}
          Cada colega precisa do Workland instalado.
        </p>
      </section>
      <section>
        <h3>Entrar no de alguém</h3>
        <div className="meet-rooms">
          {rooms === null && <p className="muted">Procurando encontros na rede...</p>}
          {rooms?.length === 0 && <p className="muted">Nenhum encontro achado. Se a rede bloquear a busca, peça o endereço pra quem criou.</p>}
          {rooms?.map((r) => (
            <button
              key={`${r.ip}:${r.port}`}
              className={pick === r ? 'on' : ''}
              onClick={() => {
                setPick(pick === r ? null : r)
                setAddr('')
              }}
            >
              <b>{r.name}</b>
              <small>
                {r.by ? `de ${r.by} · ` : ''}
                {r.people === 1 ? '1 pessoa' : `${r.people} pessoas`}
              </small>
            </button>
          ))}
        </div>
        <div className="fields">
          {!pick && (
            <label>
              <span>Endereço</span>
              <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="ex.: 192.168.0.42" />
            </label>
          )}
          <label>
            <span>PIN</span>
            <span className="row">
              <input
                className="pin"
                value={pin}
                inputMode="numeric"
                maxLength={4}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && target && pin.length === 4 && joinMeet(target, pin)}
                placeholder="0000"
              />
              <button className="primary" disabled={!target || pin.length !== 4 || busy} onClick={() => target && joinMeet(target, pin)}>
                {busy ? 'Entrando...' : 'Entrar'}
              </button>
              <button onClick={search}>Procurar de novo</button>
            </span>
          </label>
        </div>
        {error && <p className="meet-error">{error}</p>}
      </section>
    </>
  )
}

function InMeet() {
  const m = useMeet()
  const settings = useUI((s) => s.settings)
  const theme = useUI((s) => s.theme)
  const canPass = m.presenter === m.me || m.host
  const people = [{ id: m.me ?? 'eu', name: `${settings.name || 'Você'} (você)`, look: settings.avatar, host: m.host }, ...Object.values(m.peers)]
  const toAudience = () => {
    const stage = currentRoom()?.items.find((i) => i.kind === 'stage')
    if (!stage) return
    const fx = Math.sin(stage.rotY)
    const fz = Math.cos(stage.rotY)
    teleport(stage.x + fx * 17, stage.z + fz * 17, stage.rotY + Math.PI)
    useUI.getState().setPanel(null)
  }
  return (
    <>
      {m.host && m.invite && (
        <section className="meet-invite">
          <h3>Passe pro pessoal</h3>
          <p>
            No Workland deles: <b>Encontro</b>, escolher <b>{m.name}</b> e digitar o PIN
          </p>
          <div className="meet-pin">{m.invite.pin}</div>
          <p className="muted">
            Se não aparecer na lista, o endereço é {m.invite.ips.map((ip) => (m.invite!.port === PORT ? ip : `${ip}:${m.invite!.port}`)).join(' ou ')}
          </p>
        </section>
      )}
      <WatchLink />
      <section>
        <h3>
          {m.name} · {people.length === 1 ? 'só você por enquanto' : `${people.length} pessoas`}
        </h3>
        <div className="meet-people">
          {people.map((p) => (
            <div key={p.id} className="meet-person">
              <i style={{ background: 'viewer' in p && p.viewer ? 'var(--line)' : resolveLook(p.look, theme).main }} />
              <span>
                {p.name}
                {p.host && <small>criou</small>}
                {'viewer' in p && p.viewer && <small>no navegador</small>}
                {m.presenter === p.id && <small className="live">apresentando</small>}
              </span>
              {canPass && m.presenter !== p.id && p.id !== 'eu' && !('viewer' in p && p.viewer) && (
                <button onClick={() => passTurn(p.id)}>{p.id === m.me ? 'Pegar a vez' : 'Passar a vez'}</button>
              )}
            </div>
          ))}
        </div>
      </section>
      <section className="row wrap">
        <button className="primary" onClick={toAudience}>
          Ir pra plateia
        </button>
        <button className="danger" onClick={leaveMeet}>
          {m.host ? 'Encerrar encontro' : 'Sair do encontro'}
        </button>
      </section>
    </>
  )
}

export function MeetPanel() {
  const status = useMeet((s) => s.status)
  const close = () => useUI.getState().setPanel(null)
  return (
    <div className="modal" onPointerDown={close}>
      <div className="sheet wide meet" onPointerDown={(e) => e.stopPropagation()}>
        <header>
          <h2>Encontro</h2>
          <button onClick={close}>Fechar</button>
        </header>
        {status === 'on' ? <InMeet /> : <Lobby />}
      </div>
    </div>
  )
}
