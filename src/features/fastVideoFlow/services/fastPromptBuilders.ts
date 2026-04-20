import type { FastSceneDraft, FastVideoInput } from '../types/fastTypes.ts';
import { FAST_VIDEO_PROMPT_CONFIG } from '../../../config/fastVideoPrompts.ts';

const FAST_REFERENCE_TYPE_LABELS: Record<NonNullable<FastVideoInput['referenceImages'][number]['referenceType']>, string> = {
  person: '人物参考图',
  scene: '场景参考图',
  product: '产品参考图',
  style: '风格参考图',
  other: '其他参考图',
};

const FAST_REFERENCE_VIDEO_TYPE_LABELS: Record<NonNullable<FastVideoInput['referenceVideos'][number]['referenceType']>, string> = {
  motion: '动作参考视频',
  camera: '运镜参考视频',
  effect: '特效参考视频',
  edit: '视频编辑参考',
  extend: '视频延长参考',
  other: '其他参考视频',
};

const FAST_REFERENCE_AUDIO_TYPE_LABELS: Record<NonNullable<FastVideoInput['referenceAudios'][number]['referenceType']>, string> = {
  music: '音乐参考音频',
  dialogue: '对白参考音频',
  effect: '音效参考音频',
  rhythm: '节奏参考音频',
  other: '其他参考音频',
};

function getFastReferenceTypeLabel(referenceType?: FastVideoInput['referenceImages'][number]['referenceType']) {
  return FAST_REFERENCE_TYPE_LABELS[referenceType || 'other'] || FAST_REFERENCE_TYPE_LABELS.other;
}

function getFastReferenceVideoTypeLabel(referenceType?: FastVideoInput['referenceVideos'][number]['referenceType']) {
  return FAST_REFERENCE_VIDEO_TYPE_LABELS[referenceType || 'other'] || FAST_REFERENCE_VIDEO_TYPE_LABELS.other;
}

function getFastReferenceAudioTypeLabel(referenceType?: FastVideoInput['referenceAudios'][number]['referenceType']) {
  return FAST_REFERENCE_AUDIO_TYPE_LABELS[referenceType || 'other'] || FAST_REFERENCE_AUDIO_TYPE_LABELS.other;
}

function buildFastReferenceImageDetails(input: FastVideoInput) {
  const readyReferences = input.referenceImages.filter((item) => item.imageUrl.trim());

  if (readyReferences.length === 0) {
    return 'No structured reference images are available.';
  }

  return readyReferences.map((reference, index) => (
    `- 图片${index + 1}: type=${getFastReferenceTypeLabel(reference.referenceType)}; description=${(reference.description || '').trim() || 'N/A'}; assetId=${(reference.assetId || '').trim() || 'N/A'}`
  )).join('\n');
}

function buildFastReferenceVideoDetails(input: FastVideoInput) {
  const readyVideos = input.referenceVideos.filter((item) => item.videoUrl.trim());

  if (readyVideos.length === 0) {
    return 'No structured reference videos are available.';
  }

  return readyVideos.map((video, index) => (
    `- 视频${index + 1}: type=${getFastReferenceVideoTypeLabel(video.referenceType)}; description=${(video.description || '').trim() || 'N/A'}`
  )).join('\n');
}

function buildFastReferenceAudioDetails(input: FastVideoInput) {
  const readyAudios = input.referenceAudios.filter((item) => item.audioUrl.trim());

  if (readyAudios.length === 0) {
    return 'No structured reference audios are available.';
  }

  return readyAudios.map((audio, index) => (
    `- 音频${index + 1}: type=${getFastReferenceAudioTypeLabel(audio.referenceType)}; description=${(audio.description || '').trim() || 'N/A'}`
  )).join('\n');
}

function buildFastReferenceImagePromptPrefix(input: FastVideoInput) {
  const readyReferences = input.referenceImages.filter((item) => item.imageUrl.trim());

  if (readyReferences.length === 0) {
    return '';
  }

  return `参考图对应关系：${readyReferences.map((reference, index) => {
    const label = `图片${index + 1}`;
    const typeLabel = getFastReferenceTypeLabel(reference.referenceType);
    const description = (reference.description || '').trim();
    return `${label}是${typeLabel}${description ? `，${description}` : ''}`;
  }).join('；')}。后文凡涉及参考图，均按上述图片编号理解，并与提交给 API 的图片数组顺序一一对应。`;
}

