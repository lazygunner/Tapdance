import { SEEDANCE_TEMPLATE_REGISTRY } from '../config/seedanceTemplateRegistry.ts';
import type {
  SeedanceCompiledRequest,
  SeedanceDraft,
  SeedanceDraftValidation,
  SeedanceInputAsset,
  SeedanceOverlayTemplateId,
} from '../types.ts';

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

export function validateSeedanceDraft(draft: SeedanceDraft): SeedanceDraftValidation {
  const template = SEEDANCE_TEMPLATE_REGISTRY[draft.baseTemplateId];
  const errors: string[] = [];
  const warnings: string[] = [];
  const rawPrompt = draft.prompt.rawPrompt.trim();

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

    if (typeof requirement.maxCount === 'number' && matches.length > requirement.maxCount) {
      errors.push(`${template.title}最多允许 ${requirement.maxCount} 个 ${requirement.role} 素材。`);
    }
  }

  const hasVisualAsset = draft.assets.some((asset) => asset.kind === 'image' || asset.kind === 'video');
  const hasAudioAsset = draft.assets.some((asset) => asset.kind === 'audio');
  if (hasAudioAsset && !hasVisualAsset) {
    errors.push('仅输入音频无效，至少还需要 1 个图片或视频素材。');
  }

  if (draft.baseTemplateId === 'free_text' && draft.assets.length > 0) {
    warnings.push('当前模板为文生视频，已上传的参考素材不会参与请求。');
  }

  return { errors, warnings };
}

export function compileSeedanceRequest(draft: SeedanceDraft): SeedanceCompiledRequest {
  const validation = validateSeedanceDraft(draft);
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
    generateAudio: draft.options.generateAudio,
    returnLastFrame: draft.options.returnLastFrame,
    watermark: draft.options.watermark,
    safetyIdentifier: draft.options.safetyIdentifier?.trim() || undefined,
    tools: draft.options.useWebSearch ? [{ type: 'web_search' }] : undefined,
  };
}
