import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ArkAssetOpenApiError,
  callArkAssetOpenApi,
  resetArkAssetOpenApiRateLimitState,
} from '../server/arkAssetOpenApi.mjs';

const requestOptions = {
  version: '2024-01-01',
  endpoint: 'https://ark.cn-beijing.volcengineapi.com',
  credentials: {
    accessKeyId: 'mock-ak',
    accessKeySecret: 'mock-sk',
    region: 'cn-beijing',
  },
};

test('Ark asset queries retry AccountFlowLimitExceeded and preserve the action', async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  resetArkAssetOpenApiRateLimitState();
  globalThis.fetch = (async () => {
    callCount += 1;
    if (callCount === 1) {
      return new Response(JSON.stringify({
        ResponseMetadata: {
          RequestId: 'request-limited',
          Error: {
            Code: 'AccountFlowLimitExceeded',
            Message: 'Request speed exceeds the account flow control limit.',
          },
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      Result: { Items: [], TotalCount: 0 },
      ResponseMetadata: { RequestId: 'request-success', Action: 'ListAssets' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const result = await callArkAssetOpenApi({
      ...requestOptions,
      action: 'ListAssets',
      body: { PageNumber: 1, PageSize: 100 },
    });
    assert.equal(callCount, 2);
    assert.equal(result.ResponseMetadata.Action, 'ListAssets');
  } finally {
    globalThis.fetch = originalFetch;
    resetArkAssetOpenApiRateLimitState();
  }
});

test('CreateAsset retries QuotaWriteQPMExceeded before returning success', async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  resetArkAssetOpenApiRateLimitState();
  globalThis.fetch = (async () => {
    callCount += 1;
    if (callCount > 1) {
      return new Response(JSON.stringify({
        Result: { Id: 'asset-created-after-retry', Status: 'Processing' },
        ResponseMetadata: { RequestId: 'request-create-success', Action: 'CreateAsset' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      ResponseMetadata: {
        RequestId: 'request-create-limited',
        Error: {
          Code: 'QuotaWriteQPMExceeded',
          Message: 'CreateAsset QPM exceeded.',
        },
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json', 'Retry-After': '0' } });
  }) as typeof fetch;

  try {
    const result = await callArkAssetOpenApi({
      ...requestOptions,
      action: 'CreateAsset',
      body: { GroupId: 'group-1', URL: 'https://example.com/image.png' },
    });
    assert.equal(callCount, 2);
    assert.equal(result.Result.Id, 'asset-created-after-retry');
  } finally {
    globalThis.fetch = originalFetch;
    resetArkAssetOpenApiRateLimitState();
  }
});

test('Ark asset mutations do not retry non-rate-limit errors', async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  resetArkAssetOpenApiRateLimitState();
  globalThis.fetch = (async () => {
    callCount += 1;
    return new Response(JSON.stringify({
      ResponseMetadata: {
        RequestId: 'request-create-invalid',
        Error: {
          Code: 'InvalidParameter',
          Message: 'Invalid asset URL.',
        },
      },
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    await assert.rejects(
      callArkAssetOpenApi({
        ...requestOptions,
        action: 'CreateAsset',
        body: { GroupId: 'group-1', URL: 'https://example.com/image.png' },
      }),
      (error: unknown) => {
        assert.equal(error instanceof ArkAssetOpenApiError, true);
        const arkError = error as ArkAssetOpenApiError;
        assert.equal(arkError.statusCode, 400);
        assert.equal(arkError.code, 'InvalidParameter');
        assert.equal(arkError.action, 'CreateAsset');
        assert.equal(arkError.requestId, 'request-create-invalid');
        return true;
      },
    );
    assert.equal(callCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
    resetArkAssetOpenApiRateLimitState();
  }
});
