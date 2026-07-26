import { app, BrowserWindow, shell, ipcMain, nativeImage, dialog, net } from 'electron'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import type { TosConfig } from '../../src/types.ts'
import { buildTosObjectKey, createTosClient, resolveTosUrl } from '../../src/services/tosUploadService.ts'
import { startBridge } from './bridge'
import { startMockApiServer } from '../../server/mockApiServer.mjs'

let bridgeServer: any = null
let mockApiServer: any = null
let mainWindow: BrowserWindow | null = null

const iconPath = join(__dirname, '../../public/assets/tapdance_logo.png')
const WINDOW_TITLE_BAR_HEIGHT = 56

type WindowAppearanceMode = 'light' | 'dark'
type TosUploadPayload = {
  config: TosConfig
  fileName: string
  fileType?: string
  defaultPrefix?: string
  data: ArrayBuffer
}
type RemoteJsonRequestPayload = {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
}

type MockApiStartOptions = {
  port?: number
  scenario?: string
}

type RealPortraitValidationWindowOptions = {
  h5Link?: string
  callbackURL?: string
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const details = [error.message]
    const causeMessage = error.cause instanceof Error
      ? error.cause.message
      : typeof error.cause === 'string'
        ? error.cause
        : ''
    const code = typeof (error as any).code === 'string' ? (error as any).code : ''
    if (code) {
      details.push(`code=${code}`)
    }
    if (causeMessage && causeMessage !== error.message) {
      details.push(`cause=${causeMessage}`)
    }
    return details.filter(Boolean).join(' | ')
  }
  return String(error || 'Unknown error')
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

function isCallbackNavigation(navigationUrl: string, callbackURL: string): boolean {
  try {
    const navigated = new URL(navigationUrl)
    const callback = new URL(callbackURL)
    return navigated.origin === callback.origin
      && navigated.pathname.replace(/\/+$/u, '') === callback.pathname.replace(/\/+$/u, '')
  } catch {
    return Boolean(callbackURL) && navigationUrl.startsWith(callbackURL)
  }
}

