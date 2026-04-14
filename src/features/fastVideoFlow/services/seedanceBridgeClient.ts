import type { SeedanceHealth } from '../types/fastTypes.ts';
import type { FastVideoInput } from '../types/fastTypes.ts';
import type { SeedanceModelVersion } from '../../seedance/types.ts';
import { buildSeedanceBridgeRequestUrl, resolveSeedanceBridgeUrl } from '../../../services/seedanceBridgeUrl.ts';

async function requestJson<T>(path: string, init?: RequestInit, explicitBaseUrl?: string): Promise<T> {
  const response = await fetch(buildSeedanceBridgeRequestUrl(path, explicitBaseUrl), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  const text = await response.text();
  let payload: any = {};

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { error: text || `HTTP ${response.status}` };
  }

  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `HTTP ${response.status}`);
  }

  return payload as T;
}

function blobToDataUrl(blob: Blob) {
  if (typeof FileReader === 'undefined') {
    return blob.arrayBuffer().then((buffer) => {
      if (typeof Buffer !== 'undefined') {
        return `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buffer).toString('base64')}`;
      }

      const bytes = new Uint8Array(buffer);
      let binary = '';
      const chunkSize = 0x8000;
      for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
      }

      if (typeof btoa === 'undefined') {
        throw new Error('当前环境不支持读取图片数据。');
      }

      return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
    });
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('读取图片失败。'));
    reader.readAsDataURL(blob);
  });
}

function stripDataUrlPrefix(dataUrl: string) {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/u);
  if (!match) {
    throw new Error('图片数据格式无效，无法提交给 Seedance bridge。');
  }

  return {
    mimeType: match[1],
    dataBase64: match[2],
  };
}

function getImageExtension(mimeType: string) {
  const normalizedMimeType = String(mimeType || '').toLowerCase();
  if (normalizedMimeType.includes('png')) {
    return 'png';
  }
  if (normalizedMimeType.includes('webp')) {
    return 'webp';
  }
  if (normalizedMimeType.includes('gif')) {
    return 'gif';
  }
  return 'jpg';
}

async function normalizeSubmitImage(sourceUrl: string, index: number) {
  const normalizedSourceUrl = String(sourceUrl || '').trim();
  if (!normalizedSourceUrl) {
    throw new Error(`第 ${index + 1} 张图片地址为空，无法提交给 Seedance bridge。`);
  }

  if (normalizedSourceUrl.startsWith('data:')) {
    const { mimeType, dataBase64 } = stripDataUrlPrefix(normalizedSourceUrl);
    return {
      filename: `scene-${index + 1}.${getImageExtension(mimeType)}`,
      mimeType,
      dataBase64,
    };
  }

  if (normalizedSourceUrl.startsWith('blob:')) {
    const response = await fetch(normalizedSourceUrl);
    if (!response.ok) {
      throw new Error(`读取第 ${index + 1} 张图片失败 (${response.status})`);
    }

    const dataUrl = await blobToDataUrl(await response.blob());
    const { mimeType, dataBase64 } = stripDataUrlPrefix(dataUrl);
    return {
      filename: `scene-${index + 1}.${getImageExtension(mimeType)}`,
      mimeType,
      dataBase64,
    };
  }

  return {
    filename: `scene-${index + 1}`,
    sourceUrl: normalizedSourceUrl,
  };
}

function isBridgeAssetLibraryUrl(sourceUrl: string, explicitBaseUrl?: string) {
  const normalizedSourceUrl = String(sourceUrl || '').trim();
  if (!normalizedSourceUrl || normalizedSourceUrl.startsWith('data:') || normalizedSourceUrl.startsWith('blob:')) {
    return false;
  }

  try {
    const resolvedUrl = new URL(resolveSeedanceBridgeUrl(normalizedSourceUrl, explicitBaseUrl), 'http://localhost');
    const bridgeBaseUrl = new URL(buildSeedanceBridgeRequestUrl('/', explicitBaseUrl) || '/', 'http://localhost');
    const isSameOrigin = resolvedUrl.origin === bridgeBaseUrl.origin;
    const isAssetLibraryPath = resolvedUrl.pathname.endsWith('/api/seedance/assets/file') || resolvedUrl.pathname.endsWith('/assets/file');
    return isSameOrigin && isAssetLibraryPath && resolvedUrl.searchParams.has('path');
  } catch {
    return normalizedSourceUrl.startsWith('/api/seedance/assets/file?') || normalizedSourceUrl.startsWith('/assets/file?');
  }
}

