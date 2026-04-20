import type { ApiSettings, AspectRatio, ModelSourceId, PromptLanguage, Shot } from '../../../types.ts';
import {
  formatConfiguredModelDisplay,
  formatModelPricing,
  getDefaultModelSource,
  getModelBillingRule,
  getModelPricingLabel,
  getModelRoleFromSourceId,
  getProviderDisplayLabel,
  getProviderModelCatalog,
  resolveModelSource,
  type ModelProviderId,
  type ModelRole,
} from '../../../services/apiConfig.ts';
import {
  SEEDANCE_API_MODEL_SOURCE_IDS,
  getSeedanceApiModelLabelForSourceId,
  isSeedanceApiModelSourceId,
} from '../../seedance/modelVersions.ts';
import { GEMINI_ROLE_SOURCE_OPTIONS, VOLCENGINE_ROLE_SOURCE_IDS } from '../../apiConfig/utils/apiConfigUi.ts';

export type ModelCategory = 'text' | 'image' | 'video';

export type CostEstimate = {
  summary: string;
  detail: string;
};

export type OperationCostUnits = {
  seconds?: number;
  resolution?: '480p' | '720p' | '1080p';
  frameRate?: number;
  aspectRatio?: AspectRatio;
};

export type ResolvedModelSelection = {
  sourceId: ModelSourceId;
  modelName: string;
  displayLabel: string;
  selectionValue: string;
};

export type ModelSelectionOption = {
  value: string;
  sourceId: ModelSourceId;
  modelName: string;
  label: string;
};

type FlowModelOverrideMap = Record<ModelCategory, string>;
type OperationModelOverrideMap = Record<string, string>;

export function getSourceProviderKey(sourceId: ModelSourceId): ModelProviderId {
  if (sourceId.startsWith('volcengine.') || sourceId.startsWith('seedance.')) {
    return 'volcengine';
  }
  return 'gemini';
}

export function formatSelectionModelDisplay(sourceId: ModelSourceId, role: ModelRole, modelName: string) {
  if (isSeedanceApiModelSourceId(sourceId)) {
    const sourceLabel = getSeedanceApiModelLabelForSourceId(sourceId);
    return modelName.trim() ? `${sourceLabel} (${modelName.trim()})` : sourceLabel;
  }

  return formatConfiguredModelDisplay(getSourceProviderKey(sourceId), role, modelName);
}

export function getSelectionDisplayLabel(sourceId: ModelSourceId, modelName: string) {
  const normalizedModelName = modelName.trim();
  if (!sourceId || !normalizedModelName) {
    return '未配置';
  }

  const role = getModelRoleFromSourceId(sourceId as Exclude<ModelSourceId, ''>);

  if (isSeedanceApiModelSourceId(sourceId)) {
    return [
      formatSelectionModelDisplay(sourceId, role, normalizedModelName),
      '火山引擎 Ark',
    ].filter(Boolean).join(' · ');
  }

  const providerId = getSourceProviderKey(sourceId);
  const priceLabel = getModelPricingLabel(providerId, role, normalizedModelName, true);

  return [
    formatSelectionModelDisplay(sourceId, role, normalizedModelName),
    getProviderDisplayLabel(providerId),
    priceLabel,
  ].filter(Boolean).join(' · ');
}

export function getSourceDisplayLabel(apiSettings: ApiSettings, sourceId: ModelSourceId) {
  const modelName = resolveModelSource(apiSettings, sourceId);
  if (!modelName) {
    return '未配置';
  }
  return getSelectionDisplayLabel(sourceId, modelName);
}

export function getPromptLanguageBySourceId(apiSettings: ApiSettings, sourceId: ModelSourceId): PromptLanguage {
  const providerId = getSourceProviderKey(sourceId);
  return providerId === 'volcengine'
    ? apiSettings.volcengine.promptLanguage
    : apiSettings.gemini.promptLanguage;
}

