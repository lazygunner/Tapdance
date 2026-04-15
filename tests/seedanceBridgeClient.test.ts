import test from 'node:test';
import assert from 'node:assert/strict';

import { submitSeedanceTask } from '../src/features/fastVideoFlow/services/seedanceBridgeClient.ts';

test('submitSeedanceTask falls back to remote source URLs but inlines readable local bridge images', async () => {
  const originalFetch = globalThis.fetch;
  const fetchCalls: Array<{ input: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ input: String(input), init });
    if (String(input) === 'https://example.com/reference.png') {
      return new Response('forbidden', {
        status: 403,
        headers: {
          'Content-Type': 'text/plain',
        },
      });
    }
    if (String(input) === 'http://127.0.0.1:3210/api/seedance/assets/file?path=group%2Fproject%2Fimages%2Fframe.jpg') {
      return new Response('fake-image', {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
        },
      });
    }

    return new Response(JSON.stringify({
      submitId: 'submit-1',
      genStatus: 'querying',
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }) as typeof fetch;

  try {
    await submitSeedanceTask({
      projectId: 'project-1',
      prompt: '生成视频',
      imageSources: [
        'https://example.com/reference.png',
        '/api/seedance/assets/file?path=group%2Fproject%2Fimages%2Fframe.jpg',
      ],
      options: {
        modelVersion: 'seedance2.0fast_vip',
        ratio: '16:9',
        duration: 4,
        videoResolution: '480p',
      },
      baseUrl: 'http://127.0.0.1:3210/api/seedance',
    });

    assert.equal(fetchCalls.length, 3);
    assert.equal(fetchCalls[0].input, 'https://example.com/reference.png');
    assert.equal(fetchCalls[1].input, 'http://127.0.0.1:3210/api/seedance/assets/file?path=group%2Fproject%2Fimages%2Fframe.jpg');
    assert.equal(fetchCalls[2].input, 'http://127.0.0.1:3210/api/seedance/submit');

    const payload = JSON.parse(String(fetchCalls[2].init?.body || '{}'));
    assert.deepEqual(payload.images, [
      {
        filename: 'scene-1',
        sourceUrl: 'https://example.com/reference.png',
      },
      {
        filename: 'scene-2.png',
        mimeType: 'image/png',
        dataBase64: Buffer.from('fake-image').toString('base64'),
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('submitSeedanceTask keeps inline data URLs embedded in the submit payload', async () => {
  const originalFetch = globalThis.fetch;
  const fetchCalls: Array<{ input: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ input: String(input), init });
    return new Response(JSON.stringify({
      submitId: 'submit-2',
      genStatus: 'querying',
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }) as typeof fetch;

  try {
    await submitSeedanceTask({
      projectId: 'project-2',
      prompt: '生成视频',
      imageSources: ['data:image/png;base64,Zm9v'],
      options: {
        modelVersion: 'seedance2.0',
        ratio: '16:9',
        duration: 4,
        videoResolution: '720p',
      },
      baseUrl: 'http://127.0.0.1:3210/api/seedance',
    });

    const payload = JSON.parse(String(fetchCalls[0].init?.body || '{}'));
    assert.deepEqual(payload.images, [{
      filename: 'scene-1.png',
      mimeType: 'image/png',
      dataBase64: 'Zm9v',
    }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('submitSeedanceTask sends prompt-only and multimodal URL references without forcing image inputs', async () => {
  const originalFetch = globalThis.fetch;
  const fetchCalls: Array<{ input: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ input: String(input), init });
    return new Response(JSON.stringify({
      submitId: 'submit-3',
      genStatus: 'querying',
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }) as typeof fetch;

  try {
    await submitSeedanceTask({
      projectId: 'project-3',
      prompt: '只用文本生成视频',
      imageSources: [],
      videoSources: ['https://example.com/reference.mp4'],
      audioSources: ['https://example.com/reference.mp3'],
      options: {
        modelVersion: 'seedance2.0fast',
        ratio: '16:9',
        duration: 4,
        videoResolution: '720p',
      },
      baseUrl: 'http://127.0.0.1:3210/api/seedance',
    });

    const payload = JSON.parse(String(fetchCalls[0].init?.body || '{}'));
    assert.deepEqual(payload.images, []);
    assert.deepEqual(payload.videos, [{
      filename: 'video-1',
      sourceUrl: 'https://example.com/reference.mp4',
    }]);
    assert.deepEqual(payload.audios, [{
      filename: 'audio-1',
      sourceUrl: 'https://example.com/reference.mp3',
    }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
