import type { Asset, AspectRatio, Brief, ModelSourceId, Shot, VisualAspectRatio } from '../types.ts';
import type { FastSceneDraft, FastVideoInput, FastVideoPlan, FastVideoPromptDraft } from '../features/fastVideoFlow/types/fastTypes.ts';
import * as geminiService from './geminiService.ts';
import * as volcengineService from './volcengineService.ts';
import { appendModelInvocationLog } from './modelInvocationLog.ts';
import { buildTransitionVideoGenerationRequest, buildVideoGenerationRequest, normalizeVideoAspectRatio } from './requestBuilders.ts';

function isVolcengineSource(sourceId?: ModelSourceId) {
  return Boolean(sourceId && sourceId.startsWith('volcengine.'));
}

function getProvider(sourceId?: ModelSourceId): 'gemini' | 'volcengine' {
  return isVolcengineSource(sourceId) ? 'volcengine' : 'gemini';
}

function getVolcengineVideoRequestPreview(shot: Shot, defaultAspectRatio: AspectRatio, referenceAssets: Asset[] = []) {
  const videoConfig = shot.videoConfig || {
    resolution: '720p' as const,
    frameRate: 24,
    aspectRatio: defaultAspectRatio === '9:16' ? '9:16' as const : '16:9' as const,
    useFirstFrame: true,
    useLastFrame: true,
    useReferenceAssets: false,
  };

  return {
    prompt: shot.videoPrompt?.imageToVideo || shot.videoPrompt?.textToVideo || shot.action,
    parameters: {
      resolution: videoConfig.useLastFrame || videoConfig.useReferenceAssets ? '720p' : videoConfig.resolution,
      aspect_ratio: videoConfig.useReferenceAssets ? '16:9' : normalizeVideoAspectRatio(videoConfig.aspectRatio),
      duration: Math.max(1, Math.round(shot.duration || 1)),
      fps: videoConfig.frameRate || 24,
      referenceAssetCount: referenceAssets.length,
    },
  };
}

function getVolcengineTransitionRequestPreview(aspectRatio: AspectRatio, prompt: string, durationSeconds: number) {
  return {
    prompt,
    parameters: {
      resolution: '720p',
      aspect_ratio: normalizeVideoAspectRatio(aspectRatio),
      duration: Math.max(1, Math.round(durationSeconds || 3)),
      fps: 24,
    },
  };
}

function normalizeBriefStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/[,\n，、]/u)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeBriefAspectRatio(value: unknown): Brief['aspectRatio'] {
  return value === '21:9' || value === '9:16' || value === '1:1' || value === '4:3' || value === '3:4' ? value : '16:9';
}

function normalizeGeneratedBrief(brief: Brief): Brief {
  const normalizedCharacters = normalizeBriefStringArray(brief?.characters);
  const normalizedScenes = normalizeBriefStringArray(brief?.scenes);

  return {
    theme: typeof brief?.theme === 'string' ? brief.theme.trim() : '',
    style: typeof brief?.style === 'string' ? brief.style.trim() : '',
    characters: normalizedCharacters,
    scenes: normalizedScenes,
    events: typeof brief?.events === 'string' ? brief.events.trim() : '',
    mood: typeof brief?.mood === 'string' ? brief.mood.trim() : '',
    duration: typeof brief?.duration === 'string' ? brief.duration.trim() : '',
    aspectRatio: normalizeBriefAspectRatio(brief?.aspectRatio),
    platform: typeof brief?.platform === 'string' ? brief.platform.trim() : '',
  };
}

