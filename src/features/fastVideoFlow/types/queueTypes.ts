import type { Project } from '../../../types.ts';
import type { SeedanceDraft, SeedanceModelVersion } from '../../seedance/types.ts';

export type SeedanceCliQueueItemStatus =
  | 'queued'
  | 'submitting'
  | 'running'
  | 'retry_wait'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type SeedanceCliQueueItem = {
  id: string;
  projectId: string;
  projectName: string;
  groupName?: string;
  label: string;
  draft: SeedanceDraft;
  cliOptions: {
    modelVersion: SeedanceModelVersion;
    ratio: Project['fastFlow']['input']['aspectRatio'];
    duration: number;
    videoResolution: '480p' | '720p' | '1080p';
  };
  status: SeedanceCliQueueItemStatus;
  submitId?: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  lastCheckedAt?: string;
  nextRetryAt?: string;
  waitDurationMs?: number;
  attemptCount: number;
  sourceFailureDetail?: string;
};

export type SeedanceCliQueueState = {
  version: 1;
  items: SeedanceCliQueueItem[];
};

export type SeedanceCliQueueToast = {
  id: string;
  title: string;
  message: string;
  tone: 'success' | 'error' | 'info';
};

export type SeedanceCliQueueEnqueueInput = {
  project: Project;
  draft: SeedanceDraft;
  cliOptions: SeedanceCliQueueItem['cliOptions'];
  sourceFailureDetail?: string;
};
