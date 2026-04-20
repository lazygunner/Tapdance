import modelCatalogConfig from '../config/modelCatalog.json' with { type: 'json' };
import type { ApiSettings, CustomProviderModelConfig, ModelSourceId, PromptLanguage } from '../types.ts';
import { getSeedanceApiModelLabelForSourceId, normalizeSeedanceModelVersion } from '../features/seedance/modelVersions.ts';
import { loadPersistedAppState, savePersistedAppState } from '../features/app/services/appStateStore.ts';

export const API_SETTINGS_STATE_KEY = 'api_settings';

export type ModelRole = 'text' | 'image' | 'video';
export type FlowModelCategory = 'text' | 'image' | 'video';
export type ModelProviderId = 'gemini' | 'volcengine';
export type BillingType = 'per_image' | 'per_million_tokens';
export type BillingCurrency = 'CNY' | 'USD';
export interface ModelPricingConfig {
  type: BillingType;
  unitPriceCny?: number;
  unitPriceUsd?: number;
  currency?: BillingCurrency;
  unitPrice?: number;
}

type PricingCatalogConfig = {
  usdToCnyRate?: number;
};

type ProviderCatalog = {
  label: string;
  promptLanguage?: {
    default?: PromptLanguage;
    supported?: PromptLanguage[];
  };
  models: Record<ModelRole, ConfiguredModelCatalogItem[]>;
};

export interface ModelBillingRule {
  type: BillingType;
  currency: BillingCurrency;
  unitPrice: number;
}

export interface ModelSourceOption {
  id: ModelSourceId;
  label: string;
  providerLabel: string;
  value: string;
}

export interface ConfiguredModelCatalogItem {
  name: string;
  modelId: string;
  aliases?: readonly string[];
  pricing?: ModelPricingConfig;
}

export interface VolcengineModelCatalogItem {
  name: string;
  endpointId: string;
  aliases?: readonly string[];
  pricing?: ModelPricingConfig;
}

export const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';
export const DEFAULT_VOLCENGINE_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';

const MODEL_PROVIDER_CATALOG = modelCatalogConfig.providers as Record<ModelProviderId, ProviderCatalog>;
const PRICING_CATALOG_CONFIG = (modelCatalogConfig.pricingConfig || {}) as PricingCatalogConfig;
const FALLBACK_PROVIDER_PROMPT_LANGUAGE: Record<ModelProviderId, PromptLanguage> = {
  gemini: 'en',
  volcengine: 'zh',
};
const FALLBACK_USD_TO_CNY_RATE = 7.2;
const LEGACY_VOLCENGINE_MODEL_ID_MAP: Record<string, string> = {
  'doubao-seed-1.6': 'doubao-seed-1-8-251228',
  'doubao-seedance-2.0': 'doubao-seedance-1-5-pro-251215',
};

function normalizeUsdToCnyRate(value?: number) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  return FALLBACK_USD_TO_CNY_RATE;
}

const USD_TO_CNY_RATE = normalizeUsdToCnyRate(PRICING_CATALOG_CONFIG.usdToCnyRate);

function normalizePromptLanguageList(values?: PromptLanguage[]): PromptLanguage[] {
  const normalized = (values || []).filter((value): value is PromptLanguage => value === 'zh' || value === 'en');
  if (normalized.length === 0) {
    return ['zh', 'en'];
  }
  return Array.from(new Set(normalized));
}

export function getProviderPromptLanguageCatalog(providerId: ModelProviderId): { default: PromptLanguage; supported: PromptLanguage[] } {
  const config = MODEL_PROVIDER_CATALOG[providerId].promptLanguage;
  const supported = normalizePromptLanguageList(config?.supported);
  const fallback = FALLBACK_PROVIDER_PROMPT_LANGUAGE[providerId];
  const defaultLanguage = (config?.default && supported.includes(config.default))
    ? config.default
    : (supported.includes(fallback) ? fallback : supported[0]);

  return {
    default: defaultLanguage,
    supported,
  };
}

