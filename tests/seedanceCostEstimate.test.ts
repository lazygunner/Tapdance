import test from 'node:test';
import assert from 'node:assert/strict';

import type { FastVideoInput } from '../src/features/fastVideoFlow/types/fastTypes.ts';
import type { SeedanceDraft } from '../src/features/seedance/types.ts';
import { getSeedanceCostEstimate, resolveSeedanceEstimateDimensions } from '../src/features/fastVideoFlow/utils/seedanceCostEstimate.ts';

function createInput(overrides: Partial<FastVideoInput> = {}): FastVideoInput {
  return {
    prompt: '城市夜景',
    referenceImages: overrides.referenceImages ?? [],
    referenceVideos: overrides.referenceVideos ?? [],
    referenceAudios: overrides.referenceAudios ?? [],
    aspectRatio: '16:9',
    durationSec: 10,
    preferredSceneCount: 'auto',
    quickCutEnabled: false,
    negativePrompt: '',
    ...overrides,
  };
}

function createDraft(overrides?: Partial<SeedanceDraft>): SeedanceDraft {
  return {
    baseTemplateId: 'multi_image_reference',
    overlayTemplateIds: ['auto_audio'],
    assets: [],
    prompt: {
      rawPrompt: '城市夜景',
      diagnostics: [],
    },
    options: {
      ratio: '16:9',
      duration: 10,
      resolution: '720p',
      generateAudio: true,
      returnLastFrame: false,
      useWebSearch: false,
      watermark: false,
      moduleSettings: {},
    },
    ...overrides,
  };
}

test('resolveSeedanceEstimateDimensions reads 480p table values from JSON config', () => {
  const dimensions = resolveSeedanceEstimateDimensions('480p', '1:1');

  assert.equal(dimensions.width, 640);
  assert.equal(dimensions.height, 640);
  assert.equal(dimensions.source, 'seedance-2.5-doc');
});

test('resolveSeedanceEstimateDimensions supports 1080p ratio presets', () => {
  const dimensions = resolveSeedanceEstimateDimensions('1080p', '9:16');

  assert.equal(dimensions.width, 1080);
  assert.equal(dimensions.height, 1920);
});

test('getSeedanceCostEstimate uses configured dimensions for adaptive ratio estimates', () => {
  const input = createInput({ aspectRatio: '4:3', durationSec: 8 });
  const draft = createDraft({
    options: {
      ...createDraft().options,
      ratio: 'adaptive',
      duration: 8,
      resolution: '720p',
    },
  });

  const estimate = getSeedanceCostEstimate(input, draft, {
    executor: 'ark',
    apiModelKey: 'standard',
    cliModelVersion: 'seedance2.0',
  });

  assert.equal(estimate.width, 1120);
  assert.equal(estimate.height, 832);
  assert.equal(estimate.dimensionPresetLabel, '720p · 4:3');
  assert.equal(estimate.totalTokens, (1120 * 832 * 24 / 1024) * 8);
});

test('getSeedanceCostEstimate switches unit price when a reference video is selected', () => {
  const noVideoEstimate = getSeedanceCostEstimate(createInput(), createDraft(), {
    executor: 'ark',
    apiModelKey: 'fast',
    cliModelVersion: 'seedance2.0fast',
  });

  const withVideoEstimate = getSeedanceCostEstimate(createInput({
    referenceVideos: [{
      id: 'video-1',
      videoUrl: 'https://example.com/reference.mp4',
      selectedForVideo: true,
      videoMeta: {
        durationSec: 6,
        width: 1280,
        height: 720,
      },
    }],
  }), createDraft(), {
    executor: 'ark',
    apiModelKey: 'fast',
    cliModelVersion: 'seedance2.0fast',
  });

  assert.equal(noVideoEstimate.unitPrice, 37);
  assert.equal(noVideoEstimate.includesVideoInput, false);
  assert.equal(withVideoEstimate.unitPrice, 22);
  assert.equal(withVideoEstimate.includesVideoInput, true);
  assert.equal(withVideoEstimate.selectedReferenceVideoCount, 1);
  assert.equal(withVideoEstimate.inputDurationSec, 6);
  assert.equal(withVideoEstimate.outputDurationSec, 10);
  assert.equal(withVideoEstimate.billableDurationSec, 16);
  assert.equal(
    withVideoEstimate.totalTokens,
    (withVideoEstimate.width * withVideoEstimate.height * withVideoEstimate.frameRate / 1024) * 16,
  );
});

test('getSeedanceCostEstimate uses the Seedance 2.5 video-input prices', () => {
  const noVideoEstimate = getSeedanceCostEstimate(createInput(), createDraft(), {
    executor: 'ark',
    apiModelKey: 'seedance25',
    cliModelVersion: 'seedance2.0',
  });

  const withVideoEstimate = getSeedanceCostEstimate(createInput({
    referenceVideos: [{
      id: 'video-25-1',
      videoUrl: 'https://example.com/seedance-25.mp4',
      selectedForVideo: true,
      videoMeta: { durationSec: 5, width: 1280, height: 720 },
    }],
  }), createDraft(), {
    executor: 'ark',
    apiModelKey: 'seedance25',
    cliModelVersion: 'seedance2.0',
  });

  assert.equal(noVideoEstimate.unitPrice, 70);
  assert.equal(withVideoEstimate.unitPrice, 42);
});
