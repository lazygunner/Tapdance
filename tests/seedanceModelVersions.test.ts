import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SEEDANCE_MODEL_VERSIONS,
  getSeedanceApiModelKeyForCliModel,
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

