import type {
  FastReferenceAudio,
  FastReferenceAudioType,
  FastReferenceImage,
  FastReferenceImageType,
  FastReferenceVideo,
  FastReferenceVideoType,
  FastSceneDraft,
  FastVideoInput,
  FastVideoPlan,
  FastVideoProject,
  SeedanceTask,
} from '../types/fastTypes.ts';
import { FAST_VIDEO_PROMPT_CONFIG } from '../../../config/fastVideoPrompts.ts';
import { normalizeFastVideoExecutionPrompt } from './fastPromptBuilders.ts';
import { hasHumanFaceMosaicSuffix, syncHumanFaceMosaicPrompt } from './fastScenePrompt.ts';
import type { SeedanceDraft, SeedanceOverlayTemplateId } from '../../seedance/types.ts';
import { normalizeSeedanceModelVersion } from '../../seedance/modelVersions.ts';

type NormalizableFastVideoProject = Partial<Omit<FastVideoProject, 'scenes'>> & {
  scenes?: Array<Partial<FastSceneDraft>>;
};

function normalizeFastVideoAspectRatio(value: unknown): FastVideoInput['aspectRatio'] {
  return value === '9:16' || value === '1:1' || value === '4:3' || value === '3:4' || value === '21:9'
    ? value
    : '16:9';
}

export function isFastAssetSelectedForVideo(selectedForVideo?: boolean) {
  return selectedForVideo !== false;
}

export function createEmptyFastVideoInput(): FastVideoInput {
  return {
    prompt: '',
    referenceImages: [],
    referenceVideos: [],
    referenceAudios: [],
    aspectRatio: '16:9',
    durationSec: 10,
    preferredSceneCount: 'auto',
    quickCutEnabled: false,
    negativePrompt: '',
  };
}

export function createEmptySeedanceTask(): SeedanceTask {
  return {
    provider: 'ark',
    taskId: '',
    status: 'idle',
    submitId: '',
    remoteStatus: '',
    queueStatus: '',
    error: '',
    raw: undefined,
    videoUrl: '',
    lastFrameUrl: '',
    videoStorageKey: '',
    lastFrameStorageKey: '',
    lastCheckedAt: '',
    startedAt: '',
    finishedAt: '',
  };
}

export function createDefaultFastSeedanceDraft(input: FastVideoInput, videoPrompt?: string): SeedanceDraft {
  const hasReferenceMedia =
    input.referenceImages.some((item) => item.imageUrl.trim()) ||
    input.referenceVideos.some((item) => item.videoUrl.trim());

  return {
    baseTemplateId: hasReferenceMedia ? 'multi_image_reference' : 'free_text',
    overlayTemplateIds: ['auto_audio'],
    assets: [],
    prompt: {
      rawPrompt: videoPrompt || input.prompt || '',
      diagnostics: [],
    },
    options: {
      ratio: input.aspectRatio,
      duration: input.durationSec,
      resolution: '720p',
      generateAudio: true,
      returnLastFrame: false,
      useWebSearch: false,
      watermark: false,
      moduleSettings: {},
    },
  };
}