async function withModelLog<T>(
  operation: string,
  sourceId: ModelSourceId,
  modelName: string,
  request: unknown,
  runner: () => Promise<T>,
) {
  try {
    const response = await runner();
    appendModelInvocationLog({
      provider: getProvider(sourceId),
      operation,
      status: 'success',
      sourceId,
      modelName,
      request,
      response,
    });
    return response;
  } catch (error: any) {
    let errorMessage = error?.message || String(error);

    if (errorMessage.includes('Failed to fetch')) {
      const providerName = getProvider(sourceId) === 'gemini' ? 'Gemini' : '大模型 API';
      errorMessage = `网络请求失败 (Failed to fetch)。请检查您的网络是否通畅，以及 ${providerName} 是否可以正常访问。此问题通常是由于本地网络或代理设置引起的。\n原始报错：${errorMessage}`;
      
      if (error instanceof Error) {
        error.message = errorMessage;
      } else {
        error = new Error(errorMessage);
      }
    }

    appendModelInvocationLog({
      provider: getProvider(sourceId),
      operation,
      status: 'error',
      sourceId,
      modelName,
      request,
      error: errorMessage,
    });
    throw error;
  }
}

export async function generateBriefWithModel(idea: string, modelName: string, useMockMode: boolean = false, sourceId: ModelSourceId = 'gemini.textModel'): Promise<Brief> {
  return withModelLog(
    'generateBrief',
    sourceId,
    modelName,
    { idea, useMockMode },
    async () => normalizeGeneratedBrief(
      await (isVolcengineSource(sourceId)
        ? volcengineService.generateBriefWithModel(idea, modelName, useMockMode)
        : geminiService.generateBriefWithModel(idea, modelName, useMockMode)),
    ),
  );
}

export async function generateFastVideoPlanWithModel(input: FastVideoInput, modelName: string, useMockMode: boolean = false, sourceId: ModelSourceId = 'gemini.textModel'): Promise<FastVideoPlan> {
  return withModelLog(
    'generateFastVideoPlan',
    sourceId,
    modelName,
    { input, useMockMode },
    () => isVolcengineSource(sourceId)
      ? volcengineService.generateFastVideoPlanWithModel(input, modelName, useMockMode)
      : geminiService.generateFastVideoPlanWithModel(input, modelName, useMockMode),
  );
}

export async function generateFastVideoPromptWithModel(
  input: FastVideoInput,
  scenes: FastSceneDraft[],
  modelName: string,
  useMockMode: boolean = false,
  sourceId: ModelSourceId = 'gemini.textModel',
): Promise<FastVideoPromptDraft> {
  return withModelLog(
    'generateFastVideoPrompt',
    sourceId,
    modelName,
    { input, scenes, useMockMode },
    () => isVolcengineSource(sourceId)
      ? volcengineService.generateFastVideoPromptWithModel(input, scenes, modelName, useMockMode)
      : geminiService.generateFastVideoPromptWithModel(input, scenes, modelName, useMockMode),
  );
}

export async function generateShotList(brief: Brief, assets: Asset[], numShots: number = 5, useMockMode: boolean = false, modelName?: string, sourceId: ModelSourceId = 'gemini.textModel'): Promise<Shot[]> {
  const finalModelName = modelName || '';
  return withModelLog(
    'generateShotList',
    sourceId,
    finalModelName,
    { brief, assets, numShots, useMockMode },
    () => isVolcengineSource(sourceId)
      ? volcengineService.generateShotList(brief, assets, numShots, useMockMode, finalModelName)
      : geminiService.generateShotList(brief, assets, numShots, useMockMode, finalModelName),
  );
}

export async function generatePromptsForShot(shot: Shot, brief: Brief, assets: Asset[], allShots: Shot[] = [], useMockMode: boolean = false, modelName?: string, sourceId: ModelSourceId = 'gemini.textModel'): Promise<Shot> {
  const finalModelName = modelName || '';
  return withModelLog(
    'generatePromptsForShot',
    sourceId,
    finalModelName,
    { shot, brief, assets, allShots, useMockMode },
    () => isVolcengineSource(sourceId)
      ? volcengineService.generatePromptsForShot(shot, brief, assets, allShots, useMockMode, finalModelName)
      : geminiService.generatePromptsForShot(shot, brief, assets, allShots, useMockMode, finalModelName),
  );
}

