import type { Asset, AspectRatio, Brief, Shot, VisualAspectRatio } from '../types.ts';
import type { FastVideoInput, FastVideoPlan } from '../features/fastVideoFlow/types/fastTypes.ts';
import { createFallbackFastVideoPlan } from '../features/fastVideoFlow/services/fastFlowMappers.ts';
import { buildFastVideoPlanPrompt, buildFastVideoPromptRegenerationPrompt, normalizeFastVideoExecutionPrompt } from '../features/fastVideoFlow/services/fastPromptBuilders.ts';
import { loadApiSettings } from './apiConfig.ts';
import { buildCharacterReferencePrompt, buildProductReferencePrompt, buildSceneReferencePrompt } from './assetPromptTemplate.ts';
import { getMockVideoUrl } from './mockMedia.ts';
import { enforceFramePromptAspectRatio, inferAspectRatioFromFramePrompts } from './promptAspectRatio.ts';
import { ensureInlineImageDataUrl, materializeAssetImageUrls, materializeShotImageUrls, normalizeVideoAspectRatio } from './requestBuilders.ts';

type VolcengineOperation = {
  provider: 'volcengine';
  taskId: string;
};

function getVolcengineConfig() {
  return loadApiSettings().volcengine;
}

function getBaseUrl() {
  return getVolcengineConfig().baseUrl.replace(/\/$/, '');
}

function getHeaders() {
  const config = getVolcengineConfig();
  const apiKey = config.apiKey.trim();

  if (!apiKey) {
    throw new Error('未配置火山引擎 API Key。');
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

function getBriefStyleContext(brief: Brief) {
  if (brief.stylePrompt?.trim()) {
    return `${brief.style}。Style consistency: ${brief.stylePrompt.trim()}`;
  }
  return brief.style;
}

async function requestJson(path: string, init: RequestInit) {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...getHeaders(),
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let data: Record<string, any> = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { rawText: text };
    }
  }

  if (!response.ok) {
    const message = (data as any)?.error?.message || (data as any)?.message || text || `HTTP ${response.status}`;
    throw new Error(`火山引擎请求失败: ${message}`);
  }

  return data as Record<string, any>;
}

