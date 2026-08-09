import test from 'node:test';
import assert from 'node:assert/strict';

import { parsePromptReferenceTags } from '../src/features/fastVideoFlow/utils/promptReferenceTags.ts';

test('legacy prompt reference labels become renderable canonical tokens', () => {
  const result = parsePromptReferenceTags(
    '人物参考 @图1，动作参考 @视频２，节奏参考 @音频1。已有图片2保持不变。',
    ['图片1', '图片2', '视频2', '音频1'],
  );

  assert.equal(result.value, '人物参考 图片1，动作参考 视频2，节奏参考 音频1。已有图片2保持不变。');
  assert.equal(result.replacementCount, 3);
});

test('prompt reference parser preserves tags without matching materials', () => {
  const result = parsePromptReferenceTags('@图1 @图9 @视频3', ['图片1']);

  assert.equal(result.value, '图片1 @图9 @视频3');
  assert.equal(result.replacementCount, 1);
});
