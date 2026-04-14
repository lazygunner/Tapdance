import test from 'node:test';
import assert from 'node:assert/strict';

import { createTosClient, isLikelyTosCorsError, normalizeTosEndpoint, TosUploadError } from '../src/services/tosUploadService.ts';

test('normalizeTosEndpoint strips protocol and trailing slash', () => {
  assert.equal(normalizeTosEndpoint('https://tos-cn-shanghai.volces.com/'), 'tos-cn-shanghai.volces.com');
  assert.equal(normalizeTosEndpoint('http://tos-cn-shanghai.volces.com'), 'tos-cn-shanghai.volces.com');
  assert.equal(normalizeTosEndpoint('tos-cn-shanghai.volces.com'), 'tos-cn-shanghai.volces.com');
});

test('normalizeTosEndpoint strips duplicated bucket prefix from endpoint host', () => {
  assert.equal(normalizeTosEndpoint('https://ai-director.tos-cn-shanghai.volces.com', 'ai-director'), 'tos-cn-shanghai.volces.com');
  assert.equal(normalizeTosEndpoint('ai-director.tos-cn-shanghai.volces.com', 'ai-director'), 'tos-cn-shanghai.volces.com');
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

test('isLikelyTosCorsError only matches tagged cors upload errors', () => {
  assert.equal(isLikelyTosCorsError(new TosUploadError('cors', undefined, 'cors')), true);
  assert.equal(isLikelyTosCorsError(new TosUploadError('plain')), false);
  assert.equal(isLikelyTosCorsError(new Error('Failed to fetch')), false);
});