function buildQuickCutDirective(input: FastVideoInput) {
  if (!input.quickCutEnabled) {
    return '';
  }

  return `
Quick cut mode: enabled

Quick cut reference brief:
${FAST_VIDEO_PROMPT_CONFIG.quickCut.promptLead}

Quick cut reference beats:
${FAST_VIDEO_PROMPT_CONFIG.quickCut.referenceTimeline}

Quick cut requirements:
${FAST_VIDEO_PROMPT_CONFIG.quickCut.requirements.map((requirement) => `- ${requirement}`).join('\n')}
- Do not output the beat list verbatim unless it naturally fits the final prompt. Convert it into a polished, execution-ready prompt with the same rhythm, shot energy, and visual intensity.`;
}

function buildFastVideoPlanTasks(input: FastVideoInput) {
  if (input.quickCutEnabled) {
    return [
      'Do not create storyboard scenes or storyboard image prompts. Return scenes as an empty array.',
      'Write one final video prompt for Dreamina Seedance multimodal2video directly from the main prompt, reference media, duration, aspect ratio, and quick-cut guidance.',
      'The final video prompt should be execution-ready and emphasize fast-cut pacing, camera rhythm, motion, continuity, style, and exclusions.',
    ];
  }

  if (input.preferredSceneCount !== 'auto') {
    return [
      `Create exactly ${input.preferredSceneCount} storyboard scene${input.preferredSceneCount > 1 ? 's' : ''}.`,
      'Write storyboard image prompts that are optimized for still-image generation, not video generation.',
      'Make consecutive scenes explicitly preserve continuity whenever they share the same subject, environment, or visual style.',
      'Write one final video prompt for Dreamina Seedance multimodal2video that uses the storyboard images as the visual anchors.',
    ];
  }

  return [...FAST_VIDEO_PROMPT_CONFIG.plan.tasks];
}

export function normalizeFastVideoExecutionPrompt(input: FastVideoInput, prompt?: string) {
  const trimmedPrompt = (prompt || '').trim();
  const referencePrefix = buildFastReferenceImagePromptPrefix(input);

  if (!referencePrefix) {
    return trimmedPrompt;
  }

  if (trimmedPrompt.startsWith(referencePrefix)) {
    return trimmedPrompt;
  }

  return trimmedPrompt ? `${referencePrefix}\n${trimmedPrompt}` : referencePrefix;
}

export function buildFastVideoPlanPrompt(input: FastVideoInput) {
  const preferredSceneCount = input.quickCutEnabled
    ? 'none (quick cut mode skips storyboard images)'
    : input.preferredSceneCount === 'auto'
      ? 'auto (decide the scene count based on idea complexity, pacing, and visual transitions)'
      : String(input.preferredSceneCount);
  const referenceCount = input.referenceImages.filter((item) => item.imageUrl.trim()).length;
  const referenceVideoCount = input.referenceVideos.filter((item) => item.videoUrl.trim()).length;
  const referenceAudioCount = input.referenceAudios.filter((item) => item.audioUrl.trim()).length;
  const referenceInstruction = referenceCount > 0
    ? FAST_VIDEO_PROMPT_CONFIG.plan.referenceWithImage(referenceCount)
    : FAST_VIDEO_PROMPT_CONFIG.plan.referenceWithoutImage;

  return `${FAST_VIDEO_PROMPT_CONFIG.plan.role}

User input:
- Main prompt: ${input.prompt || 'N/A'}
- Aspect ratio: ${input.aspectRatio}
- Duration seconds: ${input.durationSec}
- Preferred scene count: ${preferredSceneCount}
- Quick cut: ${input.quickCutEnabled ? 'enabled' : 'disabled'}
- Negative prompt: ${input.negativePrompt || 'N/A'}
- Reference image count: ${referenceCount}
- Reference video count: ${referenceVideoCount}
- Reference audio count: ${referenceAudioCount}

Reference image details:
${buildFastReferenceImageDetails(input)}

Reference video details:
${buildFastReferenceVideoDetails(input)}

Reference audio details:
${buildFastReferenceAudioDetails(input)}

${referenceInstruction}
${buildQuickCutDirective(input)}

If reference images are present, you must explicitly use each image according to its declared type and any provided description when planning the storyboard and final video prompt.
If reference videos are present, you must explicitly describe how each reference video's motion/camera/effect should be applied or referenced in the final video prompt.
If reference audios are present, you must explicitly incorporate each audio's rhythm, dialogue, music, or sound-design cues into the final video prompt.
When referring to supplied input images inside the final video prompt, you MUST use the exact labels 图片1, 图片2, 图片3... matching the reference image order above.
Do NOT use vague phrases such as “所提供场景图”, “所提供人物图”, “参考了所提供图片”, or other non-indexed wording.

Your task:
${buildFastVideoPlanTasks(input).map((task, index) => `${index + 1}. ${task}`).join('\n')}

Output requirements:
${FAST_VIDEO_PROMPT_CONFIG.plan.outputRequirements.map((requirement) => `- ${requirement}`).join('\n')}
- If Quick cut is enabled, scenes must be [].
- If reference images are present, videoPrompt.prompt and videoPrompt.promptZh must refer to them as 图片1, 图片2, 图片3... in order.
- The numbering must correspond exactly to the reference image array order shown above.

Return ONLY a JSON object with this shape:
${FAST_VIDEO_PROMPT_CONFIG.plan.responseShape}`;
}