export function encodeSelectionValue(sourceId: ModelSourceId, modelName?: string) {
  if ((sourceId.startsWith('gemini.') || sourceId.startsWith('volcengine.')) && modelName) {
    return `${sourceId}::${modelName}`;
  }
  return sourceId;
}

export function getGeminiRoleModelOptions(apiSettings: ApiSettings, role: ModelRole) {
  const primarySourceId = GEMINI_ROLE_SOURCE_OPTIONS[role][0];
  const seen = new Set<string>();
  const options: Array<{ value: string; sourceId: ModelSourceId; modelName: string; label: string }> = [];

  const appendOption = (sourceId: ModelSourceId, modelName: string) => {
    const normalizedModelName = modelName.trim();
    const dedupeKey = normalizedModelName.toLowerCase();
    if (!normalizedModelName || seen.has(dedupeKey)) {
      return;
    }

    seen.add(dedupeKey);
    options.push({
      value: encodeSelectionValue(sourceId, normalizedModelName),
      sourceId,
      modelName: normalizedModelName,
      label: getSelectionDisplayLabel(sourceId, normalizedModelName),
    });
  };

  getProviderModelCatalog('gemini', role, apiSettings)
    .forEach((model) => appendOption(primarySourceId, model.modelId));

  GEMINI_ROLE_SOURCE_OPTIONS[role]
    .forEach((sourceId) => appendOption(sourceId, resolveModelSource(apiSettings, sourceId)));

  return options;
}

export function getVolcengineRoleModelOptions(apiSettings: ApiSettings, role: ModelRole) {
  const sourceId = VOLCENGINE_ROLE_SOURCE_IDS[role];
  const configuredValue = resolveModelSource(apiSettings, sourceId);
  const catalogOptions = getProviderModelCatalog('volcengine', role, apiSettings).map((model) => ({
    value: model.modelId,
    label: [
      `${model.name} (${model.modelId})`,
      getModelPricingLabel('volcengine', role, model.modelId, true),
    ].filter(Boolean).join(' · '),
  }));

  if (configuredValue && !catalogOptions.some((option) => option.value === configuredValue)) {
    return [{
      value: configuredValue,
      label: [
        formatConfiguredModelDisplay('volcengine', role, configuredValue),
        getModelPricingLabel('volcengine', role, configuredValue, true),
      ].filter(Boolean).join(' · '),
    }, ...catalogOptions];
  }

  return catalogOptions;
}

export function getProviderRoleCatalogOptions(
  apiSettings: ApiSettings,
  providerId: ModelProviderId,
  role: ModelRole,
  configuredValue: string,
) {
  const catalogOptions = getProviderModelCatalog(providerId, role, apiSettings).map((model) => ({
    value: model.modelId,
    label: [
      `${model.name} (${model.modelId})`,
      getModelPricingLabel(providerId, role, model.modelId, true),
    ].filter(Boolean).join(' · '),
  }));

  if (configuredValue && !catalogOptions.some((option) => option.value === configuredValue)) {
    return [{
      value: configuredValue,
      label: [
        formatConfiguredModelDisplay(providerId, role, configuredValue),
        getModelPricingLabel(providerId, role, configuredValue, true),
      ].filter(Boolean).join(' · '),
    }, ...catalogOptions];
  }

  return catalogOptions;
}

export function getRoleModelSelectionOptions(apiSettings: ApiSettings, role: ModelRole): ModelSelectionOption[] {
  const geminiOptions = getGeminiRoleModelOptions(apiSettings, role).map((option) => ({
    value: option.value,
    sourceId: option.sourceId,
    modelName: option.modelName,
    label: option.label,
  }));

  const volcengineOptions = getVolcengineRoleModelOptions(apiSettings, role).map((option) => ({
    value: encodeSelectionValue(VOLCENGINE_ROLE_SOURCE_IDS[role], option.value),
    sourceId: VOLCENGINE_ROLE_SOURCE_IDS[role],
    modelName: option.value,
    label: `${option.label} · 火山引擎 Ark`,
  }));

  const seedanceOptions = role === 'video' && apiSettings.seedance.enabled
    ? SEEDANCE_API_MODEL_SOURCE_IDS
      .map((sourceId) => ({
        value: sourceId,
        sourceId: sourceId as ModelSourceId,
        modelName: resolveModelSource(apiSettings, sourceId as ModelSourceId),
        label: getSourceDisplayLabel(apiSettings, sourceId as ModelSourceId),
      }))
      .filter((option) => option.label !== '未配置' && option.modelName.trim().length > 0)
    : [];

  return [...geminiOptions, ...volcengineOptions, ...seedanceOptions];
}