function stripCodeFence(text: string) {
  return text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function extractMessageText(payload: any) {
  return payload?.choices?.[0]?.message?.content?.trim() || '';
}

function parseJsonFromMessage<T>(payload: any): T {
  const raw = stripCodeFence(extractMessageText(payload));
  return JSON.parse(raw || '{}') as T;
}

function buildChatBody(modelName: string, prompt: string, expectsJson: boolean) {
  return {
    model: modelName,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: expectsJson
          ? 'You are a structured creative production assistant. Return only valid JSON without markdown code fences.'
          : 'You are a concise creative production assistant.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    ...(expectsJson ? { response_format: { type: 'json_object' } } : {}),
  };
}

async function chatJson<T>(modelName: string, prompt: string) {
  const payload = await requestJson('/chat/completions', {
    method: 'POST',
    body: JSON.stringify(buildChatBody(modelName, prompt, true)),
  });
  return parseJsonFromMessage<T>(payload);
}

async function chatText(modelName: string, prompt: string) {
  const payload = await requestJson('/chat/completions', {
    method: 'POST',
    body: JSON.stringify(buildChatBody(modelName, prompt, false)),
  });
  return extractMessageText(payload);
}

function appendReferencePrompt(prompt: string, referenceAssets: Asset[] = [], baseImageBase64?: string) {
  const parts = [prompt];

  if (referenceAssets.length > 0) {
    parts.push(`Reference assets to preserve visually: ${referenceAssets.map((asset) => `${asset.name} (${asset.description})`).join('; ')}`);
  }

  if (baseImageBase64) {
    parts.push('Use the provided base image as the visual continuity reference.');
  }

  return parts.join('\n\n');
}

function collectReferenceImages(referenceAssets: Asset[] = [], baseImageBase64?: string): string[] {
  const images = new Set<string>();

  const baseImage = (baseImageBase64 || '').trim();
  if (baseImage) {
    images.add(baseImage);
  }

  for (const asset of referenceAssets) {
    const url = (asset.imageUrl || '').trim();
    if (url) {
      images.add(url);
    }
  }
  // Seedream 4.x/5.x allows up to 14 reference images for single-image generation.
  return Array.from(images).slice(0, 14);
}

function supportsSeedreamReferenceImage(modelName: string): boolean {
  const normalized = modelName.toLowerCase();
  // Seedream 3.0 only supports text-to-image in official docs.
  return !normalized.includes('seedream-3.0') && !normalized.includes('seedream-3-0');
}

function mapImageSize(aspectRatio: VisualAspectRatio) {
  if (aspectRatio === '1:1') {
    return '1K';
  }

  return '2K';
}

function findTaskId(payload: any): string {
  return (
    payload?.id ||
    payload?.task_id ||
    payload?.data?.id ||
    payload?.data?.task_id ||
    ''
  );
}

function findFirstUrl(payload: any, preferredVideo: boolean = false): string | undefined {
  const queue: unknown[] = [payload];
  let fallbackUrl: string | undefined;

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    if (typeof current === 'string') {
      if (/^https?:\/\//.test(current) || current.startsWith('data:')) {
        const normalized = current.toLowerCase();
        if (!preferredVideo) {
          return current;
        }
        if (normalized.includes('.mp4') || normalized.includes('video')) {
          return current;
        }
        if (!fallbackUrl) {
          fallbackUrl = current;
        }
      }
      continue;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    if (typeof current === 'object') {
      for (const value of Object.values(current as Record<string, unknown>)) {
        queue.push(value);
      }
    }
  }

  return preferredVideo ? undefined : fallbackUrl;
}

function getVideoConfig(shot: Shot, defaultAspectRatio: AspectRatio) {
  return shot.videoConfig || {
    resolution: '720p' as const,
    frameRate: 24,
    aspectRatio: defaultAspectRatio === '9:16' ? '9:16' as const : '16:9' as const,
    useFirstFrame: true,
    useLastFrame: true,
    useReferenceAssets: false,
  };
}

function buildVideoContent(prompt: string, firstFrameUrl?: string, lastFrameUrl?: string) {
  const content: Array<Record<string, any>> = [
    {
      type: 'text',
      text: prompt,
    },
  ];

  if (firstFrameUrl) {
    content.push({
      type: 'image_url',
      role: 'first_frame',
      image_url: {
        url: firstFrameUrl,
      },
    });
  }

  if (lastFrameUrl) {
    content.push({
      type: 'image_url',
      role: 'last_frame',
      image_url: {
        url: lastFrameUrl,
      },
    });
  }

  return content;
}

export async function generateBriefWithModel(idea: string, modelName: string, useMockMode: boolean = false): Promise<Brief> {
  if (useMockMode) {
    return {
      theme: '赛博朋克',
      style: '电影感，霓虹灯',
      characters: ['主角 A', '反派 B'],
      scenes: ['雨夜街道', '天台'],
      events: '主角在雨夜被追杀，最后在天台反击。',
      mood: '紧张，刺激',
      duration: '15s',
      aspectRatio: '16:9',
      platform: 'TikTok',
    };
  }

  return chatJson<Brief>(modelName, `Analyze the following creative idea and extract the key elements to form a structured creative brief for a video production.
Idea: "${idea}"
IMPORTANT: All output values MUST be in Simplified Chinese (简体中文).
Return ONLY a JSON object with keys: theme, style, characters, scenes, events, mood, duration, aspectRatio, platform. aspectRatio must be one of 16:9, 9:16, 1:1, 4:3.`);
}

export async function generateFastVideoPlanWithModel(input: FastVideoInput, modelName: string, useMockMode: boolean = false): Promise<FastVideoPlan> {
  if (useMockMode) {
    return createFallbackFastVideoPlan(input);
  }

  const result = await chatJson<FastVideoPlan>(modelName, buildFastVideoPlanPrompt(input));
  return {
    scenes: (result.scenes || []).map((scene, index) => ({
      ...scene,
      id: `fast-scene-${index + 1}`,
      summary: typeof scene.summary === 'string' ? scene.summary : '',
      continuityAnchors: Array.isArray(scene.continuityAnchors) ? scene.continuityAnchors : [],
      locked: false,
      status: 'idle',
      error: '',
      imageUrl: '',
      imageStorageKey: '',
    })),
    videoPrompt: {
      prompt: normalizeFastVideoExecutionPrompt(input, result.videoPrompt?.prompt),
      promptZh: normalizeFastVideoExecutionPrompt(input, result.videoPrompt?.promptZh || result.videoPrompt?.prompt),
    },
  };
}

export async function generateFastVideoPromptWithModel(
  input: FastVideoInput,
  scenes: FastVideoPlan['scenes'],
  modelName: string,
  useMockMode: boolean = false,
): Promise<FastVideoPlan['videoPrompt']> {
  if (useMockMode) {
    return createFallbackFastVideoPlan(input).videoPrompt;
  }

  const result = await chatJson<FastVideoPlan['videoPrompt']>(modelName, buildFastVideoPromptRegenerationPrompt(input, scenes));
  return {
    prompt: normalizeFastVideoExecutionPrompt(input, result?.prompt),
    promptZh: normalizeFastVideoExecutionPrompt(input, result?.promptZh || result?.prompt),
  };
}

export async function generateShotList(brief: Brief, assets: Asset[], numShots: number = 5, useMockMode: boolean = false, modelName: string): Promise<Shot[]> {
  if (useMockMode) {
    return Array(numShots).fill(0).map((_, index) => ({
      id: crypto.randomUUID(),
      shotNumber: index + 1,
      duration: 3,
      shotSize: '中景',
      cameraAngle: '平视',
      cameraMovement: '推镜头',
      subject: brief.characters[0] || '主角',
      action: `在场景 ${brief.scenes[0] || '某处'} 中进行动作 ${index + 1}`,
      mood: brief.mood,
      transition: '硬切',
      referenceAssets: assets.length > 0 ? [assets[0].id] : [],
    }));
  }

  const assetContext = assets.length > 0
    ? `Available Assets:\n${assets.map((asset) => `- ID: "${asset.id}", Type: ${asset.type}, Name: ${asset.name}`).join('\n')}`
    : '';

  const result = await chatJson<Array<Omit<Shot, 'id'>>>(modelName, `Based on the following creative brief, generate a detailed shot list consisting of exactly ${numShots} shots.

Brief:
${JSON.stringify(brief, null, 2)}

${assetContext}

Break down the narrative into a logical sequence of shots.
IMPORTANT: When a shot clearly happens in a known scene, include at least one matching scene asset ID in referenceAssets.
IMPORTANT: When a known character appears in a shot, include the matching character asset ID in referenceAssets.
IMPORTANT: All output string values MUST be in Simplified Chinese (简体中文).
Return ONLY a JSON array. Each item must contain: shotNumber, duration, shotSize, cameraAngle, cameraMovement, subject, action, mood, transition, dialog, referenceAssets.`);

  return result.map((shot) => ({
    ...shot,
    id: crypto.randomUUID(),
  }));
}

export async function generatePromptsForShot(shot: Shot, brief: Brief, assets: Asset[], allShots: Shot[] = [], useMockMode: boolean = false, modelName: string): Promise<Shot> {
  if (useMockMode) {
    const imagePrompt = enforceFramePromptAspectRatio({
      basic: 'A cinematic character portrait',
      basicZh: '电影感角色肖像',
      professional: 'Cinematic shot, dramatic lighting, highly detailed',
      professionalZh: '电影级镜头，戏剧化光影，细节丰富',
      lastFrameProfessional: 'Cinematic ending frame, visual continuity, highly detailed',
      lastFrameProfessionalZh: '电影级尾帧，保持画面连续性，细节丰富',
      negative: 'blurry, deformed, low quality',
      negativeZh: '模糊，变形，低质量',
    }, brief.aspectRatio);
    return {
      ...shot,
      imagePrompt: imagePrompt,
      videoPrompt: {
        textToVideo: 'Cinematic motion with clear subject movement and continuity',
        textToVideoZh: '电影化运动，主体动作清晰，保持连续性',
        imageToVideo: 'Animate from the first frame with smooth camera movement',
        imageToVideoZh: '从首帧开始平滑运动并带有自然镜头运动',
      },
    };
  }

  const referencedAssets = assets.filter((asset) => shot.referenceAssets?.includes(asset.id));
  const assetContext = referencedAssets.length > 0
    ? `The following consistency assets MUST be featured in this shot:\n${referencedAssets.map((asset) => `- ${asset.name} (${asset.description})`).join('\n')}`
    : '';
  const contextShots = allShots.filter((item) => item.shotNumber < shot.shotNumber).slice(-3);
  const storyContext = contextShots.length > 0
    ? `Context from previous shots:\n${contextShots.map((item) => `Shot ${item.shotNumber}: ${item.action}`).join('\n')}`
    : '';

  const result = await chatJson<Pick<Shot, 'imagePrompt' | 'videoPrompt'>>(modelName, `Generate professional image and video generation prompts for the following shot.

Shot Details:
${JSON.stringify(shot, null, 2)}

Overall Brief Context:
Theme: ${brief.theme}, Style: ${getBriefStyleContext(brief)}, Aspect Ratio: ${brief.aspectRatio}

${storyContext}

${assetContext}

Create detailed prompts suitable for AI image and video generation.
IMPORTANT: imagePrompt.professional / imagePrompt.professionalZh MUST explicitly include composition aspect ratio constraint (${brief.aspectRatio}), for the first frame.
IMPORTANT: imagePrompt.lastFrameProfessional / imagePrompt.lastFrameProfessionalZh MUST explicitly include composition aspect ratio constraint (${brief.aspectRatio}), for the last frame.
IMPORTANT: The two video prompts (textToVideo and imageToVideo) MUST include a time-coded timeline with at least 3 segments (for example 0.0s-1.5s, 1.5s-3.0s, 3.0s-4.0s).
IMPORTANT: Each timeline segment must describe character action, movement/blocking, facial expression, and camera movement.
IMPORTANT: If dialog exists, include when the line is spoken and require lip-sync with emotion; if no dialog, explicitly say it is silent and rely on expression/body language.
IMPORTANT: Generate the prompts in English, and also provide their Simplified Chinese (简体中文) translations.
Return ONLY a JSON object with keys: imagePrompt and videoPrompt.`);

  return {
    ...shot,
    imagePrompt: enforceFramePromptAspectRatio(result.imagePrompt, brief.aspectRatio),
    videoPrompt: result.videoPrompt,
  };
}

export async function translatePromptsToEnglish(shot: Shot, useMockMode: boolean = false, modelName: string): Promise<Shot> {
  if (useMockMode) {
    return shot;
  }

  const promptData = {
    imagePrompt: {
      professionalZh: shot.imagePrompt?.professionalZh,
      lastFrameProfessionalZh: shot.imagePrompt?.lastFrameProfessionalZh,
    },
    videoPrompt: {
      textToVideoZh: shot.videoPrompt?.textToVideoZh,
    },
  };

  const translated = await chatJson<any>(modelName, `Translate the following Chinese prompts into highly detailed, professional English prompts suitable for AI image and video generation models.

Chinese Prompts:
${JSON.stringify(promptData, null, 2)}

Return ONLY a JSON object with keys imagePrompt.professional, imagePrompt.lastFrameProfessional, videoPrompt.textToVideo.`);

  const inferredAspectRatio = inferAspectRatioFromFramePrompts(shot.imagePrompt);
  const mergedImagePrompt = {
    ...shot.imagePrompt!,
    professional: translated.imagePrompt?.professional || shot.imagePrompt?.professional || '',
    lastFrameProfessional: translated.imagePrompt?.lastFrameProfessional || shot.imagePrompt?.lastFrameProfessional || '',
  };

  return {
    ...shot,
    imagePrompt: inferredAspectRatio
      ? enforceFramePromptAspectRatio(mergedImagePrompt, inferredAspectRatio)
      : mergedImagePrompt,
    videoPrompt: {
      ...shot.videoPrompt!,
      textToVideo: translated.videoPrompt?.textToVideo || shot.videoPrompt?.textToVideo || '',
    },
  };
}

export async function generateTransitionPrompt(currentShot: Shot, nextShot: Shot, brief: Brief, useMockMode: boolean = false, modelName: string): Promise<{ prompt: string; promptZh: string }> {
  if (useMockMode) {
    return {
      prompt: 'A smooth and natural transition between the two scenes.',
      promptZh: '两个场景之间平滑自然的过渡。',
    };
  }

  const currentPrompt = currentShot.imagePrompt?.lastFrameProfessional || currentShot.imagePrompt?.professional || currentShot.action;
  const nextPrompt = nextShot.imagePrompt?.professional || nextShot.action;

  const result = await chatJson<{ prompt: string; promptZh: string }>(modelName, `Generate a professional prompt for an AI video generation model to create a smooth, coherent transition video between two shots.

Current Shot:
${currentPrompt}

Next Shot:
${nextPrompt}

Overall Brief Context:
Theme: ${brief.theme}, Style: ${getBriefStyleContext(brief)}

Return ONLY a JSON object with keys: prompt, promptZh.`);

  return {
    prompt: result.prompt || 'A smooth and natural transition between the two scenes',
    promptZh: result.promptZh || '两个场景之间平滑自然的过渡',
  };
}

export async function generateStoryboardImage(prompt: string, aspectRatio: VisualAspectRatio, modelName: string, referenceAssets: Asset[] = [], useMockMode: boolean = false, baseImageBase64?: string): Promise<string> {
  if (useMockMode) {
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  }

  const [normalizedReferenceAssets, normalizedBaseImage] = await Promise.all([
    materializeAssetImageUrls(referenceAssets),
    ensureInlineImageDataUrl(baseImageBase64),
  ]);
  const referenceImages = collectReferenceImages(normalizedReferenceAssets, normalizedBaseImage);
  const canUseReferenceImage = supportsSeedreamReferenceImage(modelName);
  const finalPrompt = appendReferencePrompt(prompt, normalizedReferenceAssets, normalizedBaseImage);
  const imageField = canUseReferenceImage && referenceImages.length > 0
    ? (referenceImages.length === 1 ? referenceImages[0] : referenceImages)
    : undefined;

  const payload = await requestJson('/images/generations', {
    method: 'POST',
    body: JSON.stringify({
      model: modelName,
      prompt: finalPrompt,
      ...(imageField ? { image: imageField } : {}),
      size: mapImageSize(aspectRatio),
      response_format: 'url',
      watermark: false,
    }),
  });

  const url = payload?.data?.[0]?.url || payload?.images?.[0]?.url || findFirstUrl(payload);
  if (!url) {
    throw new Error('火山引擎未返回图片结果。');
  }

  return url;
}

export async function generateAssetPrompt(asset: Asset, brief: Brief, useMockMode: boolean = false, modelName: string): Promise<string> {
  if (asset.type === 'character') {
    return buildCharacterReferencePrompt(asset, brief);
  }
  if (asset.type === 'scene') {
    return buildSceneReferencePrompt(asset, brief);
  }
  if (asset.type === 'product') {
    return buildProductReferencePrompt(asset, brief);
  }

  if (useMockMode) {
    return `Character design sheet, ${asset.name}, ${asset.description}. Theme: ${brief.theme}, Style: ${getBriefStyleContext(brief)}. High quality, detailed, white background.`;
  }

  const prompt = await chatText(modelName, `Translate the following character/asset description to a concise English image generation prompt.
Name: ${asset.name}
Description: ${asset.description}
Theme: ${brief.theme}
Style: ${getBriefStyleContext(brief)}

Return ONLY the English prompt. Format it as a comma-separated list of keywords and descriptions. Add "white background, character design sheet, high quality, detailed" at the end.`);

  return prompt.trim() || `Character design sheet, ${asset.name}, ${asset.description}. Theme: ${brief.theme}, Style: ${getBriefStyleContext(brief)}. High quality, detailed, white background.`;
}

export async function generateAssetImage(asset: Asset, brief: Brief, modelName: string, useMockMode: boolean = false): Promise<string> {
  if (useMockMode) {
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  }

  const prompt = asset.imagePrompt || await generateAssetPrompt(asset, brief, useMockMode, getVolcengineConfig().textModel);
  return generateStoryboardImage(prompt, '1:1', modelName, [], useMockMode);
}

export async function startVideoGeneration(shot: Shot, defaultAspectRatio: AspectRatio, referenceAssets: Asset[] = [], useMockMode: boolean = false, modelName: string): Promise<VolcengineOperation> {
  if (useMockMode) {
    return { provider: 'volcengine', taskId: `mock-op-${shot.id}` };
  }

  const [normalizedShot, normalizedReferenceAssets] = await Promise.all([
    materializeShotImageUrls(shot),
    materializeAssetImageUrls(referenceAssets),
  ]);
  const videoConfig = getVideoConfig(normalizedShot, defaultAspectRatio);
  const effectiveResolution = videoConfig.useLastFrame || videoConfig.useReferenceAssets ? '720p' : videoConfig.resolution;
  const prompt = normalizedShot.videoPrompt?.imageToVideo || normalizedShot.videoPrompt?.textToVideo || normalizedShot.action;
  const firstFrameUrl = videoConfig.useFirstFrame ? normalizedShot.imageUrl : undefined;
  const lastFrameUrl = videoConfig.useLastFrame && !videoConfig.useReferenceAssets ? normalizedShot.lastFrameImageUrl : undefined;
  const referenceHint = videoConfig.useReferenceAssets && normalizedReferenceAssets.length > 0
    ? ` Keep consistency with these assets: ${normalizedReferenceAssets.map((asset) => asset.name).join(', ')}.`
    : '';

  const payload = await requestJson('/contents/generations/tasks', {
    method: 'POST',
    body: JSON.stringify({
      model: modelName,
      content: buildVideoContent(`${prompt}${referenceHint}`, firstFrameUrl, lastFrameUrl),
      parameters: {
        resolution: effectiveResolution,
        aspect_ratio: videoConfig.useReferenceAssets ? '16:9' : normalizeVideoAspectRatio(videoConfig.aspectRatio),
        duration: Math.max(1, Math.round(shot.duration)),
        fps: videoConfig.frameRate || 24,
      },
    }),
  });

  const taskId = findTaskId(payload);
  if (!taskId) {
    throw new Error('火山引擎未返回视频任务 ID。');
  }

  return {
    provider: 'volcengine',
    taskId,
  };
}

export async function startTransitionVideoGeneration(firstFrameUrl: string, lastFrameUrl: string, aspectRatio: AspectRatio, prompt: string = 'A smooth and natural transition between the two scenes', durationSeconds: number = 3, useMockMode: boolean = false, modelName: string): Promise<VolcengineOperation> {
  if (useMockMode) {
    return { provider: 'volcengine', taskId: 'mock-op-transition' };
  }

  const [normalizedFirstFrameUrl, normalizedLastFrameUrl] = await Promise.all([
    ensureInlineImageDataUrl(firstFrameUrl),
    ensureInlineImageDataUrl(lastFrameUrl),
  ]);

  const payload = await requestJson('/contents/generations/tasks', {
    method: 'POST',
    body: JSON.stringify({
      model: modelName,
      content: buildVideoContent(prompt, normalizedFirstFrameUrl, normalizedLastFrameUrl),
      parameters: {
        resolution: '720p',
        aspect_ratio: normalizeVideoAspectRatio(aspectRatio),
        duration: Math.max(1, Math.round(durationSeconds || 3)),
        fps: 24,
      },
    }),
  });

  const taskId = findTaskId(payload);
  if (!taskId) {
    throw new Error('火山引擎未返回转场任务 ID。');
  }

  return {
    provider: 'volcengine',
    taskId,
  };
}

export async function checkVideoStatus(operation: VolcengineOperation, useMockMode: boolean = false): Promise<any> {
  if (useMockMode) {
    return {
      done: true,
      response: {
        generatedVideos: [{ video: { uri: 'https://www.w3schools.com/html/mov_bbb.mp4' } }],
      },
    };
  }

  const payload = await requestJson(`/contents/generations/tasks/${operation.taskId}`, {
    method: 'GET',
  });

  const status = String(payload?.status || payload?.data?.status || '').toLowerCase();

  if (status.includes('success') || status.includes('succeed') || status.includes('completed')) {
    const uri = findFirstUrl(payload, true);
    return {
      done: true,
      response: uri
        ? { generatedVideos: [{ video: { uri } }] }
        : { raiMediaFilteredReasons: ['火山引擎任务完成，但未返回视频地址。'] },
    };
  }

  if (status.includes('fail') || status.includes('error') || status.includes('cancel')) {
    const message = payload?.error?.message || payload?.message || '火山引擎视频生成失败。';
    return {
      done: true,
      response: {
        raiMediaFilteredReasons: [message],
      },
    };
  }

  return {
    done: false,
    response: payload,
  };
}

export async function cancelVideoOperation(operation: VolcengineOperation, useMockMode: boolean = false): Promise<void> {
  if (useMockMode) {
    return;
  }

  if (!operation?.taskId) {
    throw new Error('火山引擎视频任务缺少 taskId，无法取消。');
  }

  await requestJson(`/contents/generations/tasks/${operation.taskId}`, {
    method: 'DELETE',
  });
}

export async function fetchVideoBlobUrl(uri: string, useMockMode: boolean = false): Promise<string> {
  if (useMockMode) {
    return getMockVideoUrl();
  }

  return uri;
}
