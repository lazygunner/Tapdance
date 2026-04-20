import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDefaultFastSeedanceDraft,
  createEmptyFastVideoProject,
  createFallbackFastVideoPlan,
  normalizeFastVideoProject,
  resolveFastVideoTaskProvider,
  syncFastFlowSeedanceDraft,
} from '../src/features/fastVideoFlow/services/fastFlowMappers.ts';
import { HUMAN_FACE_MOSAIC_SUFFIX } from '../src/features/fastVideoFlow/services/fastScenePrompt.ts';

test('normalizeFastVideoProject defaults reference and storyboard selections to checked', () => {
  const normalized = normalizeFastVideoProject({
    input: {
      ...createEmptyFastVideoProject().input,
      prompt: '海边房间转场',
      referenceImages: [{
        id: 'ref-1',
        imageUrl: 'https://example.com/reference.png',
      }],
    },
    scenes: [{
      id: 'scene-1',
      title: '分镜 1',
      summary: '开场',
      imagePrompt: 'prompt',
      continuityAnchors: [],
      imageUrl: 'https://example.com/scene.png',
    }],
  });

  assert.equal(normalized.input.referenceImages[0].selectedForVideo, true);
  assert.equal(normalized.scenes[0].selectedForVideo, true);
});

test('normalizeFastVideoProject preserves parsed reference video metadata', () => {
  const normalized = normalizeFastVideoProject({
    input: {
      ...createEmptyFastVideoProject().input,
      referenceVideos: [{
        id: 'video-1',
        videoUrl: 'https://example.com/reference.mp4',
        videoMeta: {
          durationSec: 5.5,
          width: 864,
          height: 496,
        },
      }],
    },
  });

  assert.deepEqual(normalized.input.referenceVideos[0].videoMeta, {
    durationSec: 5.5,
    width: 864,
    height: 496,
  });
});

test('normalizeFastVideoProject preserves parsed reference audio metadata', () => {
  const normalized = normalizeFastVideoProject({
    input: {
      ...createEmptyFastVideoProject().input,
      referenceAudios: [{
        id: 'audio-1',
        audioUrl: 'https://example.com/reference.mp3',
        audioMeta: {
          durationSec: 8.2,
        },
      }],
    },
  });

  assert.deepEqual(normalized.input.referenceAudios[0].audioMeta, {
    durationSec: 8.2,
  });
});

test('normalizeFastVideoProject maps legacy audio-guided fast-flow template back to multi-image mode', () => {
  const normalized = normalizeFastVideoProject({
    input: {
      ...createEmptyFastVideoProject().input,
      referenceImages: [{
        id: 'ref-1',
        imageUrl: 'https://example.com/reference.png',
      }],
      referenceAudios: [{
        id: 'audio-1',
        audioUrl: 'https://example.com/reference.mp3',
      }],
    },
    seedanceDraft: {
      ...createDefaultFastSeedanceDraft(createEmptyFastVideoProject().input),
      baseTemplateId: 'audio_guided',
    },
  });

  assert.equal(normalized.seedanceDraft?.baseTemplateId, 'multi_image_reference');
});

test('fast video defaults to Ark executor and auto-audio overlay', () => {
  const project = createEmptyFastVideoProject();
  const draft = createDefaultFastSeedanceDraft(project.input);

  assert.equal(project.input.quickCutEnabled, false);
  assert.equal(project.executionConfig.executor, 'ark');
  assert.equal(project.task.provider, 'ark');
  assert.equal(draft.baseTemplateId, 'free_text');
  assert.deepEqual(draft.overlayTemplateIds, ['auto_audio']);
  assert.equal(draft.options.generateAudio, true);
  assert.equal(draft.options.watermark, false);
});

test('createDefaultFastSeedanceDraft uses multi-image mode when reference media exists', () => {
  const draft = createDefaultFastSeedanceDraft({
    ...createEmptyFastVideoProject().input,
    referenceImages: [{
      id: 'ref-1',
      imageUrl: 'https://example.com/reference.png',
      assetId: '',
      referenceType: 'other',
      description: '',
      selectedForVideo: true,
    }],
  });

  assert.equal(draft.baseTemplateId, 'multi_image_reference');
});

test('normalizeFastVideoProject preserves CLI executor, supported CLI vip model versions, and non-default resolutions', () => {
  const normalized = normalizeFastVideoProject({
    seedanceDraft: {
      ...createDefaultFastSeedanceDraft(createEmptyFastVideoProject().input),
      baseTemplateId: 'first_frame',
      options: {
        ...createDefaultFastSeedanceDraft(createEmptyFastVideoProject().input).options,
        resolution: '480p',
      },
    },
    executionConfig: {
      executor: 'cli',
      apiModelKey: 'standard',
      cliModelVersion: 'seedance2.0fast_vip',
      pollIntervalSec: 15,
      videoResolution: '1080p',
    },
  });

  assert.equal(normalized.executionConfig.executor, 'cli');
  assert.equal(normalized.executionConfig.cliModelVersion, 'seedance2.0fast_vip');
  assert.equal(normalized.seedanceDraft?.options.resolution, '480p');
  assert.equal(normalized.executionConfig.videoResolution, '1080p');
});

