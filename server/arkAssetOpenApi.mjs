import crypto from 'node:crypto';

const DEFAULT_ARK_ASSET_ENDPOINT = 'https://ark.cn-beijing.volcengineapi.com';
const DEFAULT_ARK_ASSET_REGION = 'cn-beijing';
const DEFAULT_ARK_ASSET_SERVICE = 'ark';
const DEFAULT_ARK_ASSET_VERSION = '2024-01-01';
const ARK_FLOW_CONTROL_ERROR_CODES = new Set([
  'AccountFlowLimitExceeded',
  'FlowLimitExceeded',
  'QuotaWriteQPMExceeded',
  'QuotaWriteQPSExceeded',
]);
const RETRYABLE_ARK_ASSET_ACTIONS = new Set([
  'CreateAsset',
  'ListAssetGroups',
  'ListAssets',
  'GetAsset',
  'GetAssetGroup',
  'GetVisualValidateResult',
]);
const ARK_ACTION_MIN_INTERVAL_MS = new Map([
  ['CreateAsset', 2500],
  ['CreateVisualValidateSession', 350],
  ['GetVisualValidateResult', 350],
  ['ListAssetGroups', 110],
  ['ListAssets', 110],
  ['GetAsset', 15],
  ['GetAssetGroup', 110],
  ['UpdateAsset', 110],
  ['UpdateAssetGroup', 110],
  ['DeleteAsset', 110],
  ['DeleteAssetGroup', 220],
]);
const ALLOWED_ARK_ASSET_ACTIONS = new Set([
  'CreateAssetGroup',
  'CreateAsset',
  'ListAssetGroups',
  'ListAssets',
  'GetAsset',
  'GetAssetGroup',
  'UpdateAssetGroup',
  'UpdateAsset',
  'DeleteAsset',
  'DeleteAssetGroup',
  'CreateVisualValidateSession',
  'GetVisualValidateResult',
]);
const arkActionQueueTails = new Map();
const arkActionLastStartedAt = new Map();

export class ArkAssetOpenApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ArkAssetOpenApiError';
    this.code = String(options.code || '');
    this.action = String(options.action || '');
    this.requestId = String(options.requestId || '');
    this.statusCode = Number(options.statusCode) || 500;
  }
}

function normalizeErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || 'Unknown error');
}

function encodeRfc3986(value) {
  return encodeURIComponent(value)
    .replace(/[!'()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildCanonicalQueryString(params) {
  return Object.entries(params)
    .map(([key, value]) => [String(key), String(value)])
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => (
      leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey)
    ))
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join('&');
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmacSha256(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest(encoding);
}

function formatXDate(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/gu, '');
}

function parseJsonOrText(text) {
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { rawText: text };
  }
}

