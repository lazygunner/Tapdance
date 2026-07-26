import type { VisualAspectRatio } from '../../../types.ts';
import type { SeedanceApiModelKey, SeedanceDraft, SeedanceExecutorId, SeedanceModelVersion } from '../../seedance/types.ts';

export type FastSceneCountPreference = 'auto' | 1 | 2;
export type FastAssetStatus = 'idle' | 'generating' | 'completed' | 'failed';
export type FastTaskStatus = 'idle' | 'queued' | 'submitting' | 'generating' | 'completed' | 'failed' | 'cancelled';
export type SeedanceHealthStatus = 'unknown' | 'logged_in' | 'logged_out' | 'error';
export type FastReferenceImageType = 'person' | 'scene' | 'product' | 'style' | 'other';
export type FastReferenceImageSubmitMode = 'auto' | 'reference_image';
export type FastReferenceImageOriginKind = 'upload' | 'history' | 'storyboard' | 'director-capture';

export interface FastReferenceImageOrigin {
  kind: FastReferenceImageOriginKind;
  sceneId?: string;
  captureId?: string;
}

export interface FastReferenceImage {
  id: string;
  imageUrl: string;
  assetId?: string;
  referenceType?: FastReferenceImageType;
  description?: string;
  selectedForVideo?: boolean;
  submitMode?: FastReferenceImageSubmitMode;
  origin?: FastReferenceImageOrigin;
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
  characterIds?: string[];
  directorLayout?: FastDirectorSceneLayout;
  selectedReferenceImageIds?: string[];
  imageUrl?: string;
  imageStorageKey?: string;
  locked?: boolean;
  selectedForVideo?: boolean;
  status?: FastAssetStatus;
  error?: string;
}

export interface FastDirectorSceneLayout {
  reasoning?: string;
  camera?: {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
  };
  characters: Array<{
    roleId: string;
    position: [number, number, number];
    rotationY: number;
    scale?: number;
    pose: FastDirectorPose;
  }>;
}

export interface FastPlanCharacter {
  id: string;
  name: string;
  description: string;
}

export interface FastVideoPromptDraft {
  prompt: string;
  promptZh?: string;
}

export interface FastVideoPlan {
  characters?: FastPlanCharacter[];
  scenes: FastSceneDraft[];
  videoPrompt: FastVideoPromptDraft;
}

export type FastDirectorPose =
  | 'stand'
  | 't-pose'
  | 'walk'
  | 'run'
  | 'sit'
  | 'crouch'
  | 'kneel-one'
  | 'kneel-two'
  | 'hands-on-hips'
  | 'lean'
  | 'bow'
  | 'think'
  | 'fight'
  | 'kick'
  | 'throw'
  | 'push'
  | 'wave'
  | 'reach'
  | 'cross-arms'
  | 'phone';
export type FastDirectorBodyType =
  | 'mannequin'
  | 'female'
  | 'broad'
  | 'muscular'
  | 'slim'
  | 'teen'
  | 'child'
  | 'chibi';
export type FastDirectorPrimitiveType = 'box' | 'sphere' | 'cylinder' | 'cone' | 'plane';

export interface FastDirectorCharacter {
  id: string;
  roleId: string;
  bodyType?: FastDirectorBodyType;
  sourcePlanId?: string;
  sourceReferenceId?: string;
  name: string;
  color?: string;
  description?: string;
  referenceImageUrl?: string;
}

export interface FastDirectorPlacement {
  characterId: string;
  position: [number, number, number];
  rotationY: number;
  scale: number;
  pose: FastDirectorPose;
}

export interface FastDirectorObject {
  id: string;
  name: string;
  primitiveType: FastDirectorPrimitiveType;
  color: string;
}

export interface FastDirectorObjectPlacement {
  objectId: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface FastDirectorCamera {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  aspectRatio?: VisualAspectRatio;
}

export interface FastDirectorCapture {
  id: string;
  imageUrl: string;
  referenceImageId: string;
  camera: FastDirectorCamera;
  aspectRatio: VisualAspectRatio;
  createdAt: string;
}

export interface FastDirectorScene {
  sceneId: string;
  placements: FastDirectorPlacement[];
  objectPlacements: FastDirectorObjectPlacement[];
  camera: FastDirectorCamera;
  captures: FastDirectorCapture[];
  updatedAt: string;
}

export interface FastDirectorState {
  activeSceneId: string;
  characters: FastDirectorCharacter[];
  objects: FastDirectorObject[];
  deletedCharacterIds: string[];
  scenes: FastDirectorScene[];
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
  characters: FastPlanCharacter[];
  scenes: FastSceneDraft[];
  director: FastDirectorState;
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
