import { app, BrowserWindow, Menu, globalShortcut } from 'electron'
import path from 'path'
import fs from 'fs'
import { initDatabase } from './db'
import { registerIpcHandlers } from './ipc'

let mainWindow: BrowserWindow | null = null

function getWindowStatePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function loadWindowPosition(): { x: number; y: number } | undefined {
  try {
    const data = JSON.parse(fs.readFileSync(getWindowStatePath(), 'utf-8'))
    if (typeof data.x === 'number' && typeof data.y === 'number') return data
  } catch { /* 무시 */ }
  return undefined
}

function saveWindowPosition(): void {
  if (!mainWindow) return
  const [x, y] = mainWindow.getPosition()
  fs.writeFileSync(getWindowStatePath(), JSON.stringify({ x, y }))
}

function createWindow(): void {
  const savedPos = loadWindowPosition()
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 870,
    ...(savedPos ?? {}),
    resizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })

  mainWindow.on('moved', saveWindowPosition)

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  initDatabase()
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  globalShortcut.register('CommandOrControl+Shift+R', () => {
    mainWindow?.webContents.reload()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