export function createEmptyFastVideoProject(): FastVideoProject {
  return {
    input: createEmptyFastVideoInput(),
    scenes: [],
    videoPrompt: null,
    seedanceDraft: null,
    executionConfig: {
      executor: 'ark',
      apiModelKey: 'standard',
      cliModelVersion: 'seedance2.0',
      pollIntervalSec: 15,
      videoResolution: '720p',
    },
    task: createEmptySeedanceTask(),
  };
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function normalizeFastReferenceType(value: unknown): FastReferenceImageType {
  return value === 'person' || value === 'scene' || value === 'product' || value === 'style' || value === 'other'
    ? value
    : 'other';
}

function normalizeOverlayTemplateIds(value: unknown): SeedanceOverlayTemplateId[] {
  return normalizeStringList(value).filter((item): item is SeedanceOverlayTemplateId => (
    item === 'auto_audio'
    || item === 'subtitle'
    || item === 'bubble_dialogue'
    || item === 'slogan'
    || item === 'logo_reveal'
    || item === 'return_last_frame'
    || item === 'web_search'
  ));
}

function normalizeFastReferenceVideoType(value: unknown): FastReferenceVideoType {
  return value === 'motion' || value === 'camera' || value === 'effect'
    || value === 'edit' || value === 'extend' || value === 'other'
    ? value
    : 'other';
}

function normalizeFastReferenceAudioType(value: unknown): FastReferenceAudioType {
  return value === 'music' || value === 'dialogue' || value === 'effect'
    || value === 'rhythm' || value === 'other'
    ? value
    : 'other';
}

function normalizeReferenceVideos(value: unknown): FastReferenceVideo[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => {
      const candidate = item as Partial<FastReferenceVideo>;
      return {
        id: typeof candidate.id === 'string' && candidate.id.trim()
          ? candidate.id
          : `fast-reference-video-${index + 1}`,
        videoUrl: typeof candidate.videoUrl === 'string' ? candidate.videoUrl : '',
        referenceType: normalizeFastReferenceVideoType(candidate.referenceType),
        description: typeof candidate.description === 'string' ? candidate.description : '',
        selectedForVideo: isFastAssetSelectedForVideo(candidate.selectedForVideo),
        videoMeta: candidate.videoMeta && typeof candidate.videoMeta === 'object'
          ? {
            durationSec: Number.isFinite(candidate.videoMeta.durationSec) ? Math.max(0, Number(candidate.videoMeta.durationSec)) : 0,
            width: Number.isFinite(candidate.videoMeta.width) ? Math.max(0, Number(candidate.videoMeta.width)) : 0,
            height: Number.isFinite(candidate.videoMeta.height) ? Math.max(0, Number(candidate.videoMeta.height)) : 0,
          }
          : null,
      };
    });
}

function normalizeReferenceAudios(value: unknown): FastReferenceAudio[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => {
      const candidate = item as Partial<FastReferenceAudio>;
      return {
        id: typeof candidate.id === 'string' && candidate.id.trim()
          ? candidate.id
          : `fast-reference-audio-${index + 1}`,
        audioUrl: typeof candidate.audioUrl === 'string' ? candidate.audioUrl : '',
        referenceType: normalizeFastReferenceAudioType(candidate.referenceType),
        description: typeof candidate.description === 'string' ? candidate.description : '',
        selectedForVideo: isFastAssetSelectedForVideo(candidate.selectedForVideo),
        audioMeta: candidate.audioMeta && typeof candidate.audioMeta === 'object'
          ? {
            durationSec: Number.isFinite(candidate.audioMeta.durationSec) ? Math.max(0, Number(candidate.audioMeta.durationSec)) : 0,
          }
          : null,
      };
    });
}

function normalizeReferenceImages(value: unknown, legacyReferenceImageUrl?: string): FastReferenceImage[] {
  const fromArray = Array.isArray(value)
    ? value
      .filter((item) => item && typeof item === 'object')
      .map((item, index) => {
        const candidate = item as Partial<FastReferenceImage>;
        const normalizedItem: FastReferenceImage = {
          id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : `fast-reference-${index + 1}`,
          imageUrl: typeof candidate.imageUrl === 'string' ? candidate.imageUrl : '',
          assetId: typeof candidate.assetId === 'string' ? candidate.assetId : '',
          referenceType: normalizeFastReferenceType(candidate.referenceType),
          description: typeof candidate.description === 'string' ? candidate.description : '',
          selectedForVideo: isFastAssetSelectedForVideo(candidate.selectedForVideo),
        };
        return normalizedItem;
      })
    : [];

  if (fromArray.length > 0) {
    return fromArray;
  }

  const normalizedLegacy = (legacyReferenceImageUrl || '').trim();
  if (!normalizedLegacy) {
    return [];
  }

  return [{
    id: 'fast-reference-1',
    imageUrl: normalizedLegacy,
    assetId: '',
    referenceType: 'other' as const,
    description: '',
    selectedForVideo: true,
  }];
}

