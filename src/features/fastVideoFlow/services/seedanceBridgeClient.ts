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

function getMediaExtension(mimeType: string, kind: 'image' | 'video' | 'audio') {
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
  if (normalizedMimeType.includes('mpeg') || normalizedMimeType.includes('mp3')) {
    return 'mp3';
  }
  if (normalizedMimeType.includes('wav') || normalizedMimeType.includes('wave')) {
    return 'wav';
  }
  if (normalizedMimeType.includes('quicktime')) {
    return 'mov';
  }
  if (normalizedMimeType.includes('webm')) {
    return 'webm';
  }
  if (normalizedMimeType.includes('mp4')) {
    return 'mp4';
  }
  if (kind === 'video') {
    return 'mp4';
  }
  if (kind === 'audio') {
    return 'mp3';
  }
  return 'jpg';
}

async function normalizeSubmitMediaSource(sourceUrl: string, index: number, kind: 'image' | 'video' | 'audio') {
  const normalizedSourceUrl = String(sourceUrl || '').trim();
  if (!normalizedSourceUrl) {
    const label = kind === 'image' ? '图片' : kind === 'video' ? '视频' : '音频';
    throw new Error(`第 ${index + 1} 个${label}地址为空，无法提交给 Seedance bridge。`);
  }

  const fileBaseName = kind === 'image' ? `scene-${index + 1}` : `${kind}-${index + 1}`;

  if (normalizedSourceUrl.startsWith('data:')) {
    const { mimeType, dataBase64 } = stripDataUrlPrefix(normalizedSourceUrl);
    return {
      filename: `${fileBaseName}.${getMediaExtension(mimeType, kind)}`,
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
      filename: `${fileBaseName}.${getMediaExtension(mimeType, kind)}`,
      mimeType,
      dataBase64,
    };
  }

  return {
    filename: fileBaseName,
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
    filename: `scene-${index + 1}.${getMediaExtension(parsed.mimeType, 'image')}`,
    mimeType: parsed.mimeType,
    dataBase64: parsed.dataBase64,
  };
}

async function normalizeCliSubmitImage(sourceUrl: string, index: number, explicitBaseUrl?: string) {
  const normalizedSourceUrl = String(sourceUrl || '').trim();
  if (normalizedSourceUrl.startsWith('data:') || normalizedSourceUrl.startsWith('blob:')) {
    return normalizeSubmitMediaSource(sourceUrl, index, 'image');
  }

  const shouldInlineStrictly = isBridgeAssetLibraryUrl(sourceUrl, explicitBaseUrl);
  if (shouldInlineStrictly) {
    return tryInlineCliImage(sourceUrl, index, explicitBaseUrl);
  }

  try {
    return await tryInlineCliImage(sourceUrl, index, explicitBaseUrl);
  } catch {
    return normalizeSubmitMediaSource(sourceUrl, index, 'image');
  }
}

async function normalizeCliSubmitVideo(sourceUrl: string, index: number) {
  return normalizeSubmitMediaSource(sourceUrl, index, 'video');
}

async function normalizeCliSubmitAudio(sourceUrl: string, index: number) {
  return normalizeSubmitMediaSource(sourceUrl, index, 'audio');
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
  videoSources?: string[];
  audioSources?: string[];
  options: {
    modelVersion: SeedanceModelVersion;
    ratio: FastVideoInput['aspectRatio'];
    duration: number;
    videoResolution: '480p' | '720p';
  };
  baseUrl?: string;
}) {
  const [images, videos, audios] = await Promise.all([
    Promise.all(params.imageSources.map((item, index) => normalizeCliSubmitImage(item, index, params.baseUrl))),
    Promise.all((params.videoSources || []).map((item, index) => normalizeCliSubmitVideo(item, index))),
    Promise.all((params.audioSources || []).map((item, index) => normalizeCliSubmitAudio(item, index))),
  ]);
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
      videos,
      audios,
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