test('normalizeFastVideoProject preserves CLI executor for persisted free-text drafts', () => {
  const normalized = normalizeFastVideoProject({
    seedanceDraft: {
      ...createDefaultFastSeedanceDraft(createEmptyFastVideoProject().input),
      baseTemplateId: 'free_text',
    },
    executionConfig: {
      executor: 'cli',
      apiModelKey: 'standard',
      cliModelVersion: 'seedance2.0',
      pollIntervalSec: 15,
      videoResolution: '720p',
    },
  });

  assert.equal(normalized.executionConfig.executor, 'cli');
});

test('normalizeFastVideoProject infers human face mosaic state from prompt suffix', () => {
  const normalized = normalizeFastVideoProject({
    input: createEmptyFastVideoProject().input,
    scenes: [{
      id: 'scene-1',
      title: '分镜 1',
      summary: '开场',
      imagePrompt: `portrait close-up ${HUMAN_FACE_MOSAIC_SUFFIX}`,
      continuityAnchors: [],
    }],
  });

  assert.equal(normalized.scenes[0].humanFaceMosaic, true);
  assert.equal(normalized.scenes[0].imagePrompt, `portrait close-up ${HUMAN_FACE_MOSAIC_SUFFIX}`);
});

test('normalizeFastVideoProject cleans duplicated human face mosaic markers from edited prompts', () => {
  const normalized = normalizeFastVideoProject({
    input: createEmptyFastVideoProject().input,
    scenes: [{
      id: 'scene-1',
      title: '分镜 1',
      summary: '开场',
      imagePrompt: `portrait close-up, ${HUMAN_FACE_MOSAIC_SUFFIX}, shallow depth of field, ${HUMAN_FACE_MOSAIC_SUFFIX}`,
      continuityAnchors: [],
    }],
  });

  assert.equal(normalized.scenes[0].humanFaceMosaic, true);
  assert.equal(
    normalized.scenes[0].imagePrompt,
    `portrait close-up, shallow depth of field ${HUMAN_FACE_MOSAIC_SUFFIX}`,
  );
});

test('normalizeFastVideoProject preserves Ark task provider for task-only payloads', () => {
  const normalized = normalizeFastVideoProject({
    task: {
      taskId: 'cgt-20260404163504-xzw82',
      submitId: '',
      status: 'generating',
      raw: {
        id: 'cgt-20260404163504-xzw82',
        status: 'queued',
        model: 'doubao-seedance-2-0-260128',
      },
    },
  });

  assert.equal(normalized.task.provider, 'ark');
});

test('resolveFastVideoTaskProvider prefers CLI markers when provider is missing', () => {
  const provider = resolveFastVideoTaskProvider({
    taskId: 'cgt-20260404163504-xzw82',
    submitId: 'cgt-20260404163504-xzw82',
    raw: {
      submit_id: 'cgt-20260404163504-xzw82',
      gen_status: 'querying',
    },
  }, 'ark');

  assert.equal(provider, 'cli');
});

test('normalizeFastVideoProject backfills removed storyboard fields for older or slimmer plan payloads', () => {
  const normalized = normalizeFastVideoProject({
    input: createEmptyFastVideoProject().input,
    scenes: [{
      id: 'scene-1',
      title: '分镜 1',
      imagePrompt: 'prompt',
    }],
  });

  assert.equal(normalized.scenes[0].summary, '');
  assert.deepEqual(normalized.scenes[0].continuityAnchors, []);
});

test('normalizeFastVideoProject preserves quick-cut selection', () => {
  const normalized = normalizeFastVideoProject({
    input: {
      ...createEmptyFastVideoProject().input,
      quickCutEnabled: true,
    },
  });

  assert.equal(normalized.input.quickCutEnabled, true);
});

test('createFallbackFastVideoPlan skips storyboard scenes in quick-cut mode', () => {
  const plan = createFallbackFastVideoPlan({
    ...createEmptyFastVideoProject().input,
    prompt: '番茄炒蛋，高能量料理短片',
    quickCutEnabled: true,
  });

  assert.equal(plan.scenes.length, 0);
  assert.match(plan.videoPrompt.prompt, /快速剪辑节奏/);
});