export function getUsdToCnyExchangeRate() {
  return USD_TO_CNY_RATE;
}

export const VOLCENGINE_MODEL_CATALOG: Record<ModelRole, VolcengineModelCatalogItem[]> = {
  text: MODEL_PROVIDER_CATALOG.volcengine.models.text.map((item) => ({
    name: item.name,
    endpointId: item.modelId,
    aliases: item.aliases,
    pricing: item.pricing,
  })),
  image: MODEL_PROVIDER_CATALOG.volcengine.models.image.map((item) => ({
    name: item.name,
    endpointId: item.modelId,
    aliases: item.aliases,
    pricing: item.pricing,
  })),
  video: MODEL_PROVIDER_CATALOG.volcengine.models.video.map((item) => ({
    name: item.name,
    endpointId: item.modelId,
    aliases: item.aliases,
    pricing: item.pricing,
  })),
};

const ROLE_BY_SOURCE_ID: Record<Exclude<ModelSourceId, ''>, ModelRole> = {
  'gemini.textModel': 'text',
  'gemini.imageModel': 'image',
  'gemini.proImageModel': 'image',
  'gemini.fastVideoModel': 'video',
  'gemini.proVideoModel': 'video',
  'volcengine.textModel': 'text',
  'volcengine.imageModel': 'image',
  'volcengine.videoModel': 'video',
  'seedance.apiModel': 'video',
  'seedance.fastApiModel': 'video',
};

export const defaultApiSettings: ApiSettings = {
  gemini: {
    apiKey: '',
    baseUrl: DEFAULT_GEMINI_BASE_URL,
    promptLanguage: getProviderPromptLanguageCatalog('gemini').default,
    textModel: 'gemini-3-flash-preview',
    imageModel: 'gemini-2.5-flash-image',
    proImageModel: 'gemini-3-pro-image-preview',
    fastVideoModel: 'veo-3.1-fast-generate-preview',
    proVideoModel: 'veo-3.1-generate-preview',
    customModels: [],
  },
  volcengine: {
    enabled: true,
    apiKey: '',
    baseUrl: DEFAULT_VOLCENGINE_BASE_URL,
    promptLanguage: getProviderPromptLanguageCatalog('volcengine').default,
    textModel: VOLCENGINE_MODEL_CATALOG.text[0].endpointId,
    imageModel: VOLCENGINE_MODEL_CATALOG.image[0].endpointId,
    videoModel: VOLCENGINE_MODEL_CATALOG.video[0].endpointId,
    customModels: [],
  },
  seedance: {
    enabled: true,
    apiModel: 'doubao-seedance-2-0-260128',
    fastApiModel: 'doubao-seedance-2-0-fast-260128',
    defaultExecutor: 'ark',
    cliModelVersion: 'seedance2.0',
    pollIntervalSec: 15,
    bridgeUrl: '',
  },
  mockApi: {
    enabled: false,
    baseUrl: '',
    scenario: 'success',
    previousSettings: null,
  },
  tos: {
    enabled: false,
    region: 'cn-beijing',
    endpoint: 'https://tos-cn-beijing.volces.com',
    bucket: '',
    accessKeyId: '',
    accessKeySecret: '',
    pathPrefix: 'reference-videos/',
  },
  defaultModels: {
    text: 'gemini.textModel',
    image: 'gemini.imageModel',
    video: 'gemini.fastVideoModel',
  },
};

