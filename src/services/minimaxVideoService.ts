import type { Asset, AspectRatio, Shot, VideoConfig } from '../types.ts';
import { loadApiSettings, resolveMinimaxBaseUrl } from './apiConfig.ts';
import { ensureInlineImageDataUrl, materializeAssetImageUrls, materializeShotImageUrls } from './requestBuilders.ts';
import { getMockVideoUrl } from './mockMedia.ts';
import type { SeedanceDraft, SeedanceMediaKind } from '../features/seedance/types.ts';

export type MinimaxVideoTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type MinimaxVideoOperation = {
  provider: 'minimax';
  taskId: string;
};

export type MinimaxVideoTask = {
  id: string;
  model: string;
  status: MinimaxVideoTaskStatus;
  created_at?: number;
  updated_at?: number;
  content?: { url?: string; prompt?: string };
  error?: { code?: string; message?: string };
  resolution?: string;
  duration?: number;
  ratio?: string;
  task_type?: 'generation' | 'h3_context_ir' | 'regeneration';
  modality?: 'video' | 'text';
  usage?: Record<string, number>;
};

export type MinimaxTaskListFilters = {
  pageNum?: number;
  pageSize?: number;
  status?: MinimaxVideoTaskStatus;
  taskIds?: string[];
  model?: string;
  taskType?: 'generation' | 'h3_context_ir' | 'regeneration';
};

function getConfig() {
  return loadApiSettings().minimax;
}

function getBaseUrl() {
  return resolveMinimaxBaseUrl(getConfig().baseUrl);
}

function getHeaders() {
  const apiKey = getConfig().apiKey.trim();
  if (!apiKey) {
    throw new Error('未配置 MiniMax API Key。');
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

async function requestJson(path: string, init: RequestInit = {}) {
  const url = `${getBaseUrl()}${path}`;
  const headers = { ...getHeaders(), ...(init.headers || {}) } as Record<string, string>;
  const electronResponse = typeof window !== 'undefined'
    && window.electronAPI?.isElectron
    && typeof window.electronAPI.requestJson === 'function'
    ? await window.electronAPI.requestJson({
      url,
      method: init.method,
      headers,
      body: typeof init.body === 'string' ? init.body : undefined,
    })
    : null;
  const browserResponse = electronResponse ? null : await fetch(url, { ...init, headers });
  const response = electronResponse || {
    ok: browserResponse!.ok,
    status: browserResponse!.status,
    statusText: browserResponse!.statusText,
    text: await browserResponse!.text(),
  };

  let payload: Record<string, any> = {};
  if (response.text) {
    try {
      payload = JSON.parse(response.text);
    } catch {
      payload = { rawText: response.text };
    }
  }

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || response.text || `HTTP ${response.status}`;
    throw new Error(`MiniMax 请求失败: ${message}`);
  }
  return payload;
}

function getVideoConfig(shot: Shot, defaultAspectRatio: AspectRatio): VideoConfig {
  return shot.videoConfig || {
    resolution: '720p',
    frameRate: 24,
    aspectRatio: defaultAspectRatio,
    useFirstFrame: true,
    useLastFrame: true,
    useReferenceAssets: false,
  };
}

function normalizeDuration(duration: number) {
  return Math.max(4, Math.min(15, Math.round(duration || 4)));
}

function normalizeResolution(resolution: VideoConfig['resolution']): '768P' | '2K' {
  return resolution === '1080p' ? '2K' : '768P';
}

function buildContent(
  prompt: string,
  options: { firstFrameUrl?: string; lastFrameUrl?: string; referenceImageUrls?: string[] },
) {
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: prompt.trim() }];
  if (options.referenceImageUrls?.length) {
    options.referenceImageUrls.slice(0, 9).forEach((url) => {
      content.push({ type: 'image_url', role: 'reference_image', image_url: { url } });
    });
    return content;
  }
  if (options.firstFrameUrl) {
    content.push({ type: 'image_url', role: 'first_frame', image_url: { url: options.firstFrameUrl } });
  }
  if (options.lastFrameUrl) {
    content.push({ type: 'image_url', role: 'last_frame', image_url: { url: options.lastFrameUrl } });
  }
  return content;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('读取 MiniMax 参考素材失败。'));
    reader.readAsDataURL(blob);
  });
}

