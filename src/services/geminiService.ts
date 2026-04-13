import { GoogleGenAI, Type } from '@google/genai';
import { Brief, Asset, Shot, AspectRatio } from '../types';
import type { FastVideoInput, FastVideoPlan } from '../features/fastVideoFlow/types/fastTypes.ts';
import { createFallbackFastVideoPlan } from '../features/fastVideoFlow/services/fastFlowMappers.ts';
import { buildFastVideoPlanPrompt, buildFastVideoPromptRegenerationPrompt, normalizeFastVideoExecutionPrompt } from '../features/fastVideoFlow/services/fastPromptBuilders.ts';
import { loadApiSettings } from './apiConfig.ts';
import { buildCharacterReferencePrompt, buildProductReferencePrompt, buildSceneReferencePrompt } from './assetPromptTemplate.ts';
import { getMockVideoUrl } from './mockMedia.ts';
import {
  buildStoryboardGenerationInput,
  buildTransitionVideoGenerationRequest,
  buildVideoGenerationRequest,
  ensureInlineImageDataUrl,
  materializeAssetImageUrls,
  materializeShotImageUrls,
} from './requestBuilders.ts';
import { enforceFramePromptAspectRatio, inferAspectRatioFromFramePrompts } from './promptAspectRatio.ts';

function getGeminiConfig() {
  return loadApiSettings().gemini;
}

function getRuntimeEnv() {
  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {};
  const processEnv = typeof globalThis !== 'undefined' && 'process' in globalThis
    ? ((globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env || {})
    : {};

  return {
    ...processEnv,
    ...viteEnv,
  };
}

function resolveGeminiApiKey(): string {
  const geminiConfig = getGeminiConfig();
  const env = getRuntimeEnv();
  const apiKey = geminiConfig.apiKey.trim()
    || env.VITE_GEMINI_API_KEY
    || env.GEMINI_API_KEY
    || env.API_KEY;
  return typeof apiKey === 'string' ? apiKey.trim() : '';
}

function buildGeminiDownloadUrl(uri: string, apiKey: string): string {
  const isGoogleUri = uri.includes('generativelanguage.googleapis.com') || uri.includes('googleapis.com');
  if (!isGoogleUri || !apiKey) {
    return uri;
  }

  try {
    const downloadUrl = new URL(uri);
    if (!downloadUrl.searchParams.has('key')) {
      downloadUrl.searchParams.set('key', apiKey);
    }
    return downloadUrl.toString();
  } catch {
    return uri;
  }
}

function buildGeminiOperationActionUrl(operationName: string, action: 'cancel'): string {
  const normalized = operationName.trim().replace(/^\//u, '');
  if (!normalized) {
    throw new Error('Google 视频任务缺少 operation name。');
  }

  if (/^https?:\/\//iu.test(normalized)) {
    return `${normalized}:${action}`;
  }

  if (normalized.startsWith('v1beta/')) {
    return `https://generativelanguage.googleapis.com/${normalized}:${action}`;
  }

  return `https://generativelanguage.googleapis.com/v1beta/${normalized}:${action}`;
}

function getAI() {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API Key 未配置，请在 API 设置中填写或配置 GEMINI_API_KEY。');
  }
  return new GoogleGenAI({ apiKey });
}

function getBriefStyleContext(brief: Brief) {
  if (brief.stylePrompt?.trim()) {
    return `${brief.style}。Style consistency: ${brief.stylePrompt.trim()}`;
  }
  return brief.style;
}

export async function generateBrief(idea: string, useMockMode: boolean = false): Promise<Brief> {
  if (useMockMode) {
    await new Promise(r => setTimeout(r, 1000));
    return {
      theme: '赛博朋克',
      style: '电影感，霓虹灯',
      characters: ['主角 A', '反派 B'],
      scenes: ['雨夜街道', '天台'],
      events: '主角在雨夜被追杀，最后在天台反击。',
      mood: '紧张，刺激',
      duration: '15s',
      aspectRatio: '16:9',
      platform: 'TikTok'
    };
  }
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: getGeminiConfig().textModel,
    contents: `Analyze the following creative idea and extract the key elements to form a structured creative brief for a video production.
    Idea: "${idea}"
    IMPORTANT: All output values MUST be in Simplified Chinese (简体中文).`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          theme: { type: Type.STRING, description: 'The main theme or genre (e.g., Sci-Fi, Cyberpunk, Realistic, Fantasy) in Chinese' },
          style: { type: Type.STRING, description: 'Visual style (e.g., Cinematic, Anime, Commercial, MV) in Chinese' },
          characters: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'List of main characters in Chinese' },
          scenes: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'List of key scenes/locations in Chinese' },
          events: { type: Type.STRING, description: 'Summary of the main events or plot in Chinese' },
          mood: { type: Type.STRING, description: 'Overall emotional tone or mood in Chinese' },
          duration: { type: Type.STRING, description: 'Estimated total duration (e.g., "15s", "1 min") in Chinese' },
          aspectRatio: { type: Type.STRING, description: 'Recommended aspect ratio (16:9, 9:16, 1:1, or 4:3)' },
          platform: { type: Type.STRING, description: 'Target platform (e.g., TikTok, YouTube, Instagram) in Chinese' }
        },
        required: ['theme', 'style', 'characters', 'scenes', 'events', 'mood', 'duration', 'aspectRatio', 'platform']
      }
    }
  });

  return JSON.parse(response.text || '{}') as Brief;
}

