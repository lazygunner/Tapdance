import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultApiSettings, setCachedApiSettings } from '../src/services/apiConfig.ts';
import {
  checkVideoStatus,
  deleteOrCancelVideoTask,
  listVideoTasks,
  startFastVideoGeneration,
  startVideoGeneration,
} from '../src/services/minimaxVideoService.ts';
import type { Shot } from '../src/types.ts';

const PNG = 'data:image/png;base64,Zmlyc3Q=';
const JPG = 'data:image/jpeg;base64,bGFzdA==';

function configureMinimax() {
  setCachedApiSettings({
    ...defaultApiSettings,
    minimax: {
      ...defaultApiSettings.minimax,
      apiKey: 'test-key',
      baseUrl: 'https://minimax.example',
    },
  });
}

function createShot(): Shot {
  return {
    id: 'shot-h3',
    shotNumber: 1,
    duration: 17,
    shotSize: '中景',
    cameraAngle: '平视',
    cameraMovement: '推进',
    subject: '主角',
    action: '主角走向镜头',
    mood: '紧张',
    transition: '硬切',
    imageUrl: PNG,
    lastFrameImageUrl: JPG,
    videoPrompt: {
      textToVideo: 'text prompt',
      textToVideoZh: '文本提示',
      imageToVideo: 'animate the hero',
      imageToVideoZh: '让主角动起来',
    },
    videoConfig: {
      resolution: '1080p',
      frameRate: 24,
      aspectRatio: '9:16',
      useFirstFrame: true,
      useLastFrame: true,
      useReferenceAssets: false,
      watermark: true,
    },
  };
}

test('MiniMax H3 create maps frames, resolution, duration and watermark to V2 request', async () => {
  configureMinimax();
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(JSON.stringify({ task_id: 'task-123' }), { status: 200 });
  };

  try {
    const operation = await startVideoGeneration(createShot(), '16:9', [], false, 'MiniMax-H3');
    assert.deepEqual(operation, { provider: 'minimax', taskId: 'task-123' });
    assert.equal(capturedUrl, 'https://minimax.example/v2/video_generation');
    assert.equal((capturedInit?.headers as Record<string, string>).Authorization, 'Bearer test-key');
    const body = JSON.parse(String(capturedInit?.body));
    assert.equal(body.model, 'MiniMax-H3');
    assert.equal(body.resolution, '2K');
    assert.equal(body.duration, 15);
    assert.equal(body.ratio, 'adaptive');
    assert.equal(body.aigc_watermark, true);
    assert.deepEqual(body.content.map((item: any) => item.role || item.type), ['text', 'first_frame', 'last_frame']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('MiniMax H3 fast executor submits multimodal references through the V2 content array', async () => {
  configureMinimax();
  const originalFetch = globalThis.fetch;
  let body: any;
  globalThis.fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ task_id: 'fast-h3-task' }), { status: 200 });
  };

  try {
    const operation = await startFastVideoGeneration({
      baseTemplateId: 'multi_image_reference',
      overlayTemplateIds: [],
      prompt: { rawPrompt: '让角色转身并走向镜头', diagnostics: [] },
      assets: [
        { id: 'image', kind: 'image', source: 'upload', role: 'reference_image', urlOrData: PNG },
        { id: 'video', kind: 'video', source: 'upload', role: 'reference_video', urlOrData: 'data:video/mp4;base64,dmlkZW8=' },
        { id: 'audio', kind: 'audio', source: 'upload', role: 'reference_audio', urlOrData: 'data:audio/mp3;base64,YXVkaW8=' },
      ],
      options: {
        ratio: 'adaptive',
        duration: 8,
        resolution: '720p',
        outputFormat: 'mp4',
        generateAudio: true,
        returnLastFrame: false,
        useWebSearch: false,
        watermark: false,
      },
    }, '9:16');

    assert.deepEqual(operation, { provider: 'minimax', taskId: 'fast-h3-task' });
    assert.equal(body.ratio, '9:16');
    assert.equal(body.resolution, '768P');
    assert.deepEqual(body.content.map((item: any) => item.role || item.type), [
      'text',
      'reference_image',
      'reference_video',
      'reference_audio',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('MiniMax H3 query maps succeeded and failed task states into common polling response', async () => {
  configureMinimax();
  const originalFetch = globalThis.fetch;
  const responses = [
    { task: { id: 'task-ok', model: 'MiniMax-H3', status: 'succeeded', content: { url: 'https://cdn.example/video.mp4' } } },
    { task: { id: 'task-fail', model: 'MiniMax-H3', status: 'failed', error: { code: '1026', message: 'sensitive content' } } },
  ];
  globalThis.fetch = async () => new Response(JSON.stringify(responses.shift()), { status: 200 });

  try {
    const succeeded = await checkVideoStatus({ provider: 'minimax', taskId: 'task-ok' });
    assert.equal(succeeded.done, true);
    assert.equal(succeeded.response.generatedVideos[0].video.uri, 'https://cdn.example/video.mp4');
    const failed = await checkVideoStatus({ provider: 'minimax', taskId: 'task-fail' });
    assert.equal(failed.done, true);
    assert.deepEqual(failed.response.raiMediaFilteredReasons, ['sensitive content']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('MiniMax H3 task list and delete use V2 task management endpoints', async () => {
  configureMinimax();
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method?: string }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method });
    const body = init?.method === 'DELETE'
      ? { task_id: 'task-1', action: 'cancelled', status: 'cancelled' }
      : { items: [{ id: 'task-1', status: 'queued', model: 'MiniMax-H3' }], total: 1 };
    return new Response(JSON.stringify(body), { status: 200 });
  };

  try {
    const list = await listVideoTasks({ pageNum: 2, pageSize: 10, status: 'queued', taskIds: ['task-1'], model: 'MiniMax-H3' });
    assert.equal(list.total, 1);
    assert.match(calls[0].url, /\/v2\/query\/video_generation\?/);
    assert.match(calls[0].url, /filter\.status=queued/);
    assert.match(calls[0].url, /filter\.task_ids=task-1/);
    const result = await deleteOrCancelVideoTask('task-1');
    assert.equal(result.action, 'cancelled');
    assert.deepEqual(calls[1], { url: 'https://minimax.example/v2/video_generation/task-1', method: 'DELETE' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
