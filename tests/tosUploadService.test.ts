import test from 'node:test';
import assert from 'node:assert/strict';

import { createTosClient, normalizeTosEndpoint } from '../src/services/tosUploadService.ts';

test('normalizeTosEndpoint strips protocol and trailing slash', () => {
  assert.equal(normalizeTosEndpoint('https://tos-cn-shanghai.volces.com/'), 'tos-cn-shanghai.volces.com');
  assert.equal(normalizeTosEndpoint('http://tos-cn-shanghai.volces.com'), 'tos-cn-shanghai.volces.com');
  assert.equal(normalizeTosEndpoint('tos-cn-shanghai.volces.com'), 'tos-cn-shanghai.volces.com');
});

test('createTosClient uses normalized endpoint so presigned url host stays valid', () => {
  const client = createTosClient({
    enabled: true,
    region: 'cn-shanghai',
    endpoint: 'https://tos-cn-shanghai.volces.com',
    bucket: 'ai-director',
    accessKeyId: 'ak',
    accessKeySecret: 'sk',
    pathPrefix: 'reference-videos/',
  }) as any;

  const presignedUrl = client.getPreSignedUrl({
    bucket: 'ai-director',
    key: 'reference-videos/test.mov',
    method: 'PUT',
    expires: 600,
  });

  assert.match(presignedUrl, /^https:\/\/ai-director\.tos-cn-shanghai\.volces\.com\//);
  assert.doesNotMatch(presignedUrl, /https:\/\/ai-director\.https/);
  assert.doesNotMatch(presignedUrl, /https%3A%2F%2Ftos-cn-shanghai/);
});