export async function generateBriefWithModel(idea: string, modelName: string, useMockMode: boolean = false): Promise<Brief> {
  if (useMockMode) {
    return generateBrief(idea, true);
  }

  const ai = getAI();
  const response = await ai.models.generateContent({
    model: modelName,
    contents: `Analyze the following creative idea and extract the key elements to form a structured creative brief for a video production.
    Idea: "${idea}"
    IMPORTANT: All output values MUST be in Simplified Chinese (简体中文).`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          theme: { type: Type.STRING, description: 'The main theme or genre (e.g., Sci-Fi, Cyberpunk, Realistic, Fantasy) in Chinese' },
          style: { type: Type.STRING, description: 'Visual style (e.g., Cinematic, Anime, Commercial, MV) in Chinese' },
          characters: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'List of main characters in Chinese' },
          scenes: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'List of key scenes/locations in Chinese' },
          events: { type: Type.STRING, description: 'Summary of the main events or plot in Chinese' },
          mood: { type: Type.STRING, description: 'Overall emotional tone or mood in Chinese' },
          duration: { type: Type.STRING, description: 'Estimated total duration (e.g., "15s", "1 min") in Chinese' },
          aspectRatio: { type: Type.STRING, description: 'Recommended aspect ratio (16:9, 9:16, 1:1, or 4:3)' },
          platform: { type: Type.STRING, description: 'Target platform (e.g., TikTok, YouTube, Instagram) in Chinese' }
        },
        required: ['theme', 'style', 'characters', 'scenes', 'events', 'mood', 'duration', 'aspectRatio', 'platform']
      }
    }
  });

  return JSON.parse(response.text || '{}') as Brief;
}

export async function generateFastVideoPlanWithModel(input: FastVideoInput, modelName: string, useMockMode: boolean = false): Promise<FastVideoPlan> {
  if (useMockMode) {
    return createFallbackFastVideoPlan(input);
  }

  const ai = getAI();
  const response = await ai.models.generateContent({
    model: modelName || getGeminiConfig().textModel,
    contents: buildFastVideoPlanPrompt(input),
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                imagePrompt: { type: Type.STRING },
                imagePromptZh: { type: Type.STRING },
                negativePrompt: { type: Type.STRING },
                negativePromptZh: { type: Type.STRING },
              },
              required: ['title', 'imagePrompt', 'imagePromptZh', 'negativePrompt', 'negativePromptZh'],
            },
          },
          videoPrompt: {
            type: Type.OBJECT,
            properties: {
              prompt: { type: Type.STRING },
              promptZh: { type: Type.STRING },
            },
            required: ['prompt', 'promptZh'],
          },
        },
        required: ['scenes', 'videoPrompt'],
      },
    },
  });

  const parsed = JSON.parse(response.text || '{}') as FastVideoPlan;
  return {
    scenes: (parsed.scenes || []).map((scene, index) => ({
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
      prompt: normalizeFastVideoExecutionPrompt(input, parsed.videoPrompt?.prompt),
      promptZh: normalizeFastVideoExecutionPrompt(input, parsed.videoPrompt?.promptZh || parsed.videoPrompt?.prompt),
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

  const ai = getAI();
  const response = await ai.models.generateContent({
    model: modelName || getGeminiConfig().textModel,
    contents: buildFastVideoPromptRegenerationPrompt(input, scenes),
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          prompt: { type: Type.STRING },
          promptZh: { type: Type.STRING },
        },
        required: ['prompt', 'promptZh'],
      },
    },
  });

  const parsed = JSON.parse(response.text || '{}') as FastVideoPlan['videoPrompt'];
  return {
    prompt: normalizeFastVideoExecutionPrompt(input, parsed?.prompt),
    promptZh: normalizeFastVideoExecutionPrompt(input, parsed?.promptZh || parsed?.prompt),
  };
}

