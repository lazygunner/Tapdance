import { TosClient } from '@volcengine/tos-sdk';
import type { TosConfig } from '../types.ts';

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export class TosUploadError extends Error {
  constructor(message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = 'TosUploadError';
  }
}

export function normalizeTosEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim();
  if (!trimmed) {
    return '';
  }

  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return new URL(trimmed).host;
    }
    return new URL(`https://${trimmed}`).host;
  } catch {
    return trimmed.replace(/^https?:\/\//u, '').replace(/\/+$/u, '');
  }
}

export function createTosClient(config: TosConfig) {
  if (!config.enabled) {
    throw new TosUploadError('TOS 配置未启用');
  }

  if (!config.accessKeyId || !config.accessKeySecret || !config.region || !config.bucket || !config.endpoint) {
    throw new TosUploadError('TOS 配置不完整，请检查 AK/SK、Region、Endpoint 和 Bucket');
  }

  const normalizedEndpoint = normalizeTosEndpoint(config.endpoint);

  return new TosClient({
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    region: config.region,
    endpoint: normalizedEndpoint,
    bucket: config.bucket,
  });
}

function getFileExtension(file: File): string {
  const nameParts = file.name.split('.');
  if (nameParts.length > 1) {
    return nameParts[nameParts.length - 1].toLowerCase();
  }
  const typeParts = file.type.split('/');
  return typeParts.length > 1 ? typeParts[1] : 'mp4';
}

function buildObjectKey(config: TosConfig, file: File): string {
  const prefix = (config.pathPrefix || 'reference-videos').replace(/\/+$/u, '');
  const id = generateId();
  const ext = getFileExtension(file);
  return `${prefix}/${id}.${ext}`;
}

function resolveTosUrl(config: TosConfig, objectKey: string): string {
  const normalizedEndpoint = normalizeTosEndpoint(config.endpoint);
  const url = new URL(`https://${normalizedEndpoint}`);
  // Virtual-hosted-style: https://{bucket}.{host}/{key}
  return `${url.protocol}//${config.bucket}.${url.host}/${objectKey}`;
}

export async function uploadVideoToTos(
  file: File,
  config: TosConfig,
  onProgress?: (percent: number) => void,
): Promise<{ url: string; key: string }> {
  try {
    const client = createTosClient(config);
    const objectKey = buildObjectKey(config, file);

    // Generate a presigned PUT URL using the SDK (correct slash handling in path)
    const presignedUrl = (client as any).getPreSignedUrl({
      bucket: config.bucket,
      key: objectKey,
      method: 'PUT',
      expires: 600, // 10 minutes
    });

    const response = await fetch(presignedUrl, {
      method: 'PUT',
      // Do NOT set Content-Type header — avoids CORS preflight for simple PUT.
      // The presigned URL already includes the signing scope.
      body: file,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
    }

    onProgress?.(100);

    const url = resolveTosUrl(config, objectKey);
    return { url, key: objectKey };
  } catch (err: unknown) {
    console.error('[TOS] Upload failed:', err);
    if (err instanceof TosUploadError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new TosUploadError(`上传视频失败：${message}`, err);
  }
}

/** Check if TOS config is complete enough to upload */
export function isTosConfigComplete(config?: TosConfig | null): boolean {
  if (!config?.enabled) return false;
  return Boolean(
    config.bucket?.trim() &&
    config.region?.trim() &&
    config.endpoint?.trim() &&
    config.accessKeyId?.trim() &&
    config.accessKeySecret?.trim()
  );
}