export function resolveSelectionValue(apiSettings: ApiSettings, role: ModelRole, selection: string): ResolvedModelSelection | null {
  if (!selection) {
    return null;
  }

  const explicitOption = getRoleModelSelectionOptions(apiSettings, role).find((option) => option.value === selection);
  if (explicitOption) {
    return {
      sourceId: explicitOption.sourceId,
      modelName: explicitOption.modelName,
      displayLabel: explicitOption.label,
      selectionValue: explicitOption.value,
    };
  }

  if ((selection as ModelSourceId).includes('.') && !selection.includes('::')) {
    const sourceId = selection as ModelSourceId;
    const modelName = resolveModelSource(apiSettings, sourceId);
    if (!modelName) {
      return null;
    }
    const catalogOption = getRoleModelSelectionOptions(apiSettings, role).find((option) => (
      option.modelName === modelName && getSourceProviderKey(option.sourceId) === getSourceProviderKey(sourceId)
    ));
    if (catalogOption) {
      return {
        sourceId: catalogOption.sourceId,
        modelName: catalogOption.modelName,
        displayLabel: catalogOption.label,
        selectionValue: catalogOption.value,
      };
    }
    return {
      sourceId,
      modelName,
      displayLabel: getSelectionDisplayLabel(sourceId, modelName),
      selectionValue: encodeSelectionValue(sourceId, modelName),
    };
  }

  if (selection.includes('::')) {
    const [sourceId, modelName] = selection.split('::') as [ModelSourceId, string];
    const catalogOption = getRoleModelSelectionOptions(apiSettings, role).find((option) => (
      option.modelName === modelName && getSourceProviderKey(option.sourceId) === getSourceProviderKey(sourceId)
    ));
    if (catalogOption) {
      return {
        sourceId: catalogOption.sourceId,
        modelName: catalogOption.modelName,
        displayLabel: catalogOption.label,
        selectionValue: catalogOption.value,
      };
    }
    return {
      sourceId,
      modelName,
      displayLabel: getSelectionDisplayLabel(sourceId, modelName),
      selectionValue: encodeSelectionValue(sourceId, modelName),
    };
  }

  return null;
}

export function getApiDefaultSelection(apiSettings: ApiSettings, role: ModelRole): ResolvedModelSelection {
  const sourceId = getDefaultModelSource(apiSettings, role);
  const modelName = resolveModelSource(apiSettings, sourceId);
  return {
    sourceId,
    modelName,
    displayLabel: getSelectionDisplayLabel(sourceId, modelName),
    selectionValue: encodeSelectionValue(sourceId, modelName),
  };
}

export function getFlowSelection(apiSettings: ApiSettings, flowModelOverrides: FlowModelOverrideMap, category: ModelCategory): ResolvedModelSelection {
  const overrideValue = flowModelOverrides[category];
  if (overrideValue !== 'default') {
    const resolved = resolveSelectionValue(apiSettings, category, overrideValue);
    if (resolved) {
      return resolved;
    }
  }
  return getApiDefaultSelection(apiSettings, category);
}

export function getOperationSelection(
  apiSettings: ApiSettings,
  flowModelOverrides: FlowModelOverrideMap,
  operationModelOverrides: OperationModelOverrideMap,
  operationKey: string,
  category: ModelCategory,
): ResolvedModelSelection {
  const selected = operationModelOverrides[operationKey] || 'flow';
  if (selected !== 'flow') {
    const resolved = resolveSelectionValue(apiSettings, category, selected);
    if (resolved) {
      return resolved;
    }
  }
  return getFlowSelection(apiSettings, flowModelOverrides, category);
}

