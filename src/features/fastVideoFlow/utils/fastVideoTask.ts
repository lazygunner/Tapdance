import type { FastVideoInput } from '../types/fastTypes.ts';
import type { SeedanceBaseTemplateId } from '../../seedance/types.ts';
import type { Project } from '../../../types.ts';
import { syncFastFlowSeedanceDraft } from '../services/fastFlowMappers.ts';
import { validateSeedanceDraft } from '../../seedance/services/seedanceDraft.ts';

export function buildFastProjectName(input: FastVideoInput): string {
  const prompt = (input.prompt || '').trim();
  if (!prompt) {
    return '未命名极速视频';
  }

  return `${prompt.slice(0, 18)}${prompt.length > 18 ? '…' : ''}`;
}

export function inferFastFlowTemplateId(input: FastVideoInput, sceneCount: number): SeedanceBaseTemplateId {
  if (input.referenceImages.some((item) => item.imageUrl.trim())) {
    return 'multi_image_reference';
  }
  if (input.referenceVideos.some((item) => item.videoUrl.trim())) {
    return 'multi_image_reference';
  }
  if (sceneCount >= 2) {
    return 'first_last_frame';
  }
  if (sceneCount === 1) {
    return 'first_frame';
  }
  return 'free_text';
}

export function mapRemoteSeedanceStatus(status?: string): Project['fastFlow']['task']['status'] {
  const normalized = (status || '').trim().toLowerCase();
  if (!normalized) {
    return 'generating';
  }
  if (normalized === 'queued') {
    return 'generating';
  }
  if (normalized === 'running' || normalized === 'querying') {
    return 'generating';
  }
  if (normalized === 'succeeded' || normalized === 'success') {
    return 'completed';
  }
  if (normalized === 'failed' || normalized === 'fail' || normalized === 'error') {
    return 'failed';
  }
  if (normalized === 'cancelled' || normalized === 'canceled') {
    return 'cancelled';
  }
  if (normalized === 'expired') {
    return 'failed';
  }
  return 'generating';
}

export function resolveSeedanceFinishedAt(
  status: Project['fastFlow']['task']['status'],
  previousFinishedAt?: string,
  nowIso?: string,
) {
  if (status === 'completed' || status === 'failed' || status === 'cancelled') {
    return previousFinishedAt || nowIso || new Date().toISOString();
  }
  return '';
}

export function getFastVideoTaskId(task: Project['fastFlow']['task']) {
  return (task.taskId || task.submitId || '').trim();
}

function isFastVideoTaskActive(task: Project['fastFlow']['task']) {
  return task.status === 'submitting' || task.status === 'generating';
}

export function canCancelFastVideoTask(task: Project['fastFlow']['task']) {
  return Boolean(getFastVideoTaskId(task))
    && isFastVideoTaskActive(task)
    && task.provider === 'ark';
}

export function isSeedanceRealPersonRejection(message?: string) {
  const normalized = (message || '').toLowerCase();
  return normalized.includes('may contain real person')
    || normalized.includes('contain real person')
    || normalized.includes('真人');
}

export function isSeedanceAssetServiceUnavailable(message?: string) {
  const normalized = (message || '').toLowerCase();
  return normalized.includes('has not activated the asset service')
    || normalized.includes('asset service');
}

export function isSeedanceConcurrencyLimitError(message?: string) {
  const normalized = (message || '').toLowerCase();
  return normalized.includes('exceedconcurrencylimit')
    || normalized.includes('ret=1310');
}

export function extractSeedanceCliFailureDetail(raw?: unknown, fallback = 'Seedance 任务失败，请查看日志。') {
  const payload = raw && typeof raw === 'object' ? raw as Record<string, any> : null;
  const candidates = [
    typeof payload?.fail_reason === 'string' ? payload.fail_reason : '',
    typeof payload?.failReason === 'string' ? payload.failReason : '',
    typeof payload?.error === 'string' ? payload.error : '',
    typeof payload?.error?.message === 'string' ? payload.error.message : '',
  ]
    .map((item) => item.trim())
    .filter(Boolean);

  return candidates[0] || fallback;
}

export function buildSeedanceCliFailure(raw?: unknown, fallback = 'Seedance 任务失败，请查看日志。') {
  const detail = extractSeedanceCliFailureDetail(raw, fallback);
  if (isSeedanceConcurrencyLimitError(detail)) {
    return {
      userMessage: '提交失败：当前并发任务数已达上限，请等待已有任务完成后重试。',
      detail,
    };
  }

  return {
    userMessage: detail,
    detail,
  };
}

export function getFastVideoDraftState(project: Project) {
  const seedanceDraft = syncFastFlowSeedanceDraft(project.fastFlow);
  const draftValidation = validateSeedanceDraft(seedanceDraft);
  const cliVisualAssetCount = seedanceDraft.assets.filter((asset) => asset.kind === 'image' || asset.kind === 'video').length;
  const draftIssues = [
    ...draftValidation.errors,
    ...(project.fastFlow.executionConfig.executor === 'cli' && seedanceDraft.baseTemplateId !== 'free_text' && cliVisualAssetCount === 0
      ? ['CLI 执行器至少需要 1 个图片或视频素材。']
      : []),
  ];

  return {
    seedanceDraft,
    draftIssues,
  };
}