export async function translatePromptsToEnglish(shot: Shot, useMockMode: boolean = false, modelName?: string, sourceId: ModelSourceId = 'gemini.textModel'): Promise<Shot> {
  const finalModelName = modelName || '';
  return withModelLog(
    'translatePromptsToEnglish',
    sourceId,
    finalModelName,
    { shot, useMockMode },
    () => isVolcengineSource(sourceId)
      ? volcengineService.translatePromptsToEnglish(shot, useMockMode, finalModelName)
      : geminiService.translatePromptsToEnglish(shot, useMockMode, finalModelName),
  );
}

export async function generateStoryboardImage(prompt: string, aspectRatio: VisualAspectRatio, modelName?: string, referenceAssets: Asset[] = [], useMockMode: boolean = false, baseImageBase64?: string, sourceId: ModelSourceId = 'gemini.imageModel'): Promise<string> {
  const finalModelName = modelName || '';
  return withModelLog(
    'generateStoryboardImage',
    sourceId,
    finalModelName,
    { prompt, aspectRatio, referenceAssets, useMockMode, hasBaseImage: Boolean(baseImageBase64) },
    () => isVolcengineSource(sourceId)
      ? volcengineService.generateStoryboardImage(prompt, aspectRatio, finalModelName, referenceAssets, useMockMode, baseImageBase64)
      : geminiService.generateStoryboardImage(prompt, aspectRatio, finalModelName, referenceAssets, useMockMode, baseImageBase64),
  );
}

export async function generateAssetPrompt(asset: Asset, brief: Brief, useMockMode: boolean = false, modelName?: string, sourceId: ModelSourceId = 'gemini.textModel'): Promise<string> {
  const finalModelName = modelName || '';
  return withModelLog(
    'generateAssetPrompt',
    sourceId,
    finalModelName,
    { asset, brief, useMockMode },
    () => isVolcengineSource(sourceId)
      ? volcengineService.generateAssetPrompt(asset, brief, useMockMode, finalModelName)
      : geminiService.generateAssetPrompt(asset, brief, useMockMode, finalModelName),
  );
}

export async function generateAssetImage(asset: Asset, brief: Brief, modelName?: string, useMockMode: boolean = false, promptModelName?: string, sourceId: ModelSourceId = 'gemini.imageModel', promptSourceId: ModelSourceId = 'gemini.textModel'): Promise<string> {
  const finalModelName = modelName || '';
  const finalPromptModelName = promptModelName || finalModelName;

  let assetWithPrompt = asset;
  if (!asset.imagePrompt) {
    const prompt = await generateAssetPrompt(asset, brief, useMockMode, finalPromptModelName, promptSourceId);
    assetWithPrompt = { ...asset, imagePrompt: prompt };
  }

  return withModelLog(
    'generateAssetImage',
    sourceId,
    finalModelName,
    { asset: assetWithPrompt, brief, useMockMode },
    () => isVolcengineSource(sourceId)
      ? volcengineService.generateAssetImage(assetWithPrompt, brief, finalModelName, useMockMode)
      : geminiService.generateAssetImage(assetWithPrompt, brief, finalModelName, useMockMode, finalPromptModelName),
  );
}

export async function startVideoGeneration(shot: Shot, defaultAspectRatio: AspectRatio, referenceAssets: Asset[] = [], useMockMode: boolean = false, modelName?: string, sourceId: ModelSourceId = 'gemini.fastVideoModel'): Promise<any> {
  const finalModelName = modelName || '';
  const requestPreview = isVolcengineSource(sourceId)
    ? getVolcengineVideoRequestPreview(shot, defaultAspectRatio, referenceAssets)
    : buildVideoGenerationRequest(shot, defaultAspectRatio, referenceAssets, finalModelName || 'veo-3.1-fast-generate-preview');
  return withModelLog(
    'startVideoGeneration',
    sourceId,
    finalModelName,
    { shot, defaultAspectRatio, referenceAssets, useMockMode, requestPreview },
    () => isVolcengineSource(sourceId)
      ? volcengineService.startVideoGeneration(shot, defaultAspectRatio, referenceAssets, useMockMode, finalModelName)
      : geminiService.startVideoGeneration(shot, defaultAspectRatio, referenceAssets, useMockMode, finalModelName),
  );
}

