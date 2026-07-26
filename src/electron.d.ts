import type { MockApiScenario, TosConfig } from './types.ts';
import type { MockApiServerStatus } from './services/mockApiConfig.ts';

export interface IElectronAPI {
  isElectron: boolean;
  platform: string;
  getBridgeUrl: () => Promise<string>;
  getAppVersion: () => Promise<string>;
  getMockApiStatus: () => Promise<MockApiServerStatus>;
  startMockApiServer: (options?: { port?: number; scenario?: MockApiScenario }) => Promise<MockApiServerStatus>;
  stopMockApiServer: () => Promise<MockApiServerStatus>;
  setMockApiScenario: (scenario: MockApiScenario) => Promise<MockApiServerStatus>;
  setWindowAppearance: (themeMode: 'light' | 'dark') => Promise<boolean>;
  openExternal: (url: string) => Promise<void>;
  openRealPortraitValidation: (options: { h5Link: string; callbackURL: string }) => Promise<{ callbackURL: string }>;
  uploadVideoToTos: (payload: {
    config: TosConfig;
    fileName: string;
    fileType?: string;
    defaultPrefix?: string;
    data: ArrayBuffer;
  }) => Promise<{ url: string; key: string }>;
  requestJson: (payload: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }) => Promise<{
    ok: boolean;
    status: number;
    statusText: string;
    text: string;
  }>;
  readBundledModel: (fileName: string) => Promise<string>;
  selectDirectory: (options?: { title?: string; defaultPath?: string }) => Promise<string>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