const MODEL_SOURCE_META: Record<Exclude<ModelSourceId, ''>, { label: string; providerLabel: string }> = {
  'gemini.textModel': { label: '文本模型', providerLabel: MODEL_PROVIDER_CATALOG.gemini.label },
  'gemini.imageModel': { label: '标准图像模型', providerLabel: MODEL_PROVIDER_CATALOG.gemini.label },
  'gemini.proImageModel': { label: '高质量图像模型', providerLabel: MODEL_PROVIDER_CATALOG.gemini.label },
  'gemini.fastVideoModel': { label: '快速视频模型', providerLabel: MODEL_PROVIDER_CATALOG.gemini.label },
  'gemini.proVideoModel': { label: '高质量视频模型', providerLabel: MODEL_PROVIDER_CATALOG.gemini.label },
  'volcengine.textModel': { label: '文本模型', providerLabel: MODEL_PROVIDER_CATALOG.volcengine.label },
  'volcengine.imageModel': { label: '图像模型', providerLabel: MODEL_PROVIDER_CATALOG.volcengine.label },
  'volcengine.videoModel': { label: '视频模型', providerLabel: MODEL_PROVIDER_CATALOG.volcengine.label },
  'seedance.apiModel': { label: 'Seedance 2.0', providerLabel: '火山引擎 Ark' },
  'seedance.fastApiModel': { label: 'Seedance 2.0 Fast', providerLabel: '火山引擎 Ark' },
};

const ROLE_SOURCE_IDS: Record<ModelRole, ModelSourceId[]> = {
  text: ['gemini.textModel', 'volcengine.textModel'],
  image: ['gemini.imageModel', 'gemini.proImageModel', 'volcengine.imageModel'],
  video: ['gemini.fastVideoModel', 'gemini.proVideoModel', 'volcengine.videoModel'],
};

export const DEFAULT_MODEL_ROLE_META: Record<ModelRole, { title: string; description: string }> = {
  text: { title: '文本模型', description: '用于简报、提示词和结构化文案生成' },
  image: { title: '生图模型', description: '用于资产图、首帧和尾帧生成' },
  video: { title: '视频模型', description: '用于镜头视频和转场视频生成' },
};
let cachedApiSettings: ApiSettings = defaultApiSettings;

function trimTrailingZeros(value: string) {
  return value.replace(/(\.\d*?[1-9])0+$/u, '$1').replace(/\.0+$/u, '');
}

function formatMoney(amount: number, currency: BillingCurrency) {
  const symbol = currency === 'USD' ? '$' : '¥';
  if (Number.isInteger(amount)) {
    return `${symbol}${amount}`;
  }

  if (amount >= 1) {
    return `${symbol}${trimTrailingZeros(amount.toFixed(2))}`;
  }

  return `${symbol}${trimTrailingZeros(amount.toFixed(4))}`;
}

function getProviderCatalog(providerId: ModelProviderId) {
  return MODEL_PROVIDER_CATALOG[providerId];
}

function normalizeLegacyVolcengineModelId(modelId: string): string {
  const normalized = modelId.trim();
  if (!normalized) {
    return '';
  }

  return LEGACY_VOLCENGINE_MODEL_ID_MAP[normalized.toLowerCase()] || normalized;
}

function isModelRole(value: unknown): value is ModelRole {
  return value === 'text' || value === 'image' || value === 'video';
}

