import type { SeedanceApiTask, SeedanceDraft } from '../../seedance/types.ts';
import type {
  VideoEditOperation,
  VideoEditProject,
  VideoEditReferenceImage,
  VideoEditSource,
  VideoEditTask,
  VideoEditTaskStatus,
} from '../types.ts';

const OPERATION_LABELS: Record<VideoEditOperation, string> = {
  add: '新增',
  remove: '移除',
  replace: '替换',
};

export const VIDEO_EDIT_MAX_DURATION_SEC = 30;
export const VIDEO_EDIT_DURATION_TOLERANCE_SEC = 1;

export function normalizeVideoEditSourceDuration(durationSec?: number): number | undefined {
  if (typeof durationSec !== 'number' || !Number.isFinite(durationSec)) return undefined;
  if (durationSec > VIDEO_EDIT_MAX_DURATION_SEC
    && durationSec <= VIDEO_EDIT_MAX_DURATION_SEC + VIDEO_EDIT_DURATION_TOLERANCE_SEC) {
    return VIDEO_EDIT_MAX_DURATION_SEC;
  }
  return durationSec;
}

export function createEmptyVideoEditTask(): VideoEditTask {
  return {
    taskId: '',
    status: 'idle',
    remoteStatus: '',
    videoUrl: '',
    lastFrameUrl: '',
    error: '',
    startedAt: '',
    finishedAt: '',
    lastCheckedAt: '',
  };
}

export function createEmptyVideoEditProject(): VideoEditProject {
  return {
    operation: 'replace',
    sourceVideo: null,
    referenceImages: [],
    targetDescription: '',
    resultDescription: '',
    temporalHint: '',
    spatialHint: '',
    preserveSubject: true,
    preserveBackground: true,
    preserveCamera: true,
    resolution: '720p',
    outputFormat: 'mp4',
    generateAudio: true,
    watermark: false,
    compiledPrompt: '',
    task: createEmptyVideoEditTask(),
  };
}

function normalizeSource(value?: Partial<VideoEditSource> | null): VideoEditSource | null {
  const url = typeof value?.url === 'string' ? value.url.trim() : '';
  if (!url) return null;
  const origin = value?.origin === 'upload' || value?.origin === 'result' ? value.origin : 'url';
  return {
    url,
    fileName: typeof value?.fileName === 'string' ? value.fileName : '',
    storageKey: typeof value?.storageKey === 'string' ? value.storageKey : '',
    origin,
    durationSec: normalizeVideoEditSourceDuration(value?.durationSec),
    width: typeof value?.width === 'number' ? value.width : undefined,
    height: typeof value?.height === 'number' ? value.height : undefined,
    sizeBytes: typeof value?.sizeBytes === 'number' ? value.sizeBytes : undefined,
  };
}

function normalizeReferenceImages(value?: Array<Partial<VideoEditReferenceImage>>): VideoEditReferenceImage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      id: typeof item.id === 'string' && item.id.trim() ? item.id : crypto.randomUUID(),
      url: typeof item.url === 'string' ? item.url.trim() : '',
      fileName: typeof item.fileName === 'string' ? item.fileName : '',
      storageKey: typeof item.storageKey === 'string' ? item.storageKey : '',
    }))
    .filter((item) => item.url)
    .slice(0, 8);
}

export function normalizeVideoEditProject(value?: Partial<VideoEditProject> | null): VideoEditProject {
  const fallback = createEmptyVideoEditProject();
  const task = value?.task || fallback.task;
  const operation = value?.operation === 'add' || value?.operation === 'remove' || value?.operation === 'replace'
    ? value.operation
    : fallback.operation;
  const status: VideoEditTaskStatus = [
    'idle', 'uploading', 'submitting', 'queued', 'generating', 'completed', 'failed', 'cancelled',
  ].includes(String(task.status)) ? task.status as VideoEditTaskStatus : 'idle';

  return {
    ...fallback,
    ...value,
    operation,
    sourceVideo: normalizeSource(value?.sourceVideo),
    referenceImages: normalizeReferenceImages(value?.referenceImages),
    targetDescription: typeof value?.targetDescription === 'string' ? value.targetDescription : '',
    resultDescription: typeof value?.resultDescription === 'string' ? value.resultDescription : '',
    temporalHint: typeof value?.temporalHint === 'string' ? value.temporalHint : '',
    spatialHint: typeof value?.spatialHint === 'string' ? value.spatialHint : '',
    resolution: value?.resolution === '480p' ? '480p' : '720p',
    outputFormat: value?.outputFormat === 'mov' ? 'mov' : 'mp4',
    task: {
      ...fallback.task,
      ...task,
      status,
      raw: task.raw && typeof task.raw === 'object' ? task.raw : undefined,
    },
  };
}