export async function generateShotList(brief: Brief, assets: Asset[], numShots: number = 5, useMockMode: boolean = false, modelName?: string): Promise<Shot[]> {
  if (useMockMode) {
    await new Promise(r => setTimeout(r, 1000));
    return Array(numShots).fill(0).map((_, i) => ({
      id: crypto.randomUUID(),
      shotNumber: i + 1,
      duration: 3,
      shotSize: '中景',
      cameraAngle: '平视',
      cameraMovement: '推镜头',
      subject: brief.characters[0] || '主角',
      action: `在场景 ${brief.scenes[0] || '某处'} 中进行动作 ${i+1}`,
      mood: brief.mood,
      transition: '硬切',
      referenceAssets: assets.length > 0 ? [assets[0].id] : []
    }));
  }
  const ai = getAI();
  const assetContext = assets.length > 0 
    ? `Available Assets (use their IDs in referenceAssets if they appear in the shot):\n${assets.map(a => `- ID: "${a.id}", Type: ${a.type}, Name: ${a.name}`).join('\n')}`
    : '';

  const response = await ai.models.generateContent({
    model: modelName || getGeminiConfig().textModel,
    contents: `Based on the following creative brief, generate a detailed shot list consisting of exactly ${numShots} shots.
    
    Brief:
    ${JSON.stringify(brief, null, 2)}
    
    ${assetContext}
    
    Break down the narrative into a logical sequence of shots.
    IMPORTANT: When a shot clearly happens in a known scene, include at least one matching scene asset ID in referenceAssets.
    IMPORTANT: When a known character appears in a shot, include the matching character asset ID in referenceAssets.
    IMPORTANT: All output string values (shotSize, cameraAngle, cameraMovement, subject, action, mood, transition, dialog) MUST be in Simplified Chinese (简体中文).
    CRITICAL RULE: 同一个镜头中应该确保提示词不会涉及到场景大的变换。如果涉及到场景变换，必须拆分为多个镜头。 (Ensure no major scene changes within a single shot. Split into multiple shots if necessary).`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            shotNumber: { type: Type.INTEGER },
            duration: { type: Type.NUMBER, description: 'Duration in seconds' },
            shotSize: { type: Type.STRING, description: 'e.g., 远景, 中景, 特写' },
            cameraAngle: { type: Type.STRING, description: 'e.g., 平视, 俯拍, 仰拍' },
            cameraMovement: { type: Type.STRING, description: 'e.g., 固定, 摇镜头, 推镜头' },
            subject: { type: Type.STRING, description: 'Main subject of the shot in Chinese' },
            action: { type: Type.STRING, description: 'What happens in the shot in Chinese' },
            mood: { type: Type.STRING, description: 'Emotional tone of the shot in Chinese' },
            transition: { type: Type.STRING, description: 'Transition to the next shot (e.g., 硬切, 淡入淡出) in Chinese' },
            dialog: { type: Type.STRING, description: 'Optional dialog or voiceover in Chinese' },
            referenceAssets: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Array of asset IDs that appear in this shot' }
          },
          required: ['shotNumber', 'duration', 'shotSize', 'cameraAngle', 'cameraMovement', 'subject', 'action', 'mood', 'transition', 'referenceAssets']
        }
      }
    }
  });

  const shotsData = JSON.parse(response.text || '[]');
  return shotsData.map((s: any) => ({
    ...s,
    id: crypto.randomUUID()
  }));
}

