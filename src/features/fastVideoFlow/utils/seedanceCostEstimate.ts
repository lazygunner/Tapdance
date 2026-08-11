import seedanceCostDimensions from '../../../config/seedanceCostDimensions.json' with { type: 'json' };
import type { FastReferenceVideo, FastVideoInput } from '../types/fastTypes.ts';
import type { SeedanceApiModelKey, SeedanceDraft, SeedanceModelVersion } from '../../seedance/types.ts';
import { getSeedanceApiModelKeyForCliModel } from '../../seedance/modelVersions.ts';

type SeedanceEstimateResolution = SeedanceDraft['options']['resolution'];
type SeedanceEstimateRatio = Exclude<SeedanceDraft['options']['ratio'], 'adaptive'>;

type SeedanceEstimateDimensionConfigEntry = {
  width: number;
  height: number;
  source: string;
  note?: string;
};

type SeedanceEstimateDimensionConfig = {
  dimensions: Record<SeedanceEstimateResolution, Record<string, SeedanceEstimateDimensionConfigEntry>>;
};

type SeedanceCostExecutionConfig = {
  executor: 'ark' | 'cli' | 'aliyun' | 'minimax';
  apiModelKey: SeedanceApiModelKey;
  cliModelVersion: SeedanceModelVersion;
};

export type SeedanceCostEstimate = {
  modelLabel: string;
  billingLabel: string;
  unitPrice: number;
  pricingUnit: 'tokens' | 'second';
  effectiveRatio: SeedanceDraft['options']['resolution'] | FastVideoInput['aspectRatio'];
  width: number;
  height: number;
  frameRate: number;
  durationSec: number;
  totalTokens: number;
  estimatedCost: number;
  selectedReferenceVideoCount: number;
  includesVideoInput: boolean;
  inputDurationSec: number;
  outputDurationSec: number;
  billableDurationSec: number;
  missingInputDurationCount: number;
  dimensionPresetLabel: string;
};

const SEEDANCE_COST_DIMENSIONS = seedanceCostDimensions as SeedanceEstimateDimensionConfig;

const SEEDANCE_PRICING = {
  seedance25: {
    modelLabel: 'Doubao-Seedance-2.5',
    withVideoInputUnitPrice: 42,
    withoutVideoInputUnitPrice: 70,
  },
  standard: {
    modelLabel: 'Doubao-Seedance-2.0',
    withVideoInputUnitPrice: 28,
    withoutVideoInputUnitPrice: 46,
  },
  fast: {
    modelLabel: 'Doubao-Seedance-2.0-fast',
    withVideoInputUnitPrice: 22,
    withoutVideoInputUnitPrice: 37,
  },
  aliyun: {
    modelLabel: 'HappyHorse 1.0',
    withVideoInputUnitPrice: 0,
    withoutVideoInputUnitPrice: 0,
  },
  minimax: {
    modelLabel: 'MiniMax H3',
    withVideoInputUnitPrice: 0,
    withoutVideoInputUnitPrice: 0,
  },
} as const;

export function resolveEstimateRatio(
  ratio: SeedanceDraft['options']['ratio'],
  fallbackRatio: FastVideoInput['aspectRatio'],
) {
  return ratio === 'adaptive' ? fallbackRatio : ratio;
}

export function hasSelectedReferenceVideoInput(referenceVideos: FastReferenceVideo[]) {
  return referenceVideos.some((reference) => (
    reference.videoUrl.trim() && reference.selectedForVideo !== false
  ));
}

export function getSeedancePricingKey(executionConfig: SeedanceCostExecutionConfig) {
  if (executionConfig.executor === 'aliyun') {
    return 'aliyun';
  }
  if (executionConfig.executor === 'minimax') {
    return 'minimax';
  }
  if (executionConfig.executor === 'ark') {
    return executionConfig.apiModelKey;
  }
  return getSeedanceApiModelKeyForCliModel(executionConfig.cliModelVersion);
}

function getFallbackDimensions(
  resolution: SeedanceEstimateResolution,
  ratio: SeedanceEstimateRatio,
): SeedanceEstimateDimensionConfigEntry {
  if (resolution === '480p') {
    if (ratio === '9:16') {
      return { width: 480, height: 854, source: 'fallback' };
    }
    if (ratio === '1:1') {
      return { width: 480, height: 480, source: 'fallback' };
    }
    if (ratio === '4:3') {
      return { width: 640, height: 480, source: 'fallback' };
    }
    if (ratio === '3:4') {
      return { width: 480, height: 640, source: 'fallback' };
    }
    if (ratio === '21:9') {
      return { width: 1120, height: 480, source: 'fallback' };
    }
    return { width: 854, height: 480, source: 'fallback' };
  }

  if (resolution === '1080p') {
    if (ratio === '9:16') {
      return { width: 1080, height: 1920, source: 'fallback' };
    }
    if (ratio === '1:1') {
      return { width: 1080, height: 1080, source: 'fallback' };
    }
    if (ratio === '4:3') {
      return { width: 1440, height: 1080, source: 'fallback' };
    }
    if (ratio === '3:4') {
      return { width: 1080, height: 1440, source: 'fallback' };
    }
    if (ratio === '21:9') {
      return { width: 2520, height: 1080, source: 'fallback' };
    }
    return { width: 1920, height: 1080, source: 'fallback' };
  }

  if (ratio === '9:16') {
    return { width: 720, height: 1280, source: 'fallback' };
  }
  if (ratio === '1:1') {
    return { width: 720, height: 720, source: 'fallback' };
  }
  if (ratio === '4:3') {
    return { width: 960, height: 720, source: 'fallback' };
  }
  if (ratio === '3:4') {
    return { width: 720, height: 960, source: 'fallback' };
  }
  if (ratio === '21:9') {
    return { width: 1680, height: 720, source: 'fallback' };
  }
  return { width: 1280, height: 720, source: 'fallback' };
}

