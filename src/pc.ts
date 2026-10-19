// Ponte com o computador. No Electron vem do preload; no navegador cai num mock
// pra dar pra mexer no mundo sem o app nativo.

export type AppEntry = { id: string; name: string; appId: string | null; link: string | null; icon: string | null }
export type Shortcut = { id: string; name: string; path: string; icon?: string | null }
export type Place = { key: string; name: string; path: string }
export type FsItem = { name: string; path: string; isDir: boolean; size: number; mtime: number; ext: string }
export type FsListing = { dir: string; parent?: string | null; items: FsItem[]; error?: string }
export type WinEntry = { id: string; name: string; icon: string | null; minimized?: boolean; exe?: string | null }
export type MouseEv = { type: 'move' | 'down' | 'up' | 'dbl' | 'wheel'; u: number; v: number; button?: number; delta?: number; horizontal?: boolean; space?: 'client' }
export type Media = { title: string; artist: string; app: string; playing: boolean; art: string | null }
export type PluginInfo = { id: string; name: string; url: string }
export type Setup = Record<string, unknown>
export type UpdateInfo = { version: string }
export type MeetHosted = { port: number; pin: string; token: string; name: string; ips: string[] }
export type MeetFound = { ip: string; port: number; name: string; by: string; people: number }
export type Crop = { left: number; top: number; right: number; bottom: number; width: number; height: number }
export type KeyEv = { type: 'char'; text: string } | { type: 'key'; vk: number; down: boolean; extended?: boolean; ctrl?: boolean; alt?: boolean; shift?: boolean }
export type Stats = {
  cpu: number
  cpuName: string
  cores: number
  memUsed: number
  memTotal: number
  uptime: number
  host: string
  user: string
  diskUsed: number
  diskTotal: number
}

type Bridge = {
  native: boolean
  platform: string
  // true no Mac: a janela real vem pra frente encaixada no telão, em vez de ficar escondida atrás
  overlay: boolean
  apps(): Promise<AppEntry[]>
  appIcons(): Promise<Record<string, string>>
  launch(a: AppEntry): Promise<boolean>
  shortcuts(): Promise<Shortcut[]>
  shortcutIcons(): Promise<Record<string, string>>
  openShortcut(path: string): Promise<boolean>
  onShortcuts(fn: () => void): () => void
  places(): Promise<Place[]>
  list(dir: string): Promise<FsListing>
  icon(path: string, ext?: string): Promise<string | null>
  thumb(path: string): Promise<string | null>
  open(path: string): Promise<boolean>
  reveal(path: string): Promise<void>
  openUrl(url: string): Promise<void>
  windows(): Promise<WinEntry[]>
  focus(id: string): Promise<boolean>
  prepare(id: string): Promise<boolean>
  // Windows: quanto cortar da imagem. Mac: true se encaixou, false se só abriu o app fora (sem permissão)
  fit(id: string, rect: { x: number; y: number; width: number; height: number }): Promise<Crop | boolean | null>
  mouse(id: string, ev: MouseEv): void
  key(id: string, ev: KeyEv): void
  release(): Promise<void>
  onReturn(fn: () => void): () => void
  onApps(fn: (d: { apps: AppEntry[]; icons: Record<string, string> }) => void): () => void
  stats(): Promise<Stats>
  media(cmd: 'status' | 'play' | 'next' | 'prev'): Promise<Media | null>
  pickFolder(): Promise<string | null>
  pickImage(): Promise<string | null>
  pickMedia(): Promise<string | null>
  pickPdf(): Promise<string | null>
  pickSlides(): Promise<string[]>
  meetHost(opts: { name: string; by: string }): Promise<MeetHosted>
  meetStop(): Promise<void>
  meetDiscover(): Promise<MeetFound[]>
  meetShare(opts: { file: string; base: string; pin: string }): Promise<{ id: string }>
  plugins(): Promise<PluginInfo[]>
  openPlugins(): Promise<void>
  exportSetup(data: Setup): Promise<boolean>
  importSetup(): Promise<Setup | null>
  launchExe(path: string): Promise<boolean>
  updateStatus(): Promise<UpdateInfo | null>
  installUpdate(): Promise<boolean>
  onUpdate(fn: (u: UpdateInfo) => void): () => void
  fileUrl(path: string): string
}

const MOCK_APPS = [
  'Blender', 'Brave', 'Calculadora', 'Discord', 'Figma', 'Git Bash', 'Google Chrome', 'Notion', 'OBS Studio',
  'Photoshop', 'Postman', 'Spotify', 'Steam', 'Terminal', 'Visual Studio Code', 'WhatsApp', 'Bloco de Notas', 'Paint',
]