export async function generatePromptsForShot(shot: Shot, brief: Brief, assets: Asset[], allShots: Shot[] = [], useMockMode: boolean = false, modelName?: string): Promise<Shot> {
  if (useMockMode) {
    await new Promise(r => setTimeout(r, 1000));
    const imagePrompt = enforceFramePromptAspectRatio({
      basic: 'A cyberpunk character running',
      basicZh: '一个赛博朋克角色在奔跑',
      professional: 'Cinematic shot, cyberpunk character running in rain, neon lights, 8k resolution, highly detailed',
      professionalZh: '电影级镜头，赛博朋克角色在雨中奔跑，霓虹灯，8k分辨率，细节丰富',
      lastFrameProfessional: 'Cinematic shot, cyberpunk character stops and looks back, neon lights, 8k resolution',
      lastFrameProfessionalZh: '电影级镜头，赛博朋克角色停下回头，霓虹灯，8k分辨率',
      negative: 'blurry, low quality, deformed',
      negativeZh: '模糊，低质量，变形'
    }, brief.aspectRatio);
    return {
      ...shot,
      imagePrompt: imagePrompt,
      videoPrompt: {
        textToVideo: 'Camera pushes in as a cyberpunk character runs through a rainy neon street',
        textToVideoZh: '镜头推进，一个赛博朋克角色在下雨的霓虹街道上奔跑',
        imageToVideo: 'The character starts running forward, rain falling dynamically',
        imageToVideoZh: '角色开始向前跑，雨水动态落下'
      }
    };
  }
  const ai = getAI();
  const referencedAssets = assets.filter(a => shot.referenceAssets?.includes(a.id));
  const assetContext = referencedAssets.length > 0 
    ? `The following consistency assets MUST be featured in this shot:\n${referencedAssets.map(a => `- ${a.name} (${a.description})`).join('\n')}`
    : '';

  const contextShots = allShots.filter(s => s.shotNumber < shot.shotNumber).slice(-3);
  const storyContext = contextShots.length > 0
    ? `Context from previous shots:\n${contextShots.map(s => `Shot ${s.shotNumber}: ${s.action}`).join('\n')}`
    : '';

  // Remove large data fields like base64 images before stringifying
  const { imageUrl, videoUrl, videoOperation, ...cleanShot } = shot;

  const response = await ai.models.generateContent({
    model: modelName || getGeminiConfig().textModel,
    contents: `Generate professional image and video generation prompts for the following shot.
    
    Shot Details:
    ${JSON.stringify(cleanShot, null, 2)}
    
    Overall Brief Context:
    Theme: ${brief.theme}, Style: ${getBriefStyleContext(brief)}, Aspect Ratio: ${brief.aspectRatio}
    
    ${storyContext}
    
    ${assetContext}
    
    Create detailed prompts suitable for AI models like Midjourney/Stable Diffusion (Image) and Runway/Kling/Sora (Video).
    IMPORTANT: imagePrompt.professional / imagePrompt.professionalZh MUST explicitly include composition aspect ratio constraint (${brief.aspectRatio}), for the first frame.
    IMPORTANT: imagePrompt.lastFrameProfessional / imagePrompt.lastFrameProfessionalZh MUST explicitly include composition aspect ratio constraint (${brief.aspectRatio}), for the last frame.
    IMPORTANT: Ensure the video prompt maintains narrative and visual continuity with the previous shots.
    IMPORTANT: The two video prompts (textToVideo and imageToVideo) MUST include a time-coded timeline with at least 3 segments (e.g., 0.0s-1.5s, 1.5s-3.0s, 3.0s-4.0s).
    IMPORTANT: Each timeline segment must describe character action, movement/blocking, facial expression, and camera movement.
    IMPORTANT: If dialog exists, include when the line is spoken and require lip-sync with emotion; if no dialog, explicitly say it is silent and rely on expression/body language.
    IMPORTANT: Generate the prompts in English, and also provide their Simplified Chinese (简体中文) translations in the respective *Zh fields.`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          imagePrompt: {
            type: Type.OBJECT,
            properties: {
              basic: { type: Type.STRING, description: 'Simple, descriptive prompt for basic image models (English)' },
              basicZh: { type: Type.STRING, description: 'Chinese translation of basic prompt' },
              professional: { type: Type.STRING, description: 'Highly detailed prompt for the FIRST FRAME of the shot (English)' },
              professionalZh: { type: Type.STRING, description: 'Chinese translation of first frame professional prompt' },
              lastFrameProfessional: { type: Type.STRING, description: 'Highly detailed prompt for the LAST FRAME of the shot, ensuring visual consistency with the first frame (English)' },
              lastFrameProfessionalZh: { type: Type.STRING, description: 'Chinese translation of last frame professional prompt' },
              negative: { type: Type.STRING, description: 'Negative prompt to avoid artifacts or unwanted elements (English)' },
              negativeZh: { type: Type.STRING, description: 'Chinese translation of negative prompt' }
            },
            required: ['basic', 'basicZh', 'professional', 'professionalZh', 'lastFrameProfessional', 'lastFrameProfessionalZh', 'negative', 'negativeZh']
          },
          videoPrompt: {
            type: Type.OBJECT,
            properties: {
              textToVideo: { type: Type.STRING, description: 'Prompt for generating video directly from text with explicit timeline segments and camera/motion detail (English)' },
              textToVideoZh: { type: Type.STRING, description: 'Chinese translation of text-to-video prompt' },
              imageToVideo: { type: Type.STRING, description: 'Prompt for animating a starting image with explicit timeline segments, character acting and camera direction (English)' },
              imageToVideoZh: { type: Type.STRING, description: 'Chinese translation of image-to-video prompt' }
            },
            required: ['textToVideo', 'textToVideoZh', 'imageToVideo', 'imageToVideoZh']
          }
        },
        required: ['imagePrompt', 'videoPrompt']
      }
    }
  });

  const prompts = JSON.parse(response.text || '{}');
  const imagePrompt = enforceFramePromptAspectRatio(prompts.imagePrompt, brief.aspectRatio);
  return {
    ...shot,
    imagePrompt: imagePrompt,
    videoPrompt: prompts.videoPrompt
  };
}