export function resolveSeedanceEstimateDimensions(
  resolution: SeedanceEstimateResolution,
  ratio: SeedanceEstimateRatio,
) {
  const configuredDimensions = SEEDANCE_COST_DIMENSIONS.dimensions[resolution]?.[ratio];
  return configuredDimensions || getFallbackDimensions(resolution, ratio);
}

function formatDimensionPresetLabel(
  resolution: SeedanceEstimateResolution,
  ratio: SeedanceEstimateRatio,
  note?: string,
) {
  return `${resolution} · ${ratio}${note ? `（${note}）` : ''}`;
}

export function getSeedanceCostEstimate(
  input: FastVideoInput,
  seedanceDraft: SeedanceDraft,
  executionConfig: SeedanceCostExecutionConfig,
): SeedanceCostEstimate {
  const pricingKey = getSeedancePricingKey(executionConfig);
  const pricing = SEEDANCE_PRICING[pricingKey];
  const selectedReferenceVideos = (input.referenceVideos || []).filter((reference) => (
    reference.videoUrl.trim() && reference.selectedForVideo !== false
  ));
  const includesVideoInput = selectedReferenceVideos.length > 0;
  const unitPrice = includesVideoInput ? pricing.withVideoInputUnitPrice : pricing.withoutVideoInputUnitPrice;
  const effectiveRatio = resolveEstimateRatio(seedanceDraft.options.ratio, input.aspectRatio);
  const resolvedDimensions = resolveSeedanceEstimateDimensions(seedanceDraft.options.resolution, effectiveRatio);
  const outputDurationSec = Math.max(4, seedanceDraft.options.duration || input.durationSec || 10);
  const inputDurationSec = selectedReferenceVideos.reduce((total, reference) => (
    total + Math.max(0, reference.videoMeta?.durationSec || 0)
  ), 0);
  const missingInputDurationCount = selectedReferenceVideos.filter((reference) => (
    !(reference.videoMeta && Number.isFinite(reference.videoMeta.durationSec) && reference.videoMeta.durationSec > 0)
  )).length;
  const billableDurationSec = inputDurationSec + outputDurationSec;
  const frameRate = 24;
  const tokensPerSecond = (resolvedDimensions.width * resolvedDimensions.height * frameRate) / 1024;
  const totalTokens = tokensPerSecond * billableDurationSec;
  
  let estimatedCost = (totalTokens / 1_000_000) * unitPrice;
  let billingLabel = includesVideoInput
    ? `已选中 ${selectedReferenceVideos.length} 条参考视频，输入 ${inputDurationSec.toFixed(1).replace(/\.0$/u, '')}s + 输出 ${outputDurationSec}s 计费。${missingInputDurationCount > 0 ? ` 其中 ${missingInputDurationCount} 条未解析到时长，当前按 0s 处理。` : ''}`
    : '当前未选中参考视频，按不含视频输入计费。';
  let finalUnitPrice: number = unitPrice;
  let pricingUnit: 'tokens' | 'second' = 'tokens';

  if (pricingKey === 'aliyun') {
    const is1080p = seedanceDraft.options.resolution === '1080p';
    finalUnitPrice = is1080p ? 1.6 : 0.9;
    estimatedCost = outputDurationSec * finalUnitPrice;
    billingLabel = `按时长计费，生成 ${outputDurationSec}s 视频，单价 ${finalUnitPrice}元/秒`;
    pricingUnit = 'second';
  }

  if (pricingKey === 'minimax') {
    const is2K = seedanceDraft.options.resolution === '1080p';
    const selectedImageCount = seedanceDraft.assets.filter((asset) => asset.kind === 'image').length;
    const extraImageCost = Math.max(0, selectedImageCount - 5) * 0.2;
    finalUnitPrice = is2K ? 0.8 : 0.5;
    estimatedCost = billableDurationSec * finalUnitPrice + extraImageCost;
    billingLabel = `按时长计费：${is2K ? '2K' : '768P'} ¥${finalUnitPrice}/秒；输入视频与输出共 ${billableDurationSec.toFixed(1).replace(/\.0$/u, '')} 秒${extraImageCost > 0 ? `，另含超出 5 张的参考图费用 ¥${extraImageCost.toFixed(2)}` : ''}。`;
    pricingUnit = 'second';
  }

  return {
    modelLabel: pricing.modelLabel,
    billingLabel,
    unitPrice: finalUnitPrice,
    pricingUnit,
    effectiveRatio,
    width: resolvedDimensions.width,
    height: resolvedDimensions.height,
    frameRate,
    durationSec: billableDurationSec,
    totalTokens,
    estimatedCost,
    selectedReferenceVideoCount: selectedReferenceVideos.length,
    includesVideoInput,
    inputDurationSec,
    outputDurationSec,
    billableDurationSec,
    missingInputDurationCount,
    dimensionPresetLabel: formatDimensionPresetLabel(
      seedanceDraft.options.resolution,
      effectiveRatio,
      resolvedDimensions.note,
    ),
  };
}
