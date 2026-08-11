import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildVideoEditPrompt,
  buildVideoEditSeedanceDraft,
  createEmptyVideoEditProject,
  mapVideoEditRemoteStatus,
  normalizeVideoEditSourceDuration,
  validateVideoEditProject,
} from '../src/features/videoEditing/services/videoEditProject.ts';

test('video editing compiles a Seedance 2.5 adaptive video_edit draft', () => {
  const flow = {
    ...createEmptyVideoEditProject(),
    operation: 'replace' as const,
    sourceVideo: {
      url: 'https://example.com/source.mp4',
      fileName: 'source.mp4',
      origin: 'url' as const,
      durationSec: 8,
    },
    referenceImages: [{
      id: 'image-1',
      url: 'https://example.com/cup.png',
      fileName: 'cup.png',
    }],
    targetDescription: '画面右侧桌面上的红色杯子',
    resultDescription: '替换为参考图片中的透明玻璃杯',
  };

  assert.deepEqual(validateVideoEditProject(flow), []);
  const prompt = buildVideoEditPrompt(flow);
  assert.match(prompt, /视频1/u);
  assert.match(prompt, /图片1/u);

  const draft = buildVideoEditSeedanceDraft(flow);
  assert.equal(draft.baseTemplateId, 'video_edit');
  assert.equal(draft.options.ratio, 'adaptive');
  assert.equal(draft.options.duration, -1);
  assert.equal(draft.assets[0].role, 'reference_video');
  assert.equal(draft.assets[1].role, 'reference_image');
});

test('video editing validates source duration and required edit descriptions', () => {
  const emptyIssues = validateVideoEditProject(createEmptyVideoEditProject());
  assert.equal(emptyIssues.length, 3);

  const flow = {
    ...createEmptyVideoEditProject(),
    operation: 'remove' as const,
    sourceVideo: {
      url: 'https://example.com/source.mp4',
      fileName: 'source.mp4',
      origin: 'url' as const,
      durationSec: 31,
    },
    targetDescription: '路人',
  };
  assert.deepEqual(validateVideoEditProject(flow), ['待编辑视频时长需在 4–30 秒之间。']);
});

test('video editing normalizes Ark task statuses', () => {
  assert.equal(mapVideoEditRemoteStatus('queued'), 'queued');
  assert.equal(mapVideoEditRemoteStatus('running'), 'generating');
  assert.equal(mapVideoEditRemoteStatus('succeeded'), 'completed');
  assert.equal(mapVideoEditRemoteStatus('expired'), 'failed');
});

test('video editing tolerates container padding on a 30 second generated video', () => {
  assert.equal(normalizeVideoEditSourceDuration(30), 30);
  assert.equal(normalizeVideoEditSourceDuration(30.04), 30);
  assert.equal(normalizeVideoEditSourceDuration(31), 30);
  assert.equal(normalizeVideoEditSourceDuration(31.01), 31.01);
});
