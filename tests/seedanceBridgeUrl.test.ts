import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchSeedanceTask } from '../src/features/fastVideoFlow/services/seedanceBridgeClient.ts';
import { buildSeedanceBridgeRequestUrl, resolveSeedanceBridgeUrl } from '../src/services/seedanceBridgeUrl.ts';

test('buildSeedanceBridgeRequestUrl appends API paths under an absolute bridge base URL', () => {
  const url = buildSeedanceBridgeRequestUrl('/task/demo-submit-id', 'http://127.0.0.1:3210/api/seedance');
  assert.equal(url, 'http://127.0.0.1:3210/api/seedance/task/demo-submit-id');
});

test('resolveSeedanceBridgeUrl preserves bridge-origin file URLs under an absolute bridge base URL', () => {
  const url = resolveSeedanceBridgeUrl('/api/seedance/file/demo-submit-id/final.mp4', 'http://127.0.0.1:3210/api/seedance');
  assert.equal(url, 'http://127.0.0.1:3210/api/seedance/file/demo-submit-id/final.mp4');
});

test('fetchSeedanceTask normalizes downloaded file URLs with the configured bridge base URL', async () => {
  const originalFetch = globalThis.fetch;
  const fetchCalls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetchCalls.push(String(input));
    return new Response(JSON.stringify({
      submitId: 'demo-submit-id',
      genStatus: 'success',
      downloadedFiles: [{
        name: 'final.mp4',
        url: '/api/seedance/file/demo-submit-id/final.mp4',
      }],
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }) as typeof fetch;

  try {
    const result = await fetchSeedanceTask('demo-submit-id', 'http://127.0.0.1:3210/api/seedance');

    assert.deepEqual(fetchCalls, ['http://127.0.0.1:3210/api/seedance/task/demo-submit-id']);
    assert.equal(result.downloadedFiles?.[0]?.url, 'http://127.0.0.1:3210/api/seedance/file/demo-submit-id/final.mp4');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
