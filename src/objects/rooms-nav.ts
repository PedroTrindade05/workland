import { teleport, useUI } from '../store'
import { useRooms } from '../rooms'

// troca de sala: aplica o ambiente dela e coloca você no meio, olhando pro norte
export function goToRoom(id: string) {
  const r = useRooms.getState().rooms.find((x) => x.id === id)
  if (!r) return
  // convidado de um encontro fica na sala de quem criou
  if (useRooms.getState().sharedFrom && !r.shared) return useUI.getState().say('Saia do encontro pra trocar de sala')
  useRooms.getState().switchRoom(id)
  useUI.getState().setWatching(false)
  useUI.getState().setTheme(r.themeId)
  teleport(0, 6, Math.PI)
  useUI.getState().say(`Você entrou em ${r.name}`)
}
