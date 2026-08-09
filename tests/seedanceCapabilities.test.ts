import test from 'node:test';
import assert from 'node:assert/strict';

import { getSeedanceCapabilities, normalizeSeedanceDraftOptions } from '../src/features/seedance/capabilities.ts';
import { compileSeedanceRequest, validateSeedanceDraft } from '../src/features/seedance/services/seedanceDraft.ts';
import type { SeedanceDraft } from '../src/features/seedance/types.ts';
import { getSeedanceTemplateDescription } from '../src/features/seedance/config/seedanceTemplateRegistry.ts';

function createDraft(patch: Partial<SeedanceDraft> = {}): SeedanceDraft {
  return {
    baseTemplateId: 'free_text',
    overlayTemplateIds: [],
    assets: [],
    prompt: { rawPrompt: '生成一段电影感视频', diagnostics: [] },
    options: {
      ratio: '16:9',
      duration: 30,
      resolution: '720p',
      outputFormat: 'mov',
      generateAudio: true,
      returnLastFrame: false,
      useWebSearch: false,
      watermark: false,
    },
    ...patch,
  };
}

test('Seedance 2.5 exposes 30 second, 30/10/10 references and MOV capability', () => {
  const profile = getSeedanceCapabilities('seedance25');
  assert.equal(profile.maxDurationSec, 30);
  assert.equal(profile.maxImages, 30);
  assert.equal(profile.maxVideos, 10);
  assert.equal(profile.maxAudios, 10);
  assert.deepEqual(profile.resolutions, ['480p', '720p']);
  assert.deepEqual(profile.outputFormats, ['mp4', 'mov']);
});

test('template descriptions follow the selected Seedance model limits', () => {
  assert.equal(
    getSeedanceTemplateDescription('multi_image_reference', 'seedance25'),
    '使用 1-30 张参考图锁定主体、场景或元素组合。',
  );
  assert.equal(
    getSeedanceTemplateDescription('multi_image_reference', 'standard'),
    '使用 1-9 张参考图锁定主体、场景或元素组合。',
  );
  assert.equal(
    getSeedanceTemplateDescription('video_stitch', 'seedance25'),
    '使用 2-10 段参考视频进行拼接与补间。',
  );
});

test('Seedance 2.5 video edit is normalized to adaptive ratio and automatic duration', () => {
  const draft = createDraft({ baseTemplateId: 'video_edit' });
  const normalized = normalizeSeedanceDraftOptions(draft, 'seedance25');
  assert.equal(normalized.options.ratio, 'adaptive');
  assert.equal(normalized.options.duration, -1);
});

test('Seedance 2.5 rejects 1080p and still rejects pure audio input', () => {
  const draft = createDraft({
    baseTemplateId: 'audio_guided',
    assets: [{
      id: 'audio-1',
      kind: 'audio',
      source: 'url',
      urlOrData: 'https://example.com/audio.mp3',
      role: 'reference_audio',
      durationSec: 5,
    }],
    options: { ...createDraft().options, resolution: '1080p' },
  });
  const validation = validateSeedanceDraft(draft, 'seedance25');
  assert.equal(validation.errors.some((error) => error.includes('仅输入音频无效')), true);
  assert.equal(validation.errors.some((error) => error.includes('不支持 1080p')), true);
});

test('compiled 2.5 request carries MOV output format', () => {
  const compiled = compileSeedanceRequest(createDraft(), 'seedance25');
  assert.equal(compiled.outputFormat, 'mov');
  assert.equal(compiled.duration, 30);
});