export function buildFastVideoPromptRegenerationPrompt(input: FastVideoInput, scenes: FastSceneDraft[]) {
  const referenceCount = input.referenceImages.filter((item) => item.imageUrl.trim()).length;
  const referenceVideoCount = input.referenceVideos.filter((item) => item.videoUrl.trim()).length;
  const referenceAudioCount = input.referenceAudios.filter((item) => item.audioUrl.trim()).length;
  const normalizedScenes = scenes.map((scene, index) => ({
    sceneNumber: index + 1,
    title: scene.title || `分镜 ${index + 1}`,
    imagePromptReference: scene.imagePromptZh || scene.imagePrompt || '',
    negativePrompt: scene.negativePrompt || scene.negativePromptZh || '',
    hasConfirmedImage: Boolean(scene.imageUrl),
  }));

  return `You are refining ONLY the final Seedance execution prompt for a fast video workflow.

User input:
- Main prompt: ${input.prompt || 'N/A'}
- Aspect ratio: ${input.aspectRatio}
- Duration seconds: ${input.durationSec}
- Quick cut: ${input.quickCutEnabled ? 'enabled' : 'disabled'}
- Negative prompt: ${input.negativePrompt || 'N/A'}
- Reference image count: ${referenceCount}
- Reference video count: ${referenceVideoCount}
- Reference audio count: ${referenceAudioCount}

Reference image details:
${buildFastReferenceImageDetails(input)}

Reference video details:
${buildFastReferenceVideoDetails(input)}

Reference audio details:
${buildFastReferenceAudioDetails(input)}

${buildQuickCutDirective(input)}

Confirmed storyboard scenes:
${JSON.stringify(normalizedScenes, null, 2)}

Your task:
1. Write ONE final video execution prompt for Seedance in Simplified Chinese.
2. Treat the confirmed storyboard scenes as the strongest source of truth for opening state, motion progression, continuity, composition, and exclusions.
3. Explicitly incorporate each reference image according to its declared type and any provided description.
4. Explictly incorporate each reference video's motion, camera movement, or effects if present.
5. Explicitly incorporate each reference audio's rhythm, dialogue, music, or sound-design cues if present.
6. Preserve subject identity, scene continuity, style direction, and exclusions across the whole video.
7. Do not output scene lists, explanations, markdown, or any extra text.
8. When referring to supplied input images inside the final prompt, you MUST use the exact labels 图片1, 图片2, 图片3... matching the reference image order above.
9. Do NOT use vague phrases such as “所提供场景图”, “所提供人物图”, “参考了所提供图片”, or other non-indexed wording.

Output requirements:
- prompt must be Simplified Chinese.
- promptZh must be Simplified Chinese.
- prompt and promptZh should stay aligned and both be directly usable as the final Seedance execution prompt.
- The prompt must clearly cover opening state, motion, progression, continuity, camera behavior, visual style, and exclusions.
- If reference images are present, the prompt must refer to them as 图片1, 图片2, 图片3... in order, matching the API image array order exactly.

Return ONLY a JSON object with this shape:
{
  "prompt": "string",
  "promptZh": "string"
}`;
}
