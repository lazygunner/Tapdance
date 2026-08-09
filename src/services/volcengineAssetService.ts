import { loadApiSettings } from './apiConfig.ts';
import { buildSeedanceBridgeRequestUrl } from './seedanceBridgeUrl.ts';
import { isTosConfigComplete, uploadFileToTos } from './tosUploadService.ts';

const ARK_ASSET_REGION = 'cn-beijing';
const ARK_ASSET_ENDPOINT = 'https://ark.cn-beijing.volcengineapi.com';
const ARK_ASSET_VERSION = '2024-01-01';
export const DEFAULT_VIRTUAL_PORTRAIT_ASSET_GROUP_NAME = 'Tapdance 虚拟人像';
export const DEFAULT_VIRTUAL_PORTRAIT_PROJECT_NAME = 'default';
export const ARK_VIRTUAL_PORTRAIT_GROUP_TYPE = 'AIGC';
export const ARK_REAL_PORTRAIT_GROUP_TYPE = 'LivenessFace';

type ArkAssetApiAction =
  | 'CreateAssetGroup'
  | 'UpdateAssetGroup'
  | 'CreateAsset'
  | 'ListAssetGroups'
  | 'ListAssets'
  | 'GetAsset'
  | 'DeleteAsset'
  | 'DeleteAssetGroup'
  | 'CreateVisualValidateSession'
  | 'GetVisualValidateResult';

export type ArkAssetStatus = 'Processing' | 'Active' | 'Failed' | string;

export type ArkAssetGroup = {
  id: string;
  name: string;
  title: string;
  description: string;
  groupType: string;
  projectName: string;
  createTime: string;
  updateTime: string;
};

export type ArkAsset = {
  id: string;
  groupId: string;
  name: string;
  assetType: string;
  projectName: string;
  url: string;
  status: ArkAssetStatus;
  createTime: string;
  updateTime: string;
};

export type UploadVirtualPortraitAssetResult = {
  asset: ArkAsset;
  group: ArkAssetGroup;
  uploadedUrl: string;
  uploadedKey: string;
};

export type RealPortraitValidationSession = {
  bytedToken: string;
  h5Link: string;
  callbackURL: string;
};

export type UploadRealPortraitAssetResult = {
  asset: ArkAsset;
  groupId: string;
  uploadedUrl: string;
  uploadedKey: string;
};

function delay(ms: number) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

export function normalizeArkAssetStatus(value?: string): ArkAssetStatus {
  const normalized = String(value || '').trim();
  const lower = normalized.toLowerCase();
  if (lower === 'active' || lower === 'success' || lower === 'succeeded') {
    return 'Active';
  }
  if (lower === 'failed' || lower === 'fail') {
    return 'Failed';
  }
  if (lower === 'processing' || lower === 'pending' || lower === 'running') {
    return 'Processing';
  }
  return normalized || 'Processing';
}

export function isArkAssetActiveStatus(value?: string) {
  return normalizeArkAssetStatus(value) === 'Active';
}

export function isArkAssetFailedStatus(value?: string) {
  return normalizeArkAssetStatus(value) === 'Failed';
}

export function getArkAssetStatusLabel(value?: string) {
  const status = normalizeArkAssetStatus(value);
  if (status === 'Active') {
    return '已就绪';
  }
  if (status === 'Processing') {
    return '处理中';
  }
  if (status === 'Failed') {
    return '处理失败';
  }
  return status || '未知状态';
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

function unwrapArkResult(payload: any) {
  return payload?.Result && typeof payload.Result === 'object' ? payload.Result : payload;
}

function normalizeProjectName(value?: string) {
  return String(value || '').trim() || DEFAULT_VIRTUAL_PORTRAIT_PROJECT_NAME;
}

function normalizeGroupName(value?: string) {
  return String(value || '').replace(/\s+/gu, ' ').trim() || DEFAULT_VIRTUAL_PORTRAIT_ASSET_GROUP_NAME;
}

function normalizeAssetGroup(value: any): ArkAssetGroup | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const id = String(value.Id || value.id || '').trim();
  if (!id) {
    return null;
  }

  const name = String(value.Name || value.name || value.Title || value.title || '').trim();
  const title = String(value.Title || value.title || name).trim();

  return {
    id,
    name,
    title,
    description: String(value.Description || value.description || '').trim(),
    groupType: String(value.GroupType || value.groupType || '').trim(),
    projectName: String(value.ProjectName || value.projectName || DEFAULT_VIRTUAL_PORTRAIT_PROJECT_NAME).trim(),
    createTime: String(value.CreateTime || value.createTime || '').trim(),
    updateTime: String(value.UpdateTime || value.updateTime || '').trim(),
  };
}

