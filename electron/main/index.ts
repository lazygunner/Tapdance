import { app, BrowserWindow, shell, ipcMain, nativeImage, dialog } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { startBridge } from './bridge'

let bridgeServer: any = null
let mainWindow: BrowserWindow | null = null

const iconPath = join(__dirname, '../../public/assets/tapdance_logo.png')
const WINDOW_TITLE_BAR_HEIGHT = 56

type WindowAppearanceMode = 'light' | 'dark'

const WINDOW_APPEARANCE: Record<WindowAppearanceMode, {
  backgroundColor: string
  titleBarColor: string
  symbolColor: string
}> = {
  dark: {
    backgroundColor: '#050b16',
    titleBarColor: '#091221',
    symbolColor: '#f8fbff'
  },
  light: {
    backgroundColor: '#f6f1e8',
    titleBarColor: '#fff8ef',
    symbolColor: '#1a2433'
  }
}

function applyWindowAppearance(window: BrowserWindow, mode: WindowAppearanceMode): void {
  const appearance = WINDOW_APPEARANCE[mode]

  window.setBackgroundColor(appearance.backgroundColor)

  if (process.platform !== 'darwin') {
    window.setTitleBarOverlay({
      color: appearance.titleBarColor,
      symbolColor: appearance.symbolColor,
      height: WINDOW_TITLE_BAR_HEIGHT
    })
  }
}

async function createWindow(): Promise<void> {
  const defaultAppearance = WINDOW_APPEARANCE.dark

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    title: 'Tapdance - AI导演工作台',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    backgroundColor: defaultAppearance.backgroundColor,
    ...(process.platform !== 'darwin'
      ? {
        titleBarOverlay: {
          color: defaultAppearance.titleBarColor,
          symbolColor: defaultAppearance.symbolColor,
          height: WINDOW_TITLE_BAR_HEIGHT
        }
      }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: nativeImage.createFromPath(iconPath)
  })

  applyWindowAppearance(mainWindow, 'dark')

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.tapdance.ai-director')

  // Set Dock icon for macOS
  if (process.platform === 'darwin') {
    const fs = require('node:fs')
    if (fs.existsSync(iconPath)) {
      app.dock.setIcon(iconPath)
      console.log('[Electron] Dock icon set from:', iconPath)
    } else {
      console.error('[Electron] Icon file not found at:', iconPath)
    }
  }

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Start internal bridge server
  try {
    const port = Number(process.env.SEEDANCE_BRIDGE_PORT || 3210)
    bridgeServer = await startBridge(port)
    console.log(`Bridge server started on port ${port}`)
  } catch (err) {
    console.error('Failed to start bridge server:', err)
  }

  // IPC handlers
  ipcMain.handle('bridge:getUrl', () => {
    return `http://127.0.0.1:${bridgeServer?.port || 3210}/api/seedance`
  })

  ipcMain.handle('app:getVersion', () => {
    return app.getVersion()
  })

  ipcMain.handle('window:setAppearance', (_, mode: WindowAppearanceMode) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return false
    }

    applyWindowAppearance(mainWindow, mode === 'light' ? 'light' : 'dark')
    return true
  })

  ipcMain.handle('shell:openExternal', async (_, url: string) => {
    await shell.openExternal(url)
  })

  ipcMain.handle('dialog:selectDirectory', async (_, options?: { title?: string; defaultPath?: string }) => {
    const result = await dialog.showOpenDialog({
      title: options?.title || '选择文件夹',
      defaultPath: options?.defaultPath || undefined,
      properties: ['openDirectory', 'createDirectory'],
    })

    if (result.canceled) {
      return ''
    }

    return result.filePaths[0] || ''
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Clean up resources
app.on('will-quit', () => {
  if (bridgeServer && typeof bridgeServer.close === 'function') {
    bridgeServer.close()
  }
})
