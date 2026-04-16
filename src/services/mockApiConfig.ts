import type { ApiSettings, MockApiScenario } from '../types.ts';

export const MOCK_API_DEFAULT_PORT = 3220;
export const MOCK_API_SCENARIO_OPTIONS: Array<{ value: MockApiScenario; label: string; description: string }> = [
  { value: 'success', label: '成功返回', description: '提交后立即返回完成结果，适合常规流程验证。' },
  { value: 'slow_success', label: '慢速成功', description: '任务先 running，约 8 秒后完成，适合轮询状态验证。' },
  { value: 'concurrency_once', label: '并发限制一次', description: '第一次提交返回 ret=1310，后续提交成功，适合队列验证。' },
  { value: 'concurrency_always', label: '持续并发限制', description: '每次提交都返回 ret=1310，适合排队重试验证。' },
  { value: 'submit_fail', label: '提交失败', description: '提交返回普通失败，适合失败提示验证。' },
];

export type MockApiServerStatus = {
  running: boolean;
  port?: number;
  baseUrl?: string;
  volcengineBaseUrl?: string;
  seedanceBridgeUrl?: string;
  scenario?: MockApiScenario;
  taskCount?: number;
  error?: string;
};

export function normalizeMockApiBaseUrl(baseUrl?: string) {
  return String(baseUrl || '').trim().replace(/\/+$/u, '');
}

export function buildMockVolcengineBaseUrl(baseUrl?: string) {
  const normalizedBaseUrl = normalizeMockApiBaseUrl(baseUrl);
  return normalizedBaseUrl ? `${normalizedBaseUrl}/api/v3` : '';
}

export function buildMockSeedanceBridgeUrl(baseUrl?: string) {
  const normalizedBaseUrl = normalizeMockApiBaseUrl(baseUrl);
  return normalizedBaseUrl ? `${normalizedBaseUrl}/api/seedance` : '';
}

function createPreviousSettings(settings: ApiSettings): NonNullable<ApiSettings['mockApi']['previousSettings']> {
  return {
    volcengineApiKey: settings.volcengine.apiKey,
    volcengineBaseUrl: settings.volcengine.baseUrl,
    seedanceBridgeUrl: settings.seedance.bridgeUrl,
    defaultModels: { ...settings.defaultModels },
  };
}

export function applyMockApiSettings(
  settings: ApiSettings,
  params: {
    baseUrl: string;
    scenario: MockApiScenario;
  },
): ApiSettings {
  const baseUrl = normalizeMockApiBaseUrl(params.baseUrl);
  const previousSettings = settings.mockApi.enabled
    ? (settings.mockApi.previousSettings || null)
    : createPreviousSettings(settings);

  return {
    ...settings,
    volcengine: {
      ...settings.volcengine,
      enabled: true,
      apiKey: settings.volcengine.apiKey.trim() || 'mock-api-key',
      baseUrl: buildMockVolcengineBaseUrl(baseUrl),
    },
    seedance: {
      ...settings.seedance,
      enabled: true,
      bridgeUrl: buildMockSeedanceBridgeUrl(baseUrl),
    },
    defaultModels: {
      ...settings.defaultModels,
      text: 'volcengine.textModel',
      image: 'volcengine.imageModel',
      video: 'volcengine.videoModel',
    },
    mockApi: {
      enabled: true,
      baseUrl,
      scenario: params.scenario,
      previousSettings,
    },
  };
}

export function restoreMockApiSettings(settings: ApiSettings): ApiSettings {
  const previousSettings = settings.mockApi.previousSettings;
  if (!previousSettings) {
    return {
      ...settings,
      mockApi: {
        ...settings.mockApi,
        enabled: false,
        previousSettings: null,
      },
    };
  }

  return {
    ...settings,
    volcengine: {
      ...settings.volcengine,
      apiKey: previousSettings.volcengineApiKey,
      baseUrl: previousSettings.volcengineBaseUrl,
    },
    seedance: {
      ...settings.seedance,
      bridgeUrl: previousSettings.seedanceBridgeUrl,
    },
    defaultModels: {
      ...previousSettings.defaultModels,
    },
    mockApi: {
      ...settings.mockApi,
      enabled: false,
      previousSettings: null,
    },
  };
}