function normalizeAsset(value: any, fallbackId?: string, fallbackGroupId?: string, fallbackProjectName?: string): ArkAsset {
  return {
    id: String(value?.Id || value?.id || fallbackId || '').trim(),
    groupId: String(value?.GroupId || value?.groupId || fallbackGroupId || '').trim(),
    name: String(value?.Name || value?.name || '').trim(),
    assetType: String(value?.AssetType || value?.assetType || 'Image').trim() || 'Image',
    projectName: String(value?.ProjectName || value?.projectName || fallbackProjectName || DEFAULT_VIRTUAL_PORTRAIT_PROJECT_NAME).trim(),
    url: String(value?.URL || value?.Url || value?.url || '').trim(),
    status: normalizeArkAssetStatus(value?.Status || value?.status),
    createTime: String(value?.CreateTime || value?.createTime || '').trim(),
    updateTime: String(value?.UpdateTime || value?.updateTime || '').trim(),
  };
}

function getArkAssetCredentials() {
  const tosConfig = loadApiSettings().tos;

  if (!isTosConfigComplete(tosConfig)) {
    throw new Error('请先在 API 配置中启用并填写 TOS 配置。素材上传需要 TOS 公网 URL，同时使用同一组 AccessKey 调用 Ark 素材资产 API。');
  }

  return {
    accessKeyId: tosConfig!.accessKeyId.trim(),
    accessKeySecret: tosConfig!.accessKeySecret.trim(),
    region: ARK_ASSET_REGION,
  };
}

async function callArkAssetApi<T>(action: ArkAssetApiAction, body: Record<string, any>, baseUrl?: string): Promise<T> {
  const payload = await requestJson<any>('/ark/assets/call', {
    method: 'POST',
    body: JSON.stringify({
      action,
      version: ARK_ASSET_VERSION,
      endpoint: ARK_ASSET_ENDPOINT,
      credentials: getArkAssetCredentials(),
      body,
    }),
  }, baseUrl);

  return unwrapArkResult(payload) as T;
}

export async function listArkAssetGroups(params?: {
  name?: string;
  groupIds?: string[];
  groupType?: string;
  projectName?: string;
  baseUrl?: string;
}) {
  const groupType = String(params?.groupType || ARK_VIRTUAL_PORTRAIT_GROUP_TYPE).trim() || ARK_VIRTUAL_PORTRAIT_GROUP_TYPE;
  const groupIds = Array.from(new Set((params?.groupIds || []).map((item) => String(item || '').trim()).filter(Boolean)));
  const pageSize = 100;
  const allItems: any[] = [];
  let pageNumber = 1;

  while (true) {
    const result = await callArkAssetApi<any>('ListAssetGroups', {
      Filter: {
        GroupType: groupType,
        ...(params?.name?.trim() ? { Name: params.name.trim() } : {}),
        ...(groupIds.length ? { GroupIds: groupIds } : {}),
      },
      PageNumber: pageNumber,
      PageSize: pageSize,
    }, params?.baseUrl);
    const pageItems = Array.isArray(result?.Items) ? result.Items : [];
    const totalCount = Number(result?.TotalCount);
    allItems.push(...pageItems);

    if (pageItems.length < pageSize || (Number.isFinite(totalCount) && allItems.length >= totalCount)) {
      break;
    }
    pageNumber += 1;
  }
  const projectName = params?.projectName ? normalizeProjectName(params.projectName) : '';

  return allItems
    .map((item: any) => normalizeAssetGroup(item))
    .filter((item: ArkAssetGroup | null): item is ArkAssetGroup => Boolean(item))
    .filter((item: ArkAssetGroup) => !projectName || item.projectName === projectName);
}

