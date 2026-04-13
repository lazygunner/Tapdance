export interface IElectronAPI {
  isElectron: boolean;
  platform: string;
  getBridgeUrl: () => Promise<string>;
  getAppVersion: () => Promise<string>;
  setWindowAppearance: (themeMode: 'light' | 'dark') => Promise<boolean>;
  openExternal: (url: string) => Promise<void>;
  selectDirectory: (options?: { title?: string; defaultPath?: string }) => Promise<string>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
