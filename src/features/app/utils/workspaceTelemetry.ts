import type { Project } from '../../../types.ts';
import { collectProjectGeneratedMediaAssets } from '../../../services/projectGroups.ts';
import { syncFastFlowSeedanceDraft } from '../../fastVideoFlow/services/fastFlowMappers.ts';
import { getSeedanceCostEstimate } from '../../fastVideoFlow/utils/seedanceCostEstimate.ts';

export type WorkspaceTelemetryStats = {
  projectCount: number;
  groupCount: number;
  creativeProjectCount: number;
  fastProjectCount: number;
  plannedFastProjectCount: number;
  submittedFastTaskCount: number;
  billableFastTaskCount: number;
  completedFastTaskCount: number;
  activeFastTaskCount: number;
  failedFastTaskCount: number;
  generatedImageCount: number;
  generatedVideoCount: number;
  generatedAudioCount: number;
  totalEstimatedTokens: number;
  usedEstimatedTokens: number;
  totalEstimatedCostCny: number;
  usedEstimatedCostCny: number;
  totalGenerationMs: number;
  timedTaskCount: number;
  averageGenerationMs: number;
  completionRate: number;
};

const GENERATED_VIDEO_SOURCE_TYPES = new Set([
  'shot-video',
  'shot-transition-video',
  'fast-task-video',
  'video-edit-result',
]);

const GENERATED_IMAGE_SOURCE_TYPES = new Set([
  'asset',
  'shot-first',
  'shot-last',
  'ad-storyboard',
  'ad-packaging',
  'ad-logo',
  'fast-scene',
  'fast-task-last-frame',
  'image-creation',
]);

function normalizeStatus(value?: string | null) {
  return (value || '').trim().toLowerCase();
}

function isFastTaskSubmitted(project: Project) {
  return Boolean((project.fastFlow.task.taskId || project.fastFlow.task.submitId || '').trim());
}

function isFastTaskActive(project: Project) {
  return project.fastFlow.task.status === 'queued'
    || project.fastFlow.task.status === 'submitting'
    || project.fastFlow.task.status === 'generating';
}

function isFastTaskCompleted(project: Project) {
  const remoteStatus = normalizeStatus(project.fastFlow.task.remoteStatus);
  return project.fastFlow.task.status === 'completed'
    || remoteStatus === 'success'
    || remoteStatus === 'succeeded';
}

function isFastTaskFailed(project: Project) {
  const remoteStatus = normalizeStatus(project.fastFlow.task.remoteStatus);
  return project.fastFlow.task.status === 'failed'
    || remoteStatus === 'fail'
    || remoteStatus === 'failed'
    || remoteStatus === 'error';
}

function isFastTaskCancelled(project: Project) {
  const remoteStatus = normalizeStatus(project.fastFlow.task.remoteStatus);
  return project.fastFlow.task.status === 'cancelled'
    || remoteStatus === 'cancelled'
    || remoteStatus === 'canceled';
}

function isPotentiallyBillableFastTask(project: Project) {
  return isFastTaskSubmitted(project)
    && !isFastTaskFailed(project)
    && !isFastTaskCancelled(project);
}

