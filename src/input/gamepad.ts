// Controle de videogame (Xbox/PlayStation via Gamepad API): pra usar no sofá, ligado na TV.
//   analógico esquerdo anda · direito gira a câmera · gatilho corre
//   A usa · X pega/solta tela · Y ação extra · B volta
//   LB/RB troca de sala · Select alterna 1ª/3ª pessoa · Start abre a busca
//   direcional: ↑ atalhos · → telas · ↓ sistema · ← navegador
import * as THREE from 'three'
import { currentTarget, player, spawnWebScreen, useUI, wardrobe } from '../store'
import { useRooms } from '../rooms'
import { dropCarried, leaveWindow } from '../inside'
import { goToKind } from '../objects/nav'
import { goToRoom } from '../objects/rooms-nav'

const prev: boolean[] = []
const DEAD = 0.18
const dz = (v: number) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD))

function cycleRoom(step: number) {
  const s = useRooms.getState()
  const i = s.rooms.findIndex((r) => r.id === s.roomId)
  const next = s.rooms[(i + step + s.rooms.length) % s.rooms.length]
  if (next && next.id !== s.roomId) goToRoom(next.id)
}

const ACTIONS: Record<number, () => void> = {
  0: () => currentTarget()?.run(),
  1: () => {
    const ui = useUI.getState()
    if (ui.focus) leaveWindow()
    else if (ui.cmdOpen) ui.setCmdOpen(false)
    else ui.setPanel(null)
  },
  2: () => (useUI.getState().carrying ? dropCarried() : currentTarget()?.grab?.run()),
  3: () => currentTarget()?.alt?.run(),
  4: () => cycleRoom(-1),
  5: () => cycleRoom(1),
  8: () => useUI.getState().toggleView(),
  9: () => useUI.getState().setCmdOpen(true),
  12: () => goToKind('shortcut-wall'),
  13: () => goToKind('system-panel'),
  14: () => spawnWebScreen('https://www.google.com'),
  15: () => goToKind('screen-wall'),
}

export function gamepadStep(dt: number, fx: number, fz: number) {
  const pad = navigator.getGamepads?.().find((g) => g && g.connected)
  if (!pad) return { ix: 0, iz: 0, run: false }
  const lx = dz(pad.axes[0] ?? 0)
  const ly = dz(pad.axes[1] ?? 0)
  const rx = dz(pad.axes[2] ?? 0)
  const ry = dz(pad.axes[3] ?? 0)
  const ui = useUI.getState()
  // no provador o analógico direito gira o boneco e só o B (fechar) vale
  const dressing = ui.panel === 'avatar'
  if (dressing) wardrobe.spin += rx * dt * 2.6
  else if (!ui.focus) {
    player.camYaw -= rx * dt * 2.6
    const first = ui.view === 'first'
    player.pitch = THREE.MathUtils.clamp(player.pitch + ry * dt * 1.8, first ? -1.4 : -0.25, first ? 1.4 : 1.25)
  }
  pad.buttons.forEach((b, i) => {
    if (b.pressed && !prev[i] && (!dressing || i === 1)) ACTIONS[i]?.()
    prev[i] = b.pressed
  })
  // frente = (fx,fz); direita = (-fz,fx)
  return { ix: fx * -ly + -fz * lx, iz: fz * -ly + fx * lx, run: (pad.buttons[7]?.value ?? 0) > 0.4 }
}
