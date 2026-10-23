const { contextBridge, ipcRenderer } = require('electron')

const call = (ch) => (...args) => ipcRenderer.invoke(ch, ...args)

contextBridge.exposeInMainWorld('pc', {
  native: true,
  apps: call('apps:list'),
  appIcons: call('apps:icons'),
  launch: call('apps:launch'),
  shortcuts: call('shortcuts:list'),
  shortcutIcons: call('shortcuts:icons'),
  openShortcut: call('shortcuts:open'),
  onShortcuts: (fn) => {
    const h = () => fn()
    ipcRenderer.on('shortcuts:changed', h)
    return () => ipcRenderer.removeListener('shortcuts:changed', h)
  },
  places: call('fs:places'),
  list: call('fs:list'),
  icon: call('fs:icon'),
  thumb: call('fs:thumb'),
  open: call('fs:open'),
  reveal: call('fs:reveal'),
  openUrl: call('web:open'),
  windows: call('win:list'),
  focus: call('win:focus'),
  prepare: call('win:prepare'),
  fit: call('win:fit'),
  overlay: call('win:overlay'),
  overlayEnd: call('win:overlay-end'),
  onOverlayEnded: (fn) => {
    const h = (_e, reason) => fn(reason)
    ipcRenderer.on('win:overlay-ended', h)
    return () => ipcRenderer.removeListener('win:overlay-ended', h)
  },
  // só existem no modo de teste escondido
  testWindow: call('test:window'),
  testPlaced: call('test:placed'),
  mouse: (id, ev) => ipcRenderer.send('win:mouse', id, ev),
  key: (id, ev) => ipcRenderer.send('win:key', id, ev),
  onApps: (fn) => {
    const h = (_e, data) => fn(data)
    ipcRenderer.on('apps:updated', h)
    return () => ipcRenderer.removeListener('apps:updated', h)
  },
  stats: call('sys:stats'),
  media: call('media'),
  pickFolder: call('pick:folder'),
  pickImage: call('pick:image'),
  pickMedia: call('pick:media'),
  pickPdf: call('pick:pdf'),
  pickSlides: call('pick:slides'),
  meetHost: call('meet:host'),
  meetStop: call('meet:stop'),
  meetDiscover: call('meet:discover'),
  meetShare: call('meet:share'),
  plugins: call('plugins:list'),
  openPlugins: call('plugins:open'),
  exportSetup: call('setup:export'),
  importSetup: call('setup:import'),
  launchExe: call('exe:launch'),
  updateStatus: call('update:status'),
  installUpdate: call('update:install'),
  onUpdate: (fn) => {
    const h = (_e, data) => fn(data)
    ipcRenderer.on('update:ready', h)
    return () => ipcRenderer.removeListener('update:ready', h)
  },
})