export async function translatePromptsToEnglish(shot: Shot, useMockMode: boolean = false, modelName?: string): Promise<Shot> {
  if (useMockMode) {
    await new Promise(r => setTimeout(r, 1000));
    return shot;
  }
  const ai = getAI();
  
  const promptData = {
    imagePrompt: {
      professionalZh: shot.imagePrompt?.professionalZh,
      lastFrameProfessionalZh: shot.imagePrompt?.lastFrameProfessionalZh,
    },
    videoPrompt: {
      textToVideoZh: shot.videoPrompt?.textToVideoZh,
    }
  };

  const response = await ai.models.generateContent({
    model: modelName || getGeminiConfig().textModel,
    contents: `Translate the following Chinese prompts into highly detailed, professional English prompts suitable for AI image and video generation models (like Midjourney, Stable Diffusion, Sora, Runway).
    
    Chinese Prompts:
    ${JSON.stringify(promptData, null, 2)}
    
    Return ONLY a JSON object with the translated English strings.`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          imagePrompt: {
            type: Type.OBJECT,
            properties: {
              professional: { type: Type.STRING },
              lastFrameProfessional: { type: Type.STRING }
            }
          },
          videoPrompt: {
            type: Type.OBJECT,
            properties: {
              textToVideo: { type: Type.STRING }
            }
          }
        }
      }
    }
  });

  const translated = JSON.parse(response.text || '{}');
  const inferredAspectRatio = inferAspectRatioFromFramePrompts(shot.imagePrompt);
  const mergedImagePrompt = {
    ...shot.imagePrompt!,
    professional: translated.imagePrompt?.professional || shot.imagePrompt?.professional || '',
    lastFrameProfessional: translated.imagePrompt?.lastFrameProfessional || shot.imagePrompt?.lastFrameProfessional || '',
  };
  const imagePrompt = inferredAspectRatio
    ? enforceFramePromptAspectRatio(mergedImagePrompt, inferredAspectRatio)
    : mergedImagePrompt;
  
  return {
    ...shot,
    imagePrompt: imagePrompt,
    videoPrompt: {
      ...shot.videoPrompt!,
      textToVideo: translated.videoPrompt?.textToVideo || shot.videoPrompt?.textToVideo || '',
    }
  };
}

