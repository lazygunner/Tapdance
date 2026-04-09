import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HUMAN_FACE_MOSAIC_SUFFIX,
  hasHumanFaceMosaicSuffix,
  syncHumanFaceMosaicPrompt,
} from '../src/features/fastVideoFlow/services/fastScenePrompt.ts';

test('syncHumanFaceMosaicPrompt appends the suffix once when enabled', () => {
  assert.equal(
    syncHumanFaceMosaicPrompt(`close-up portrait ${HUMAN_FACE_MOSAIC_SUFFIX}`, true),
    `close-up portrait ${HUMAN_FACE_MOSAIC_SUFFIX}`,
  );
  assert.equal(
    syncHumanFaceMosaicPrompt('close-up portrait', true),
    `close-up portrait ${HUMAN_FACE_MOSAIC_SUFFIX}`,
  );
});

test('syncHumanFaceMosaicPrompt removes the suffix when disabled', () => {
  assert.equal(
    syncHumanFaceMosaicPrompt(`close-up portrait ${HUMAN_FACE_MOSAIC_SUFFIX}`, false),
    'close-up portrait',
  );
  assert.equal(
    syncHumanFaceMosaicPrompt(`close-up portrait, ${HUMAN_FACE_MOSAIC_SUFFIX}, shallow depth of field`, false),
    'close-up portrait, shallow depth of field',
  );
});

test('syncHumanFaceMosaicPrompt keeps the suffix managed at the end while editing', () => {
  assert.equal(
    syncHumanFaceMosaicPrompt(`close-up portrait, ${HUMAN_FACE_MOSAIC_SUFFIX}, shallow depth of field`, true),
    `close-up portrait, shallow depth of field ${HUMAN_FACE_MOSAIC_SUFFIX}`,
  );
  assert.equal(
    syncHumanFaceMosaicPrompt(`close-up portrait, ${HUMAN_FACE_MOSAIC_SUFFIX} shallow depth of field`, true),
    `close-up portrait, shallow depth of field ${HUMAN_FACE_MOSAIC_SUFFIX}`,
  );
});

test('hasHumanFaceMosaicSuffix detects the managed suffix anywhere in prompts', () => {
  assert.equal(hasHumanFaceMosaicSuffix(`close-up portrait ${HUMAN_FACE_MOSAIC_SUFFIX}`), true);
  assert.equal(hasHumanFaceMosaicSuffix(`close-up portrait, ${HUMAN_FACE_MOSAIC_SUFFIX}, shallow depth of field`), true);
  assert.equal(hasHumanFaceMosaicSuffix('close-up portrait, human face fully mosaic'), false);
  assert.equal(hasHumanFaceMosaicSuffix('close-up portrait'), false);
});
