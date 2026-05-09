import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  onScanProgress: (cb: (count: number) => void) => {
    const handler = (_: Electron.IpcRendererEvent, count: number) => cb(count)
    ipcRenderer.on('scan:progress', handler)
    return handler
  },
  offScanProgress: (handler: (e: Electron.IpcRendererEvent, count: number) => void) => {
    ipcRenderer.off('scan:progress', handler)
  }
})
