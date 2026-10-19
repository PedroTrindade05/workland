// Barra da apresentação: aparece em sala com palco (ou num encontro). Quem tem a vez escolhe o que mostrar e passa as páginas.
import { useEffect, useState } from 'react'
import { pc } from '../pc'
import { useUI } from '../store'
import { useCurrentRoom } from '../rooms'
import { mergeWindows } from '../inside'
import { normalizeUrl } from '../objects/web'
import { go, presentPdf, presentSite, presentSlides, presentWindow, stopPresenting, usePresent } from '../present/state'
import { REACTIONS, react, shareFile, takeTurn, useMeet } from '../meet/net'
import './meet.css'

const isTyping = () => {
  const el = document.activeElement
  return !!el && ['INPUT', 'TEXTAREA', 'SELECT', 'WEBVIEW', 'IFRAME'].includes(el.tagName)
}

function PresentMenu() {
  const windows = useUI((s) => s.windows)
  const [mode, setMode] = useState<null | 'window' | 'site'>(null)
  const [url, setUrl] = useState('')
  const close = () => usePresent.getState().setMenu(false)
  // escolheu: fecha o menu e a câmera vai pro telão
  const done = () => {
    close()
    useUI.getState().setWatching(true)
  }
  useEffect(() => {
    if (mode === 'window') pc.windows().then((l) => mergeWindows(l))
  }, [mode])
  return (
    <div className="pb-menu" onPointerDown={(e) => e.stopPropagation()}>
      {!mode && (
        <>
          <button
            onClick={async () => {
              const p = await pc.pickPdf()
              if (!p) return
              done()
              await presentPdf(p, shareFile)
            }}
          >
            <b>PDF de slides</b>
            <small>do PowerPoint, Canva ou Figma</small>
          </button>
          <button
            onClick={async () => {
              const ps = await pc.pickSlides()
              if (!ps.length) return
              done()
              await presentSlides(ps, shareFile)
            }}
          >
            <b>Imagens e vídeos</b>
            <small>um ou vários, na ordem do nome</small>
          </button>
          <button onClick={() => setMode('window')}>
            <b>Tela de um app</b>
            <small>o sistema rodando, ao vivo</small>
          </button>
          <button onClick={() => setMode('site')}>
            <b>Site</b>
            <small>o projeto publicado, navegável</small>
          </button>
        </>
      )}
      {mode === 'window' && (
        <div className="pb-list">
          {windows.length === 0 && <p className="muted">Nenhuma janela aberta agora</p>}
          {windows.map((w) => (
            <button
              key={w.id}
              onClick={() => {
                presentWindow(w.id, w.name)
                done()
              }}
            >
              {w.icon ? <img src={w.icon} alt="" /> : <i />}
              <span>{w.name}</span>
            </button>
          ))}
          <button className="back" onClick={() => setMode(null)}>
            Voltar
          </button>
        </div>
      )}
      {mode === 'site' && (
        <form
          className="pb-site"
          onSubmit={(e) => {
            e.preventDefault()
            if (!url.trim()) return
            presentSite(normalizeUrl(url))
            done()
          }}
        >
          <input autoFocus placeholder="endereço do site" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="primary">Mostrar</button>
          <button type="button" onClick={() => setMode(null)}>
            Voltar
          </button>
        </form>
      )}
    </div>
  )
}

export function PresentBar({ low }: { low: boolean }) {
  const hasStage = useCurrentRoom()?.items.some((i) => i.kind === 'stage') ?? false
  const status = useMeet((s) => s.status)
  const presenter = useMeet((s) => s.presenter)
  const me = useMeet((s) => s.me)
  const host = useMeet((s) => s.host)
  const presenterName = useMeet((s) => (s.presenter ? s.peers[s.presenter]?.name : null))
  const watchers = useMeet((s) => Object.values(s.peers).filter((p) => p.viewer).length)
  const s = usePresent((st) => st.state)
  const menu = usePresent((st) => st.menu)
  const muted = usePresent((st) => st.muted)
  const watching = useUI((st) => st.watching)
  const on = status === 'on'
  const control = !on || presenter === me

  // passador de slides: PageUp/PageDown sempre; setas e espaço quando está assistindo
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping() || !usePresent.getState().state) return
      const m = useMeet.getState()
      if (m.status === 'on' && m.presenter !== m.me) return
      const watch = useUI.getState().watching
      if (e.key === 'PageDown' || (watch && (e.key === 'ArrowRight' || e.key === ' '))) {
        e.preventDefault()
        go(1)
      } else if (e.key === 'PageUp' || (watch && e.key === 'ArrowLeft')) {
        e.preventDefault()
        go(-1)
      }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [])
  // quem não tem a vez e chega no púlpito só fica sabendo quem está apresentando
  useEffect(() => {
    if (menu && !control) {
      usePresent.getState().setMenu(false)
      useUI.getState().say(`${presenterName ?? 'Outra pessoa'} está apresentando`)
    }
  }, [menu, control, presenterName])

  if (!hasStage && !on) return null
  const video = s?.kind === 'media' && s.slides[s.index]?.video
  const who = !on ? 'Apresentação' : control ? 'Você está apresentando' : presenterName ? `${presenterName} apresentando` : 'Ninguém apresentando'
  return (
    <div className={`present-bar ${low ? 'low' : ''}`}>
      <span className="pb-who">
        <i className={on ? 'live' : ''} />
        <b>{who}</b>
        {s && <small>{s.title}</small>}
      </span>
      {watchers > 0 && (
        <span className="pb-watch" title="assistindo pelo navegador">
          {watchers === 1 ? '1 no navegador' : `${watchers} no navegador`}
        </span>
      )}
      {s && s.count > 1 && (
        <span className="pb-nav">
          {control && (
            <button onClick={() => go(-1)} disabled={s.index === 0} title="Anterior (PageUp)">
              ‹
            </button>
          )}
          <span>
            {s.index + 1} / {s.count}
          </span>
          {control && (
            <button onClick={() => go(1)} disabled={s.index >= s.count - 1} title="Próxima (PageDown)">
              ›
            </button>
          )}
        </span>
      )}
      {control && (
        <button className={menu ? 'primary' : ''} onClick={() => usePresent.getState().setMenu(!menu)}>
          Mostrar
        </button>
      )}
      {!control && host && <button onClick={takeTurn}>Pegar a vez</button>}
      {video && <button onClick={() => usePresent.getState().setMuted(!muted)}>{muted ? 'Ligar som' : 'Tirar som'}</button>}
      <button className={watching ? 'primary' : ''} onClick={() => useUI.getState().setWatching(!watching)} title="Enquadra o telão (Esc sai)">
        {watching ? 'Sair do telão' : 'Assistir'}
      </button>
      {control && s && <button onClick={stopPresenting}>Parar</button>}
      {on && (
        <span className="pb-react">
          {REACTIONS.map((e) => (
            <button key={e} onClick={() => react(e)} title="Reagir">
              {e}
            </button>
          ))}
        </span>
      )}
      {menu && control && <PresentMenu />}
    </div>
  )
}
