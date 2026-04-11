import { app, BrowserWindow, shell, ipcMain, nativeImage } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { startBridge } from './bridge'

let bridgeServer: any = null

const iconPath = join(__dirname, '../../public/assets/tapdance_logo.png')

async function createWindow(): Promise<void> {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    title: 'Tapdance - AI导演工作台',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: nativeImage.createFromPath(iconPath)
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
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

  ipcMain.handle('shell:openExternal', async (_, url: string) => {
    await shell.openExternal(url)
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
