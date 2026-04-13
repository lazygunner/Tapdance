import { buildSeedanceBridgeRequestUrl } from './seedanceBridgeUrl.ts';

export type PortraitLibraryConfig = {
  rootPath: string;
  configured: boolean;
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

export function getPortraitLibraryRelativePath(sourceUrl?: string) {
  const normalizedSourceUrl = String(sourceUrl || '').trim();
  if (!normalizedSourceUrl) {
    return '';
  }

  try {
    const parsed = new URL(
      normalizedSourceUrl,
      typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1',
    );
    const marker = '/portraits/';
    const markerIndex = parsed.pathname.lastIndexOf(marker);
    if (markerIndex === -1) {
      return '';
    }
    return decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
  } catch {
    const marker = '/portraits/';
    const markerIndex = normalizedSourceUrl.lastIndexOf(marker);
    if (markerIndex === -1) {
      return '';
    }
    return decodeURIComponent(normalizedSourceUrl.slice(markerIndex + marker.length));
  }
}

export function buildPortraitLibraryFileUrl(relativePath: string, baseUrl?: string) {
  const safeRelativePath = String(relativePath || '').trim();
  if (!safeRelativePath) {
    return '';
  }
  return buildSeedanceBridgeRequestUrl(`/portraits/file?path=${encodeURIComponent(safeRelativePath)}`, baseUrl);
}

export function fetchPortraitLibraryConfig(baseUrl?: string) {
  return requestJson<PortraitLibraryConfig>('/portraits/config', { method: 'GET' }, baseUrl);
}

export function updatePortraitLibraryConfig(params: { rootPath?: string; baseUrl?: string }) {
  return requestJson<PortraitLibraryConfig>('/portraits/config', {
    method: 'POST',
    body: JSON.stringify({
      rootPath: params.rootPath || '',
    }),
  }, params.baseUrl);
}
