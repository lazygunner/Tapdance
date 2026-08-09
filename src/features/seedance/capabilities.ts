import type {
  SeedanceApiModelKey,
  SeedanceBaseTemplateId,
  SeedanceDraft,
  SeedanceOutputFormat,
} from './types.ts';

export interface SeedanceCapabilityProfile {
  key: SeedanceApiModelKey;
  label: string;
  maxDurationSec: number;
  resolutions: ReadonlyArray<'480p' | '720p' | '1080p'>;
  outputFormats: ReadonlyArray<SeedanceOutputFormat>;
  maxImages: number;
  maxVideos: number;
  maxAudios: number;
  maxMediaDurationSec: number;
  maxTotalVideoDurationSec: number;
  maxTotalAudioDurationSec: number;
  minMediaDurationSec: number;
}

const LEGACY_PROFILE = {
  maxDurationSec: 15,
  resolutions: ['480p', '720p', '1080p'],
  outputFormats: ['mp4'],
  maxImages: 9,
  maxVideos: 3,
  maxAudios: 3,
  maxMediaDurationSec: 15,
  maxTotalVideoDurationSec: 15,
  maxTotalAudioDurationSec: 15,
  minMediaDurationSec: 1,
} as const;

export const SEEDANCE_CAPABILITIES: Record<SeedanceApiModelKey, SeedanceCapabilityProfile> = {
  seedance25: {
    key: 'seedance25',
    label: 'Seedance 2.5',
    maxDurationSec: 30,
    resolutions: ['480p', '720p'],
    outputFormats: ['mp4', 'mov'],
    maxImages: 30,
    maxVideos: 10,
    maxAudios: 10,
    minMediaDurationSec: 2,
    maxMediaDurationSec: 30,
    maxTotalVideoDurationSec: 30,
    maxTotalAudioDurationSec: 30,
  },
  standard: { key: 'standard', label: 'Seedance 2.0', ...LEGACY_PROFILE },
  fast: { key: 'fast', label: 'Seedance 2.0 Fast', ...LEGACY_PROFILE },
};

export function getSeedanceCapabilities(modelKey: SeedanceApiModelKey) {
  return SEEDANCE_CAPABILITIES[modelKey];
}

export function isSeedance25(modelKey: SeedanceApiModelKey) {
  return modelKey === 'seedance25';
}

export function getSeedanceTemplateOptionConstraints(templateId: SeedanceBaseTemplateId, modelKey: SeedanceApiModelKey) {
  if (!isSeedance25(modelKey)) return {};
  if (templateId === 'video_edit') return { ratio: 'adaptive' as const, duration: -1 as const };
  if (templateId === 'video_extend' || templateId === 'first_frame' || templateId === 'first_last_frame') {
    return { ratio: 'adaptive' as const };
  }
  return {};
}

export function normalizeSeedanceDraftOptions(draft: SeedanceDraft, modelKey: SeedanceApiModelKey): SeedanceDraft {
  const capability = getSeedanceCapabilities(modelKey);
  const constraints = getSeedanceTemplateOptionConstraints(draft.baseTemplateId, modelKey);
  const resolution = capability.resolutions.includes(draft.options.resolution)
    ? draft.options.resolution
    : capability.resolutions[capability.resolutions.length - 1];
  const outputFormat = capability.outputFormats.includes(draft.options.outputFormat)
    ? draft.options.outputFormat
    : capability.outputFormats[0];
  const currentDuration = draft.options.duration;
  const duration = constraints.duration ?? (
    currentDuration === -1 || (typeof currentDuration === 'number' && currentDuration >= 4 && currentDuration <= capability.maxDurationSec)
      ? currentDuration
      : Math.min(10, capability.maxDurationSec)
  );
  return {
    ...draft,
    options: {
      ...draft.options,
      resolution,
      outputFormat,
      ratio: constraints.ratio ?? draft.options.ratio,
      duration,
    },
  };
}
