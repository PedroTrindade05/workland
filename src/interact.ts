import { useEffect, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { nearby, useUI, type Near, type Target } from './store'
import { leaveWindow } from './inside'
import { useRooms } from './rooms'

// arrastar a câmera não pode contar como clique nos objetos
// building = arrastando um objeto no modo construção (a câmera não gira)
export const drag = { moved: false, building: false }

const MAX_DIST = 34

// mira/mouse em cima = vira o alvo do E; clique executa
export function useHoverable(target: Target | null) {
  const ref = useRef(target)
  ref.current = target
  const id = target?.id

  useEffect(
    () => () => {
      const ui = useUI.getState()
      if (id && ui.hover?.id === id) ui.setHover(null)
    },
    [id],
  )

  const enter = (e: ThreeEvent<PointerEvent>) => {
    // no modo construção quem cuida do clique é o objeto inteiro; no provador nada no mundo responde
    if (useRooms.getState().build || useUI.getState().panel === 'avatar') return
    e.stopPropagation()
    const t = ref.current
    if (!t || e.distance > MAX_DIST) return
    const ui = useUI.getState()
    if (ui.hover?.id !== t.id) ui.setHover(t)
    document.body.style.cursor = 'pointer'
  }
  return {
    onPointerOver: enter,
    onPointerMove: enter,
    onPointerOut: () => {
      const ui = useUI.getState()
      if (ui.hover?.id === ref.current?.id) ui.setHover(null)
      document.body.style.cursor = ''
    },
    onClick: (e: ThreeEvent<MouseEvent>) => {
      if (useRooms.getState().build || useUI.getState().panel === 'avatar') return
      e.stopPropagation()
      // usando um app, clicar em qualquer outra coisa volta pro mundo
      if (useUI.getState().focus) return leaveWindow()
      if (drag.moved || e.distance > MAX_DIST) return
      ref.current?.run()
    },
  }
}

export function useHovered(id: string) {
  return useUI((s) => s.hover?.id === id)
}

// interação por proximidade (registra a cada render pra closures frescas)
export function useNear(it: Near | null) {
  const id = it?.id
  useEffect(() => () => void (id && nearby.delete(id)), [id])
  if (it) nearby.set(it.id, it)
}
