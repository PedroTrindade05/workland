import { Suspense, useEffect } from 'react'
import { Canvas, events as domEvents, useThree, type RootState } from '@react-three/fiber'
import { pc, type AppEntry } from './pc'
import { player, teleport, useUI, wardrobe } from './store'
import { carriedPose, dropCarried, enterWindow, leaveWindow, mergeWindows } from './inside'
import { Player } from './world/Player'
import { Atmosphere, CustomSky, Effects, Floor, Lights, Scenery, Sky } from './world/Scenery'
import { useLiveTheme } from './world/timeOfDay'
import { setAmbient } from './audio/ambient'
import { Items } from './objects/Items'
import { currentRoom, useRooms } from './rooms'
import { Hud } from './ui/Hud'
import { RemotePlayers } from './meet/RemotePlayers'

// atalho pra depurar pelo console
Object.assign(window, { __workland: { player, teleport, wardrobe, ui: useUI, rooms: useRooms, enterWindow, leaveWindow, dropCarried, carriedPose } })

// com o mouse preso (1ª pessoa) a mira é o centro da tela
type Store = Parameters<typeof domEvents>[0]
function lockAwareEvents(store: Store) {
  const ev = domEvents(store)
  return {
    ...ev,
    compute(event: { offsetX: number; offsetY: number }, state: RootState) {
      if (document.pointerLockElement) state.pointer.set(0, 0)
      else state.pointer.set((event.offsetX / state.size.width) * 2 - 1, -(event.offsetY / state.size.height) * 2 + 1)
      state.raycaster.setFromCamera(state.pointer, state.camera)
    },
  }
}

function useDesktopData() {
  useEffect(() => {
    const ui = useUI.getState()
    pc.places().then(ui.setPlaces)
    // atalhos primeiro (são poucos), ícones grandes logo depois
    const loadShortcuts = async () => {
      const list = await pc.shortcuts()
      ui.setShortcuts(list)
      const icons = await pc.shortcutIcons()
      ui.setShortcuts(list.map((s) => ({ ...s, icon: icons[s.id] ?? null })))
    }
    loadShortcuts()
    const offShortcuts = pc.onShortcuts(loadShortcuts)
    pc.plugins().then(ui.setPlugins)
    // cada sala tem seu ambiente
    const r = currentRoom()
    if (r) ui.setTheme(r.themeId)
    const withIcons = (apps: AppEntry[], icons: Record<string, string>) => apps.map((a) => (icons[a.id] ? { ...a, icon: icons[a.id] } : a))
    pc.apps().then((apps) => {
      ui.setApps(apps)
      return pc.appIcons().then((icons) => ui.setApps(withIcons(apps, icons)))
    })
    const offApps = pc.onApps(({ apps, icons }) => ui.setApps(withIcons(apps, icons)))
    const poll = async () => mergeWindows(await pc.windows())
    poll()
    let t = 0
    const id = setInterval(() => {
      t++
      const s = useUI.getState()
      if (s.focus) return
      if (s.section === 'Telas' || t % 3 === 0) poll()
    }, 3000)
    return () => {
      clearInterval(id)
      offApps()
      offShortcuts()
    }
  }, [])
}

function World() {
  const theme = useLiveTheme()
  const sky = useUI((s) => s.settings.sky)
  const three = useThree()
  ;(window as unknown as { __workland: Record<string, unknown> }).__workland.three = three
  return (
    <>
      <Atmosphere theme={theme} clear={!!sky} />
      {sky ? <CustomSky path={sky.path} video={sky.video} /> : <Sky theme={theme} />}
      <Lights theme={theme} />
      <Floor theme={theme} />
      {!sky && <Scenery theme={theme} />}
      <Items />
      <Player />
      <RemotePlayers />
      <Effects theme={theme} />
    </>
  )
}

// som ambiente segue a preferência
function useAmbient() {
  const kind = useUI((s) => s.settings.ambient)
  const volume = useUI((s) => s.settings.volume)
  useEffect(() => setAmbient(kind, volume), [kind, volume])
}

export default function App() {
  useDesktopData()
  useAmbient()
  const quality = useUI((s) => s.quality)
  return (
    <>
      <Canvas
        shadows
        flat={quality !== 'leve'}
        dpr={quality === 'alta' ? [1, 1.5] : 1}
        events={lockAwareEvents as never}
        camera={{ fov: 60, near: 0.05, far: 3000, position: [0, 3, 12] }}
        gl={{ antialias: quality === 'leve', powerPreference: 'high-performance', stencil: false }}
        key={quality === 'leve' ? 'aa' : 'pp'}
        // usando um app, clicar no vazio volta pro mundo
        onPointerMissed={() => useUI.getState().focus?.phase === 'on' && leaveWindow()}
      >
        <Suspense fallback={null}>
          <World />
        </Suspense>
      </Canvas>
      <Hud />
    </>
  )
}
