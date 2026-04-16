import type { Project } from '../../../types.ts';
import type { SeedanceDraft } from '../../seedance/types.ts';
import type { SeedanceCliQueueEnqueueInput, SeedanceCliQueueItem, SeedanceCliQueueState } from '../types/queueTypes.ts';

export const SEEDANCE_CLI_QUEUE_STATE_KEY = 'seedance.cliQueue.v1';

export function createEmptySeedanceCliQueueState(): SeedanceCliQueueState {
  return {
    version: 1,
    items: [],
  };
}

export function isSeedanceCliQueueActive(status: SeedanceCliQueueItem['status']) {
  return status === 'queued' || status === 'submitting' || status === 'running' || status === 'retry_wait';
}

export function countSeedanceCliQueueAhead(items: SeedanceCliQueueItem[]) {
  return items.filter((item) => item.status === 'queued' || item.status === 'retry_wait' || item.status === 'submitting' || item.status === 'running').length;
}

export function normalizeSeedanceCliQueueState(value: unknown): SeedanceCliQueueState {
  const base = createEmptySeedanceCliQueueState();
  if (!value || typeof value !== 'object') {
    return base;
  }

  const candidate = value as Partial<SeedanceCliQueueState>;
  const items = Array.isArray(candidate.items) ? candidate.items : [];
  return {
    version: 1,
    items: items
      .filter((item) => item && typeof item === 'object')
      .map((item, index) => {
        const queueItem = item as Partial<SeedanceCliQueueItem>;
        const submitId = typeof queueItem.submitId === 'string' ? queueItem.submitId : '';
        const normalizedStatus = queueItem.status === 'queued'
          || queueItem.status === 'submitting'
          || queueItem.status === 'running'
          || queueItem.status === 'retry_wait'
          || queueItem.status === 'completed'
          || queueItem.status === 'failed'
          || queueItem.status === 'cancelled'
          ? queueItem.status
          : 'queued';
        const safeStatus = normalizedStatus === 'submitting' || (normalizedStatus === 'running' && !submitId)
          ? 'queued'
          : normalizedStatus;
        return {
          id: typeof queueItem.id === 'string' && queueItem.id.trim() ? queueItem.id : `queue-${index + 1}`,
          projectId: typeof queueItem.projectId === 'string' ? queueItem.projectId : '',
          projectName: typeof queueItem.projectName === 'string' ? queueItem.projectName : '未命名项目',
          groupName: typeof queueItem.groupName === 'string' ? queueItem.groupName : '',
          label: typeof queueItem.label === 'string' ? queueItem.label : '极速视频任务',
          draft: queueItem.draft as SeedanceDraft,
          cliOptions: queueItem.cliOptions as SeedanceCliQueueItem['cliOptions'],
          status: safeStatus,
          submitId,
          error: typeof queueItem.error === 'string' ? queueItem.error : '',
          createdAt: typeof queueItem.createdAt === 'string' ? queueItem.createdAt : new Date().toISOString(),
          startedAt: typeof queueItem.startedAt === 'string' ? queueItem.startedAt : '',
          finishedAt: typeof queueItem.finishedAt === 'string' ? queueItem.finishedAt : '',
          lastCheckedAt: typeof queueItem.lastCheckedAt === 'string' ? queueItem.lastCheckedAt : '',
          nextRetryAt: typeof queueItem.nextRetryAt === 'string' ? queueItem.nextRetryAt : '',
          waitDurationMs: Number.isFinite(queueItem.waitDurationMs) ? Math.max(0, Number(queueItem.waitDurationMs)) : undefined,
          attemptCount: Number.isFinite(queueItem.attemptCount) ? Math.max(0, Number(queueItem.attemptCount)) : 0,
          sourceFailureDetail: typeof queueItem.sourceFailureDetail === 'string' ? queueItem.sourceFailureDetail : '',
        };
      })
      .filter((item) => item.projectId && item.draft && item.cliOptions),
  };
}

export function createSeedanceCliQueueItem(input: SeedanceCliQueueEnqueueInput): SeedanceCliQueueItem {
  const nowIso = new Date().toISOString();
  const prompt = input.draft.prompt.rawPrompt.trim();
  const label = prompt
    ? `${prompt.slice(0, 24)}${prompt.length > 24 ? '...' : ''}`
    : `${input.project.name || '极速视频'} 任务`;

  return {
    id: crypto.randomUUID?.() || `seedance-cli-queue-${Date.now()}`,
    projectId: input.project.id,
    projectName: input.project.name || '未命名项目',
    groupName: input.project.groupName || '',
    label,
    draft: input.draft,
    cliOptions: input.cliOptions,
    status: 'queued',
    createdAt: nowIso,
    attemptCount: 0,
    sourceFailureDetail: input.sourceFailureDetail || '',
  };
}

export function getSeedanceCliRetryDelayMs(attemptCount: number) {
  return Math.min(120_000, 30_000 + Math.max(0, attemptCount - 1) * 30_000);
}
