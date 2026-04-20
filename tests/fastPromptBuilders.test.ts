import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFastVideoPlanPrompt, buildFastVideoPromptRegenerationPrompt } from '../src/features/fastVideoFlow/services/fastPromptBuilders.ts';
import type { FastVideoInput } from '../src/features/fastVideoFlow/types/fastTypes.ts';

function createInput(overrides: Partial<FastVideoInput> = {}): FastVideoInput {
  return {
    prompt: '番茄炒蛋，高能量料理短片',
    referenceImages: overrides.referenceImages ?? [],
    referenceVideos: overrides.referenceVideos ?? [],
    referenceAudios: overrides.referenceAudios ?? [],
    aspectRatio: '16:9',
    durationSec: 15,
    preferredSceneCount: 'auto',
    quickCutEnabled: false,
    negativePrompt: 'no watermark',
    ...overrides,
  };
}

test('buildFastVideoPlanPrompt injects quick-cut guidance when enabled', () => {
  const prompt = buildFastVideoPlanPrompt(createInput({ quickCutEnabled: true }));

  assert.match(prompt, /Quick cut mode: enabled/);
  assert.match(prompt, /每2秒一次的快速节奏剪辑/);
  assert.match(prompt, /\[第 14-15 秒\]/);
  assert.match(prompt, /Return scenes as an empty array/);
  assert.match(prompt, /If Quick cut is enabled, scenes must be \[\]/);
});

test('buildFastVideoPlanPrompt omits quick-cut guidance when disabled', () => {
  const prompt = buildFastVideoPlanPrompt(createInput());

  assert.doesNotMatch(prompt, /Quick cut mode: enabled/);
  assert.doesNotMatch(prompt, /每2秒一次的快速节奏剪辑/);
});

test('buildFastVideoPlanPrompt lets auto scene count be model-decided and keeps video prompt Chinese', () => {
  const prompt = buildFastVideoPlanPrompt(createInput());

  assert.match(prompt, /decide the scene count based on idea complexity/);
  assert.match(prompt, /imagePrompt must be a professional English prompt/);
  assert.match(prompt, /videoPrompt\.prompt and videoPrompt\.promptZh must both be Simplified Chinese/);
  assert.doesNotMatch(prompt, /decide 1 or 2 scenes/);
  assert.doesNotMatch(prompt, /imagePrompt and videoPrompt should be professional English/);
});

test('buildFastVideoPromptRegenerationPrompt keeps quick-cut guidance for final prompt regeneration', () => {
  const prompt = buildFastVideoPromptRegenerationPrompt(createInput({ quickCutEnabled: true }), [{
    id: 'fast-scene-1',
    title: '开场分镜',
    summary: '',
    imagePrompt: 'prompt',
    imagePromptZh: '中文提示词',
    negativePrompt: 'negative',
    negativePromptZh: '负面词',
    continuityAnchors: [],
    imageUrl: '',
    locked: false,
    status: 'idle',
    error: '',
  }]);

  assert.match(prompt, /Quick cut mode: enabled/);
  assert.match(prompt, /retro jazz aesthetics/);
});

test('buildFastVideoPlanPrompt includes reference audio details when present', () => {
  const prompt = buildFastVideoPlanPrompt(createInput({
    referenceAudios: [{
      id: 'audio-1',
      audioUrl: 'https://example.com/reference.mp3',
      referenceType: 'rhythm',
      description: '鼓点清晰，推进感强',
    }],
  }));

  assert.match(prompt, /Reference audio count: 1/);
  assert.match(prompt, /音频1: type=节奏参考音频; description=鼓点清晰，推进感强/);
  assert.match(prompt, /reference audios are present/i);
});