function openRealPortraitValidationWindow(options: RealPortraitValidationWindowOptions): Promise<{ callbackURL: string }> {
  const h5Link = String(options?.h5Link || '').trim()
  const callbackURL = String(options?.callbackURL || '').trim()

  if (!isHttpUrl(h5Link)) {
    throw new Error('真人认证 H5Link 无效')
  }
  if (!isHttpUrl(callbackURL)) {
    throw new Error('真人认证 CallbackURL 无效')
  }

  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false
    const authWindow = new BrowserWindow({
      width: 430,
      height: 760,
      minWidth: 360,
      minHeight: 640,
      title: '真人人像认证',
      parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
      modal: false,
      autoHideMenuBar: true,
      backgroundColor: '#050b16',
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
      icon: nativeImage.createFromPath(iconPath),
    })

    const finish = (resultURL: string) => {
      if (settled) {
        return
      }
      settled = true
      resolvePromise({ callbackURL: resultURL })
      if (!authWindow.isDestroyed()) {
        authWindow.close()
      }
    }

    const fail = (error: Error) => {
      if (settled) {
        return
      }
      settled = true
      if (!authWindow.isDestroyed()) {
        authWindow.close()
      }
      rejectPromise(error)
    }

    authWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
      const isAuthContents = webContents.id === authWindow.webContents.id
      callback(isAuthContents && ['media', 'camera', 'microphone'].includes(permission))
    })

    authWindow.webContents.setWindowOpenHandler((details) => {
      if (isCallbackNavigation(details.url, callbackURL)) {
        finish(details.url)
        return { action: 'deny' }
      }
      if (isHttpUrl(details.url)) {
        authWindow.loadURL(details.url).catch((error) => {
          fail(new Error(`加载真人认证页面失败：${normalizeErrorMessage(error)}`))
        })
      }
      return { action: 'deny' }
    })

    const handleNavigation = (event: Electron.Event, targetUrl: string) => {
      if (!isCallbackNavigation(targetUrl, callbackURL)) {
        return
      }
      event.preventDefault()
      finish(targetUrl)
    }

    authWindow.webContents.on('will-redirect', handleNavigation)
    authWindow.webContents.on('will-navigate', handleNavigation)
    authWindow.webContents.on('did-navigate', (_event, targetUrl) => {
      if (isCallbackNavigation(targetUrl, callbackURL)) {
        finish(targetUrl)
      }
    })

    authWindow.on('closed', () => {
      authWindow.webContents.session.setPermissionRequestHandler(null)
      if (!settled) {
        settled = true
        resolvePromise({ callbackURL: '' })
      }
    })

    authWindow.loadURL(h5Link).catch((error) => {
      fail(new Error(`加载真人认证页面失败：${normalizeErrorMessage(error)}`))
    })
  })
}

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

  ipcMain.handle('mock-api:status', () => {
    if (!mockApiServer) {
      return {
        running: false,
        baseUrl: '',
      }
    }
    return mockApiServer.getStatus()
  })

  ipcMain.handle('mock-api:start', async (_, options?: MockApiStartOptions) => {
    if (!mockApiServer) {
      const port = Number(options?.port || process.env.MOCK_API_PORT || 3220)
      mockApiServer = await startMockApiServer({
        port,
        scenario: options?.scenario,
      })
      console.log(`Mock API server started on ${mockApiServer.baseUrl}`)
    } else if (options?.scenario && typeof mockApiServer.setScenario === 'function') {
      mockApiServer.setScenario(options.scenario)
    }
    return mockApiServer.getStatus()
  })

  ipcMain.handle('mock-api:stop', async () => {
    if (mockApiServer && typeof mockApiServer.close === 'function') {
      await mockApiServer.close()
      mockApiServer = null
    }
    return {
      running: false,
      baseUrl: '',
    }
  })

  ipcMain.handle('mock-api:setScenario', async (_, scenario: string) => {
    if (!mockApiServer) {
      mockApiServer = await startMockApiServer({
        port: Number(process.env.MOCK_API_PORT || 3220),
        scenario,
      })
    } else if (typeof mockApiServer.setScenario === 'function') {
      mockApiServer.setScenario(scenario)
    }
    return mockApiServer.getStatus()
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

  ipcMain.handle('real-portrait:openValidation', async (_, options?: RealPortraitValidationWindowOptions) => {
    return openRealPortraitValidationWindow(options || {})
  })

  ipcMain.handle('tos:uploadVideo', async (_, payload: TosUploadPayload) => {
    try {
      const fileMeta = {
        name: String(payload?.fileName || '').trim(),
        type: String(payload?.fileType || '').trim(),
      }

      if (!fileMeta.name) {
        throw new Error('缺少上传文件名')
      }

      const client = createTosClient(payload.config)
      const objectKey = buildTosObjectKey(payload.config, fileMeta, payload.defaultPrefix || 'reference-videos')
      const body = Buffer.from(payload.data)

      await client.putObject({
        bucket: payload.config.bucket,
        key: objectKey,
        body,
        contentLength: body.byteLength,
        contentType: fileMeta.type || undefined,
      })

      return {
        url: resolveTosUrl(payload.config, objectKey),
        key: objectKey,
      }
    } catch (error) {
      console.error('[Electron][TOS] Upload failed:', error)
      throw new Error(`TOS 主进程上传失败：${normalizeErrorMessage(error)}`)
    }
  })

  ipcMain.handle('http:requestJson', async (_, payload: RemoteJsonRequestPayload) => {
    const url = String(payload?.url || '').trim()
    if (!isHttpUrl(url)) {
      throw new Error('远程请求 URL 无效')
    }
    const response = await net.fetch(url, {
      method: payload.method || 'GET',
      headers: payload.headers,
      body: payload.body,
    })
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      text: await response.text(),
    }
  })

  ipcMain.handle('asset:readBundledModel', async (_, fileName: string) => {
    if (fileName !== 'ue-mannequin-retopology.glb') {
      throw new Error('不允许读取该模型资源')
    }
    const data = await readFile(join(__dirname, '../renderer/models', fileName))
    return data.toString('base64')
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
  if (mockApiServer && typeof mockApiServer.close === 'function') {
    void mockApiServer.close()
  }
})
