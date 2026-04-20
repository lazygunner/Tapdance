import type { AspectRatio } from '../../types.ts';

export type SeedanceModelVersion = 'seedance2.0' | 'seedance2.0fast' | 'seedance2.0_vip' | 'seedance2.0fast_vip';
export type SeedanceExecutorId = 'ark' | 'cli';
export type SeedanceApiModelKey = 'standard' | 'fast';
export type SeedanceAspectRatio = AspectRatio | '3:4' | '21:9' | 'adaptive';

export type SeedanceBaseTemplateId =
  | 'free_text'
  | 'first_frame'
  | 'first_last_frame'
  | 'multi_image_reference'
  | 'motion_reference'
  | 'camera_reference'
  | 'effect_reference'
  | 'video_edit'
  | 'video_extend'
  | 'video_stitch'
  | 'audio_guided';

export type SeedanceOverlayTemplateId =
  | 'auto_audio'
  | 'subtitle'
  | 'bubble_dialogue'
  | 'slogan'
  | 'logo_reveal'
  | 'return_last_frame'
  | 'web_search';

export type SeedanceAssetRole =
  | 'first_frame'
  | 'last_frame'
  | 'reference_image'
  | 'reference_video'
  | 'reference_audio';

export type SeedanceMediaKind = 'image' | 'video' | 'audio';
export type SeedanceMediaSource = 'upload' | 'url' | 'asset';

export interface SeedanceInputAsset {
  id: string;
  kind: SeedanceMediaKind;
  source: SeedanceMediaSource;
  urlOrData: string;
  role: SeedanceAssetRole;
  label?: string;
}

export interface SeedancePromptDraft {
  rawPrompt: string;
  optimizedPrompt?: string;
  diagnostics: string[];
}

export interface SeedancePromptModuleSettings {
  subtitleText?: string;
  bubbleDialogue?: string;
  sloganText?: string;
  logoPrompt?: string;
}

export interface SeedanceRequestOptions {
  ratio: SeedanceAspectRatio;
  duration?: number;
  resolution: '480p' | '720p' | '1080p';
  generateAudio: boolean;
  returnLastFrame: boolean;
  useWebSearch: boolean;
  watermark: boolean;
  safetyIdentifier?: string;
  moduleSettings?: SeedancePromptModuleSettings;
}

export interface SeedanceDraft {
  baseTemplateId: SeedanceBaseTemplateId;
  overlayTemplateIds: SeedanceOverlayTemplateId[];
  assets: SeedanceInputAsset[];
  prompt: SeedancePromptDraft;
  options: SeedanceRequestOptions;
}

export interface SeedanceTemplateDefinition {
  id: SeedanceBaseTemplateId;
  title: string;
  description: string;
  requires: Array<{
    role: SeedanceAssetRole | 'text';
    minCount: number;
    maxCount?: number;
  }>;
  supportedOverlays: SeedanceOverlayTemplateId[];
}

export interface SeedanceCompiledRequest {
  content: Array<Record<string, any>>;
  ratio: SeedanceAspectRatio;
  duration?: number;
  resolution: '480p' | '720p' | '1080p';
  generateAudio: boolean;
  returnLastFrame: boolean;
  watermark: boolean;
  safetyIdentifier?: string;
  tools?: Array<{ type: 'web_search' }>;
}

export interface SeedanceDraftValidation {
  errors: string[];
  warnings: string[];
}

export interface SeedanceApiTask {
  id: string;
  status: string;
  model?: string;
  videoUrl?: string;
  lastFrameUrl?: string;
  createdAt?: number;
  updatedAt?: number;
  ratio?: string;
  resolution?: string;
  duration?: number;
  error?: {
    code?: string;
    message?: string;
  } | null;
  raw: Record<string, any>;
}
