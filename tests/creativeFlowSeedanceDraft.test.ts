import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCreativeSeedanceOptionsFromVideoConfig, buildShotSeedanceDraft } from '../src/features/creativeFlow/services/creativeFlowSeedanceDraft.ts';
import type { Shot } from '../src/types.ts';

function createShot(overrides: Partial<Shot> = {}): Shot {
  return {
    id: 'shot-1',
    shotNumber: 1,
    duration: 5,
    shotSize: '中景',
    cameraAngle: '平视',
    cameraMovement: '固定',
    subject: '主角',
    action: '主角走入画面',
    mood: '平静',
    transition: '硬切',
    ...overrides,
  };
}

test('buildCreativeSeedanceOptionsFromVideoConfig maps 480p and Seedance toggles', () => {
  const options = buildCreativeSeedanceOptionsFromVideoConfig({
    resolution: '480p',
    generateAudio: true,
    returnLastFrame: true,
    useWebSearch: true,
    watermark: true,
  });

  assert.deepEqual(options, {
    resolution: '480p',
    generateAudio: true,
    returnLastFrame: true,
    useWebSearch: true,
    watermark: true,
  });
});

test('buildShotSeedanceDraft applies creative Seedance options to request options', async () => {
  const shot = createShot({
    videoConfig: {
      resolution: '480p',
      frameRate: 24,
      aspectRatio: '16:9',
      useFirstFrame: false,
      useLastFrame: false,
      useReferenceAssets: false,
      generateAudio: true,
      returnLastFrame: true,
      useWebSearch: true,
      watermark: true,
    },
  });

  const draft = await buildShotSeedanceDraft(
    shot,
    '16:9',
    [],
    buildCreativeSeedanceOptionsFromVideoConfig(shot.videoConfig),
  );

  assert.equal(draft.options.resolution, '480p');
  assert.equal(draft.options.generateAudio, true);
  assert.equal(draft.options.returnLastFrame, true);
  assert.equal(draft.options.useWebSearch, true);
  assert.equal(draft.options.watermark, true);
  assert.deepEqual(draft.overlayTemplateIds, ['auto_audio']);
});
