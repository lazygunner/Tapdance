import type { VisualAspectRatio } from '../../../types.ts';
import type { SeedanceApiModelKey, SeedanceDraft, SeedanceExecutorId, SeedanceModelVersion } from '../../seedance/types.ts';

export type FastSceneCountPreference = 'auto' | 1 | 2;
export type FastAssetStatus = 'idle' | 'generating' | 'completed' | 'failed';
export type FastTaskStatus = 'idle' | 'queued' | 'submitting' | 'generating' | 'completed' | 'failed' | 'cancelled';
export type SeedanceHealthStatus = 'unknown' | 'logged_in' | 'logged_out' | 'error';
export type FastReferenceImageType = 'person' | 'scene' | 'product' | 'style' | 'other';

export interface FastReferenceImage {
  id: string;
  imageUrl: string;
  assetId?: string;
  referenceType?: FastReferenceImageType;
  description?: string;
  selectedForVideo?: boolean;
}

export type FastReferenceVideoType = 'motion' | 'camera' | 'effect' | 'edit' | 'extend' | 'other';
export type FastReferenceAudioType = 'music' | 'dialogue' | 'effect' | 'rhythm' | 'other';

export interface FastReferenceVideoMeta {
  durationSec: number;
  width: number;
  height: number;
}

export interface FastReferenceVideo {
  id: string;
  videoUrl: string;
  referenceType?: FastReferenceVideoType;
  description?: string;
  selectedForVideo?: boolean;
  videoMeta?: FastReferenceVideoMeta | null;
}

export interface FastReferenceAudioMeta {
  durationSec: number;
}

export interface FastReferenceAudio {
  id: string;
  audioUrl: string;
  referenceType?: FastReferenceAudioType;
  description?: string;
  selectedForVideo?: boolean;
  audioMeta?: FastReferenceAudioMeta | null;
}

export interface FastVideoInput {
  prompt: string;
  referenceImages: FastReferenceImage[];
  referenceVideos: FastReferenceVideo[];
  referenceAudios: FastReferenceAudio[];
  aspectRatio: VisualAspectRatio;
  durationSec: number;
  preferredSceneCount: FastSceneCountPreference;
  quickCutEnabled?: boolean;
  negativePrompt?: string;
}

export interface FastSceneDraft {
  id: string;
  title: string;
  summary: string;
  imagePrompt: string;
  humanFaceMosaic?: boolean;
  imagePromptZh?: string;
  negativePrompt?: string;
  negativePromptZh?: string;
  continuityAnchors: string[];
  imageUrl?: string;
  imageStorageKey?: string;
  locked?: boolean;
  selectedForVideo?: boolean;
  status?: FastAssetStatus;
  error?: string;
}

export interface FastVideoPromptDraft {
  prompt: string;
  promptZh?: string;
}

export interface FastVideoPlan {
  scenes: FastSceneDraft[];
  videoPrompt: FastVideoPromptDraft;
}

export interface SeedanceTask {
  provider?: SeedanceExecutorId;
  taskId?: string;
  submitId?: string;
  status: FastTaskStatus;
  remoteStatus?: string;
  queueStatus?: string;
  error?: string;
  raw?: unknown;
  videoUrl?: string;
  lastFrameUrl?: string;
  videoStorageKey?: string;
  lastFrameStorageKey?: string;
  lastCheckedAt?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface SeedanceHealth {
  cliAvailable: boolean;
  loginStatus: SeedanceHealthStatus;
  modelVersions: SeedanceModelVersion[];
  credit?: {
    vip_credit?: number;
    gift_credit?: number;
    purchase_credit?: number;
    total_credit?: number;
  };
  checkedAt?: string;
  error?: string;
}

export interface FastVideoProject {
  input: FastVideoInput;
  scenes: FastSceneDraft[];
  videoPrompt: FastVideoPromptDraft | null;
  seedanceDraft: SeedanceDraft | null;
  executionConfig: {
    executor: SeedanceExecutorId;
    apiModelKey: SeedanceApiModelKey;
    cliModelVersion: SeedanceModelVersion;
    pollIntervalSec: number;
    videoResolution: '480p' | '720p' | '1080p';
  };
  task: SeedanceTask;
}
