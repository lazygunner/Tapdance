import { SEEDANCE_TEMPLATE_REGISTRY } from '../config/seedanceTemplateRegistry.ts';
import type {
  SeedanceApiModelKey,
  SeedanceCompiledRequest,
  SeedanceDraft,
  SeedanceDraftValidation,
  SeedanceInputAsset,
  SeedanceOverlayTemplateId,
} from '../types.ts';
import { getSeedanceCapabilities, getSeedanceTemplateOptionConstraints } from '../capabilities.ts';

function buildOverlayPromptLines(draft: SeedanceDraft) {
  const lines: string[] = [];
  const modules = draft.options.moduleSettings || {};
  const overlaySet = new Set<SeedanceOverlayTemplateId>(draft.overlayTemplateIds);

  if (overlaySet.has('subtitle')) {
    lines.push(modules.subtitleText?.trim()
      ? `画面底部出现字幕，字幕内容为“${modules.subtitleText.trim()}”。`
      : '画面底部出现字幕，字幕需与对白或音频节奏同步。');
  }

  if (overlaySet.has('bubble_dialogue')) {
    lines.push(modules.bubbleDialogue?.trim()
      ? `角色说：“${modules.bubbleDialogue.trim()}”，说话时周围出现气泡，气泡里写着对应台词。`
      : '角色说话时周围出现气泡，气泡里写着对应台词。');
  }

  if (overlaySet.has('slogan')) {
    lines.push(modules.sloganText?.trim()
      ? `画面中出现广告语“${modules.sloganText.trim()}”，出现时机与位置自然明确。`
      : '画面中出现明确的广告语文案，出现时机与位置自然明确。');
  }

  if (overlaySet.has('logo_reveal')) {
    lines.push(modules.logoPrompt?.trim()
      ? modules.logoPrompt.trim()
      : '画面后段自然出现品牌 Logo，露出方式克制清晰。');
  }

  if (draft.options.generateAudio) {
    lines.push('生成有声视频，声音与画面同步自然。');
  } else {
    lines.push('生成无声视频。');
  }

  return lines;
}

function buildReferencePromptLines(draft: SeedanceDraft) {
  return draft.assets
    .filter((asset) => asset.kind === 'image' && asset.role === 'reference_image' && asset.label?.trim())
    .map((asset) => asset.label!.trim());
}

function toCompiledAsset(asset: SeedanceInputAsset) {
  if (asset.kind === 'image') {
    return {
      type: 'image_url',
      image_url: { url: asset.urlOrData },
      role: asset.role,
    };
  }

  if (asset.kind === 'video') {
    return {
      type: 'video_url',
      video_url: { url: asset.urlOrData },
      role: asset.role,
    };
  }

  return {
    type: 'audio_url',
    audio_url: { url: asset.urlOrData },
    role: asset.role,
  };
}

