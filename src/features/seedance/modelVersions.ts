import type { SeedanceApiModelKey, SeedanceModelVersion } from './types.ts';

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