const mockFs: Record<string, FsItem[]> = {}
function fakeDir(dir: string): FsItem[] {
  if (mockFs[dir]) return mockFs[dir]
  const depth = dir.split('/').length
  const items: FsItem[] = []
  const nDirs = depth > 4 ? 0 : 3 + (dir.length % 4)
  for (let i = 0; i < nDirs; i++) items.push({ name: `Pasta ${i + 1}`, path: `${dir}/Pasta ${i + 1}`, isDir: true, size: 0, mtime: 0, ext: '' })
  const exts = ['pdf', 'png', 'mp4', 'docx', 'zip', 'txt', 'psd', 'mp3', 'xlsx', 'js']
  for (let i = 0; i < 9 + (dir.length % 11); i++) {
    const ext = exts[i % exts.length]
    items.push({ name: `arquivo-${i + 1}.${ext}`, path: `${dir}/arquivo-${i + 1}.${ext}`, isDir: false, size: 1000 * i, mtime: 0, ext })
  }
  return (mockFs[dir] = items)
}

const mock: Bridge = {
  native: false,
  platform: 'web',
  overlay: false,
  apps: async () => MOCK_APPS.map((name) => ({ id: name, name, appId: name, link: null, icon: null })),
  appIcons: async () => ({}),
  launch: async () => true,
  shortcuts: async () =>
    ['Visual Studio Code', 'Google Chrome', 'Figma', 'Discord', 'Spotify', 'Steam', 'GitHub Desktop', 'Cursor', 'Notion'].map((name) => ({
      id: name,
      name,
      path: `C:/Users/Nexus/Desktop/${name}.lnk`,
    })),
  shortcutIcons: async () => ({}),
  openShortcut: async () => true,
  onShortcuts: () => () => {},
  places: async () =>
    [
      ['desktop', 'Área de Trabalho'],
      ['downloads', 'Downloads'],
      ['documents', 'Documentos'],
      ['pictures', 'Imagens'],
      ['music', 'Músicas'],
      ['videos', 'Vídeos'],
      ['home', 'Nexus'],
    ].map(([key, name]) => ({ key, name, path: `C:/Users/Nexus/${name}` })),
  list: async (dir) => ({ dir, parent: dir.split('/').length > 4 ? dir.split('/').slice(0, -1).join('/') : null, items: fakeDir(dir) }),
  icon: async () => null,
  thumb: async () => null,
  open: async () => true,
  reveal: async () => {},
  openUrl: async (url) => void window.open(url, '_blank'),
  windows: async () => [
    { id: 'window:1:0', name: 'Visual Studio Code', icon: null },
    { id: 'window:2:0', name: 'Spotify Premium', icon: null },
    { id: 'window:3:0', name: 'Discord', icon: null },
  ],
  focus: async () => true,
  prepare: async () => true,
  fit: async () => null,
  mouse: () => {},
  key: () => {},
  release: async () => {},
  onReturn: () => () => {},
  onApps: () => () => {},
  media: async () => null,
  pickFolder: async () => null,
  pickImage: async () => null,
  pickMedia: async () => null,
  pickPdf: async () => null,
  pickSlides: async () => [],
  meetHost: async () => {
    throw new Error('Encontro só no app instalado')
  },
  meetStop: async () => {},
  meetDiscover: async () => [],
  meetShare: async () => {
    throw new Error('Encontro só no app instalado')
  },
  plugins: async () => [],
  openPlugins: async () => {},
  exportSetup: async (data) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    a.download = 'meu-workland.json'
    a.click()
    return true
  },
  importSetup: async () => null,
  launchExe: async () => true,
  updateStatus: async () => null,
  installUpdate: async () => false,
  onUpdate: () => () => {},
  fileUrl: (p) => p,
  stats: async () => ({
    cpu: 0.2 + Math.random() * 0.3,
    cpuName: 'CPU de mentirinha',
    cores: 12,
    memUsed: 9e9 + Math.random() * 1e9,
    memTotal: 32e9,
    uptime: 3600 * 5 + performance.now() / 1000,
    host: 'NEXUS-PC',
    diskUsed: 310e9,
    diskTotal: 512e9,
    user: 'Nexus',
  }),
}

const native = (window as unknown as { pc?: Bridge }).pc
// caminho local -> endereço que a página consegue carregar (protocolo próprio do Workland)
const fileUrl = (p: string) => 'wlfile://local/' + encodeURI(p.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F')
export const pc: Bridge = native ? { ...native, fileUrl } : mock
