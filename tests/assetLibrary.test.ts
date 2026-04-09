import test from 'node:test';
import assert from 'node:assert/strict';

import { saveMediaToAssetLibrary } from '../src/services/assetLibrary.ts';

test('saveMediaToAssetLibrary delegates remote media downloads to the bridge', async () => {
  const originalFetch = globalThis.fetch;
  const fetchCalls: Array<{ input: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ input: String(input), init });
    return new Response(JSON.stringify({
      rootPath: '/tmp/assets',
      relativePath: 'group/project/videos/final.mp4',
      absolutePath: '/tmp/assets/group/project/videos/final.mp4',
      fileName: 'final.mp4',
      kind: 'video',
      url: '/api/seedance/assets/file?path=group%2Fproject%2Fvideos%2Ffinal.mp4',
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }) as typeof fetch;

  try {
    const saved = await saveMediaToAssetLibrary({
      sourceUrl: 'https://example.com/output.mp4',
      kind: 'video',
      assetId: 'asset-1',
      title: '成片',
      groupName: '分组',
      projectName: '项目',
      baseUrl: 'http://127.0.0.1:3210/api/seedance',
    });

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].input, 'http://127.0.0.1:3210/api/seedance/assets/save');
    assert.equal(saved.url, 'http://127.0.0.1:3210/api/seedance/assets/file?path=group%2Fproject%2Fvideos%2Ffinal.mp4');

    const payload = JSON.parse(String(fetchCalls[0].init?.body || '{}'));
    assert.equal(payload.sourceUrl, 'https://example.com/output.mp4');
    assert.equal(payload.dataBase64, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('saveMediaToAssetLibrary resolves relative bridge media URLs before delegating them to the bridge', async () => {
  const originalFetch = globalThis.fetch;
  const fetchCalls: Array<{ input: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ input: String(input), init });
    return new Response(JSON.stringify({
      rootPath: '/tmp/assets',
      relativePath: 'group/project/videos/final.mp4',
      absolutePath: '/tmp/assets/group/project/videos/final.mp4',
      fileName: 'final.mp4',
      kind: 'video',
      url: '/api/seedance/assets/file?path=group%2Fproject%2Fvideos%2Ffinal.mp4',
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }) as typeof fetch;

  try {
    await saveMediaToAssetLibrary({
      sourceUrl: '/api/seedance/file/demo-task/final.mp4',
      kind: 'video',
      assetId: 'asset-2',
      title: '成片',
      groupName: '分组',
      projectName: '项目',
      baseUrl: 'http://127.0.0.1:3210/api/seedance',
    });

    const payload = JSON.parse(String(fetchCalls[0].init?.body || '{}'));
    assert.equal(payload.sourceUrl, 'http://127.0.0.1:3210/api/seedance/file/demo-task/final.mp4');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