async function materializeMediaUrl(urlOrData: string, kind: SeedanceMediaKind) {
  const normalized = urlOrData.trim();
  if (!normalized || normalized.startsWith('data:') || normalized.startsWith('mm_file://')) {
    return normalized;
  }
  if (/^https?:\/\//u.test(normalized) && !/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::|\/)/u.test(normalized)) {
    return normalized;
  }
  const response = await fetch(normalized);
  if (!response.ok) {
    throw new Error(`读取 MiniMax 参考素材失败 (${response.status})`);
  }
  const blob = await response.blob();
  if (!blob.type.toLowerCase().startsWith(`${kind}/`)) {
    throw new Error(`MiniMax 参考素材类型不正确：期望 ${kind}，实际为 ${blob.type || '未知类型'}。`);
  }
  return blobToDataUrl(blob);
}

async function createTask(body: Record<string, unknown>): Promise<MinimaxVideoOperation> {
  const payload = await requestJson('/v2/video_generation', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const taskId = String(payload.task_id || '').trim();
  if (!taskId) {
    throw new Error('MiniMax 未返回视频任务 ID。');
  }
  return { provider: 'minimax', taskId };
}

export async function startVideoGeneration(
  shot: Shot,
  defaultAspectRatio: AspectRatio,
  referenceAssets: Asset[] = [],
  useMockMode = false,
  modelName = 'MiniMax-H3',
): Promise<MinimaxVideoOperation> {
  if (useMockMode) {
    return { provider: 'minimax', taskId: `mock-op-${shot.id}` };
  }

  const [normalizedShot, normalizedAssets] = await Promise.all([
    materializeShotImageUrls(shot),
    materializeAssetImageUrls(referenceAssets),
  ]);
  const config = getVideoConfig(normalizedShot, defaultAspectRatio);
  const prompt = normalizedShot.videoPrompt?.imageToVideo || normalizedShot.videoPrompt?.textToVideo || normalizedShot.action;
  const useReferences = config.useReferenceAssets && normalizedAssets.some((asset) => asset.imageUrl);
  const content = buildContent(prompt, useReferences
    ? { referenceImageUrls: normalizedAssets.map((asset) => asset.imageUrl || '').filter(Boolean) }
    : {
      firstFrameUrl: config.useFirstFrame ? normalizedShot.imageUrl : undefined,
      lastFrameUrl: config.useLastFrame ? normalizedShot.lastFrameImageUrl : undefined,
    });
  const hasFrame = content.some((item) => item.role === 'first_frame' || item.role === 'last_frame');

  return createTask({
    model: modelName || 'MiniMax-H3',
    content,
    resolution: normalizeResolution(config.resolution),
    duration: normalizeDuration(normalizedShot.duration),
    ratio: hasFrame ? 'adaptive' : config.aspectRatio,
    aigc_watermark: Boolean(config.watermark),
  });
}

export async function startTransitionVideoGeneration(
  firstFrameUrl: string,
  lastFrameUrl: string,
  aspectRatio: AspectRatio,
  prompt = 'A smooth and natural transition between the two scenes',
  durationSeconds = 4,
  useMockMode = false,
  modelName = 'MiniMax-H3',
): Promise<MinimaxVideoOperation> {
  if (useMockMode) {
    return { provider: 'minimax', taskId: 'mock-op-transition' };
  }
  const [firstFrame, lastFrame] = await Promise.all([
    firstFrameUrl ? ensureInlineImageDataUrl(firstFrameUrl) : Promise.resolve(''),
    lastFrameUrl ? ensureInlineImageDataUrl(lastFrameUrl) : Promise.resolve(''),
  ]);
  const content = buildContent(prompt, { firstFrameUrl: firstFrame, lastFrameUrl: lastFrame });
  const hasFrame = Boolean(firstFrame || lastFrame);
  return createTask({
    model: modelName || 'MiniMax-H3',
    content,
    resolution: '768P',
    duration: normalizeDuration(durationSeconds),
    ratio: hasFrame ? 'adaptive' : aspectRatio,
    aigc_watermark: false,
  });
}

export async function startFastVideoGeneration(
  draft: SeedanceDraft,
  fallbackRatio: AspectRatio,
  useMockMode = false,
  modelName = 'MiniMax-H3',
): Promise<MinimaxVideoOperation> {
  if (useMockMode) {
    return { provider: 'minimax', taskId: `mock-fast-${Date.now()}` };
  }
  const assets = await Promise.all(draft.assets.map(async (asset) => ({
    ...asset,
    urlOrData: await materializeMediaUrl(asset.urlOrData, asset.kind),
  })));
  const isFrameMode = draft.baseTemplateId === 'first_frame' || draft.baseTemplateId === 'first_last_frame';
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: draft.prompt.rawPrompt.trim() }];
  const includedAssets = draft.baseTemplateId === 'free_text' ? [] : assets;
  includedAssets.filter((asset) => asset.urlOrData && (!isFrameMode || asset.kind === 'image')).forEach((asset) => {
    const type = `${asset.kind}_url`;
    const role = isFrameMode
      ? asset.role === 'last_frame' ? 'last_frame' : 'first_frame'
      : asset.kind === 'image'
        ? 'reference_image'
        : asset.kind === 'video'
          ? 'reference_video'
          : 'reference_audio';
    content.push({ type, role, [type]: { url: asset.urlOrData } });
  });
  const ratio = isFrameMode
    ? 'adaptive'
    : draft.options.ratio === 'adaptive'
      ? fallbackRatio
      : draft.options.ratio;
  return createTask({
    model: modelName || 'MiniMax-H3',
    content,
    resolution: normalizeResolution(draft.options.resolution),
    duration: normalizeDuration(draft.options.duration === -1 ? 10 : draft.options.duration || 10),
    ratio,
    aigc_watermark: Boolean(draft.options.watermark),
  });
}