export async function generateTransitionPrompt(currentShot: Shot, nextShot: Shot, brief: Brief, useMockMode: boolean = false, modelName?: string): Promise<{ prompt: string, promptZh: string }> {
  if (useMockMode) {
    await new Promise(r => setTimeout(r, 1000));
    return {
      prompt: "A smooth and natural transition between the two scenes, blending elements seamlessly.",
      promptZh: "两个场景之间平滑自然的过渡，元素无缝融合。"
    };
  }
  
  const ai = getAI();
  
  const currentPrompt = currentShot.imagePrompt?.lastFrameProfessional || currentShot.imagePrompt?.professional || currentShot.action;
  const nextPrompt = nextShot.imagePrompt?.professional || nextShot.action;

  const response = await ai.models.generateContent({
    model: modelName || getGeminiConfig().textModel,
    contents: `Generate a professional prompt for an AI video generation model to create a smooth, coherent transition video between two shots.
    
    Current Shot (Last Frame) Context:
    ${currentPrompt}
    
    Next Shot (First Frame) Context:
    ${nextPrompt}
    
    Overall Brief Context:
    Theme: ${brief.theme}, Style: ${getBriefStyleContext(brief)}
    
    Create a detailed prompt that describes how the visual elements, camera movement, or lighting should transition from the current shot to the next shot. The transition should feel natural and cinematic.
    Provide the prompt in English and its Simplified Chinese (简体中文) translation.`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          prompt: { type: Type.STRING, description: 'The transition prompt in English' },
          promptZh: { type: Type.STRING, description: 'The transition prompt in Simplified Chinese' }
        },
        required: ['prompt', 'promptZh']
      }
    }
  });

  const result = JSON.parse(response.text || '{}');
  return {
    prompt: result.prompt || "A smooth and natural transition between the two scenes",
    promptZh: result.promptZh || "两个场景之间平滑自然的过渡"
  };
}

