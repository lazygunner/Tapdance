export interface IElectronAPI {
  isElectron: boolean;
  platform: string;
  getBridgeUrl: () => Promise<string>;
  openExternal: (url: string) => Promise<void>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