async function tryInlineCliImage(sourceUrl: string, index: number, explicitBaseUrl?: string) {
  const resolvedSourceUrl = resolveSeedanceBridgeUrl(sourceUrl, explicitBaseUrl);
  const response = await fetch(resolvedSourceUrl);
  if (!response.ok) {
    throw new Error(`读取第 ${index + 1} 张图片失败 (${response.status})`);
  }

  const blob = await response.blob();
  const mimeType = blob.type || response.headers.get('content-type') || '';
  if (!String(mimeType).toLowerCase().startsWith('image/')) {
    throw new Error(`第 ${index + 1} 张图片不是有效图片资源，无法提交给 Seedance bridge。`);
  }

  const dataUrl = await blobToDataUrl(blob);
  const parsed = stripDataUrlPrefix(dataUrl);
  return {
    filename: `scene-${index + 1}.${getImageExtension(parsed.mimeType)}`,
    mimeType: parsed.mimeType,
    dataBase64: parsed.dataBase64,
  };
}

async function normalizeCliSubmitImage(sourceUrl: string, index: number, explicitBaseUrl?: string) {
  const normalizedSourceUrl = String(sourceUrl || '').trim();
  if (normalizedSourceUrl.startsWith('data:') || normalizedSourceUrl.startsWith('blob:')) {
    return normalizeSubmitImage(sourceUrl, index);
  }

  const shouldInlineStrictly = isBridgeAssetLibraryUrl(sourceUrl, explicitBaseUrl);
  if (shouldInlineStrictly) {
    return tryInlineCliImage(sourceUrl, index, explicitBaseUrl);
  }

  try {
    return await tryInlineCliImage(sourceUrl, index, explicitBaseUrl);
  } catch {
    return normalizeSubmitImage(sourceUrl, index);
  }
}

export async function fetchSeedanceHealth(baseUrl?: string): Promise<SeedanceHealth> {
  return requestJson<SeedanceHealth>('/health', {
    method: 'GET',
  }, baseUrl);
}

export async function submitSeedanceTask(params: {
  projectId: string;
  prompt: string;
  imageSources: string[];
  options: {
    modelVersion: SeedanceModelVersion;
    ratio: FastVideoInput['aspectRatio'];
    duration: number;
    videoResolution: '480p' | '720p';
  };
  baseUrl?: string;
}) {
  const images = await Promise.all(params.imageSources.map((item, index) => normalizeCliSubmitImage(item, index, params.baseUrl)));
  return requestJson<{
    submitId: string;
    genStatus: string;
    raw: unknown;
  }>('/submit', {
    method: 'POST',
    body: JSON.stringify({
      projectId: params.projectId,
      prompt: params.prompt,
      images,
      options: {
        modelVersion: params.options.modelVersion,
        ratio: params.options.ratio,
        duration: params.options.duration,
        videoResolution: params.options.videoResolution,
      },
    }),
  }, params.baseUrl);
}

export async function fetchSeedanceTask(submitId: string, baseUrl?: string) {
  const payload = await requestJson<{
    submitId: string;
    genStatus: string;
    queueInfo?: {
      queue_status?: string;
      queue_idx?: number;
      queue_length?: number;
    };
    downloadedFiles?: Array<{
      name: string;
      url: string;
      size?: number;
    }>;
    raw?: unknown;
  }>(`/task/${encodeURIComponent(submitId)}`, {
    method: 'GET',
  }, baseUrl);

  return {
    ...payload,
    downloadedFiles: payload.downloadedFiles?.map((file) => ({
      ...file,
      url: resolveSeedanceBridgeUrl(file.url, baseUrl),
    })),
  };
}
