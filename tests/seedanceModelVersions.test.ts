import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SEEDANCE_API_MODEL_SOURCE_IDS,
  SEEDANCE_MODEL_VERSIONS,
  getSeedanceApiModelKeyForModelSourceId,
  getSeedanceApiModelLabelForSourceId,
  getSeedanceApiModelKeyForCliModel,
  isSeedanceApiModelSourceId,
  normalizeSeedanceModelVersion,
} from '../src/features/seedance/modelVersions.ts';

test('normalizeSeedanceModelVersion accepts all supported CLI model variants', () => {
  assert.deepEqual(SEEDANCE_MODEL_VERSIONS, [
    'seedance2.0',
    'seedance2.0fast',
    'seedance2.0_vip',
    'seedance2.0fast_vip',
  ]);
  assert.equal(normalizeSeedanceModelVersion('seedance2.0_vip'), 'seedance2.0_vip');
  assert.equal(normalizeSeedanceModelVersion('seedance2.0fast_vip'), 'seedance2.0fast_vip');
  assert.equal(normalizeSeedanceModelVersion('unknown'), 'seedance2.0');
});

test('getSeedanceApiModelKeyForCliModel maps vip variants to the correct pricing tier', () => {
  assert.equal(getSeedanceApiModelKeyForCliModel('seedance2.0'), 'standard');
  assert.equal(getSeedanceApiModelKeyForCliModel('seedance2.0_vip'), 'standard');
  assert.equal(getSeedanceApiModelKeyForCliModel('seedance2.0fast'), 'fast');
  assert.equal(getSeedanceApiModelKeyForCliModel('seedance2.0fast_vip'), 'fast');
});

test('Seedance API model source ids map to standard and fast models', () => {
  assert.deepEqual(SEEDANCE_API_MODEL_SOURCE_IDS, [
    'seedance.apiModel',
    'seedance.fastApiModel',
  ]);
  assert.equal(isSeedanceApiModelSourceId('seedance.apiModel'), true);
  assert.equal(isSeedanceApiModelSourceId('seedance.fastApiModel'), true);
  assert.equal(isSeedanceApiModelSourceId('volcengine.videoModel'), false);
  assert.equal(getSeedanceApiModelKeyForModelSourceId('seedance.apiModel'), 'standard');
  assert.equal(getSeedanceApiModelKeyForModelSourceId('seedance.fastApiModel'), 'fast');
  assert.equal(getSeedanceApiModelLabelForSourceId('seedance.apiModel'), 'Seedance 2.0');
  assert.equal(getSeedanceApiModelLabelForSourceId('seedance.fastApiModel'), 'Seedance 2.0 Fast');
});
