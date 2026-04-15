import { buildSeedanceBridgeRequestUrl } from './seedanceBridgeUrl.ts';
import { loadPersistedAppState, savePersistedAppState } from '../features/app/services/appStateStore.ts';

export type PortraitLibraryConfig = {
  rootPath: string;
  configured: boolean;
};

export type RealPortraitLibraryAsset = {
  id: string;
  description: string;
  assetId: string;
  imageUrl: string;
  createdAt: string;
};

const REAL_PORTRAIT_LIBRARY_STATE_KEY = 'portraitLibrary.realAssets';

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

function normalizeRealPortraitLibraryAsset(value: unknown): RealPortraitLibraryAsset | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<RealPortraitLibraryAsset>;
  const id = String(candidate.id || '').trim();
  const description = String(candidate.description || '').trim();
  const assetId = String(candidate.assetId || '').trim();
  const imageUrl = String(candidate.imageUrl || '').trim();
  const createdAt = String(candidate.createdAt || '').trim() || new Date().toISOString();

  if (!id || !description || !assetId || !imageUrl) {
    return null;
  }

  return {
    id,
    description,
    assetId,
    imageUrl,
    createdAt,
  };
}

export async function fetchRealPortraitLibraryAssets(baseUrl?: string) {
  const persisted = await loadPersistedAppState<RealPortraitLibraryAsset[]>(REAL_PORTRAIT_LIBRARY_STATE_KEY, baseUrl);
  const items = Array.isArray(persisted.value)
    ? persisted.value
      .map((item) => normalizeRealPortraitLibraryAsset(item))
      .filter((item): item is RealPortraitLibraryAsset => Boolean(item))
    : [];

  return items.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function saveRealPortraitLibraryAssets(items: RealPortraitLibraryAsset[], baseUrl?: string) {
  const normalizedItems = items
    .map((item) => normalizeRealPortraitLibraryAsset(item))
    .filter((item): item is RealPortraitLibraryAsset => Boolean(item))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  await savePersistedAppState(REAL_PORTRAIT_LIBRARY_STATE_KEY, normalizedItems, baseUrl);
  return normalizedItems;
}