export async function startTransitionVideoGeneration(firstFrameUrl: string, lastFrameUrl: string, aspectRatio: AspectRatio, prompt: string = 'A smooth and natural transition between the two scenes', durationSeconds: number = 3, useMockMode: boolean = false, modelName?: string, sourceId: ModelSourceId = 'gemini.fastVideoModel'): Promise<any> {
  const finalModelName = modelName || '';
  const requestPreview = isVolcengineSource(sourceId)
    ? getVolcengineTransitionRequestPreview(aspectRatio, prompt, durationSeconds)
    : buildTransitionVideoGenerationRequest(firstFrameUrl, lastFrameUrl, aspectRatio, prompt, durationSeconds, finalModelName || 'veo-3.1-fast-generate-preview');
  return withModelLog(
    'startTransitionVideoGeneration',
    sourceId,
    finalModelName,
    { firstFrameUrl, lastFrameUrl, aspectRatio, prompt, durationSeconds, useMockMode, requestPreview },
    () => isVolcengineSource(sourceId)
      ? volcengineService.startTransitionVideoGeneration(firstFrameUrl, lastFrameUrl, aspectRatio, prompt, durationSeconds, useMockMode, finalModelName)
      : geminiService.startTransitionVideoGeneration(firstFrameUrl, lastFrameUrl, aspectRatio, prompt, durationSeconds, useMockMode, finalModelName),
  );
}

export async function generateTransitionPrompt(currentShot: Shot, nextShot: Shot, brief: Brief, useMockMode: boolean = false, modelName?: string, sourceId: ModelSourceId = 'gemini.textModel'): Promise<{ prompt: string; promptZh: string }> {
  const finalModelName = modelName || '';
  return withModelLog(
    'generateTransitionPrompt',
    sourceId,
    finalModelName,
    { currentShot, nextShot, brief, useMockMode },
    () => isVolcengineSource(sourceId)
      ? volcengineService.generateTransitionPrompt(currentShot, nextShot, brief, useMockMode, finalModelName)
      : geminiService.generateTransitionPrompt(currentShot, nextShot, brief, useMockMode, finalModelName),
  );
}

export async function checkVideoStatus(operation: any, useMockMode: boolean = false): Promise<any> {
  const provider = operation?.provider === 'volcengine' ? 'volcengine' : 'gemini';
  const sourceId: ModelSourceId = provider === 'volcengine' ? 'volcengine.videoModel' : 'gemini.fastVideoModel';

  return withModelLog(
    'checkVideoStatus',
    sourceId,
    provider,
    { operation, useMockMode },
    () => provider === 'volcengine'
      ? volcengineService.checkVideoStatus(operation, useMockMode)
      : geminiService.checkVideoStatus(operation, useMockMode),
  );
}

export async function cancelVideoOperation(operation: any, useMockMode: boolean = false): Promise<void> {
  const provider = operation?.provider === 'volcengine' ? 'volcengine' : 'gemini';
  const sourceId: ModelSourceId = provider === 'volcengine' ? 'volcengine.videoModel' : 'gemini.fastVideoModel';

  return withModelLog(
    'cancelVideoOperation',
    sourceId,
    provider,
    { operation, useMockMode },
    () => provider === 'volcengine'
      ? volcengineService.cancelVideoOperation(operation, useMockMode)
      : geminiService.cancelVideoOperation(operation, useMockMode),
  );
}

export async function fetchVideoBlobUrl(uri: string, useMockMode: boolean = false): Promise<string> {
  const isDirectRemoteUrl = uri.startsWith('http') && !uri.includes('googleapis.com') && !uri.includes('generativelanguage.googleapis.com');
  const sourceId: ModelSourceId = isDirectRemoteUrl ? 'volcengine.videoModel' : 'gemini.fastVideoModel';

  return withModelLog(
    'fetchVideoBlobUrl',
    sourceId,
    uri,
    { uri, useMockMode },
    () => isDirectRemoteUrl
      ? volcengineService.fetchVideoBlobUrl(uri, useMockMode)
      : geminiService.fetchVideoBlobUrl(uri, useMockMode),
  );
}