function normalizeSceneDraft(scene: Partial<FastSceneDraft>, index: number): FastSceneDraft {
  const humanFaceMosaic = Boolean(scene.humanFaceMosaic) || hasHumanFaceMosaicSuffix(typeof scene.imagePrompt === 'string' ? scene.imagePrompt : '');

  return {
    id: typeof scene.id === 'string' && scene.id.trim() ? scene.id : `fast-scene-${index + 1}`,
    title: typeof scene.title === 'string' ? scene.title : `分镜 ${index + 1}`,
    summary: typeof scene.summary === 'string' ? scene.summary : '',
    imagePrompt: syncHumanFaceMosaicPrompt(typeof scene.imagePrompt === 'string' ? scene.imagePrompt : '', humanFaceMosaic),
    humanFaceMosaic,
    imagePromptZh: typeof scene.imagePromptZh === 'string' ? scene.imagePromptZh : '',
    negativePrompt: typeof scene.negativePrompt === 'string' ? scene.negativePrompt : '',
    negativePromptZh: typeof scene.negativePromptZh === 'string' ? scene.negativePromptZh : '',
    continuityAnchors: normalizeStringList(scene.continuityAnchors),
    imageUrl: typeof scene.imageUrl === 'string' ? scene.imageUrl : '',
    imageStorageKey: typeof scene.imageStorageKey === 'string' ? scene.imageStorageKey : '',
    locked: Boolean(scene.locked),
    selectedForVideo: isFastAssetSelectedForVideo(scene.selectedForVideo),
    status: scene.status || (scene.imageUrl ? 'completed' : 'idle'),
    error: typeof scene.error === 'string' ? scene.error : '',
  };
}

export function syncFastFlowSeedanceDraft(fastFlow: FastVideoProject): SeedanceDraft {
  const baseDraft = fastFlow.seedanceDraft || createDefaultFastSeedanceDraft(fastFlow.input, fastFlow.videoPrompt?.prompt);
  const readyScenes = fastFlow.scenes.filter((scene) => scene.imageUrl);
  const selectedReadyScenes = readyScenes.filter((scene) => isFastAssetSelectedForVideo(scene.selectedForVideo));
  const originalReferenceImages = fastFlow.input.referenceImages.filter((item) => item.imageUrl.trim());
  const selectedReferenceImages = originalReferenceImages.filter((item) => isFastAssetSelectedForVideo(item.selectedForVideo));
  const originalReferenceVideos = fastFlow.input.referenceVideos.filter((item) => item.videoUrl.trim());
  const selectedReferenceVideos = originalReferenceVideos.filter((item) => isFastAssetSelectedForVideo(item.selectedForVideo));
  const originalReferenceAudios = fastFlow.input.referenceAudios.filter((item) => item.audioUrl.trim());
  const selectedReferenceAudios = originalReferenceAudios.filter((item) => isFastAssetSelectedForVideo(item.selectedForVideo));
  const useAssetIdForVideoTask = fastFlow.executionConfig.executor === 'ark';
  const assets = (() => {
    if (baseDraft.baseTemplateId === 'first_last_frame') {
      const firstScene = selectedReadyScenes[0];
      const lastScene = selectedReadyScenes[selectedReadyScenes.length - 1];
      return [
        firstScene ? {
          id: `${firstScene.id}-first`,
          kind: 'image' as const,
          source: 'upload' as const,
          urlOrData: firstScene.imageUrl || '',
          role: 'first_frame' as const,
          label: firstScene.title,
        } : null,
        lastScene ? {
          id: `${lastScene.id}-last`,
          kind: 'image' as const,
          source: 'upload' as const,
          urlOrData: lastScene.imageUrl || '',
          role: 'last_frame' as const,
          label: lastScene.title,
        } : null,
      ].filter((item): item is NonNullable<typeof item> => Boolean(item));
    }

    if (baseDraft.baseTemplateId === 'first_frame') {
      const firstScene = selectedReadyScenes[0];
      return firstScene ? [{
        id: `${firstScene.id}-first`,
        kind: 'image' as const,
        source: 'upload' as const,
        urlOrData: firstScene.imageUrl || '',
        role: 'first_frame' as const,
        label: firstScene.title,
      }] : [];
    }

    if (baseDraft.baseTemplateId === 'multi_image_reference') {
      const referenceAssets = [
        ...selectedReferenceImages.map((reference, index) => ({
          id: reference.id || `fast-original-reference-image-${index + 1}`,
          kind: 'image' as const,
          source: 'upload' as const,
          urlOrData: useAssetIdForVideoTask && (reference.assetId || '').trim() ? `asset://${reference.assetId!.trim()}` : reference.imageUrl,
          role: 'reference_image' as const,
          label: `参考图${index + 1}是${
            reference.referenceType === 'person'
              ? '人物参考图'
              : reference.referenceType === 'scene'
                ? '场景参考图'
                : reference.referenceType === 'product'
                  ? '产品参考图'
                  : reference.referenceType === 'style'
                    ? '风格参考图'
                    : '参考图'
          }${useAssetIdForVideoTask && (reference.assetId || '').trim() ? '，提交时使用 asset 素材' : ''}`,
        })),
        ...selectedReadyScenes.map((scene, index) => ({
          id: `${scene.id}-reference-${index + 1}`,
          kind: 'image' as const,
          source: 'upload' as const,
          urlOrData: scene.imageUrl || '',
          role: 'reference_image' as const,
          label: `参考图${selectedReferenceImages.length + index + 1}是已确认分镜图`,
        })),
        ...selectedReferenceVideos.map((video, index) => ({
          id: video.id || `fast-reference-video-${index + 1}`,
          kind: 'video' as const,
          source: 'url' as const,
          urlOrData: video.videoUrl,
          role: 'reference_video' as const,
          label: `参考视频${index + 1}是${
            video.referenceType === 'motion'
              ? '动作参考视频'
              : video.referenceType === 'camera'
                ? '运镜参考视频'
                : video.referenceType === 'effect'
                  ? '特效参考视频'
                  : video.referenceType === 'edit'
                    ? '视频编辑参考'
                    : video.referenceType === 'extend'
                      ? '视频延长参考'
                      : '其他参考视频'
          }${video.description?.trim() ? `，${video.description.trim()}` : ''}`,
        })),
        ...selectedReferenceAudios.map((audio, index) => ({
          id: audio.id || `fast-reference-audio-${index + 1}`,
          kind: 'audio' as const,
          source: 'url' as const,
          urlOrData: audio.audioUrl,
          role: 'reference_audio' as const,
          label: `参考音频${index + 1}是${
            audio.referenceType === 'music'
              ? '音乐参考音频'
              : audio.referenceType === 'dialogue'
                ? '对白参考音频'
                : audio.referenceType === 'effect'
                  ? '音效参考音频'
                  : audio.referenceType === 'rhythm'
                    ? '节奏参考音频'
                    : '其他参考音频'
          }${audio.description?.trim() ? `，${audio.description.trim()}` : ''}`,
        })),
      ];

      return referenceAssets.filter((asset, index, list) => (
        asset.urlOrData.trim()
        && list.findIndex((candidate) => candidate.urlOrData === asset.urlOrData) === index
      )).map((asset) => ({
        ...asset,
      }));
    }

    return [];
  })();

  const overlaySet = new Set(baseDraft.overlayTemplateIds);

  return {
    ...baseDraft,
    assets,
      prompt: {
      ...baseDraft.prompt,
      rawPrompt: fastFlow.videoPrompt?.prompt || baseDraft.prompt.rawPrompt || '',
    },
    options: {
      ...baseDraft.options,
      ratio: baseDraft.options.ratio || fastFlow.input.aspectRatio,
      duration: baseDraft.options.duration || fastFlow.input.durationSec,
      resolution: baseDraft.options.resolution || '720p',
      generateAudio: overlaySet.has('auto_audio'),
      returnLastFrame: overlaySet.has('return_last_frame'),
      useWebSearch: overlaySet.has('web_search'),
      watermark: typeof baseDraft.options.watermark === 'boolean' ? baseDraft.options.watermark : false,
      safetyIdentifier: baseDraft.options.safetyIdentifier || '',
      moduleSettings: {
        ...(baseDraft.options.moduleSettings || {}),
      },
    },
  };
}