export async function listArkAssets(params?: {
  groupId?: string;
  groupIds?: string[];
  groupType?: string;
  statuses?: string[];
  name?: string;
  projectName?: string;
  pageSize?: number;
  baseUrl?: string;
}) {
  const groupIds = [
    ...(params?.groupIds || []),
    ...(params?.groupId ? [params.groupId] : []),
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  const groupType = String(params?.groupType || ARK_VIRTUAL_PORTRAIT_GROUP_TYPE).trim() || ARK_VIRTUAL_PORTRAIT_GROUP_TYPE;
  const uniqueGroupIds = Array.from(new Set(groupIds));
  const pageSize = Math.max(1, Math.min(100, params?.pageSize || 100));
  const allItems: any[] = [];
  let pageNumber = 1;

  while (true) {
    const result = await callArkAssetApi<any>('ListAssets', {
      Filter: {
        GroupType: groupType,
        ...(uniqueGroupIds.length > 0 ? { GroupIds: uniqueGroupIds } : {}),
        ...(params?.statuses?.length ? { Statuses: params.statuses.map((item) => normalizeArkAssetStatus(item)) } : {}),
        ...(params?.name?.trim() ? { Name: params.name.trim() } : {}),
      },
      PageNumber: pageNumber,
      PageSize: pageSize,
      SortBy: 'CreateTime',
      SortOrder: 'Desc',
    }, params?.baseUrl);
    const pageItems = Array.isArray(result?.Items) ? result.Items : [];
    const totalCount = Number(result?.TotalCount);
    allItems.push(...pageItems);

    if (pageItems.length < pageSize || (Number.isFinite(totalCount) && allItems.length >= totalCount)) {
      break;
    }
    pageNumber += 1;
  }
  const projectName = params?.projectName ? normalizeProjectName(params.projectName) : '';

  return allItems
    .map((item: any) => normalizeAsset(item))
    .filter((item: ArkAsset) => item.id)
    .filter((item: ArkAsset) => !projectName || item.projectName === projectName);
}

export async function createArkAssetGroup(params: {
  name: string;
  description?: string;
  projectName?: string;
  baseUrl?: string;
}) {
  const name = normalizeGroupName(params.name);
  const projectName = normalizeProjectName(params.projectName);
  const result = await callArkAssetApi<any>('CreateAssetGroup', {
    Name: name,
    Description: String(params.description || '').trim() || name,
    GroupType: 'AIGC',
    ProjectName: projectName,
  }, params.baseUrl);

  return normalizeAssetGroup({
    ...result,
    Id: result?.Id || result?.id,
    Name: result?.Name || name,
    Title: result?.Title || result?.Name || name,
    Description: result?.Description || params.description || name,
    GroupType: result?.GroupType || 'AIGC',
    ProjectName: result?.ProjectName || projectName,
  })!;
}

export async function ensureArkAssetGroup(params: {
  name?: string;
  description?: string;
  projectName?: string;
  baseUrl?: string;
}) {
  const name = normalizeGroupName(params.name);
  const projectName = normalizeProjectName(params.projectName);
  const groups = await listArkAssetGroups({ name, projectName, baseUrl: params.baseUrl });
  const existing = groups.find((group) => (
    group.projectName === projectName
    && (group.name === name || group.title === name)
  ));

  if (existing) {
    return existing;
  }

  return createArkAssetGroup({
    name,
    description: params.description,
    projectName,
    baseUrl: params.baseUrl,
  });
}

export async function createArkAsset(params: {
  groupId: string;
  url: string;
  name?: string;
  projectName?: string;
  baseUrl?: string;
}) {
  const groupId = String(params.groupId || '').trim();
  const url = String(params.url || '').trim();
  const projectName = normalizeProjectName(params.projectName);

  if (!groupId) {
    throw new Error('缺少虚拟人像资产组 ID。');
  }
  if (!url) {
    throw new Error('缺少虚拟人像图片 URL。');
  }

  const result = await callArkAssetApi<any>('CreateAsset', {
    GroupId: groupId,
    URL: url,
    Name: String(params.name || '').trim(),
    AssetType: 'Image',
    ProjectName: projectName,
  }, params.baseUrl);
  const assetId = String(result?.Id || result?.id || '').trim();

  if (!assetId) {
    throw new Error('Ark CreateAsset 未返回 Asset ID。');
  }

  return normalizeAsset(result, assetId, groupId, projectName);
}

export async function createRealPortraitValidationSession(params: {
  callbackURL: string;
  projectName?: string;
  baseUrl?: string;
}) {
  const callbackURL = String(params.callbackURL || '').trim();
  const projectName = normalizeProjectName(params.projectName);

  if (!callbackURL) {
    throw new Error('请填写 CallbackURL。');
  }

  const result = await callArkAssetApi<any>('CreateVisualValidateSession', {
    CallbackURL: callbackURL,
    ProjectName: projectName,
  }, params.baseUrl);
  const session: RealPortraitValidationSession = {
    bytedToken: String(result?.BytedToken || result?.bytedToken || '').trim(),
    h5Link: String(result?.H5Link || result?.h5Link || '').trim(),
    callbackURL: String(result?.CallbackURL || result?.callbackURL || callbackURL).trim(),
  };

  if (!session.bytedToken || !session.h5Link) {
    throw new Error('CreateVisualValidateSession 未返回 H5Link 或 BytedToken。');
  }

  return session;
}

export async function getRealPortraitValidationResult(params: {
  bytedToken: string;
  projectName?: string;
  baseUrl?: string;
}) {
  const bytedToken = String(params.bytedToken || '').trim();
  const projectName = normalizeProjectName(params.projectName);

  if (!bytedToken) {
    throw new Error('请填写 BytedToken。');
  }

  const result = await callArkAssetApi<any>('GetVisualValidateResult', {
    BytedToken: bytedToken,
    ProjectName: projectName,
  }, params.baseUrl);
  const groupId = String(result?.GroupId || result?.groupId || '').trim();

  if (!groupId) {
    throw new Error('GetVisualValidateResult 未返回 GroupId。请确认真人认证已通过且 BytedToken 未过期。');
  }

  return { groupId, projectName };
}

export async function deleteArkAsset(params: {
  assetId: string;
  projectName?: string;
  baseUrl?: string;
}) {
  const assetId = String(params.assetId || '').trim();
  if (!assetId) {
    throw new Error('缺少 Asset ID。');
  }

  await callArkAssetApi<any>('DeleteAsset', {
    Id: assetId,
    AssetId: assetId,
    ProjectName: normalizeProjectName(params.projectName),
  }, params.baseUrl);
}

export async function deleteArkAssetGroup(params: {
  groupId: string;
  projectName?: string;
  baseUrl?: string;
}) {
  const groupId = String(params.groupId || '').trim();
  if (!groupId) {
    throw new Error('缺少素材资产组合 ID。');
  }

  await callArkAssetApi<any>('DeleteAssetGroup', {
    Id: groupId,
    GroupId: groupId,
    ProjectName: normalizeProjectName(params.projectName),
  }, params.baseUrl);
}

export async function updateArkAssetGroup(params: {
  groupId: string;
  name?: string;
  description?: string;
  projectName?: string;
  baseUrl?: string;
}) {
  const groupId = String(params.groupId || '').trim();
  const name = String(params.name || '').trim();
  const description = String(params.description || '').trim();
  const hasName = Object.prototype.hasOwnProperty.call(params, 'name');
  const hasDescription = Object.prototype.hasOwnProperty.call(params, 'description');

  if (!groupId) {
    throw new Error('缺少素材资产组合 ID。');
  }
  if (name.length > 64) {
    throw new Error('Asset Group 名称不能超过 64 个字符。');
  }
  if (description.length > 300) {
    throw new Error('Asset Group 描述不能超过 300 个字符。');
  }

  const result = await callArkAssetApi<any>('UpdateAssetGroup', {
    Id: groupId,
    ...(hasName ? { Name: name } : {}),
    ...(hasDescription ? { Description: description } : {}),
    ProjectName: normalizeProjectName(params.projectName),
  }, params.baseUrl);

  return String(result?.Id || result?.id || groupId).trim();
}

export async function getArkAsset(params: {
  assetId: string;
  projectName?: string;
  baseUrl?: string;
}) {
  const assetId = String(params.assetId || '').trim();
  if (!assetId) {
    throw new Error('缺少 Asset ID。');
  }

  const result = await callArkAssetApi<any>('GetAsset', {
    Id: assetId,
    ProjectName: normalizeProjectName(params.projectName),
  }, params.baseUrl);

  return normalizeAsset(result, assetId, undefined, params.projectName);
}

export async function waitForArkAssetStatus(params: {
  assetId: string;
  projectName?: string;
  baseUrl?: string;
  intervalMs?: number;
  timeoutMs?: number;
  onStatus?: (asset: ArkAsset) => void;
}) {
  const intervalMs = Math.max(1000, params.intervalMs ?? 3000);
  const timeoutMs = Math.max(1000, params.timeoutMs ?? 20000);
  const deadline = Date.now() + timeoutMs;
  let latest = await getArkAsset(params);
  params.onStatus?.(latest);

  while (!isArkAssetActiveStatus(latest.status) && !isArkAssetFailedStatus(latest.status) && Date.now() < deadline) {
    await delay(intervalMs);
    latest = await getArkAsset(params);
    params.onStatus?.(latest);
  }

  return latest;
}

export async function uploadVirtualPortraitAsset(params: {
  file: File;
  description: string;
  groupId?: string;
  groupName?: string;
  projectName?: string;
  baseUrl?: string;
  initialStatusWaitMs?: number | null;
  onStatus?: (asset: ArkAsset) => void;
}) : Promise<UploadVirtualPortraitAssetResult> {
  if (!params.file.type.startsWith('image/')) {
    throw new Error('仅支持图片文件。');
  }
  if (params.file.size > 30 * 1024 * 1024) {
    throw new Error('单张图片需小于 30 MB。');
  }

  const tosConfig = loadApiSettings().tos;
  if (!isTosConfigComplete(tosConfig)) {
    throw new Error('请先在 API 配置中启用并填写 TOS 配置。');
  }

  const projectName = normalizeProjectName(params.projectName);
  const groupName = normalizeGroupName(params.groupName);
  const uploaded = await uploadFileToTos(params.file, tosConfig!, {
    mediaLabel: '虚拟人像图片',
    defaultPrefix: 'virtual-portraits',
  });
  const groupId = String(params.groupId || '').trim();
  const group = groupId
    ? {
        id: groupId,
        name: groupName,
        title: groupName,
        description: '',
        groupType: 'AIGC',
        projectName,
        createTime: '',
        updateTime: '',
      }
    : await ensureArkAssetGroup({
        name: groupName,
        description: `Tapdance virtual portraits: ${groupName}`,
        projectName,
        baseUrl: params.baseUrl,
      });
  const createdAsset = await createArkAsset({
    groupId: group.id,
    url: uploaded.url,
    name: params.description || params.file.name,
    projectName,
    baseUrl: params.baseUrl,
  });

  let asset = createdAsset;
  const shouldWaitForInitialStatus = typeof params.initialStatusWaitMs !== 'number' || params.initialStatusWaitMs > 0;

  if (shouldWaitForInitialStatus) {
    try {
      asset = await waitForArkAssetStatus({
        assetId: createdAsset.id,
        projectName,
        baseUrl: params.baseUrl,
        timeoutMs: params.initialStatusWaitMs ?? 20000,
        onStatus: params.onStatus,
      });
    } catch (error) {
      console.warn('Failed to refresh created Ark asset status:', error);
    }
  }

  return {
    asset,
    group,
    uploadedUrl: uploaded.url,
    uploadedKey: uploaded.key,
  };
}

export async function uploadRealPortraitAsset(params: {
  file: File;
  description: string;
  groupId: string;
  projectName?: string;
  baseUrl?: string;
  initialStatusWaitMs?: number | null;
  onStatus?: (asset: ArkAsset) => void;
}) : Promise<UploadRealPortraitAssetResult> {
  if (!params.file.type.startsWith('image/')) {
    throw new Error('仅支持图片文件。');
  }
  if (params.file.size > 30 * 1024 * 1024) {
    throw new Error('单张图片需小于 30 MB。');
  }

  const groupId = String(params.groupId || '').trim();
  if (!groupId) {
    throw new Error('缺少真人人像素材组 GroupId。');
  }

  const tosConfig = loadApiSettings().tos;
  if (!isTosConfigComplete(tosConfig)) {
    throw new Error('请先在 API 配置中启用并填写 TOS 配置。');
  }

  const projectName = normalizeProjectName(params.projectName);
  const uploaded = await uploadFileToTos(params.file, tosConfig!, {
    mediaLabel: '真人人像图片',
    defaultPrefix: 'real-portraits',
  });
  const createdAsset = await createArkAsset({
    groupId,
    url: uploaded.url,
    name: params.description || params.file.name,
    projectName,
    baseUrl: params.baseUrl,
  });

  let asset = createdAsset;
  const shouldWaitForInitialStatus = typeof params.initialStatusWaitMs !== 'number' || params.initialStatusWaitMs > 0;

  if (shouldWaitForInitialStatus) {
    try {
      asset = await waitForArkAssetStatus({
        assetId: createdAsset.id,
        projectName,
        baseUrl: params.baseUrl,
        timeoutMs: params.initialStatusWaitMs ?? 20000,
        onStatus: params.onStatus,
      });
    } catch (error) {
      console.warn('Failed to refresh created real portrait Ark asset status:', error);
    }
  }

  return {
    asset,
    groupId,
    uploadedUrl: uploaded.url,
    uploadedKey: uploaded.key,
  };
}
