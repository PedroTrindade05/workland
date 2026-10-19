import type { ComponentType } from 'react'
import type { Item, ItemKind } from '../rooms'
import { ShortcutWall } from '../districts/ShortcutWall'
import { ScreenArc } from '../districts/ScreenArc'
import { SystemPanel } from '../districts/SystemPanel'
import { Calendar, Clock, Music, Note, Photos, Pomodoro, ShortcutItem, TextSign, Todo, Weather } from './widgets'
import { Desk, Frame, Lamp, Plant, Portal, Rug, Sculpture, Sofa } from './decor'
import { Shelf } from './shelf'
import { Plugin, Site } from './web'
import { Seats, Stage } from './stage'

// cada tipo de objeto -> o componente que desenha ele (em coordenadas do próprio objeto)
export const REGISTRY: Record<ItemKind, ComponentType<{ item: Item }>> = {
  'shortcut-wall': ShortcutWall,
  'screen-wall': ScreenArc,
  'system-panel': SystemPanel,
  shortcut: ShortcutItem,
  clock: Clock,
  calendar: Calendar,
  pomodoro: Pomodoro,
  note: Note,
  todo: Todo,
  photos: Photos,
  shelf: Shelf,
  music: Music,
  weather: Weather,
  site: Site,
  plugin: Plugin,
  portal: Portal,
  text: TextSign,
  plant: Plant,
  lamp: Lamp,
  sofa: Sofa,
  desk: Desk,
  rug: Rug,
  sculpture: Sculpture,
  frame: Frame,
  stage: Stage,
  seats: Seats,
}