export function resolveFastVideoTaskProvider(
  task?: Partial<SeedanceTask> | null,
  fallback: 'ark' | 'cli' = 'cli',
): 'ark' | 'cli' {
  if (task?.provider === 'ark' || task?.provider === 'cli') {
    return task.provider;
  }

  const submitId = typeof task?.submitId === 'string' ? task.submitId.trim() : '';
  const taskId = typeof task?.taskId === 'string' ? task.taskId.trim() : '';
  const raw = task?.raw && typeof task.raw === 'object' ? task.raw as Record<string, unknown> : null;

  if (submitId) {
    return 'cli';
  }

  if (raw && (
    'submit_id' in raw
    || 'submitId' in raw
    || 'gen_status' in raw
    || 'genStatus' in raw
    || 'queue_info' in raw
    || 'queueInfo' in raw
  )) {
    return 'cli';
  }

  if (raw && (
    'content' in raw
    || 'video_url' in raw
    || 'last_frame_url' in raw
    || 'model' in raw
  )) {
    return 'ark';
  }

  if (taskId) {
    return 'ark';
  }

  return fallback;
}

export function normalizeFastVideoProject(value?: NormalizableFastVideoProject | null): FastVideoProject {
  const base = createEmptyFastVideoProject();
  const input = (value?.input || {}) as Partial<FastVideoInput>;
  const task = (value?.task || {}) as Partial<SeedanceTask>;
  const legacyInput = (value?.input || {}) as Record<string, unknown>;
  const executionExecutor = value?.executionConfig?.executor === 'cli' || value?.executionConfig?.executor === 'ark'
    ? value.executionConfig.executor
    : base.executionConfig.executor;
  const normalizedReferenceImages = normalizeReferenceImages(input.referenceImages, typeof legacyInput.referenceImageUrl === 'string' ? legacyInput.referenceImageUrl : '');
  const fallbackSeedanceDraft = createDefaultFastSeedanceDraft(
    {
      ...base.input,
      ...input,
    },
    value?.videoPrompt?.prompt,
  );
  const normalizedSeedanceDraft = value?.seedanceDraft
    ? {
      ...fallbackSeedanceDraft,
      ...value.seedanceDraft,
      baseTemplateId: value.seedanceDraft.baseTemplateId === 'audio_guided'
        ? 'multi_image_reference'
        : value.seedanceDraft.baseTemplateId,
      prompt: {
        ...fallbackSeedanceDraft.prompt,
        ...(value.seedanceDraft.prompt || {}),
        diagnostics: normalizeStringList(value.seedanceDraft.prompt?.diagnostics),
      },
      options: {
        ...fallbackSeedanceDraft.options,
        ...(value.seedanceDraft.options || {}),
        resolution: value.seedanceDraft.options?.resolution === '480p' ? '480p' as const : '720p' as const,
      },
      assets: Array.isArray(value.seedanceDraft.assets)
        ? value.seedanceDraft.assets
          .filter((asset) => asset && typeof asset === 'object')
          .map((asset, index) => ({
            id: typeof asset.id === 'string' && asset.id.trim() ? asset.id : `seedance-asset-${index + 1}`,
            kind: asset.kind === 'video' || asset.kind === 'audio'
              ? asset.kind as 'video' | 'audio'
              : 'image' as const,
            source: asset.source === 'url' || asset.source === 'asset'
              ? asset.source as 'url' | 'asset'
              : 'upload' as const,
            urlOrData: typeof asset.urlOrData === 'string' ? asset.urlOrData : '',
            role: asset.role || 'reference_image',
            label: typeof asset.label === 'string' ? asset.label : '',
          }))
        : [],
      overlayTemplateIds: normalizeOverlayTemplateIds(value.seedanceDraft.overlayTemplateIds),
    }
    : null;
  return {
    input: {
      prompt: typeof input.prompt === 'string' ? input.prompt : base.input.prompt,
      referenceImages: normalizedReferenceImages,
      referenceVideos: normalizeReferenceVideos(input.referenceVideos),
      referenceAudios: normalizeReferenceAudios(input.referenceAudios),
      aspectRatio: normalizeFastVideoAspectRatio(input.aspectRatio),
      durationSec: Number.isFinite(input.durationSec) ? Math.max(4, Math.min(15, Number(input.durationSec))) : base.input.durationSec,
      preferredSceneCount: input.preferredSceneCount === 1 || input.preferredSceneCount === 2 || input.preferredSceneCount === 'auto'
        ? input.preferredSceneCount
        : base.input.preferredSceneCount,
      quickCutEnabled: typeof input.quickCutEnabled === 'boolean' ? input.quickCutEnabled : base.input.quickCutEnabled,
      negativePrompt: typeof input.negativePrompt === 'string' ? input.negativePrompt : base.input.negativePrompt,
    },
    scenes: Array.isArray(value?.scenes)
      ? value!.scenes.map((scene, index) => normalizeSceneDraft(scene, index))
      : [],
    videoPrompt: value?.videoPrompt
      ? {
        prompt: typeof value.videoPrompt.prompt === 'string' ? value.videoPrompt.prompt : '',
        promptZh: typeof value.videoPrompt.promptZh === 'string' ? value.videoPrompt.promptZh : '',
      }
      : null,
    seedanceDraft: normalizedSeedanceDraft,
    executionConfig: {
      executor: executionExecutor,
      apiModelKey: value?.executionConfig?.apiModelKey === 'fast' ? 'fast' : 'standard',
      cliModelVersion: normalizeSeedanceModelVersion(
        value?.executionConfig?.cliModelVersion ?? (value as any)?.cliConfig?.modelVersion,
        base.executionConfig.cliModelVersion,
      ),
      pollIntervalSec: Number.isFinite(value?.executionConfig?.pollIntervalSec)
        ? Math.max(5, Math.min(60, Number(value?.executionConfig?.pollIntervalSec)))
        : Number.isFinite((value as any)?.cliConfig?.pollIntervalSec)
          ? Math.max(5, Math.min(60, Number((value as any).cliConfig.pollIntervalSec)))
          : base.executionConfig.pollIntervalSec,
      videoResolution: value?.executionConfig?.videoResolution === '480p' ? '480p' : '720p',
    },
    task: {
      provider: resolveFastVideoTaskProvider(task, executionExecutor),
      taskId: typeof task.taskId === 'string' ? task.taskId : (typeof task.submitId === 'string' ? task.submitId : ''),
      status: task.status || base.task.status,
      submitId: typeof task.submitId === 'string' ? task.submitId : '',
      remoteStatus: typeof task.remoteStatus === 'string'
        ? task.remoteStatus
        : (typeof (task as any).genStatus === 'string' ? (task as any).genStatus : ''),
      queueStatus: typeof task.queueStatus === 'string' ? task.queueStatus : '',
      error: typeof task.error === 'string' ? task.error : '',
      raw: task.raw,
      videoUrl: typeof task.videoUrl === 'string' ? task.videoUrl : '',
      lastFrameUrl: typeof task.lastFrameUrl === 'string' ? task.lastFrameUrl : '',
      videoStorageKey: typeof task.videoStorageKey === 'string' ? task.videoStorageKey : '',
      lastFrameStorageKey: typeof task.lastFrameStorageKey === 'string' ? task.lastFrameStorageKey : '',
      lastCheckedAt: typeof task.lastCheckedAt === 'string' ? task.lastCheckedAt : '',
      startedAt: typeof task.startedAt === 'string' ? task.startedAt : '',
      finishedAt: typeof task.finishedAt === 'string' ? task.finishedAt : '',
    },
  };
}

