import { TosClient } from '@volcengine/tos-sdk';
import type { TosConfig } from '../types.ts';

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export class TosUploadError extends Error {
  constructor(
    message: string,
    public readonly originalError?: unknown,
    public readonly reason?: 'cors',
  ) {
    super(message);
    this.name = 'TosUploadError';
  }
}

export function isLikelyTosCorsError(error: unknown): error is TosUploadError {
  return error instanceof TosUploadError && error.reason === 'cors';
}

function normalizeTosUploadErrorMessage(message: string): string {
  return String(message || '')
    .replace(/^Error invoking remote method 'tos:uploadVideo':\s*/u, '')
    .trim();
}

function stripBucketPrefixFromEndpoint(host: string, bucket?: string): string {
  const normalizedHost = String(host || '').trim();
  const normalizedBucket = String(bucket || '').trim();
  if (!normalizedHost || !normalizedBucket) {
    return normalizedHost;
  }

  const lowerHost = normalizedHost.toLowerCase();
  const lowerBucket = normalizedBucket.toLowerCase();
  const bucketPrefix = `${lowerBucket}.`;
  if (lowerHost.startsWith(bucketPrefix)) {
    return normalizedHost.slice(bucketPrefix.length);
  }

  return normalizedHost;
}

export function normalizeTosEndpoint(endpoint: string, bucket?: string): string {
  const trimmed = endpoint.trim();
  if (!trimmed) {
    return '';
  }

  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return stripBucketPrefixFromEndpoint(new URL(trimmed).host, bucket);
    }
    return stripBucketPrefixFromEndpoint(new URL(`https://${trimmed}`).host, bucket);
  } catch {
    return stripBucketPrefixFromEndpoint(trimmed.replace(/^https?:\/\//u, '').replace(/\/+$/u, ''), bucket);
  }
}

export function createTosClient(config: TosConfig) {
  if (!config.enabled) {
    throw new TosUploadError('TOS 配置未启用');
  }

  if (!config.accessKeyId || !config.accessKeySecret || !config.region || !config.bucket || !config.endpoint) {
    throw new TosUploadError('TOS 配置不完整，请检查 AK/SK、Region、Endpoint 和 Bucket');
  }

  const normalizedEndpoint = normalizeTosEndpoint(config.endpoint, config.bucket);

  return new TosClient({
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    region: config.region,
    endpoint: normalizedEndpoint,
    bucket: config.bucket,
  });
}

export type TosUploadFileMeta = {
  name: string;
  type?: string;
};

function getFileExtension(file: TosUploadFileMeta): string {
  const nameParts = file.name.split('.');
  if (nameParts.length > 1) {
    return nameParts[nameParts.length - 1].toLowerCase();
  }
  const typeParts = String(file.type || '').split('/');
  return typeParts.length > 1 ? typeParts[1] : 'mp4';
}

export function buildTosObjectKey(config: TosConfig, file: TosUploadFileMeta): string {
  const prefix = (config.pathPrefix || 'reference-videos').replace(/\/+$/u, '');
  const id = generateId();
  const ext = getFileExtension(file);
  return `${prefix}/${id}.${ext}`;
}

export function resolveTosUrl(config: TosConfig, objectKey: string): string {
  const normalizedEndpoint = normalizeTosEndpoint(config.endpoint, config.bucket);
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
    if (typeof window !== 'undefined' && typeof window.electronAPI?.uploadVideoToTos === 'function' && window.electronAPI.isElectron) {
      const result = await window.electronAPI.uploadVideoToTos({
        config,
        fileName: file.name,
        fileType: file.type,
        data: await file.arrayBuffer(),
      });
      onProgress?.(100);
      return result;
    }

    const client = createTosClient(config);
    const objectKey = buildTosObjectKey(config, file);

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
    const message = normalizeTosUploadErrorMessage(err instanceof Error ? err.message : String(err));
    if (err instanceof TypeError && /Failed to fetch/i.test(message)) {
      const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
      const originHint = currentOrigin ? `请将 ${currentOrigin} 加入 Bucket CORS 的 AllowedOrigin。` : '请将当前应用域名加入 Bucket CORS 的 AllowedOrigin。';
      throw new TosUploadError(`上传视频失败：浏览器无法直传到 TOS，疑似 Bucket 跨域配置缺失。${originHint}`, err, 'cors');
    }
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
