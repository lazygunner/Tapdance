import { buildSeedanceBridgeRequestUrl, resolveSeedanceBridgeUrl } from './seedanceBridgeUrl.ts';

export type AssetLibraryConfig = {
  rootPath: string;
  defaultRootPath: string;
  usingDefaultPath: boolean;
};

export type AssetLibrarySavedFile = {
  rootPath: string;
  relativePath: string;
  absolutePath: string;
  fileName: string;
  kind: 'image' | 'video';
  url: string;
};

export type AssetLibraryCopiedFile = {
  relativePath: string;
  destinationPath: string;
  fileName: string;
};

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

function stripDataUrlPrefix(dataUrl: string) {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/u);
  if (!match) {
    throw new Error('媒体数据格式无效，无法写入资产库。');
  }

  return {
    mimeType: match[1],
    dataBase64: match[2],
  };
}

function assertAssetMimeType(kind: 'image' | 'video', mimeType: string) {
  const normalizedMimeType = String(mimeType || '').toLowerCase();
  const isExpectedType = kind === 'image'
    ? normalizedMimeType.startsWith('image/')
    : normalizedMimeType.startsWith('video/');

  if (!isExpectedType) {
    throw new Error(kind === 'image'
      ? '读取到的文件不是图片，已取消保存。'
      : '读取到的文件不是视频，已取消保存。');
  }
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('读取媒体文件失败。'));
    reader.readAsDataURL(blob);
  });
}

async function urlToDataUrl(sourceUrl: string, explicitBaseUrl?: string) {
  const normalizedSourceUrl = String(sourceUrl || '').trim();
  if (!normalizedSourceUrl) {
    throw new Error('媒体地址为空，无法写入资产库。');
  }

  if (normalizedSourceUrl.startsWith('data:')) {
    return normalizedSourceUrl;
  }

  const response = await fetch(resolveSeedanceBridgeUrl(normalizedSourceUrl, explicitBaseUrl));
  if (!response.ok) {
    throw new Error(`读取媒体文件失败 (${response.status})`);
  }

  return blobToDataUrl(await response.blob());
}

function isBrowserLocalMediaUrl(sourceUrl: string) {
  const normalizedSourceUrl = String(sourceUrl || '').trim();
  return normalizedSourceUrl.startsWith('data:') || normalizedSourceUrl.startsWith('blob:');
}

export async function fetchAssetLibraryConfig(baseUrl?: string) {
  return requestJson<AssetLibraryConfig>('/assets/config', {
    method: 'GET',
  }, baseUrl);
}

export async function updateAssetLibraryConfig(params: {
  rootPath?: string;
  migrateExistingFiles?: boolean;
  baseUrl?: string;
}) {
  return requestJson<AssetLibraryConfig>('/assets/config', {
    method: 'POST',
    body: JSON.stringify({
      rootPath: params.rootPath || '',
      migrateExistingFiles: params.migrateExistingFiles !== false,
    }),
  }, params.baseUrl);
}

export async function copyAssetLibraryFilesToDownloads(params: {
  relativePaths: string[];
  baseUrl?: string;
}) {
  const relativePaths = Array.from(new Set(params.relativePaths.map((item) => item.trim()).filter(Boolean)));
  return requestJson<{
    downloadsDir: string;
    copiedFiles: AssetLibraryCopiedFile[];
  }>('/assets/copy-to-downloads', {
    method: 'POST',
    body: JSON.stringify({ relativePaths }),
  }, params.baseUrl);
}

export async function saveMediaToAssetLibrary(params: {
  sourceUrl: string;
  kind: 'image' | 'video';
  assetId: string;
  title: string;
  groupName: string;
  projectName: string;
  fileNameHint?: string;
  baseUrl?: string;
}) {
  const normalizedSourceUrl = String(params.sourceUrl || '').trim();
  if (!normalizedSourceUrl) {
    throw new Error('媒体地址为空，无法写入资产库。');
  }

  const requestBody: Record<string, string> = {
    kind: params.kind,
    assetId: params.assetId,
    title: params.title,
    groupName: params.groupName,
    projectName: params.projectName,
    fileName: params.fileNameHint || '',
  };

  if (isBrowserLocalMediaUrl(normalizedSourceUrl)) {
    const dataUrl = await urlToDataUrl(normalizedSourceUrl, params.baseUrl);
    const { mimeType, dataBase64 } = stripDataUrlPrefix(dataUrl);
    assertAssetMimeType(params.kind, mimeType);
    requestBody.mimeType = mimeType;
    requestBody.dataBase64 = dataBase64;
  } else {
    requestBody.sourceUrl = resolveSeedanceBridgeUrl(normalizedSourceUrl, params.baseUrl);
  }

  const savedFile = await requestJson<AssetLibrarySavedFile>('/assets/save', {
    method: 'POST',
    body: JSON.stringify(requestBody),
  }, params.baseUrl);

  return {
    ...savedFile,
    url: resolveSeedanceBridgeUrl(savedFile.url, params.baseUrl),
  };
}

export function isAssetLibraryUrl(url?: string) {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(
      resolveSeedanceBridgeUrl(url),
      typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1',
    );
    return parsed.pathname.endsWith('/api/seedance/assets/file') || parsed.pathname.endsWith('/assets/file');
  } catch {
    return false;
  }
}

export function getAssetLibraryRelativePath(url?: string) {
  if (!url) {
    return '';
  }

  try {
    const parsed = new URL(
      resolveSeedanceBridgeUrl(url),
      typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1',
    );
    return decodeURIComponent(parsed.searchParams.get('path') || '');
  } catch {
    return '';
  }
}
