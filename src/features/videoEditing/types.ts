import type { SeedanceOutputFormat } from '../seedance/types.ts';

export type VideoEditOperation = 'add' | 'remove' | 'replace';

export type VideoEditTaskStatus =
  | 'idle'
  | 'uploading'
  | 'submitting'
  | 'queued'
  | 'generating'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type VideoEditSource = {
  url: string;
  fileName: string;
  storageKey?: string;
  origin: 'upload' | 'url' | 'result';
  durationSec?: number;
  width?: number;
  height?: number;
  sizeBytes?: number;
};

export type VideoEditReferenceImage = {
  id: string;
  url: string;
  fileName: string;
  storageKey?: string;
};

export type VideoEditTask = {
  taskId: string;
  status: VideoEditTaskStatus;
  remoteStatus: string;
  videoUrl: string;
  lastFrameUrl: string;
  error: string;
  startedAt: string;
  finishedAt: string;
  lastCheckedAt: string;
  raw?: Record<string, unknown>;
};

export type VideoEditProject = {
  operation: VideoEditOperation;
  sourceVideo: VideoEditSource | null;
  referenceImages: VideoEditReferenceImage[];
  targetDescription: string;
  resultDescription: string;
  temporalHint: string;
  spatialHint: string;
  preserveSubject: boolean;
  preserveBackground: boolean;
  preserveCamera: boolean;
  resolution: '480p' | '720p';
  outputFormat: SeedanceOutputFormat;
  generateAudio: boolean;
  watermark: boolean;
  compiledPrompt: string;
  task: VideoEditTask;
};
