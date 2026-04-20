import type { SeedanceApiModelKey, SeedanceModelVersion } from './types.ts';

export const SEEDANCE_API_MODEL_SOURCE_IDS = [
  'seedance.apiModel',
  'seedance.fastApiModel',
] as const;

export type SeedanceApiModelSourceId = typeof SEEDANCE_API_MODEL_SOURCE_IDS[number];

export const SEEDANCE_MODEL_VERSIONS: SeedanceModelVersion[] = [
  'seedance2.0',
  'seedance2.0fast',
  'seedance2.0_vip',
  'seedance2.0fast_vip',
];

export function isSeedanceModelVersion(value: unknown): value is SeedanceModelVersion {
  return typeof value === 'string' && SEEDANCE_MODEL_VERSIONS.includes(value as SeedanceModelVersion);
}

export function normalizeSeedanceModelVersion(value: unknown, fallback: SeedanceModelVersion = 'seedance2.0'): SeedanceModelVersion {
  return isSeedanceModelVersion(value) ? value : fallback;
}

export function getSeedanceApiModelKeyForCliModel(modelVersion: SeedanceModelVersion): SeedanceApiModelKey {
  return modelVersion === 'seedance2.0fast' || modelVersion === 'seedance2.0fast_vip' ? 'fast' : 'standard';
}

export function isSeedanceApiModelSourceId(value: unknown): value is SeedanceApiModelSourceId {
  return typeof value === 'string' && SEEDANCE_API_MODEL_SOURCE_IDS.includes(value as SeedanceApiModelSourceId);
}

export function getSeedanceApiModelKeyForModelSourceId(sourceId: unknown): SeedanceApiModelKey | null {
  if (sourceId === 'seedance.apiModel') {
    return 'standard';
  }
  if (sourceId === 'seedance.fastApiModel') {
    return 'fast';
  }
  return null;
}

export function getSeedanceApiModelLabelForSourceId(sourceId: unknown): string {
  if (sourceId === 'seedance.fastApiModel') {
    return 'Seedance 2.0 Fast';
  }
  if (sourceId === 'seedance.apiModel') {
    return 'Seedance 2.0';
  }
  return '';
}