export function createFallbackFastVideoPlan(input: FastVideoInput): FastVideoPlan {
  const sceneCount = input.preferredSceneCount === 'auto' ? 2 : input.preferredSceneCount;
  const promptBase = input.prompt.trim() || 'A cinematic scene';
  const fallbackVideoPromptSuffix = input.quickCutEnabled
    ? FAST_VIDEO_PROMPT_CONFIG.quickCut.fallbackVideoPromptZhSuffix
    : FAST_VIDEO_PROMPT_CONFIG.fallback.videoPromptZhSuffix;
  const scenes = Array.from({ length: sceneCount }, (_, index) => ({
    id: `fast-scene-${index + 1}`,
    title: index === 0 ? FAST_VIDEO_PROMPT_CONFIG.fallback.openingSceneTitle : FAST_VIDEO_PROMPT_CONFIG.fallback.progressionSceneTitle,
    summary: '',
    imagePrompt: `${promptBase}, ${index === 0 ? FAST_VIDEO_PROMPT_CONFIG.fallback.openingScenePromptSuffix : FAST_VIDEO_PROMPT_CONFIG.fallback.progressionScenePromptSuffix}`,
    humanFaceMosaic: false,
    imagePromptZh: `${promptBase}，电影感静帧，${index === 0 ? '开场状态' : '后续推进'}，环境细节清晰，真实光影，无文字，无水印`,
    negativePrompt: input.negativePrompt || FAST_VIDEO_PROMPT_CONFIG.fallback.defaultNegativePrompt,
    negativePromptZh: input.negativePrompt || FAST_VIDEO_PROMPT_CONFIG.fallback.defaultNegativePromptZh,
    continuityAnchors: [],
    imageUrl: '',
    locked: false,
    status: 'idle' as const,
    error: '',
  }));

  return {
    scenes,
    videoPrompt: {
      prompt: normalizeFastVideoExecutionPrompt(input, `${promptBase}。${fallbackVideoPromptSuffix}`),
      promptZh: normalizeFastVideoExecutionPrompt(input, `${promptBase}。${fallbackVideoPromptSuffix}`),
    },
  };
}
