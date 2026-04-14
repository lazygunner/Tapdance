import type { FastVideoProject } from './features/fastVideoFlow/types/fastTypes.ts';
import type { SeedanceExecutorId, SeedanceModelVersion } from './features/seedance/types.ts';

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3';
export type VisualAspectRatio = AspectRatio | '3:4' | '21:9';
export type ProjectType = 'creative-video' | 'fast-video';

export interface Brief {
  theme: string;
  style: string;
  stylePresetId?: string;
  stylePrompt?: string;
  characters: string[];
  scenes: string[];
  events: string;
  mood: string;
  duration: string;
  aspectRatio: AspectRatio;
  platform: string;
}

export type AssetType = 'character' | 'scene' | 'style' | 'prop' | 'product';

export interface Asset {
  id: string;
  type: AssetType;
  name: string;
  description: string;
  characterPrompt?: {
    characterType?: 'human' | 'animal';
    gender?: string;
    ageVibe?: string;
    ethnicityOrAppearance?: string;
    build?: string;
    faceHairstyle?: string;
    topOuterwear?: string;
    bottomsFootwear?: string;
    mainColors?: string;
    uniqueMark?: string;
    signatureProp?: string;
  };
  scenePrompt?: {
    locationType?: string;
    eraOrWorld?: string;
    architectureLandscape?: string;
    timeOfDay?: string;
    weatherAtmosphere?: string;
    lighting?: string;
    mainColors?: string;
    foregroundElements?: string;
    backgroundLandmark?: string;
    avoidElements?: string;
  };
  productPrompt?: {
    category?: string;
    formFactor?: string;
    materialFinish?: string;
    mainColors?: string;
    heroFeatures?: string;
    logoBranding?: string;
    packagingDetails?: string;
    usageScene?: string;
    avoidElements?: string;
  };
  imageUrl?: string;
  imagePrompt?: string;
}

export interface VideoConfig {
  resolution: '720p' | '1080p';
  frameRate: number;
  aspectRatio: AspectRatio;
  useFirstFrame: boolean;
  useLastFrame: boolean;
  useReferenceAssets: boolean;
}

export type PromptLanguage = 'zh' | 'en';

export interface GeminiApiConfig {
  apiKey: string;
  promptLanguage: PromptLanguage;
  textModel: string;
  imageModel: string;
  proImageModel: string;
  fastVideoModel: string;
  proVideoModel: string;
}

export interface VolcengineApiConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  promptLanguage: PromptLanguage;
  textModel: string;
  imageModel: string;
  videoModel: string;
}

export interface SeedanceApiConfig {
  enabled: boolean;
  apiModel: string;
  fastApiModel: string;
  defaultExecutor: SeedanceExecutorId;
  cliModelVersion: SeedanceModelVersion;
  pollIntervalSec: number;
  bridgeUrl: string;
}

export type ModelSourceId =
  | ''
  | 'gemini.textModel'
  | 'gemini.imageModel'
  | 'gemini.proImageModel'
  | 'gemini.fastVideoModel'
  | 'gemini.proVideoModel'
  | 'volcengine.textModel'
  | 'volcengine.imageModel'
  | 'volcengine.videoModel';

export interface DefaultModelSettings {
  text: ModelSourceId;
  image: ModelSourceId;
  video: ModelSourceId;
}

export interface TosConfig {
  enabled: boolean;
  region: string;
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
  pathPrefix?: string;
}

export interface ApiSettings {
  gemini: GeminiApiConfig;
  volcengine: VolcengineApiConfig;
  seedance: SeedanceApiConfig;
  tos?: TosConfig;
  defaultModels: DefaultModelSettings;
}

export interface Shot {
  id: string;
  shotNumber: number;
  duration: number; // in seconds
  shotSize: string; // e.g., Close-up, Wide shot
  cameraAngle: string; // e.g., Eye-level, High angle
  cameraMovement: string; // e.g., Pan, Tilt, Static
  subject: string;
  action: string;
  mood: string;
  transition: string;
  dialog?: string;
  imagePrompt?: {
    basic: string;
    basicZh: string;
    professional: string;
    professionalZh: string;
    lastFrameProfessional?: string;
    lastFrameProfessionalZh?: string;
    negative: string;
    negativeZh: string;
  };
  videoPrompt?: {
    textToVideo: string;
    textToVideoZh: string;
    imageToVideo: string;
    imageToVideoZh: string;
  };
  imageUrl?: string; // For generated storyboard image (first frame)
  lastFrameImageUrl?: string; // For generated storyboard image (last frame)
  videoUrl?: string; // Blob URL for the generated video
  videoStorageKey?: string;
  videoOperation?: any; // Store the operation object for polling
  videoStatus?: 'idle' | 'generating' | 'completed' | 'failed' | 'cancelled';
  videoError?: string;
  transitionVideoUrl?: string;
  transitionVideoStorageKey?: string;
  transitionVideoOperation?: any;
  transitionVideoStatus?: 'idle' | 'generating' | 'completed' | 'failed' | 'cancelled';
  transitionVideoError?: string;
  transitionVideoPrompt?: string;
  transitionVideoPromptZh?: string;
  transitionVideoDuration?: number;
  transitionVideoAspectRatio?: AspectRatio;
  referenceAssets?: string[]; // IDs of assets to use as reference
  groupReferenceImageIds?: string[];
  videoConfig?: VideoConfig;
  usePreviousShotBackground?: boolean;
}

export interface Project {
  id: string;
  projectType: ProjectType;
  name: string;
  nameCustomized?: boolean;
  createdAt: string;
  groupId?: string;
  groupName?: string;
  category?: string;
  idea: string;
  selectedStyleId?: string;
  customStyleDescription?: string;
  styleSelectionMode?: 'manual' | 'auto' | 'custom';
  inputAspectRatio?: AspectRatio;
  brief: Brief | null;
  assets: Asset[];
  shots: Shot[];
  fastFlow: FastVideoProject;
}
