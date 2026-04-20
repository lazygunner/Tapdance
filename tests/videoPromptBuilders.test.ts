import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFallbackTransitionPrompt } from '../src/features/creativeFlow/utils/videoPromptBuilders.ts';
import type { Brief, Shot } from '../src/types.ts';

function createBrief(overrides: Partial<Brief> = {}): Brief {
  return {
    theme: '美术馆奇遇',
    style: '国创 3D 动画',
    characters: ['年轻探索者'],
    scenes: ['美术馆'],
    events: '角色进入画中世界',
    mood: '神秘',
    duration: '12s',
    aspectRatio: '16:9',
    platform: '短视频',
    ...overrides,
  };
}

function createShot(overrides: Partial<Shot> = {}): Shot {
  return {
    id: 'shot-1',
    shotNumber: 1,
    duration: 4,
    shotSize: '中景',
    cameraAngle: '平视',
    cameraMovement: '缓慢推进',
    subject: '年轻探索者',
    action: '伸手触碰画作',
    mood: '好奇',
    transition: '画面流动变形',
    ...overrides,
  };
}

test('buildFallbackTransitionPrompt creates usable bilingual prompts from shot context', () => {
  const result = buildFallbackTransitionPrompt(
    createShot({
      imagePrompt: {
        basic: '',
        basicZh: '',
        professional: 'A young explorer reaches toward a painting.',
        professionalZh: '年轻探索者伸手触碰画作。',
        lastFrameProfessional: 'The painting begins to ripple under the explorer hand.',
        lastFrameProfessionalZh: '画作在探索者手下开始泛起涟漪。',
        negative: '',
        negativeZh: '',
      },
    }),
    createShot({
      id: 'shot-2',
      shotNumber: 2,
      action: '进入画中的世界',
      imagePrompt: {
        basic: '',
        basicZh: '',
        professional: 'The explorer steps into a painted mountain world.',
        professionalZh: '探索者进入画中的山水世界。',
        negative: '',
        negativeZh: '',
      },
    }),
    createBrief(),
  );

  assert.match(result.prompt, /painting begins to ripple/u);
  assert.match(result.prompt, /painted mountain world/u);
  assert.match(result.promptZh, /画作在探索者手下开始泛起涟漪/u);
  assert.match(result.promptZh, /画中的山水世界/u);
  assert.match(result.prompt, /Avoid sudden jumps/u);
});