export function buildVideoEditPrompt(flow: VideoEditProject): string {
  const operationLabel = OPERATION_LABELS[flow.operation];
  const lines = [
    `编辑视频1，执行${operationLabel}操作。`,
    flow.targetDescription.trim() ? `编辑目标：${flow.targetDescription.trim()}。` : '',
  ];

  if (flow.operation === 'remove') {
    lines.push('移除目标后自然补全被遮挡区域，保持前后帧连续、光影和纹理一致。');
  } else {
    lines.push(flow.resultDescription.trim() ? `期望结果：${flow.resultDescription.trim()}。` : '');
  }

  if (flow.referenceImages.length > 0) {
    lines.push(`参考${flow.referenceImages.map((_, index) => `图片${index + 1}`).join('、')}的外观、材质与细节。`);
  }
  if (flow.temporalHint.trim()) lines.push(`时间范围：${flow.temporalHint.trim()}。`);
  if (flow.spatialHint.trim()) lines.push(`空间位置：${flow.spatialHint.trim()}。`);

  const preserve: string[] = [];
  if (flow.preserveSubject) preserve.push('主体身份、动作和姿态');
  if (flow.preserveBackground) preserve.push('背景结构、光影和色调');
  if (flow.preserveCamera) preserve.push('镜头运动、景别和构图');
  if (preserve.length > 0) lines.push(`除编辑区域外，严格保持${preserve.join('、')}不变。`);
  lines.push('输出与视频1等长、同画幅，编辑边缘自然，避免闪烁、漂移、重复物体和突兀形变。');

  return lines.filter(Boolean).join('\n');
}

export function validateVideoEditProject(flow: VideoEditProject): string[] {
  const errors: string[] = [];
  if (!flow.sourceVideo?.url.trim()) errors.push('请先上传视频或填写视频公网 URL。');
  if (flow.sourceVideo?.durationSec && (flow.sourceVideo.durationSec < 4 || flow.sourceVideo.durationSec > 30)) {
    errors.push('待编辑视频时长需在 4–30 秒之间。');
  }
  if (!flow.targetDescription.trim()) errors.push('请描述需要编辑的对象或区域。');
  if (flow.operation !== 'remove' && !flow.resultDescription.trim()) errors.push('请描述编辑后的期望结果。');
  if (flow.referenceImages.length > 8) errors.push('参考图片最多 8 张。');
  return errors;
}

export function buildVideoEditSeedanceDraft(flow: VideoEditProject): SeedanceDraft {
  const prompt = buildVideoEditPrompt(flow);
  return {
    baseTemplateId: 'video_edit',
    overlayTemplateIds: [],
    assets: [
      ...(flow.sourceVideo ? [{
        id: 'video-1',
        kind: 'video' as const,
        source: flow.sourceVideo.origin === 'url' ? 'url' as const : 'upload' as const,
        urlOrData: flow.sourceVideo.url,
        role: 'reference_video' as const,
        label: '视频1',
        durationSec: flow.sourceVideo.durationSec,
        sizeBytes: flow.sourceVideo.sizeBytes,
        width: flow.sourceVideo.width,
        height: flow.sourceVideo.height,
      }] : []),
      ...flow.referenceImages.map((image, index) => ({
        id: image.id,
        kind: 'image' as const,
        source: image.storageKey ? 'upload' as const : 'url' as const,
        urlOrData: image.url,
        role: 'reference_image' as const,
        label: `图片${index + 1}`,
      })),
    ],
    prompt: {
      rawPrompt: prompt,
      diagnostics: [],
    },
    options: {
      ratio: 'adaptive',
      duration: -1,
      resolution: flow.resolution,
      outputFormat: flow.outputFormat,
      generateAudio: flow.generateAudio,
      returnLastFrame: true,
      useWebSearch: false,
      watermark: flow.watermark,
    },
  };
}

export function mapVideoEditRemoteStatus(status?: string): VideoEditTaskStatus {
  const normalized = (status || '').trim().toLowerCase();
  if (normalized === 'succeeded' || normalized === 'success') return 'completed';
  if (normalized === 'failed' || normalized === 'fail' || normalized === 'error' || normalized === 'expired') return 'failed';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelled';
  if (normalized === 'queued' || normalized === 'pending') return 'queued';
  return 'generating';
}

export function mergeVideoEditApiTask(previous: VideoEditTask, task: SeedanceApiTask): VideoEditTask {
  const status = mapVideoEditRemoteStatus(task.status);
  const now = new Date().toISOString();
  const finishedAt = status === 'completed' || status === 'failed' || status === 'cancelled'
    ? previous.finishedAt || now
    : '';
  return {
    ...previous,
    taskId: task.id || previous.taskId,
    status,
    remoteStatus: task.status || previous.remoteStatus,
    videoUrl: task.videoUrl || previous.videoUrl,
    lastFrameUrl: task.lastFrameUrl || previous.lastFrameUrl,
    error: task.error?.message || (status === 'failed' ? '视频编辑任务失败。' : ''),
    startedAt: previous.startedAt || now,
    finishedAt,
    lastCheckedAt: now,
    raw: task.raw,
  };
}