function parseTimestampMs(value?: string) {
  const timestamp = Date.parse((value || '').trim());
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function getFastTaskElapsedMs(project: Project, nowMs: number) {
  const startedAtMs = parseTimestampMs(project.fastFlow.task.startedAt);
  if (!startedAtMs) {
    return 0;
  }

  const finishedAtMs = parseTimestampMs(project.fastFlow.task.finishedAt);
  const checkedAtMs = parseTimestampMs(project.fastFlow.task.lastCheckedAt);
  const endMs = finishedAtMs || (isFastTaskActive(project) ? nowMs : checkedAtMs);
  if (!endMs || endMs < startedAtMs) {
    return 0;
  }

  return endMs - startedAtMs;
}

function shouldEstimateFastProject(project: Project) {
  return Boolean(
    project.fastFlow.input.prompt.trim()
    || project.fastFlow.videoPrompt?.prompt?.trim()
    || isFastTaskSubmitted(project),
  );
}

function getDedupedProjectMedia(projects: Project[]) {
  const seen = new Set<string>();
  return projects.flatMap((project) => collectProjectGeneratedMediaAssets(project)).filter((item) => {
    const url = item.url.trim();
    if (!url) {
      return false;
    }

    const key = `${item.kind}:${item.sourceType}:${url}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function buildWorkspaceTelemetry(
  projects: Project[],
  groupCount: number,
  nowMs = Date.now(),
): WorkspaceTelemetryStats {
  const stats: WorkspaceTelemetryStats = {
    projectCount: projects.length,
    groupCount,
    creativeProjectCount: 0,
    fastProjectCount: 0,
    plannedFastProjectCount: 0,
    submittedFastTaskCount: 0,
    billableFastTaskCount: 0,
    completedFastTaskCount: 0,
    activeFastTaskCount: 0,
    failedFastTaskCount: 0,
    generatedImageCount: 0,
    generatedVideoCount: 0,
    generatedAudioCount: 0,
    totalEstimatedTokens: 0,
    usedEstimatedTokens: 0,
    totalEstimatedCostCny: 0,
    usedEstimatedCostCny: 0,
    totalGenerationMs: 0,
    timedTaskCount: 0,
    averageGenerationMs: 0,
    completionRate: 0,
  };

  const media = getDedupedProjectMedia(projects);
  stats.generatedImageCount = media.filter((item) => item.kind === 'image' && GENERATED_IMAGE_SOURCE_TYPES.has(item.sourceType)).length;
  stats.generatedVideoCount = media.filter((item) => item.kind === 'video' && GENERATED_VIDEO_SOURCE_TYPES.has(item.sourceType)).length;
  stats.generatedAudioCount = media.filter((item) => item.kind === 'audio' && item.sourceType !== 'fast-reference-audio').length;

  for (const project of projects) {
    if (project.projectType === 'creative-video') {
      stats.creativeProjectCount += 1;
      continue;
    }

    if (project.projectType !== 'fast-video') {
      continue;
    }

    stats.fastProjectCount += 1;
    if (!shouldEstimateFastProject(project)) {
      continue;
    }

    stats.plannedFastProjectCount += 1;
    const seedanceDraft = syncFastFlowSeedanceDraft(project.fastFlow);
    const estimate = getSeedanceCostEstimate(project.fastFlow.input, seedanceDraft, project.fastFlow.executionConfig);
    stats.totalEstimatedTokens += estimate.totalTokens;
    stats.totalEstimatedCostCny += estimate.estimatedCost;

    if (isFastTaskSubmitted(project)) {
      stats.submittedFastTaskCount += 1;
    }

    if (isPotentiallyBillableFastTask(project)) {
      stats.billableFastTaskCount += 1;
      stats.usedEstimatedTokens += estimate.totalTokens;
      stats.usedEstimatedCostCny += estimate.estimatedCost;
    }

    if (isFastTaskCompleted(project)) {
      stats.completedFastTaskCount += 1;
    }

    if (isFastTaskActive(project)) {
      stats.activeFastTaskCount += 1;
    }

    if (isFastTaskFailed(project)) {
      stats.failedFastTaskCount += 1;
    }

    const elapsedMs = getFastTaskElapsedMs(project, nowMs);
    if (elapsedMs > 0) {
      stats.totalGenerationMs += elapsedMs;
      stats.timedTaskCount += 1;
    }
  }

  stats.averageGenerationMs = stats.timedTaskCount > 0
    ? stats.totalGenerationMs / stats.timedTaskCount
    : 0;
  stats.completionRate = stats.submittedFastTaskCount > 0
    ? stats.completedFastTaskCount / stats.submittedFastTaskCount
    : 0;

  return stats;
}
