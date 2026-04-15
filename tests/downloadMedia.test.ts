import test from 'node:test';
import assert from 'node:assert/strict';

import { downloadMedia } from '../src/features/app/utils/downloadMedia.ts';

function flushAsyncWork() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test('downloadMedia downloads fetched blobs via an object URL', async () => {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  const clickedAnchors: Array<{ href: string; download: string }> = [];
  const appendedAnchors: unknown[] = [];
  const removedAnchors: unknown[] = [];
  const objectUrls: string[] = [];
  const revokedObjectUrls: string[] = [];

  try {
    globalThis.fetch = (async () => new Response(new Blob(['image-bytes'], { type: 'image/png' }), { status: 200 })) as typeof fetch;
    URL.createObjectURL = ((blob: Blob) => {
      assert.equal(blob.type, 'image/png');
      const objectUrl = 'blob:download-media-test';
      objectUrls.push(objectUrl);
      return objectUrl;
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = ((url: string) => {
      revokedObjectUrls.push(url);
    }) as typeof URL.revokeObjectURL;
    globalThis.document = {
      createElement: (tagName: string) => {
        assert.equal(tagName, 'a');
        return {
          href: '',
          download: '',
          rel: '',
          style: { display: '' },
          click() {
            clickedAnchors.push({ href: this.href, download: this.download });
          },
        };
      },
      body: {
        appendChild(node: unknown) {
          appendedAnchors.push(node);
        },
        removeChild(node: unknown) {
          removedAnchors.push(node);
        },
      },
    } as unknown as Document;

    downloadMedia('https://example.com/demo.png', 'demo.png');
    await flushAsyncWork();
    await new Promise((resolve) => setTimeout(resolve, 1100));

    assert.deepEqual(clickedAnchors, [{ href: 'blob:download-media-test', download: 'demo.png' }]);
    assert.equal(appendedAnchors.length, 1);
    assert.equal(removedAnchors.length, 1);
    assert.deepEqual(objectUrls, ['blob:download-media-test']);
    assert.deepEqual(revokedObjectUrls, ['blob:download-media-test']);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.document = originalDocument;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  }
});

test('downloadMedia falls back to the direct URL when blob download fails', async () => {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const originalConsoleError = console.error;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  const clickedAnchors: Array<{ href: string; download: string }> = [];
  const consoleErrors: unknown[][] = [];

  try {
    globalThis.fetch = (async () => {
      throw new Error('network failed');
    }) as typeof fetch;
    console.error = (...args: unknown[]) => {
      consoleErrors.push(args);
    };
    URL.createObjectURL = (() => {
      throw new Error('should not create object url when fetch fails');
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
    globalThis.document = {
      createElement: (tagName: string) => {
        assert.equal(tagName, 'a');
        return {
          href: '',
          download: '',
          rel: '',
          style: { display: '' },
          click() {
            clickedAnchors.push({ href: this.href, download: this.download });
          },
        };
      },
      body: {
        appendChild() {},
        removeChild() {},
      },
    } as unknown as Document;

    downloadMedia('https://example.com/fallback.png', 'fallback.png');
    await flushAsyncWork();

    assert.deepEqual(clickedAnchors, [{ href: 'https://example.com/fallback.png', download: 'fallback.png' }]);
    assert.equal(consoleErrors.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.document = originalDocument;
    console.error = originalConsoleError;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  }
});