export function getOperationOptions(apiSettings: ApiSettings, category: ModelCategory) {
  return [
    { value: 'flow', label: '跟随当前流程' },
    ...getRoleModelSelectionOptions(apiSettings, category).map((option) => ({
      value: option.value,
      label: option.label,
    })),
  ];
}

export function getCompactOperationOptions(apiSettings: ApiSettings, category: ModelCategory) {
  return [
    { value: 'flow', label: '跟随当前流程' },
    ...getRoleModelSelectionOptions(apiSettings, category).map((option) => ({
      value: option.value,
      label: formatSelectionModelDisplay(option.sourceId, category, option.modelName),
    })),
  ];
}

function formatAmount(amount: number, currency: 'CNY' | 'USD') {
  const symbol = currency === 'USD' ? '$' : '¥';
  if (Number.isInteger(amount)) {
    return `${symbol}${amount}`;
  }
  if (amount >= 1) {
    return `${symbol}${amount.toFixed(2).replace(/\.00$/u, '').replace(/(\.\d*?[1-9])0+$/u, '$1')}`;
  }
  return `${symbol}${amount.toFixed(4).replace(/\.?0+$/u, '')}`;
}

function formatTokenCount(tokenCount: number) {
  if (tokenCount >= 1_000_000) {
    return `${(tokenCount / 1_000_000).toFixed(2).replace(/\.00$/u, '')}M`;
  }
  if (tokenCount >= 1_000) {
    return `${(tokenCount / 1_000).toFixed(1).replace(/\.0$/u, '')}K`;
  }
  return `${Math.round(tokenCount)}`;
}

function getVideoDimensions(units?: OperationCostUnits) {
  const resolution = units?.resolution || '720p';
  const aspectRatio = units?.aspectRatio || '16:9';

  if (resolution === '1080p') {
    if (aspectRatio === '21:9') {
      return { width: 2520, height: 1080 };
    }
    if (aspectRatio === '9:16') {
      return { width: 1080, height: 1920 };
    }
    if (aspectRatio === '1:1') {
      return { width: 1080, height: 1080 };
    }
    if (aspectRatio === '4:3') {
      return { width: 1440, height: 1080 };
    }
    if (aspectRatio === '3:4') {
      return { width: 1080, height: 1440 };
    }
    return { width: 1920, height: 1080 };
  }

  if (resolution === '480p') {
    if (aspectRatio === '21:9') {
      return { width: 1120, height: 480 };
    }
    if (aspectRatio === '9:16') {
      return { width: 480, height: 854 };
    }
    if (aspectRatio === '1:1') {
      return { width: 480, height: 480 };
    }
    if (aspectRatio === '4:3') {
      return { width: 640, height: 480 };
    }
    if (aspectRatio === '3:4') {
      return { width: 480, height: 640 };
    }
    return { width: 854, height: 480 };
  }

  if (aspectRatio === '21:9') {
    return { width: 1680, height: 720 };
  }
  if (aspectRatio === '9:16') {
    return { width: 720, height: 1280 };
  }
  if (aspectRatio === '1:1') {
    return { width: 720, height: 720 };
  }
  if (aspectRatio === '4:3') {
    return { width: 960, height: 720 };
  }
  if (aspectRatio === '3:4') {
    return { width: 720, height: 960 };
  }
  return { width: 1280, height: 720 };
}

function getTokenUnitCostEstimate(modelName: string, billing: NonNullable<ReturnType<typeof getModelBillingRule>>): CostEstimate {
  const unitLabel = formatModelPricing(billing);
  if (!unitLabel) {
    return { summary: '', detail: '' };
  }

  return {
    summary: unitLabel,
    detail: `${modelName} 按输入与输出 token 计费，当前只展示单价，未对本次文本 token 数做额外估算。`,
  };
}