export function validateSeedanceDraft(draft: SeedanceDraft, modelKey: SeedanceApiModelKey = 'standard'): SeedanceDraftValidation {
  const template = SEEDANCE_TEMPLATE_REGISTRY[draft.baseTemplateId];
  const errors: string[] = [];
  const warnings: string[] = [];
  const rawPrompt = draft.prompt.rawPrompt.trim();
  const capability = getSeedanceCapabilities(modelKey);

  if (!rawPrompt) {
    errors.push('视频提示词不能为空。');
  }

  for (const requirement of template.requires) {
    if (requirement.role === 'text') {
      if (!rawPrompt) {
        errors.push(`${template.title}需要文本提示词。`);
      }
      continue;
    }

    const matches = draft.assets.filter((asset) => asset.role === requirement.role && asset.urlOrData.trim());

    if (requirement.role === 'reference_image' && matches.length < requirement.minCount) {
      const hasReferenceVideo = draft.assets.some(
        (asset) => asset.role === 'reference_video' && asset.urlOrData.trim()
      );
      if (!hasReferenceVideo) {
        errors.push(`${template.title}缺少 ${requirement.role} 素材。`);
      }
    } else if (matches.length < requirement.minCount) {
      errors.push(`${template.title}缺少 ${requirement.role} 素材。`);
    }

    const modelMaxCount = modelKey === 'seedance25'
      ? requirement.role === 'reference_image' ? capability.maxImages
        : requirement.role === 'reference_video' ? capability.maxVideos
          : requirement.role === 'reference_audio' ? capability.maxAudios
            : requirement.maxCount
      : requirement.maxCount;
    if (typeof modelMaxCount === 'number' && matches.length > modelMaxCount) {
      errors.push(`${template.title}最多允许 ${modelMaxCount} 个 ${requirement.role} 素材。`);
    }
  }

  const hasVisualAsset = draft.assets.some((asset) => asset.kind === 'image' || asset.kind === 'video');
  const hasAudioAsset = draft.assets.some((asset) => asset.kind === 'audio');
  if (hasAudioAsset && !hasVisualAsset) {
    errors.push('仅输入音频无效，至少还需要 1 个图片或视频素材。');
  }

  const images = draft.assets.filter((asset) => asset.kind === 'image');
  const videos = draft.assets.filter((asset) => asset.kind === 'video');
  const audios = draft.assets.filter((asset) => asset.kind === 'audio');
  if (images.length > capability.maxImages) errors.push(`${capability.label} 最多支持 ${capability.maxImages} 张参考图片。`);
  if (videos.length > capability.maxVideos) errors.push(`${capability.label} 最多支持 ${capability.maxVideos} 个参考视频。`);
  if (audios.length > capability.maxAudios) errors.push(`${capability.label} 最多支持 ${capability.maxAudios} 个参考音频。`);

  const validateMediaDuration = (asset: SeedanceInputAsset) => {
    if (typeof asset.durationSec !== 'number') return;
    if (asset.durationSec < capability.minMediaDurationSec || asset.durationSec > capability.maxMediaDurationSec) {
      errors.push(`${asset.label || '参考素材'}时长需在 ${capability.minMediaDurationSec}-${capability.maxMediaDurationSec} 秒。`);
    }
  };
  videos.forEach(validateMediaDuration);
  audios.forEach(validateMediaDuration);
  const videoDuration = videos.reduce((sum, asset) => sum + (asset.durationSec || 0), 0);
  const audioDuration = audios.reduce((sum, asset) => sum + (asset.durationSec || 0), 0);
  if (videoDuration > capability.maxTotalVideoDurationSec) errors.push(`参考视频总时长不能超过 ${capability.maxTotalVideoDurationSec} 秒。`);
  if (audioDuration > capability.maxTotalAudioDurationSec) errors.push(`参考音频总时长不能超过 ${capability.maxTotalAudioDurationSec} 秒。`);

  if (!capability.resolutions.includes(draft.options.resolution)) errors.push(`${capability.label} 不支持 ${draft.options.resolution} 输出。`);
  const outputFormat = draft.options.outputFormat || 'mp4';
  if (!capability.outputFormats.includes(outputFormat)) errors.push(`${capability.label} 不支持 ${outputFormat.toUpperCase()} 输出。`);
  if (draft.options.duration !== -1 && (typeof draft.options.duration !== 'number' || draft.options.duration < 4 || draft.options.duration > capability.maxDurationSec)) {
    errors.push(`生成时长需为 -1（自动）或 4-${capability.maxDurationSec} 秒。`);
  }
  const constraints = getSeedanceTemplateOptionConstraints(draft.baseTemplateId, modelKey);
  if (constraints.ratio && draft.options.ratio !== constraints.ratio) errors.push(`${template.title}要求画幅比例为 adaptive。`);
  if (typeof constraints.duration === 'number' && draft.options.duration !== constraints.duration) errors.push(`${template.title}要求生成时长为 -1（自动）。`);

  if (draft.baseTemplateId === 'free_text' && draft.assets.length > 0) {
    warnings.push('当前模板为文生视频，已上传的参考素材不会参与请求。');
  }

  return { errors, warnings };
}

export function compileSeedanceRequest(draft: SeedanceDraft, modelKey: SeedanceApiModelKey = 'standard'): SeedanceCompiledRequest {
  const validation = validateSeedanceDraft(draft, modelKey);
  if (validation.errors.length > 0) {
    throw new Error(validation.errors[0]);
  }

  const promptLines = [
    ...buildReferencePromptLines(draft),
    draft.prompt.optimizedPrompt?.trim() || draft.prompt.rawPrompt.trim(),
    ...buildOverlayPromptLines(draft),
  ]
    .filter(Boolean);
  const content: Array<Record<string, any>> = [
    {
      type: 'text',
      text: promptLines.join('\n'),
    },
  ];

  if (draft.baseTemplateId !== 'free_text') {
    content.push(
      ...draft.assets
        .filter((asset) => asset.urlOrData.trim())
        .map((asset) => toCompiledAsset(asset)),
    );
  }

  return {
    content,
    ratio: draft.options.ratio,
    duration: draft.options.duration,
    resolution: draft.options.resolution,
    outputFormat: draft.options.outputFormat || 'mp4',
    generateAudio: draft.options.generateAudio,
    returnLastFrame: draft.options.returnLastFrame,
    watermark: draft.options.watermark,
    safetyIdentifier: draft.options.safetyIdentifier?.trim() || undefined,
    tools: draft.options.useWebSearch ? [{ type: 'web_search' }] : undefined,
  };
}
