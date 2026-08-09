import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getArkAssetStatusLabel,
  isArkAssetActiveStatus,
  isArkAssetFailedStatus,
  listArkAssets,
  normalizeArkAssetStatus,
} from '../src/services/volcengineAssetService.ts';
import { loadApiSettings, setCachedApiSettings } from '../src/services/apiConfig.ts';

test('normalizeArkAssetStatus canonicalizes common asset processing states', () => {
  assert.equal(normalizeArkAssetStatus('active'), 'Active');
  assert.equal(normalizeArkAssetStatus('SUCCESS'), 'Active');
  assert.equal(normalizeArkAssetStatus('pending'), 'Processing');
  assert.equal(normalizeArkAssetStatus('running'), 'Processing');
  assert.equal(normalizeArkAssetStatus('fail'), 'Failed');
  assert.equal(normalizeArkAssetStatus(''), 'Processing');
});

test('asset status helpers recognize canonical terminal states', () => {
  assert.equal(isArkAssetActiveStatus('succeeded'), true);
  assert.equal(isArkAssetFailedStatus('FAILED'), true);
  assert.equal(isArkAssetActiveStatus('processing'), false);
  assert.equal(isArkAssetFailedStatus('processing'), false);
});

test('Ark asset statuses have readable Chinese labels', () => {
  assert.equal(getArkAssetStatusLabel('Active'), '已就绪');
  assert.equal(getArkAssetStatusLabel('processing'), '处理中');
  assert.equal(getArkAssetStatusLabel('Failed'), '处理失败');
  assert.equal(getArkAssetStatusLabel('Archived'), 'Archived');
});

test('listArkAssets sends all group ids together and loads every result page', async () => {
  const originalFetch = globalThis.fetch;
  const originalSettings = loadApiSettings();
  const requestBodies: any[] = [];
  setCachedApiSettings({
    ...originalSettings,
    tos: {
      enabled: true,
      region: 'cn-beijing',
      endpoint: 'https://tos-cn-beijing.volces.com',
      bucket: 'mock-bucket',
      accessKeyId: 'mock-ak',
      accessKeySecret: 'mock-sk',
      pathPrefix: 'mock/',
    },
  });
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body || '{}'));
    requestBodies.push(request);
    const pageNumber = request.body.PageNumber;
    const items = pageNumber === 1
      ? [
          { Id: 'asset-1', GroupId: 'group-1', Status: 'Active' },
          { Id: 'asset-2', GroupId: 'group-2', Status: 'Processing' },
        ]
      : [{ Id: 'asset-3', GroupId: 'group-1', Status: 'Active' }];
    return new Response(JSON.stringify({
      Result: {
        Items: items,
        TotalCount: 3,
        PageNumber: pageNumber,
        PageSize: 2,
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const assets = await listArkAssets({
      groupIds: ['group-1', 'group-2', 'group-1'],
      pageSize: 2,
      baseUrl: 'http://127.0.0.1:3220/api/seedance',
    });
    assert.deepEqual(assets.map((item) => item.id), ['asset-1', 'asset-2', 'asset-3']);
    assert.equal(requestBodies.length, 2);
    assert.deepEqual(requestBodies[0].body.Filter.GroupIds, ['group-1', 'group-2']);
    assert.equal(requestBodies[0].body.PageNumber, 1);
    assert.equal(requestBodies[1].body.PageNumber, 2);
  } finally {
    globalThis.fetch = originalFetch;
    setCachedApiSettings(originalSettings);
  }
});
