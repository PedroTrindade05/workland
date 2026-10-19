// O que dá pra colocar no mundo: nome, categoria, altura padrão e o que dá pra editar em cada objeto.
import type { ItemKind } from '../rooms'

export type Field =
  | { key: string; label: string; type: 'text' | 'textarea' | 'color' | 'folder' | 'image' | 'url' | 'shortcut' | 'room' | 'plugin' }
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[] }
  | { key: string; label: string; type: 'toggle' }

export type Category = 'Paredes' | 'Úteis' | 'Organizar' | 'Telas' | 'Decoração' | 'Passagens'

export type Kind = {
  kind: ItemKind
  name: string
  hint: string
  category: Category
  icon: string
  y: number
  unique?: boolean
  defaults?: Record<string, unknown>
  fields?: Field[]
}

const ZONES = [
  { value: '', label: 'Hora daqui' },
  { value: 'America/Sao_Paulo', label: 'Brasília' },
  { value: 'America/New_York', label: 'Nova York' },
  { value: 'Europe/London', label: 'Londres' },
  { value: 'Europe/Lisbon', label: 'Lisboa' },
  { value: 'Asia/Tokyo', label: 'Tóquio' },
]

export const CATALOG: Kind[] = [
  // paredes grandes
  { kind: 'shortcut-wall', name: 'Parede de atalhos', hint: 'os atalhos da sua Área de Trabalho', category: 'Paredes', icon: 'grid', y: 0, fields: [{ key: 'title', label: 'Título', type: 'text' }] },
  { kind: 'screen-wall', name: 'Arco de telas', hint: 'suas janelas abertas, ao vivo', category: 'Paredes', icon: 'screen', y: 0, unique: true },
  { kind: 'system-panel', name: 'Painel do sistema', hint: 'hora, CPU, memória e disco', category: 'Paredes', icon: 'pulse', y: 0, unique: true },

  // úteis
  { kind: 'clock', name: 'Relógio', hint: 'digital ou de ponteiro', category: 'Úteis', icon: 'clock', y: 2.2, defaults: { style: 'digital', tz: '' }, fields: [
    { key: 'style', label: 'Estilo', type: 'select', options: [{ value: 'digital', label: 'Digital' }, { value: 'analogico', label: 'Ponteiros' }] },
    { key: 'tz', label: 'Fuso', type: 'select', options: ZONES },
  ] },
  { kind: 'calendar', name: 'Calendário', hint: 'o mês com o dia de hoje marcado', category: 'Úteis', icon: 'calendar', y: 2 },
  { kind: 'pomodoro', name: 'Pomodoro', hint: '25 min de foco, 5 de pausa', category: 'Úteis', icon: 'timer', y: 1.9, defaults: { work: '25', rest: '5' }, fields: [
    { key: 'work', label: 'Foco (min)', type: 'text' },
    { key: 'rest', label: 'Pausa (min)', type: 'text' },
  ] },
  { kind: 'music', name: 'Tocando agora', hint: 'a música do Spotify, YouTube e afins', category: 'Úteis', icon: 'music', y: 1.9 },
  { kind: 'weather', name: 'Clima', hint: 'temperatura e previsão da sua cidade', category: 'Úteis', icon: 'cloud', y: 2.1, defaults: { city: 'São Paulo' }, fields: [{ key: 'city', label: 'Cidade', type: 'text' }] },

  // organizar
  { kind: 'note', name: 'Post-it', hint: 'um lembrete colado no ar', category: 'Organizar', icon: 'note', y: 1.8, defaults: { text: 'Nova nota', color: '#ffd76a' }, fields: [
    { key: 'text', label: 'Texto', type: 'textarea' },
    { key: 'color', label: 'Cor', type: 'color' },
  ] },
  { kind: 'todo', name: 'Lista de tarefas', hint: 'marque o que já fez', category: 'Organizar', icon: 'check', y: 1.9, defaults: { title: 'Tarefas', items: [] } },
  { kind: 'photos', name: 'Porta-retrato', hint: 'passa as fotos de uma pasta', category: 'Organizar', icon: 'image', y: 2.1, fields: [{ key: 'folder', label: 'Pasta', type: 'folder' }] },
  { kind: 'shelf', name: 'Estante de pasta', hint: 'os arquivos de uma pasta na prateleira', category: 'Organizar', icon: 'folder', y: 0, fields: [{ key: 'folder', label: 'Pasta', type: 'folder' }] },
  { kind: 'shortcut', name: 'Atalho solto', hint: 'um atalho em qualquer lugar', category: 'Organizar', icon: 'link', y: 1.6, fields: [{ key: 'path', label: 'Atalho', type: 'shortcut' }] },
  { kind: 'text', name: 'Letreiro', hint: 'um texto grande flutuando', category: 'Organizar', icon: 'type', y: 3, defaults: { text: 'Meu espaço', color: '#ffffff' }, fields: [
    { key: 'text', label: 'Texto', type: 'text' },
    { key: 'color', label: 'Cor', type: 'color' },
  ] },

  // telas
  { kind: 'site', name: 'Tela de site', hint: 'qualquer site, usável aqui dentro', category: 'Telas', icon: 'globe', y: 0, defaults: { url: 'https://www.google.com' }, fields: [{ key: 'url', label: 'Endereço', type: 'url' }] },
  { kind: 'stage', name: 'Palco com telão', hint: 'apresente PDF, imagens, vídeos, um app ou um site', category: 'Telas', icon: 'stage', y: 0, unique: true },
  { kind: 'plugin', name: 'Plugin', hint: 'um widget feito por você ou por alguém', category: 'Telas', icon: 'puzzle', y: 0, fields: [{ key: 'plugin', label: 'Plugin', type: 'plugin' }] },

  // decoração
  { kind: 'plant', name: 'Planta', hint: '', category: 'Decoração', icon: 'leaf', y: 0, defaults: { kind: 'folhas' }, fields: [
    { key: 'kind', label: 'Tipo', type: 'select', options: [{ value: 'folhas', label: 'Folhagem' }, { value: 'cacto', label: 'Cacto' }, { value: 'arvore', label: 'Arvorezinha' }] },
  ] },
  { kind: 'lamp', name: 'Luminária', hint: '', category: 'Decoração', icon: 'lamp', y: 0, defaults: { color: '#ffd9a8' }, fields: [{ key: 'color', label: 'Luz', type: 'color' }] },
  { kind: 'sofa', name: 'Sofá', hint: '', category: 'Decoração', icon: 'sofa', y: 0, defaults: { color: '#4a4f5c' }, fields: [{ key: 'color', label: 'Cor', type: 'color' }] },
  { kind: 'desk', name: 'Mesa', hint: '', category: 'Decoração', icon: 'desk', y: 0, defaults: { color: '#2a2622' }, fields: [{ key: 'color', label: 'Cor', type: 'color' }] },
  { kind: 'rug', name: 'Tapete', hint: '', category: 'Decoração', icon: 'square', y: 0, defaults: { color: '#3a3f4a', round: false }, fields: [
    { key: 'color', label: 'Cor', type: 'color' },
    { key: 'round', label: 'Redondo', type: 'toggle' },
  ] },
  { kind: 'sculpture', name: 'Escultura', hint: '', category: 'Decoração', icon: 'shape', y: 0, defaults: { shape: 'no' }, fields: [
    { key: 'shape', label: 'Forma', type: 'select', options: [{ value: 'no', label: 'Nó' }, { value: 'esfera', label: 'Esfera' }, { value: 'anel', label: 'Anel' }] },
  ] },
  { kind: 'seats', name: 'Plateia', hint: 'fileiras de cadeiras viradas pra frente', category: 'Decoração', icon: 'seats', y: 0, defaults: { rows: 4, cols: 10, color: '#3d4350' }, fields: [
    { key: 'rows', label: 'Fileiras', type: 'select', options: [2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) })) },
    { key: 'cols', label: 'Cadeiras por fileira', type: 'select', options: [6, 8, 10, 12, 14].map((n) => ({ value: String(n), label: String(n) })) },
    { key: 'color', label: 'Cor', type: 'color' },
  ] },
  { kind: 'frame', name: 'Quadro', hint: 'uma imagem sua na parede', category: 'Decoração', icon: 'frame', y: 2, fields: [{ key: 'image', label: 'Imagem', type: 'image' }] },

  // passagens
  { kind: 'portal', name: 'Portal', hint: 'leva pra outra sala', category: 'Passagens', icon: 'portal', y: 0, fields: [{ key: 'room', label: 'Leva pra', type: 'room' }] },
]

export const kindOf = (k: ItemKind) => CATALOG.find((c) => c.kind === k)!
export const CATEGORIES: Category[] = ['Paredes', 'Úteis', 'Organizar', 'Telas', 'Decoração', 'Passagens']
