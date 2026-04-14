import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStoryboardGenerationInput,
  buildTransitionVideoGenerationRequest,
  buildVideoGenerationRequest,
  mapStoryboardAspectRatio,
  parseInlineImageData,
} from '../src/services/requestBuilders.ts';
import type { Asset, Shot } from '../src/types.ts';

const PNG_DATA_URL = 'data:image/png;base64,Zmlyc3Q=';
const JPG_DATA_URL = 'data:image/jpeg;base64,bGFzdA==';

function createShot(overrides: Partial<Shot> = {}): Shot {
  return {
    id: 'shot-1',
    shotNumber: 1,
    duration: 3,
    shotSize: '中景',
    cameraAngle: '平视',
    cameraMovement: '固定',
    subject: '主角',
    action: '主角奔跑',
    mood: '紧张',
    transition: '硬切',
    ...overrides,
  };
}

function createAsset(id: string, imageUrl?: string): Asset {
  return {
    id,
    type: 'character',
    name: `asset-${id}`,
    description: `desc-${id}`,
    imageUrl,
  };
}

test('parseInlineImageData returns parsed image bytes and mime type', () => {
  assert.deepEqual(parseInlineImageData(PNG_DATA_URL), {
    imageBytes: 'Zmlyc3Q=',
    mimeType: 'image/png',
  });
  assert.equal(parseInlineImageData('not-a-data-url'), undefined);
});

test('buildStoryboardGenerationInput keeps image parts in stable order and appends text last', () => {
  const input = buildStoryboardGenerationInput(
    'hero portrait',
    '9:16',
    'gemini-3.1-flash-image-preview',
    [
      createAsset('1', PNG_DATA_URL),
      createAsset('2'),
      createAsset('3', 'bad-data'),
      createAsset('4', JPG_DATA_URL),
    ],
    PNG_DATA_URL,
  );

  assert.equal(input.modelName, 'gemini-3.1-flash-image-preview');
  assert.deepEqual(input.config, {
    imageConfig: {
      aspectRatio: '9:16',
    },
  });
  assert.equal(input.parts.length, 4);
  assert.deepEqual(input.parts[0], {
    inlineData: {
      data: 'Zmlyc3Q=',
      mimeType: 'image/png',
    },
  });
  assert.deepEqual(input.parts[1], {
    inlineData: {
      data: 'Zmlyc3Q=',
      mimeType: 'image/png',
    },
  });
  assert.deepEqual(input.parts[2], {
    inlineData: {
      data: 'bGFzdA==',
      mimeType: 'image/jpeg',
    },
  });
  assert.deepEqual(input.parts[3], { text: 'hero portrait' });
});

test('buildVideoGenerationRequest preserves first frame and forces 720p when last frame is present', () => {
  const request = buildVideoGenerationRequest(
    createShot({
      duration: 6,
      imageUrl: PNG_DATA_URL,
      lastFrameImageUrl: JPG_DATA_URL,
      videoPrompt: {
        textToVideo: 'fallback text prompt',
        textToVideoZh: '中文',
        imageToVideo: 'animate this frame',
        imageToVideoZh: '中文',
      },
      videoConfig: {
        resolution: '1080p',
        frameRate: 24,
        aspectRatio: '9:16',
        useFirstFrame: true,
        useLastFrame: true,
        useReferenceAssets: false,
      },
    }),
    '16:9',
    [],
    'veo-3.1-fast-generate-preview',
  );

  assert.equal(request.model, 'veo-3.1-fast-generate-preview');
  assert.equal(request.prompt, 'animate this frame');
  assert.deepEqual(request.image, {
    imageBytes: 'Zmlyc3Q=',
    mimeType: 'image/png',
  });
  assert.deepEqual(request.config.lastFrame, {
    imageBytes: 'bGFzdA==',
    mimeType: 'image/jpeg',
  });
  assert.equal(request.config.durationSeconds, 8);
  assert.equal(request.config.aspectRatio, '9:16');
  assert.equal(request.config.resolution, '720p');
});