export async function generateStoryboardImage(prompt: string, aspectRatio: AspectRatio, modelName?: string, referenceAssets: Asset[] = [], useMockMode: boolean = false, baseImageBase64?: string): Promise<string> {
  if (useMockMode) {
    await new Promise(r => setTimeout(r, 1500));
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  }
  const ai = getAI();
  const geminiConfig = getGeminiConfig();
  const [normalizedReferenceAssets, normalizedBaseImage] = await Promise.all([
    materializeAssetImageUrls(referenceAssets),
    ensureInlineImageDataUrl(baseImageBase64),
  ]);
  const { modelName: resolvedModelName, config, parts } = buildStoryboardGenerationInput(
    prompt,
    aspectRatio,
    modelName || geminiConfig.imageModel,
    normalizedReferenceAssets,
    normalizedBaseImage,
  );

  const response = await ai.models.generateContent({
    model: resolvedModelName,
    contents: { parts },
    config
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No image generated");
}

export async function generateAssetPrompt(asset: Asset, brief: Brief, useMockMode: boolean = false, modelName?: string): Promise<string> {
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
    await new Promise(r => setTimeout(r, 500));
    return `Character design sheet, ${asset.name}, ${asset.description}. Theme: ${brief.theme}, Style: ${getBriefStyleContext(brief)}. High quality, detailed, white background.`;
  }
  const ai = getAI();
  const translationResponse = await ai.models.generateContent({
    model: modelName || getGeminiConfig().textModel,
    contents: `Translate the following character/asset description to a concise English image generation prompt. 
    Name: ${asset.name}
    Description: ${asset.description}
    Theme: ${brief.theme}
    Style: ${getBriefStyleContext(brief)}
    
    Return ONLY the English prompt, nothing else. Format it as a comma-separated list of keywords and descriptions. Add "white background, character design sheet, high quality, detailed" at the end.`
  });
  return translationResponse.text?.trim() || `Character design sheet, ${asset.name}, ${asset.description}. Theme: ${brief.theme}, Style: ${getBriefStyleContext(brief)}. High quality, detailed, white background.`;
}

export async function generateAssetImage(asset: Asset, brief: Brief, modelName?: string, useMockMode: boolean = false, promptModelName?: string): Promise<string> {
  if (useMockMode) {
    await new Promise(r => setTimeout(r, 1500));
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  }
  
  const prompt = asset.imagePrompt || await generateAssetPrompt(asset, brief, useMockMode, promptModelName);
  
  return await generateStoryboardImage(prompt, "1:1", modelName, [], useMockMode);
}

export async function startVideoGeneration(shot: Shot, defaultAspectRatio: AspectRatio, referenceAssets: Asset[] = [], useMockMode: boolean = false, modelName?: string): Promise<any> {
  if (useMockMode) {
    await new Promise(r => setTimeout(r, 1000));
    return { provider: 'gemini', name: `operations/mock-op-${shot.id}`, done: false };
  }
  const ai = getAI();
  const geminiConfig = getGeminiConfig();
  const [normalizedShot, normalizedReferenceAssets] = await Promise.all([
    materializeShotImageUrls(shot),
    materializeAssetImageUrls(referenceAssets),
  ]);
  const req = buildVideoGenerationRequest(
    normalizedShot,
    defaultAspectRatio,
    normalizedReferenceAssets,
    modelName || geminiConfig.fastVideoModel,
    geminiConfig.proVideoModel,
  );

  const operation = await ai.models.generateVideos(req as any);
  return Object.assign(operation || {}, { provider: 'gemini' });
}

export async function startTransitionVideoGeneration(firstFrameUrl: string, lastFrameUrl: string, aspectRatio: AspectRatio, prompt: string = 'A smooth and natural transition between the two scenes', durationSeconds: number = 3, useMockMode: boolean = false, modelName?: string): Promise<any> {
  if (useMockMode) {
    await new Promise(r => setTimeout(r, 1000));
    return { provider: 'gemini', name: 'operations/mock-op-transition', done: false };
  }
  const ai = getAI();
  const [normalizedFirstFrameUrl, normalizedLastFrameUrl] = await Promise.all([
    ensureInlineImageDataUrl(firstFrameUrl),
    ensureInlineImageDataUrl(lastFrameUrl),
  ]);
  const req = buildTransitionVideoGenerationRequest(
    normalizedFirstFrameUrl || '',
    normalizedLastFrameUrl || '',
    aspectRatio,
    prompt,
    durationSeconds,
    modelName || getGeminiConfig().fastVideoModel,
  );

  const operation = await ai.models.generateVideos(req as any);
  return Object.assign(operation || {}, { provider: 'gemini' });
}

export async function checkVideoStatus(operation: any, useMockMode: boolean = false): Promise<any> {
  if (useMockMode) {
    await new Promise(r => setTimeout(r, 1000));
    return {
      done: true,
      response: {
        generatedVideos: [{ video: { uri: 'mock-video-uri' } }]
      }
    };
  }
  const ai = getAI();
  return await ai.operations.getVideosOperation({ operation });
}

export async function cancelVideoOperation(operation: any, useMockMode: boolean = false): Promise<void> {
  if (useMockMode) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return;
  }

  const operationName = (operation?.name || '').trim();
  if (!operationName) {
    throw new Error('Google 视频任务缺少 operation name，无法取消。');
  }

  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API Key 未配置，无法取消视频任务。');
  }

  const response = await fetch(buildGeminiOperationActionUrl(operationName, 'cancel'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: '{}',
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Google 视频任务取消失败（HTTP ${response.status}）。`);
  }
}

export async function fetchVideoBlobUrl(uri: string, useMockMode: boolean = false): Promise<string> {
  if (useMockMode && uri === 'mock-video-uri') {
    await new Promise(r => setTimeout(r, 500));
    return getMockVideoUrl();
  }
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API Key 未配置，无法下载生成的视频。');
  }

  const downloadUrl = buildGeminiDownloadUrl(uri, apiKey);
  const response = await fetch(downloadUrl, {
    method: 'GET',
    headers: {
      'x-goog-api-key': apiKey,
    },
  });
  if (!response.ok) throw new Error('Failed to fetch video');
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