test('syncFastFlowSeedanceDraft only includes checked references and storyboard images for multi-image mode', () => {
  const project = createEmptyFastVideoProject();
  project.input.prompt = '夜景广告';
  project.input.referenceImages = [
    {
      id: 'ref-1',
      imageUrl: 'https://example.com/reference-1.png',
      assetId: 'asset-ref-1',
      referenceType: 'person',
      selectedForVideo: true,
    },
    {
      id: 'ref-2',
      imageUrl: 'https://example.com/reference-2.png',
      referenceType: 'scene',
      selectedForVideo: false,
    },
  ];
  project.scenes = [
    {
      id: 'scene-1',
      title: '分镜 1',
      summary: '开场',
      imagePrompt: 'prompt 1',
      continuityAnchors: [],
      imageUrl: 'https://example.com/scene-1.png',
      selectedForVideo: true,
    },
    {
      id: 'scene-2',
      title: '分镜 2',
      summary: '收束',
      imagePrompt: 'prompt 2',
      continuityAnchors: [],
      imageUrl: 'https://example.com/scene-2.png',
      selectedForVideo: false,
    },
  ];
  project.videoPrompt = {
    prompt: '最终视频提示词',
    promptZh: '最终视频提示词',
  };
  project.executionConfig.executor = 'ark';
  project.seedanceDraft = {
    ...createDefaultFastSeedanceDraft(project.input, project.videoPrompt.prompt),
    baseTemplateId: 'multi_image_reference',
  };

  const draft = syncFastFlowSeedanceDraft(project);

  assert.equal(draft.assets.length, 2);
  assert.deepEqual(
    draft.assets.map((asset) => asset.urlOrData),
    ['asset://asset-ref-1', 'https://example.com/scene-1.png'],
  );
  assert.ok(draft.assets.every((asset) => asset.role === 'reference_image'));
});

test('syncFastFlowSeedanceDraft uses the first and last checked storyboard images for first-last-frame mode', () => {
  const project = createEmptyFastVideoProject();
  project.input.prompt = '产品展示';
  project.scenes = [
    {
      id: 'scene-1',
      title: '分镜 1',
      summary: '开场',
      imagePrompt: 'prompt 1',
      continuityAnchors: [],
      imageUrl: 'https://example.com/scene-1.png',
      selectedForVideo: false,
    },
    {
      id: 'scene-2',
      title: '分镜 2',
      summary: '中段',
      imagePrompt: 'prompt 2',
      continuityAnchors: [],
      imageUrl: 'https://example.com/scene-2.png',
      selectedForVideo: true,
    },
    {
      id: 'scene-3',
      title: '分镜 3',
      summary: '结尾',
      imagePrompt: 'prompt 3',
      continuityAnchors: [],
      imageUrl: 'https://example.com/scene-3.png',
      selectedForVideo: true,
    },
  ];
  project.videoPrompt = {
    prompt: '最终视频提示词',
    promptZh: '最终视频提示词',
  };
  project.seedanceDraft = {
    ...createDefaultFastSeedanceDraft(project.input, project.videoPrompt.prompt),
    baseTemplateId: 'first_last_frame',
  };

  const draft = syncFastFlowSeedanceDraft(project);

  assert.deepEqual(
    draft.assets.map((asset) => ({ role: asset.role, urlOrData: asset.urlOrData })),
    [
      { role: 'first_frame', urlOrData: 'https://example.com/scene-2.png' },
      { role: 'last_frame', urlOrData: 'https://example.com/scene-3.png' },
    ],
  );
});

test('syncFastFlowSeedanceDraft includes selected reference audios without changing fast-flow template logic', () => {
  const project = createEmptyFastVideoProject();
  project.input.prompt = '电子音乐节奏海报';
  project.input.referenceImages = [
    {
      id: 'ref-1',
      imageUrl: 'https://example.com/reference-1.png',
      referenceType: 'style',
      selectedForVideo: true,
    },
  ];
  project.input.referenceAudios = [
    {
      id: 'audio-1',
      audioUrl: 'https://example.com/reference-1.mp3',
      referenceType: 'music',
      description: '鼓点稳定',
      selectedForVideo: true,
    },
    {
      id: 'audio-2',
      audioUrl: 'https://example.com/reference-2.mp3',
      referenceType: 'effect',
      selectedForVideo: false,
    },
  ];
  project.videoPrompt = {
    prompt: '最终视频提示词',
    promptZh: '最终视频提示词',
  };
  project.seedanceDraft = {
    ...createDefaultFastSeedanceDraft(project.input, project.videoPrompt.prompt),
    baseTemplateId: 'multi_image_reference',
  };

  const draft = syncFastFlowSeedanceDraft(project);

  assert.deepEqual(
    draft.assets.map((asset) => ({ kind: asset.kind, role: asset.role, urlOrData: asset.urlOrData })),
    [
      { kind: 'image', role: 'reference_image', urlOrData: 'https://example.com/reference-1.png' },
      { kind: 'audio', role: 'reference_audio', urlOrData: 'https://example.com/reference-1.mp3' },
    ],
  );
  assert.equal(draft.options.generateAudio, true);
});
