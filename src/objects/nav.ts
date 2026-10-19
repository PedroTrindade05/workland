import { teleport, useUI } from '../store'
import { currentRoom, type ItemKind } from '../rooms'
import { kindOf } from './catalog'

const WALLS = new Set<ItemKind>(['shortcut-wall', 'screen-wall', 'system-panel'])

// vai pra frente de um objeto, olhando pra ele
export function goToItem(id: string) {
  const it = currentRoom()?.items.find((i) => i.id === id)
  if (!it) return
  const d = (WALLS.has(it.kind) ? 11 : 3.2) * it.scale
  const fx = Math.sin(it.rotY)
  const fz = Math.cos(it.rotY)
  teleport(it.x + fx * d, it.z + fz * d, it.rotY + Math.PI)
}

export function goToKind(kind: ItemKind) {
  const it = currentRoom()?.items.find((i) => i.kind === kind)
  if (it) goToItem(it.id)
  else useUI.getState().say(`Esta sala não tem ${kindOf(kind).name.toLowerCase()} (B pra colocar)`)
}
