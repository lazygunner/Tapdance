import type { SeedanceApiModelKey, SeedanceModelVersion } from './types.ts';

/** Official Ark IDs verified 2026-11-16; preserve the existing source IDs/settings keys. */
export const SEEDANCE_API_MODELS = {
  seedance25: { sourceId: 'seedance.seedance25ApiModel', settingKey: 'seedance25ApiModel', label: 'Seedance 2.5', modelId: 'doubao-seedance-2-5-260628' },
  flash: { sourceId: 'seedance.flashApiModel', settingKey: 'flashApiModel', label: 'Seedance 2.5 Flash', modelId: 'doubao-seedance-2-5-flash-261115' },
  standard: { sourceId: 'seedance.apiModel', settingKey: 'apiModel', label: 'Seedance 2.0', modelId: 'doubao-seedance-2-0-260128' },
  fast: { sourceId: 'seedance.fastApiModel', settingKey: 'fastApiModel', label: 'Seedance 2.0 Fast', modelId: 'doubao-seedance-2-0-fast-260128' },
  mini: { sourceId: 'seedance.miniApiModel', settingKey: 'miniApiModel', label: 'Seedance 2.0 Mini', modelId: 'doubao-seedance-2-0-mini-260615' },
} as const;

export const SEEDANCE_API_MODEL_SOURCE_IDS = Object.values(SEEDANCE_API_MODELS).map((item) => item.sourceId);
export type SeedanceApiModelSourceId = typeof SEEDANCE_API_MODEL_SOURCE_IDS[number];
export const SEEDANCE_API_MODEL_KEYS = Object.keys(SEEDANCE_API_MODELS) as SeedanceApiModelKey[];
export function isSeedanceApiModelKey(value: unknown): value is SeedanceApiModelKey {
  return typeof value === 'string' && Object.hasOwn(SEEDANCE_API_MODELS, value);
}
export function getSeedanceApiModelDefinition(key: SeedanceApiModelKey) { return SEEDANCE_API_MODELS[key]; }

export const SEEDANCE_MODEL_VERSIONS: SeedanceModelVersion[] = ['seedance2.0', 'seedance2.0fast', 'seedance2.0_vip', 'seedance2.0fast_vip'];
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
  return SEEDANCE_API_MODEL_KEYS.find((key) => SEEDANCE_API_MODELS[key].sourceId === sourceId) || null;
}
export function getSeedanceApiModelLabelForSourceId(sourceId: unknown): string {
  const key = getSeedanceApiModelKeyForModelSourceId(sourceId);
  return key ? SEEDANCE_API_MODELS[key].label : '';
}