export async function queryVideoTask(taskId: string): Promise<MinimaxVideoTask> {
  const normalizedTaskId = taskId.trim();
  if (!normalizedTaskId) {
    throw new Error('MiniMax 视频任务缺少 taskId。');
  }
  const payload = await requestJson(`/v2/query/video_generation/${encodeURIComponent(normalizedTaskId)}`, { method: 'GET' });
  if (!payload.task) {
    throw new Error('MiniMax 查询响应未包含任务信息。');
  }
  return payload.task as MinimaxVideoTask;
}

export async function listVideoTasks(filters: MinimaxTaskListFilters = {}): Promise<{ items: MinimaxVideoTask[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.pageNum) params.set('page_num', String(filters.pageNum));
  if (filters.pageSize) params.set('page_size', String(filters.pageSize));
  if (filters.status) params.set('filter.status', filters.status);
  filters.taskIds?.filter(Boolean).forEach((taskId) => params.append('filter.task_ids', taskId));
  if (filters.model) params.set('filter.model', filters.model);
  if (filters.taskType) params.set('filter.task_type', filters.taskType);
  const query = params.toString();
  const payload = await requestJson(`/v2/query/video_generation${query ? `?${query}` : ''}`, { method: 'GET' });
  return {
    items: Array.isArray(payload.items) ? payload.items as MinimaxVideoTask[] : [],
    total: Number(payload.total) || 0,
  };
}

export async function deleteOrCancelVideoTask(taskId: string): Promise<{ task_id: string; action: 'cancelled' | 'deleted'; status: 'cancelled' | 'deleted' }> {
  const normalizedTaskId = taskId.trim();
  if (!normalizedTaskId) {
    throw new Error('MiniMax 视频任务缺少 taskId。');
  }
  return requestJson(`/v2/video_generation/${encodeURIComponent(normalizedTaskId)}`, { method: 'DELETE' }) as Promise<any>;
}

export async function checkVideoStatus(operation: MinimaxVideoOperation, useMockMode = false) {
  if (useMockMode) {
    return {
      done: true,
      response: { generatedVideos: [{ video: { uri: 'mock-video-uri' } }] },
    };
  }
  const task = await queryVideoTask(operation.taskId);
  if (task.status === 'succeeded') {
    return {
      done: true,
      response: task.content?.url
        ? { generatedVideos: [{ video: { uri: task.content.url } }], minimaxTask: task }
        : { raiMediaFilteredReasons: ['MiniMax 任务成功，但未返回视频地址。'], minimaxTask: task },
    };
  }
  if (task.status === 'failed' || task.status === 'cancelled') {
    return {
      done: true,
      cancelled: task.status === 'cancelled',
      response: {
        raiMediaFilteredReasons: [task.error?.message || (task.status === 'cancelled' ? 'MiniMax 视频任务已取消。' : 'MiniMax 视频生成失败。')],
        minimaxTask: task,
      },
    };
  }
  return { done: false, response: { minimaxTask: task } };
}

export async function cancelVideoOperation(operation: MinimaxVideoOperation, useMockMode = false) {
  if (useMockMode) return;
  await deleteOrCancelVideoTask(operation.taskId);
}

export async function fetchVideoBlobUrl(uri: string, useMockMode = false) {
  if (useMockMode && uri === 'mock-video-uri') {
    return getMockVideoUrl();
  }
  return uri;
}
