import crypto from 'node:crypto';

const DEFAULT_ARK_ASSET_ENDPOINT = 'https://ark.cn-beijing.volcengineapi.com';
const DEFAULT_ARK_ASSET_REGION = 'cn-beijing';
const DEFAULT_ARK_ASSET_SERVICE = 'ark';
const DEFAULT_ARK_ASSET_VERSION = '2024-01-01';
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
]);

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

  if (!response.ok || arkError) {
    const message = arkError?.Message || arkError?.message || payload?.message || payload?.rawText || `HTTP ${response.status}`;
    const code = arkError?.Code || arkError?.code || '';
    throw new Error(code ? `${code}: ${message}` : message);
  }

  return payload;
}

export function registerArkAssetOpenApiRoutes(app) {
  app.post('/api/seedance/ark/assets/call', async (request, response) => {
    try {
      const payload = await callArkAssetOpenApi(request.body);
      response.json(payload);
    } catch (error) {
      response.status(500).json({ error: normalizeErrorMessage(error) });
    }
  });
}
