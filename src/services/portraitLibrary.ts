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

export type SeedreamGeneratedPortraitAsset = {
  id: string;
  description: string;
  model: string;
  prompt: string;
  expandedPrompt: string;
  imageUrl: string;
  createdAt: string;
};

export type VirtualPortraitLibraryAsset = {
  id: string;
  description: string;
  assetId: string;
  imageUrl: string;
  groupId: string;
  groupName: string;
  projectName: string;
  status: string;
  sourceUrl: string;
  createdAt: string;
  updatedAt: string;
};

const REAL_PORTRAIT_LIBRARY_STATE_KEY = 'portraitLibrary.realAssets';
const VIRTUAL_PORTRAIT_LIBRARY_STATE_KEY = 'portraitLibrary.virtualAssets';
const SEEDREAM_GENERATED_PORTRAIT_LIBRARY_STATE_KEY = 'portraitLibrary.seedreamGeneratedAssets';

export const SEEDREAM_GENERATED_PORTRAIT_MODEL = 'doubao-seedream-5-0-260128';

export function buildSeedreamGeneratedPortraitPrompt(prompt: string) {
  const normalizedPrompt = String(prompt || '').trim();
  return [
    '用户角色设定：',
    normalizedPrompt,
    '',
    '请将上述角色设定作为唯一角色参考，生成角色设计标准三视图：正视图呈现角色正面全貌，注重身体比例与服饰细节刻画；侧视图展现角色侧面轮廓，强调线条流畅性与立体感塑造；背视图呈现角色背面造型，突出背部装饰与整体协调性。在最左侧添加角色面部正视图的特写，聚焦五官细节与表情刻画，运用细腻光影凸显面部层次感。背景修改成纯白色，整体保持与角色设定一致的美术风格和色彩搭配。比例16:9。',
    '',
    '版式要求：从左到右依次为面部五官放大特写、正视图、侧视图、背视图；四个视图必须是同一个角色，五官、发型、体型、服饰、材质和色彩保持一致；画面中不要出现文字、Logo、水印、标尺或注释。',
  ].join('\n');
}

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

function normalizeSeedreamGeneratedPortraitAsset(value: unknown): SeedreamGeneratedPortraitAsset | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<SeedreamGeneratedPortraitAsset>;
  const id = String(candidate.id || '').trim();
  const prompt = String(candidate.prompt || '').trim();
  const imageUrl = String(candidate.imageUrl || '').trim();
  const expandedPrompt = String(candidate.expandedPrompt || '').trim();
  const description = String(candidate.description || '').trim() || prompt.slice(0, 48) || 'Seedream 生成虚拟人像';
  const model = String(candidate.model || '').trim() || SEEDREAM_GENERATED_PORTRAIT_MODEL;
  const createdAt = String(candidate.createdAt || '').trim() || new Date().toISOString();

  if (!id || !prompt || !expandedPrompt || !imageUrl) {
    return null;
  }

  return {
    id,
    description,
    model,
    prompt,
    expandedPrompt,
    imageUrl,
    createdAt,
  };
}

function normalizeVirtualPortraitLibraryAsset(value: unknown): VirtualPortraitLibraryAsset | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<VirtualPortraitLibraryAsset>;
  const id = String(candidate.id || '').trim();
  const description = String(candidate.description || '').trim();
  const assetId = String(candidate.assetId || '').trim();
  const imageUrl = String(candidate.imageUrl || '').trim();
  const createdAt = String(candidate.createdAt || '').trim() || new Date().toISOString();
  const updatedAt = String(candidate.updatedAt || '').trim() || createdAt;

  if (!id || !description || !assetId || !imageUrl) {
    return null;
  }

  return {
    id,
    description,
    assetId,
    imageUrl,
    groupId: String(candidate.groupId || '').trim(),
    groupName: String(candidate.groupName || '').trim(),
    projectName: String(candidate.projectName || '').trim() || 'default',
    status: String(candidate.status || '').trim() || 'Processing',
    sourceUrl: String(candidate.sourceUrl || '').trim(),
    createdAt,
    updatedAt,
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

export async function fetchVirtualPortraitLibraryAssets(baseUrl?: string) {
  const persisted = await loadPersistedAppState<VirtualPortraitLibraryAsset[]>(VIRTUAL_PORTRAIT_LIBRARY_STATE_KEY, baseUrl);
  const items = Array.isArray(persisted.value)
    ? persisted.value
      .map((item) => normalizeVirtualPortraitLibraryAsset(item))
      .filter((item): item is VirtualPortraitLibraryAsset => Boolean(item))
    : [];

  return items.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function saveVirtualPortraitLibraryAssets(items: VirtualPortraitLibraryAsset[], baseUrl?: string) {
  const normalizedItems = items
    .map((item) => normalizeVirtualPortraitLibraryAsset(item))
    .filter((item): item is VirtualPortraitLibraryAsset => Boolean(item))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  await savePersistedAppState(VIRTUAL_PORTRAIT_LIBRARY_STATE_KEY, normalizedItems, baseUrl);
  return normalizedItems;
}

export async function fetchSeedreamGeneratedPortraitAssets(baseUrl?: string) {
  const persisted = await loadPersistedAppState<SeedreamGeneratedPortraitAsset[]>(SEEDREAM_GENERATED_PORTRAIT_LIBRARY_STATE_KEY, baseUrl);
  const items = Array.isArray(persisted.value)
    ? persisted.value
      .map((item) => normalizeSeedreamGeneratedPortraitAsset(item))
      .filter((item): item is SeedreamGeneratedPortraitAsset => Boolean(item))
    : [];

  return items.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function saveSeedreamGeneratedPortraitAssets(items: SeedreamGeneratedPortraitAsset[], baseUrl?: string) {
  const normalizedItems = items
    .map((item) => normalizeSeedreamGeneratedPortraitAsset(item))
    .filter((item): item is SeedreamGeneratedPortraitAsset => Boolean(item))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  await savePersistedAppState(SEEDREAM_GENERATED_PORTRAIT_LIBRARY_STATE_KEY, normalizedItems, baseUrl);
  return normalizedItems;
}
