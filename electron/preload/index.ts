import type { TosConfig } from '../../src/types.ts'
import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  isElectron: true,
  platform: process.platform,
  getBridgeUrl: () => ipcRenderer.invoke('bridge:getUrl'),
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  setWindowAppearance: (themeMode: 'light' | 'dark') => ipcRenderer.invoke('window:setAppearance', themeMode),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  uploadVideoToTos: (payload: {
    config: TosConfig
    fileName: string
    fileType?: string
    data: ArrayBuffer
  }) => ipcRenderer.invoke('tos:uploadVideo', payload),
  selectDirectory: (options?: { title?: string; defaultPath?: string }) => ipcRenderer.invoke('dialog:selectDirectory', options),
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('electronAPI', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in window)
  window.electron = electronAPI
  // @ts-ignore (define in window)
  window.electronAPI = api
}
