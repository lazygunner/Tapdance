import test from 'node:test';
import assert from 'node:assert/strict';

import {
  enforceFramePromptAspectRatio,
  inferAspectRatioFromFramePrompts,
} from '../src/services/promptAspectRatio.ts';

test('enforceFramePromptAspectRatio appends aspect ratio constraint to first/last frame prompts', () => {
  const imagePrompt = enforceFramePromptAspectRatio({
    professional: 'Cinematic frame, subject in rain',
    professionalZh: '电影镜头，角色在雨中',
    lastFrameProfessional: 'Ending frame, subject stops',
    lastFrameProfessionalZh: '尾帧，角色停下',
  }, '9:16');

  assert.equal(imagePrompt?.professional, 'Cinematic frame, subject in rain, aspect ratio 9:16');
  assert.equal(imagePrompt?.professionalZh, '电影镜头，角色在雨中，画面比例9:16');
  assert.equal(imagePrompt?.lastFrameProfessional, 'Ending frame, subject stops, aspect ratio 9:16');
  assert.equal(imagePrompt?.lastFrameProfessionalZh, '尾帧，角色停下，画面比例9:16');
});

test('enforceFramePromptAspectRatio does not append duplicate aspect ratio constraints', () => {
  const imagePrompt = enforceFramePromptAspectRatio({
    professional: 'Cinematic frame, aspect ratio 16:9, dramatic lighting',
    professionalZh: '电影镜头，画面比例16:9，戏剧化光影',
    lastFrameProfessional: 'Ending frame, ratio 16:9, visual continuity',
    lastFrameProfessionalZh: '尾帧，纵横比16:9，保持连贯',
  }, '16:9');

  assert.equal(imagePrompt?.professional, 'Cinematic frame, aspect ratio 16:9, dramatic lighting');
  assert.equal(imagePrompt?.professionalZh, '电影镜头，画面比例16:9，戏剧化光影');
  assert.equal(imagePrompt?.lastFrameProfessional, 'Ending frame, ratio 16:9, visual continuity');
  assert.equal(imagePrompt?.lastFrameProfessionalZh, '尾帧，纵横比16:9，保持连贯');
});

test('inferAspectRatioFromFramePrompts reads aspect ratio from existing frame prompts', () => {
  const inferred = inferAspectRatioFromFramePrompts({
    professional: 'Cinematic frame, aspect ratio 9:16, neon atmosphere',
    lastFrameProfessionalZh: '尾帧，画面比例16:9',
  });
  assert.equal(inferred, '9:16');
});

test('enforceFramePromptAspectRatio supports 4:3 prompts', () => {
  const imagePrompt = enforceFramePromptAspectRatio({
    professional: 'Retro portrait with shallow depth of field',
    professionalZh: '复古肖像，浅景深',
  }, '4:3');

  assert.equal(imagePrompt?.professional, 'Retro portrait with shallow depth of field, aspect ratio 4:3');
  assert.equal(imagePrompt?.professionalZh, '复古肖像，浅景深，画面比例4:3');
});