test('buildVideoGenerationRequest upgrades to pro model and trims reference images to three', () => {
  const request = buildVideoGenerationRequest(
    createShot({
      imageUrl: PNG_DATA_URL,
      lastFrameImageUrl: JPG_DATA_URL,
      videoConfig: {
        resolution: '1080p',
        frameRate: 24,
        aspectRatio: '9:16',
        useFirstFrame: true,
        useLastFrame: true,
        useReferenceAssets: true,
      },
    }),
    '9:16',
    [
      createAsset('1', PNG_DATA_URL),
      createAsset('2', JPG_DATA_URL),
      createAsset('3', PNG_DATA_URL),
      createAsset('4', JPG_DATA_URL),
    ],
    'veo-3.1-fast-generate-preview',
  );

  assert.equal(request.model, 'veo-3.1-generate-preview');
  assert.deepEqual(request.image, {
    imageBytes: 'Zmlyc3Q=',
    mimeType: 'image/png',
  });
  assert.equal(request.config.durationSeconds, 8);
  assert.equal(request.config.aspectRatio, '16:9');
  assert.equal(request.config.resolution, '720p');
  assert.equal(request.config.referenceImages?.length, 3);
  assert.equal('lastFrame' in request.config, false);
});

test('buildTransitionVideoGenerationRequest uses 720p and normalizes non-portrait aspect ratios to 16:9', () => {
  const request = buildTransitionVideoGenerationRequest(
    PNG_DATA_URL,
    JPG_DATA_URL,
    '1:1',
    undefined,
    3,
    'veo-3.1-generate-preview',
  );

  assert.equal(request.model, 'veo-3.1-generate-preview');
  assert.equal(request.prompt, 'A smooth and natural transition between the two scenes');
  assert.equal(request.config.resolution, '720p');
  assert.equal(request.config.aspectRatio, '16:9');
  assert.equal(request.config.durationSeconds, 4);
  assert.deepEqual(request.image, {
    imageBytes: 'Zmlyc3Q=',
    mimeType: 'image/png',
  });
  assert.deepEqual(request.config.lastFrame, {
    imageBytes: 'bGFzdA==',
    mimeType: 'image/jpeg',
  });
});

test('mapStoryboardAspectRatio preserves 4:3 for image generation', () => {
  assert.equal(mapStoryboardAspectRatio('4:3'), '4:3');
});

test('mapStoryboardAspectRatio preserves 3:4 and 21:9 for image generation', () => {
  assert.equal(mapStoryboardAspectRatio('3:4'), '3:4');
  assert.equal(mapStoryboardAspectRatio('21:9'), '21:9');
});

test('buildVideoGenerationRequest normalizes 4:3 video requests to 16:9 provider format', () => {
  const request = buildVideoGenerationRequest(
    createShot({
      videoPrompt: {
        textToVideo: 'retro medium shot',
        textToVideoZh: '中文',
        imageToVideo: 'retro medium shot',
        imageToVideoZh: '中文',
      },
      videoConfig: {
        resolution: '720p',
        frameRate: 24,
        aspectRatio: '4:3',
        useFirstFrame: false,
        useLastFrame: false,
        useReferenceAssets: false,
      },
    }),
    '4:3',
    [],
    'veo-3.1-fast-generate-preview',
  );

  assert.equal(request.config.aspectRatio, '16:9');
});

test('buildVideoGenerationRequest clamps segment duration into Gemini supported 4-8s range', () => {
  const request = buildVideoGenerationRequest(
    createShot({
      duration: 12,
      videoPrompt: {
        textToVideo: 'long segment prompt',
        textToVideoZh: '中文',
        imageToVideo: 'long segment prompt',
        imageToVideoZh: '中文',
      },
    }),
    '16:9',
    [],
    'veo-3.1-fast-generate-preview',
  );

  assert.equal(request.config.durationSeconds, 8);
});

test('buildVideoGenerationRequest maps 5s to nearest supported Veo duration', () => {
  const request = buildVideoGenerationRequest(
    createShot({
      duration: 5,
      videoPrompt: {
        textToVideo: 'mid length prompt',
        textToVideoZh: '中文',
        imageToVideo: 'mid length prompt',
        imageToVideoZh: '中文',
      },
    }),
    '16:9',
    [],
    'veo-3.1-fast-generate-preview',
  );

  assert.equal(request.config.durationSeconds, 6);
});