function extractArkError(payload) {
  return payload?.ResponseMetadata?.Error || payload?.Error || payload?.error || null;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getArkRequestId(payload) {
  return String(payload?.ResponseMetadata?.RequestId || payload?.RequestId || '').trim();
}

function isArkFlowControlError(error) {
  return error instanceof ArkAssetOpenApiError && ARK_FLOW_CONTROL_ERROR_CODES.has(error.code);
}

function getRetryAfterMs(response) {
  const value = String(response.headers.get('retry-after') || '').trim();
  if (!value) {
    return null;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const retryAt = Date.parse(value);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - Date.now()) : null;
}

function getArkRetryDelayMs(action, attempt, response) {
  const retryAfterMs = getRetryAfterMs(response);
  if (retryAfterMs !== null) {
    return retryAfterMs;
  }
  const baseDelayMs = action === 'CreateAsset' ? 3000 : 250;
  const maximumDelayMs = action === 'CreateAsset' ? 30000 : 4000;
  return Math.min(maximumDelayMs, baseDelayMs * (2 ** attempt)) + Math.floor(Math.random() * 250);
}

function runWithArkActionRateLimit(action, task) {
  const previousTail = arkActionQueueTails.get(action) || Promise.resolve();
  const scheduled = previousTail
    .catch(() => undefined)
    .then(async () => {
      const minimumIntervalMs = ARK_ACTION_MIN_INTERVAL_MS.get(action) || 0;
      const lastStartedAt = arkActionLastStartedAt.get(action) || 0;
      const waitMs = Math.max(0, lastStartedAt + minimumIntervalMs - Date.now());
      if (waitMs > 0) {
        await delay(waitMs);
      }
      arkActionLastStartedAt.set(action, Date.now());
      return task();
    });

  arkActionQueueTails.set(action, scheduled.then(() => undefined, () => undefined));
  return scheduled;
}

export function resetArkAssetOpenApiRateLimitState() {
  arkActionQueueTails.clear();
  arkActionLastStartedAt.clear();
}

export async function callArkAssetOpenApi(options) {
  const action = String(options?.action || '').trim();
  if (!ALLOWED_ARK_ASSET_ACTIONS.has(action)) {
    throw new Error('不支持的 Ark 素材资产 API。');
  }

  const accessKeyId = String(options?.credentials?.accessKeyId || '').trim();
  const accessKeySecret = String(options?.credentials?.accessKeySecret || '').trim();
  if (!accessKeyId || !accessKeySecret) {
    throw new Error('缺少 AccessKey ID 或 AccessKey Secret。');
  }

  const region = String(options?.credentials?.region || DEFAULT_ARK_ASSET_REGION).trim() || DEFAULT_ARK_ASSET_REGION;
  const service = DEFAULT_ARK_ASSET_SERVICE;
  const version = String(options?.version || DEFAULT_ARK_ASSET_VERSION).trim() || DEFAULT_ARK_ASSET_VERSION;
  const endpoint = new URL(String(options?.endpoint || DEFAULT_ARK_ASSET_ENDPOINT).trim() || DEFAULT_ARK_ASSET_ENDPOINT);
  return runWithArkActionRateLimit(action, async () => {
    const maxAttempts = action === 'CreateAsset' ? 7 : (RETRYABLE_ARK_ASSET_ACTIONS.has(action) ? 4 : 1);

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const queryString = buildCanonicalQueryString({ Action: action, Version: version });
      const requestUrl = `${endpoint.origin}/?${queryString}`;
      const requestBody = JSON.stringify(options?.body || {});
      const contentType = 'application/json';
      const xDate = formatXDate();
      const shortDate = xDate.slice(0, 8);
      const payloadHash = sha256Hex(requestBody);
      const signedHeaders = 'content-type;host;x-content-sha256;x-date';
      const canonicalHeaders = [
        `content-type:${contentType}`,
        `host:${endpoint.host}`,
        `x-content-sha256:${payloadHash}`,
        `x-date:${xDate}`,
        '',
      ].join('\n');
      const canonicalRequest = [
        'POST',
        '/',
        queryString,
        canonicalHeaders,
        signedHeaders,
        payloadHash,
      ].join('\n');
      const credentialScope = `${shortDate}/${region}/${service}/request`;
      const stringToSign = [
        'HMAC-SHA256',
        xDate,
        credentialScope,
        sha256Hex(canonicalRequest),
      ].join('\n');
      const signingKey = hmacSha256(
        hmacSha256(
          hmacSha256(
            hmacSha256(accessKeySecret, shortDate),
            region,
          ),
          service,
        ),
        'request',
      );
      const signature = hmacSha256(signingKey, stringToSign, 'hex');
      const authorization = `HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

      // Retries also count toward the account quota. Record every actual attempt so
      // the next queued CreateAsset cannot burst immediately after a successful retry.
      arkActionLastStartedAt.set(action, Date.now());
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          'X-Date': xDate,
          'X-Content-Sha256': payloadHash,
          Authorization: authorization,
        },
        body: requestBody,
      });
      const text = await response.text();
      const payload = parseJsonOrText(text);
      const arkError = extractArkError(payload);

      if (response.ok && !arkError) {
        return payload;
      }

      const message = arkError?.Message || arkError?.message || payload?.message || payload?.rawText || `HTTP ${response.status}`;
      const code = String(arkError?.Code || arkError?.code || '').trim();
      const error = new ArkAssetOpenApiError(code ? `${code}: ${message}` : message, {
        code,
        action,
        requestId: getArkRequestId(payload),
        statusCode: ARK_FLOW_CONTROL_ERROR_CODES.has(code) ? 429 : (response.ok ? 500 : response.status),
      });

      if (!isArkFlowControlError(error) || attempt === maxAttempts - 1) {
        throw error;
      }

      const retryDelayMs = getArkRetryDelayMs(action, attempt, response);
      console.warn(
        `[ArkAssetOpenApi] ${action} hit ${error.code}; retrying ${attempt + 2}/${maxAttempts} in ${retryDelayMs}ms.`,
      );
      await delay(retryDelayMs);
    }

    throw new ArkAssetOpenApiError('Ark 素材资产 API 调用失败。', { action });
  });
}

export function registerArkAssetOpenApiRoutes(app) {
  app.post('/api/seedance/ark/assets/call', async (request, response) => {
    try {
      const payload = await callArkAssetOpenApi(request.body);
      response.json(payload);
    } catch (error) {
      const statusCode = error instanceof ArkAssetOpenApiError ? error.statusCode : 500;
      response.status(statusCode).json({
        error: normalizeErrorMessage(error),
        ...(error instanceof ArkAssetOpenApiError ? {
          code: error.code,
          action: error.action,
          requestId: error.requestId,
        } : {}),
      });
    }
  });
}