function getImageCostEstimate(modelName: string, billing: NonNullable<ReturnType<typeof getModelBillingRule>>): CostEstimate {
  const unitLabel = formatModelPricing(billing);
  if (!unitLabel) {
    return { summary: '', detail: '' };
  }

  return {
    summary: unitLabel,
    detail: `${modelName} 按固定单价计费：${unitLabel}`,
  };
}

function getVideoCostEstimate(modelName: string, billing: NonNullable<ReturnType<typeof getModelBillingRule>>, units?: OperationCostUnits): CostEstimate {
  const frameRate = Math.max(units?.frameRate || 24, 1);
  const { width, height } = getVideoDimensions(units);
  const tokensPerSecond = (width * height * frameRate) / 1024;
  const unitPrice = billing.unitPrice;
  const currency = billing.currency;

  if (units?.seconds) {
    const seconds = Math.max(units.seconds, 1);
    const totalTokens = tokensPerSecond * seconds;
    const totalCost = (totalTokens / 1_000_000) * unitPrice;

    return {
      summary: `${formatAmount(totalCost, currency)} / 次`,
      detail: `tokens = (${width} x ${height} x ${frameRate} x ${seconds}) / 1024 = ${formatTokenCount(totalTokens)}；总价 = ${formatTokenCount(totalTokens)} / 1,000,000 x ${formatAmount(unitPrice, currency)} = ${formatAmount(totalCost, currency)}`,
    };
  }

  const costPerSecond = (tokensPerSecond / 1_000_000) * unitPrice;
  return {
    summary: `${formatAmount(costPerSecond, currency)} / 秒`,
    detail: `tokens/秒 = (${width} x ${height} x ${frameRate}) / 1024 = ${formatTokenCount(tokensPerSecond)}；总价 = 时长(秒) x ${formatTokenCount(tokensPerSecond)} / 1,000,000 x ${formatAmount(unitPrice, currency)}`,
  };
}

export function getEstimatedCost(
  apiSettings: ApiSettings,
  sourceId: ModelSourceId,
  category: ModelCategory,
  units?: OperationCostUnits,
  explicitModelName?: string,
): CostEstimate {
  const modelName = (explicitModelName || resolveModelSource(apiSettings, sourceId)).trim();
  if (!sourceId || !modelName) {
    return { summary: '', detail: '' };
  }

  const providerId = getSourceProviderKey(sourceId);
  const role = getModelRoleFromSourceId(sourceId as Exclude<ModelSourceId, ''>);
  const billing = getModelBillingRule(providerId, role, modelName);

  if (!billing) {
    return { summary: '', detail: '' };
  }

  if (category === 'video' && billing.type === 'per_million_tokens') {
    return getVideoCostEstimate(modelName, billing, units);
  }

  if (billing.type === 'per_image') {
    return getImageCostEstimate(modelName, billing);
  }

  if (billing.type === 'per_million_tokens') {
    return getTokenUnitCostEstimate(modelName, billing);
  }

  return { summary: '', detail: '' };
}

export function getVideoCostUnits(shot: Shot | undefined, defaultAspectRatio: AspectRatio): OperationCostUnits {
  const config = shot?.videoConfig || {
    resolution: '720p' as const,
    frameRate: 24,
    aspectRatio: defaultAspectRatio,
    useFirstFrame: true,
    useLastFrame: true,
    useReferenceAssets: false,
  };

  return {
    seconds: shot?.duration,
    resolution: config.resolution,
    frameRate: config.frameRate || 24,
    aspectRatio: config.useReferenceAssets ? '16:9' : config.aspectRatio,
  };
}

export function getTransitionVideoConfig(shot: Shot | undefined, defaultAspectRatio: AspectRatio) {
  const aspectRatio = shot?.transitionVideoConfig?.aspectRatio || shot?.transitionVideoAspectRatio || defaultAspectRatio;
  const duration = Math.max(4, Math.round(shot?.transitionVideoDuration || 4));
  return { aspectRatio, duration };
}