function normalizeCustomModels(value: unknown, providerId?: ModelProviderId): CustomProviderModelConfig[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: CustomProviderModelConfig[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const candidate = item as Record<string, unknown>;
    const role = isModelRole(candidate.role) ? candidate.role : null;
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
    const rawModelId = typeof candidate.modelId === 'string' ? candidate.modelId.trim() : '';
    const modelId = providerId === 'volcengine'
      ? normalizeLegacyVolcengineModelId(rawModelId)
      : rawModelId;

    if (!role || !name || !modelId) {
      continue;
    }

    const dedupeKey = `${role}:${modelId.toLowerCase()}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    normalized.push({ role, name, modelId });
  }

  return normalized;
}

function getCustomProviderModels(settings: ApiSettings, providerId: ModelProviderId): CustomProviderModelConfig[] {
  const providerSettings = settings[providerId] as { customModels?: CustomProviderModelConfig[] };
  return Array.isArray(providerSettings.customModels) ? providerSettings.customModels : [];
}

function getProviderModelCatalogFromSettings(
  settings: ApiSettings,
  providerId: ModelProviderId,
  role: ModelRole,
): ConfiguredModelCatalogItem[] {
  const seen = new Set<string>();
  const customModels = getCustomProviderModels(settings, providerId)
    .filter((item) => item.role === role)
    .map((item) => ({
      name: item.name,
      modelId: item.modelId,
    }));
  const builtInModels = getProviderCatalog(providerId).models[role];

  return [...customModels, ...builtInModels].filter((item) => {
    const normalizedModelId = item.modelId.trim().toLowerCase();
    if (!normalizedModelId || seen.has(normalizedModelId)) {
      return false;
    }

    seen.add(normalizedModelId);
    return true;
  });
}

export function getProviderModelCatalog(
  providerId: ModelProviderId,
  role: ModelRole,
  settings: ApiSettings = cachedApiSettings,
): ConfiguredModelCatalogItem[] {
  return getProviderModelCatalogFromSettings(settings, providerId, role);
}

function readModelSource(settings: ApiSettings, sourceId: ModelSourceId): string {
  if (!sourceId) {
    return '';
  }

  if (sourceId === 'seedance.apiModel') {
    return settings.seedance.apiModel.trim();
  }

  if (sourceId === 'seedance.fastApiModel') {
    return settings.seedance.fastApiModel.trim();
  }

  const [provider, field] = sourceId.split('.') as ['gemini' | 'volcengine', keyof ApiSettings['gemini']];
  const config = settings[provider] as unknown as Record<string, string>;
  return (config[field] || '').trim();
}

export function getProviderDisplayLabel(providerId: ModelProviderId) {
  return getProviderCatalog(providerId).label;
}

export function getModelRoleFromSourceId(sourceId: Exclude<ModelSourceId, ''>): ModelRole {
  return ROLE_BY_SOURCE_ID[sourceId];
}

export function findConfiguredModel(
  providerId: ModelProviderId,
  role: ModelRole,
  modelId: string,
  settings: ApiSettings = cachedApiSettings,
): ConfiguredModelCatalogItem | undefined {
  const normalized = modelId.trim();
  if (!normalized) {
    return undefined;
  }

  return getProviderModelCatalogFromSettings(settings, providerId, role).find((item) => {
    const aliases = item.aliases ? [...item.aliases] : [];
    return item.modelId === normalized || aliases.includes(normalized);
  });
}

function normalizePriceValue(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return value;
}

function resolveModelPricing(rule?: ModelPricingConfig): ModelBillingRule | undefined {
  if (!rule || (rule.type !== 'per_image' && rule.type !== 'per_million_tokens')) {
    return undefined;
  }

  const cnyPrice = normalizePriceValue(rule.unitPriceCny);
  if (cnyPrice !== undefined) {
    return {
      type: rule.type,
      currency: 'CNY',
      unitPrice: cnyPrice,
    };
  }

  const usdPriceFromNewField = normalizePriceValue(rule.unitPriceUsd);
  if (usdPriceFromNewField !== undefined) {
    return {
      type: rule.type,
      currency: 'CNY',
      unitPrice: usdPriceFromNewField * USD_TO_CNY_RATE,
    };
  }

  const legacyPrice = normalizePriceValue(rule.unitPrice);
  if (legacyPrice === undefined) {
    return undefined;
  }

  if (rule.currency === 'USD') {
    return {
      type: rule.type,
      currency: 'CNY',
      unitPrice: legacyPrice * USD_TO_CNY_RATE,
    };
  }

  if (rule.currency === 'CNY') {
    return {
      type: rule.type,
      currency: 'CNY',
      unitPrice: legacyPrice,
    };
  }

  return undefined;
}

export function getModelBillingRule(providerId: ModelProviderId, role: ModelRole, modelId: string): ModelBillingRule | undefined {
  return resolveModelPricing(findConfiguredModel(providerId, role, modelId)?.pricing);
}

export function formatConfiguredModelDisplay(providerId: ModelProviderId, role: ModelRole, modelId: string): string {
  const normalized = modelId.trim();
  if (!normalized) {
    return '';
  }

  const matched = findConfiguredModel(providerId, role, normalized);
  if (!matched) {
    return normalized;
  }

  return `${matched.name} (${matched.modelId})`;
}

export function formatModelPricing(rule?: ModelBillingRule, compact = false): string {
  if (!rule) {
    return '';
  }

  const suffix = rule.type === 'per_image' ? '张' : '百万tokens';
  const separator = compact ? '/' : ' / ';
  return `${formatMoney(rule.unitPrice, rule.currency)}${separator}${suffix}`;
}

export function getModelPricingLabel(providerId: ModelProviderId, role: ModelRole, modelId: string, compact = false): string {
  return formatModelPricing(getModelBillingRule(providerId, role, modelId), compact);
}

export function getPricedModelEntries(): Array<{ providerId: ModelProviderId; role: ModelRole; name: string; modelId: string; priceLabel: string }> {
  const items: Array<{ providerId: ModelProviderId; role: ModelRole; name: string; modelId: string; priceLabel: string }> = [];

  (Object.keys(MODEL_PROVIDER_CATALOG) as ModelProviderId[]).forEach((providerId) => {
    (Object.keys(getProviderCatalog(providerId).models) as ModelRole[]).forEach((role) => {
      getProviderCatalog(providerId).models[role].forEach((item) => {
        const priceLabel = formatModelPricing(resolveModelPricing(item.pricing));
        if (!priceLabel) {
          return;
        }

        items.push({
          providerId,
          role,
          name: item.name,
          modelId: item.modelId,
          priceLabel,
        });
      });
    });
  });

  return items;
}

function normalizeVolcengineModelValue(role: ModelRole, endpointId: string, settings: ApiSettings): string {
  const normalizedEndpointId = normalizeLegacyVolcengineModelId(endpointId);
  const matched = findConfiguredModel('volcengine', role, normalizedEndpointId, settings);
  return matched?.modelId || normalizedEndpointId;
}

export function resolveVolcengineBaseUrl(baseUrl?: string): string {
  const normalized = typeof baseUrl === 'string' ? baseUrl.trim() : '';
  return normalized || DEFAULT_VOLCENGINE_BASE_URL;
}

export function resolveGeminiBaseUrl(baseUrl?: string): string {
  const normalized = typeof baseUrl === 'string' ? baseUrl.trim().replace(/\/+$/u, '') : '';
  const withoutApiVersion = normalized.replace(/\/v1(?:alpha|beta)?$/iu, '');
  return withoutApiVersion || DEFAULT_GEMINI_BASE_URL;
}

function normalizeApiSettings(settings: ApiSettings): ApiSettings {
  const geminiLanguageCatalog = getProviderPromptLanguageCatalog('gemini');
  const volcengineLanguageCatalog = getProviderPromptLanguageCatalog('volcengine');
  const normalizedGeminiPromptLanguage = geminiLanguageCatalog.supported.includes(settings.gemini.promptLanguage)
    ? settings.gemini.promptLanguage
    : geminiLanguageCatalog.default;
  const normalizedVolcenginePromptLanguage = volcengineLanguageCatalog.supported.includes(settings.volcengine.promptLanguage)
    ? settings.volcengine.promptLanguage
    : volcengineLanguageCatalog.default;

  return {
    ...settings,
    gemini: {
      ...settings.gemini,
      baseUrl: resolveGeminiBaseUrl(settings.gemini.baseUrl),
      customModels: normalizeCustomModels(settings.gemini.customModels, 'gemini'),
      promptLanguage: normalizedGeminiPromptLanguage,
    },
    volcengine: {
      ...settings.volcengine,
      enabled: true,
      baseUrl: resolveVolcengineBaseUrl(settings.volcengine.baseUrl),
      customModels: normalizeCustomModels(settings.volcengine.customModels, 'volcengine'),
      promptLanguage: normalizedVolcenginePromptLanguage,
      textModel: normalizeVolcengineModelValue('text', settings.volcengine.textModel, settings),
      imageModel: normalizeVolcengineModelValue('image', settings.volcengine.imageModel, settings),
      videoModel: normalizeVolcengineModelValue('video', settings.volcengine.videoModel, settings),
    },
    seedance: {
      enabled: settings.seedance?.enabled !== false,
      apiModel: typeof settings.seedance?.apiModel === 'string' ? settings.seedance.apiModel : defaultApiSettings.seedance.apiModel,
      fastApiModel: typeof settings.seedance?.fastApiModel === 'string' ? settings.seedance.fastApiModel : defaultApiSettings.seedance.fastApiModel,
      defaultExecutor: settings.seedance?.defaultExecutor === 'cli' ? 'cli' : 'ark',
      cliModelVersion: normalizeSeedanceModelVersion(
        settings.seedance?.cliModelVersion
          ?? (settings.seedance as unknown as Record<string, unknown> | undefined)?.modelVersion,
        defaultApiSettings.seedance.cliModelVersion,
      ),
      pollIntervalSec: Number.isFinite(settings.seedance?.pollIntervalSec)
        ? Math.max(5, Math.min(60, Number(settings.seedance.pollIntervalSec)))
        : defaultApiSettings.seedance.pollIntervalSec,
      bridgeUrl: typeof settings.seedance?.bridgeUrl === 'string' ? settings.seedance.bridgeUrl : defaultApiSettings.seedance.bridgeUrl,
    },
    mockApi: {
      enabled: Boolean(settings.mockApi?.enabled),
      baseUrl: typeof settings.mockApi?.baseUrl === 'string' ? settings.mockApi.baseUrl : '',
      scenario: settings.mockApi?.scenario === 'slow_success'
        || settings.mockApi?.scenario === 'concurrency_once'
        || settings.mockApi?.scenario === 'concurrency_always'
        || settings.mockApi?.scenario === 'submit_fail'
        ? settings.mockApi.scenario
        : 'success',
      previousSettings: settings.mockApi?.previousSettings && typeof settings.mockApi.previousSettings === 'object'
        ? {
          volcengineApiKey: typeof settings.mockApi.previousSettings.volcengineApiKey === 'string' ? settings.mockApi.previousSettings.volcengineApiKey : '',
          volcengineBaseUrl: typeof settings.mockApi.previousSettings.volcengineBaseUrl === 'string' ? settings.mockApi.previousSettings.volcengineBaseUrl : defaultApiSettings.volcengine.baseUrl,
          seedanceBridgeUrl: typeof settings.mockApi.previousSettings.seedanceBridgeUrl === 'string' ? settings.mockApi.previousSettings.seedanceBridgeUrl : defaultApiSettings.seedance.bridgeUrl,
          defaultModels: {
            ...defaultApiSettings.defaultModels,
            ...(settings.mockApi.previousSettings.defaultModels || {}),
          },
        }
        : null,
    },
    tos: {
      enabled: Boolean(settings.tos?.enabled),
      region: typeof settings.tos?.region === 'string' ? settings.tos.region : defaultApiSettings.tos!.region,
      endpoint: typeof settings.tos?.endpoint === 'string' ? settings.tos.endpoint : defaultApiSettings.tos!.endpoint,
      bucket: typeof settings.tos?.bucket === 'string' ? settings.tos.bucket : '',
      accessKeyId: typeof settings.tos?.accessKeyId === 'string' ? settings.tos.accessKeyId : '',
      accessKeySecret: typeof settings.tos?.accessKeySecret === 'string' ? settings.tos.accessKeySecret : '',
      pathPrefix: typeof settings.tos?.pathPrefix === 'string' ? settings.tos.pathPrefix : defaultApiSettings.tos!.pathPrefix,
    },
  };
}

function mergeApiSettings(parsed?: Partial<ApiSettings>): ApiSettings {
  return normalizeApiSettings({
    gemini: {
      ...defaultApiSettings.gemini,
      ...(parsed?.gemini || {}),
    },
    volcengine: {
      ...defaultApiSettings.volcengine,
      ...(parsed?.volcengine || {}),
    },
    seedance: {
      ...defaultApiSettings.seedance,
      ...(parsed?.seedance || {}),
    },
    mockApi: {
      ...defaultApiSettings.mockApi,
      ...(parsed?.mockApi || {}),
    },
    tos: {
      ...defaultApiSettings.tos,
      ...(parsed?.tos || {}),
    },
    defaultModels: {
      ...defaultApiSettings.defaultModels,
      ...(parsed?.defaultModels || {}),
    },
  });
}

export function setCachedApiSettings(settings: ApiSettings): ApiSettings {
  cachedApiSettings = mergeApiSettings(settings);
  return cachedApiSettings;
}

export function loadApiSettings(): ApiSettings {
  return cachedApiSettings;
}

export async function loadPersistedApiSettings(): Promise<ApiSettings> {
  try {
    const persisted = await loadPersistedAppState<Partial<ApiSettings>>(API_SETTINGS_STATE_KEY);
    cachedApiSettings = mergeApiSettings(persisted.value || undefined);
  } catch (error) {
    console.error('Failed to load API settings from bridge store', error);
    cachedApiSettings = defaultApiSettings;
  }

  return cachedApiSettings;
}

export function getModelSourceDisplayValue(settings: ApiSettings, sourceId: ModelSourceId): string {
  const value = readModelSource(settings, sourceId);
  if (!value || !sourceId) {
    return '';
  }

  if (sourceId === 'seedance.apiModel' || sourceId === 'seedance.fastApiModel') {
    return `${getSeedanceApiModelLabelForSourceId(sourceId)} (${value})`;
  }

  const providerId = sourceId.startsWith('volcengine.') ? 'volcengine' : 'gemini';
  return formatConfiguredModelDisplay(providerId, ROLE_BY_SOURCE_ID[sourceId], value);
}

export function getModelSourceOptions(settings: ApiSettings, role: ModelRole): ModelSourceOption[] {
  return getModelSourceOptionsForSelection(settings, role, false);
}

export function getModelSourceOptionsForSelection(settings: ApiSettings, role: ModelRole, includeDisabledProviders: boolean): ModelSourceOption[] {
  return ROLE_SOURCE_IDS[role]
    .map((sourceId) => {
      if (sourceId.startsWith('volcengine.') && !includeDisabledProviders && !settings.volcengine.enabled) {
        return null;
      }

      const value = readModelSource(settings, sourceId);
      if (!value) {
        return null;
      }

      return {
        id: sourceId,
        label: getModelSourceDisplayValue(settings, sourceId),
        providerLabel: MODEL_SOURCE_META[sourceId].providerLabel,
        value,
      };
    })
    .filter((option): option is ModelSourceOption => Boolean(option));
}

export function resolveModelSource(settings: ApiSettings, sourceId: ModelSourceId): string {
  return readModelSource(settings, sourceId);
}

export function getDefaultModelSource(settings: ApiSettings, role: ModelRole): ModelSourceId {
  const configured = settings.defaultModels[role];
  if (configured && readModelSource(settings, configured)) {
    return configured;
  }

  const firstAvailable = getModelSourceOptions(settings, role)[0];
  return firstAvailable?.id || '';
}

export function getFlowOverrideOptions(settings: ApiSettings, category: FlowModelCategory): Array<{ id: 'default' | ModelSourceId; label: string; providerLabel?: string }> {
  const roles: Record<FlowModelCategory, ModelRole[]> = {
    text: ['text'],
    image: ['image'],
    video: ['video'],
  };

  const seen = new Set<string>();
  const items: Array<{ id: 'default' | ModelSourceId; label: string; providerLabel?: string }> = [
    { id: 'default', label: '使用默认配置' },
  ];

  for (const role of roles[category]) {
    for (const option of getModelSourceOptions(settings, role)) {
      if (seen.has(option.id)) {
        continue;
      }
      seen.add(option.id);
      items.push({
        id: option.id,
        label: option.label,
        providerLabel: option.providerLabel,
      });
    }
  }

  return items;
}

export async function saveApiSettings(settings: ApiSettings) {
  try {
    const normalized = setCachedApiSettings(settings);
    await savePersistedAppState(API_SETTINGS_STATE_KEY, normalized);
  } catch (error) {
    console.error('Failed to save API settings', error);
  }
}
