import test from 'node:test';
import assert from 'node:assert/strict';

import type { ApiSettings } from '../src/types.ts';
import { applyMockApiSettings, restoreMockApiSettings } from '../src/services/mockApiConfig.ts';

test('applyMockApiSettings switches API settings to local mock endpoints and keeps a restorable snapshot', () => {
  const initial: ApiSettings = {
    gemini: {
      apiKey: '',
      baseUrl: 'https://generativelanguage.googleapis.com',
      promptLanguage: 'en',
      textModel: 'gemini-text',
      imageModel: 'gemini-image',
      proImageModel: 'gemini-pro-image',
      fastVideoModel: 'gemini-video-fast',
      proVideoModel: 'gemini-video-pro',
      customModels: [],
    },
    volcengine: {
      enabled: true,
      apiKey: 'real-ak',
      baseUrl: 'https://real.example/api/v3',
      promptLanguage: 'zh',
      textModel: 'doubao-text',
      imageModel: 'doubao-image',
      videoModel: 'doubao-video',
      customModels: [],
    },
    seedance: {
      enabled: true,
      apiModel: 'seedance-standard',
      fastApiModel: 'seedance-fast',
      defaultExecutor: 'ark',
      cliModelVersion: 'seedance2.0',
      pollIntervalSec: 15,
      bridgeUrl: 'http://127.0.0.1:3210/api/seedance',
    },
    mockApi: {
      enabled: false,
      baseUrl: '',
      scenario: 'success',
      previousSettings: null,
    },
    defaultModels: {
      text: 'gemini.textModel' as const,
      image: 'gemini.imageModel' as const,
      video: 'gemini.fastVideoModel' as const,
    },
  };

  const applied = applyMockApiSettings(initial, {
    baseUrl: 'http://127.0.0.1:3220/',
    scenario: 'concurrency_once',
  });

  assert.equal(applied.mockApi.enabled, true);
  assert.equal(applied.mockApi.baseUrl, 'http://127.0.0.1:3220');
  assert.equal(applied.mockApi.scenario, 'concurrency_once');
  assert.equal(applied.volcengine.apiKey, 'real-ak');
  assert.equal(applied.volcengine.baseUrl, 'http://127.0.0.1:3220/api/v3');
  assert.equal(applied.seedance.bridgeUrl, 'http://127.0.0.1:3220/api/seedance');
  assert.equal(applied.defaultModels.text, 'volcengine.textModel');
  assert.equal(applied.mockApi.previousSettings?.volcengineBaseUrl, 'https://real.example/api/v3');

  const reapplied = applyMockApiSettings(applied, {
    baseUrl: 'http://127.0.0.1:3221',
    scenario: 'success',
  });
  assert.equal(reapplied.mockApi.previousSettings?.volcengineBaseUrl, 'https://real.example/api/v3');
  assert.equal(reapplied.volcengine.baseUrl, 'http://127.0.0.1:3221/api/v3');

  const restored = restoreMockApiSettings(reapplied);
  assert.equal(restored.mockApi.enabled, false);
  assert.equal(restored.mockApi.previousSettings, null);
  assert.equal(restored.volcengine.apiKey, 'real-ak');
  assert.equal(restored.volcengine.baseUrl, 'https://real.example/api/v3');
  assert.equal(restored.seedance.bridgeUrl, 'http://127.0.0.1:3210/api/seedance');
  assert.equal(restored.defaultModels.text, 'gemini.textModel');
});
