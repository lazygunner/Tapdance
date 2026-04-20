import type { AspectRatio, Asset, Shot, VideoConfig } from '../../../types.ts';
import type { SeedanceDraft, SeedanceInputAsset, SeedanceRequestOptions } from '../../seedance/types.ts';
import { ensureInlineImageDataUrl } from '../../../services/requestBuilders.ts';

export interface CreativeSeedanceOptions {
  generateAudio: boolean;
  returnLastFrame: boolean;
  useWebSearch: boolean;
  watermark: boolean;
  resolution: '480p' | '720p' | '1080p';
}

const DEFAULT_CREATIVE_SEEDANCE_OPTIONS: CreativeSeedanceOptions = {
  generateAudio: false,
  returnLastFrame: false,
  useWebSearch: false,
  watermark: false,
  resolution: '720p',
};

export function buildCreativeSeedanceOptionsFromVideoConfig(videoConfig?: Partial<VideoConfig>): CreativeSeedanceOptions {
  return {
    resolution: videoConfig?.resolution === '480p' || videoConfig?.resolution === '1080p' ? videoConfig.resolution : '720p',
    generateAudio: Boolean(videoConfig?.generateAudio),
    returnLastFrame: Boolean(videoConfig?.returnLastFrame),
    useWebSearch: Boolean(videoConfig?.useWebSearch),
    watermark: Boolean(videoConfig?.watermark),
  };
}

function normalizeAspectRatio(aspectRatio: AspectRatio): SeedanceRequestOptions['ratio'] {
  return aspectRatio;
}

async function materializeImageUrl(url?: string): Promise<string> {
  if (!url || !url.trim()) {
    return '';
  }
  return await ensureInlineImageDataUrl(url) || url;
}

/**
 * Build a SeedanceDraft for shot video generation.
 * Maps the creative flow shot data (first frame, last frame, video prompt, reference assets)
 * into the standard SeedanceDraft format used by seedanceApiService / seedanceBridgeClient.
 */
export async function buildShotSeedanceDraft(
  shot: Shot,
  aspectRatio: AspectRatio,
  referenceAssets: Asset[],
  options?: Partial<CreativeSeedanceOptions>,
): Promise<SeedanceDraft> {
  const opts = { ...DEFAULT_CREATIVE_SEEDANCE_OPTIONS, ...options };
  const videoConfig = shot.videoConfig || {
    resolution: '720p' as const,
    frameRate: 24,
    aspectRatio,
    useFirstFrame: true,
    useLastFrame: true,
    useReferenceAssets: false,
  };

  const prompt = shot.videoPrompt?.imageToVideo
    || shot.videoPrompt?.textToVideo
    || shot.action
    || '';

  const assets: SeedanceInputAsset[] = [];

  // First frame
  if (videoConfig.useFirstFrame && shot.imageUrl) {
    const materializedUrl = await materializeImageUrl(shot.imageUrl);
    if (materializedUrl) {
      assets.push({
        id: `${shot.id}-first-frame`,
        kind: 'image',
        source: 'upload',
        urlOrData: materializedUrl,
        role: 'first_frame',
        label: '首帧',
      });
    }
  }

  // Last frame
  if (videoConfig.useLastFrame && !videoConfig.useReferenceAssets && shot.lastFrameImageUrl) {
    const materializedUrl = await materializeImageUrl(shot.lastFrameImageUrl);
    if (materializedUrl) {
      assets.push({
        id: `${shot.id}-last-frame`,
        kind: 'image',
        source: 'upload',
        urlOrData: materializedUrl,
        role: 'last_frame',
        label: '尾帧',
      });
    }
  }

  // Determine base template based on assets
  const hasFirstFrame = assets.some((a) => a.role === 'first_frame');
  const hasLastFrame = assets.some((a) => a.role === 'last_frame');
  const baseTemplateId = hasFirstFrame && hasLastFrame
    ? 'first_last_frame' as const
    : hasFirstFrame
      ? 'first_frame' as const
      : 'free_text' as const;

  // Reference assets appended as reference_images if template allows
  if (videoConfig.useReferenceAssets && referenceAssets.length > 0) {
    for (const asset of referenceAssets) {
      if (asset.imageUrl) {
        const materializedUrl = await materializeImageUrl(asset.imageUrl);
        if (materializedUrl) {
          assets.push({
            id: `ref-${asset.id}`,
            kind: 'image',
            source: 'upload',
            urlOrData: materializedUrl,
            role: 'reference_image',
            label: asset.name,
          });
        }
      }
    }
  }

  // Build reference hint for prompt (consistent with volcengineService behavior)
  const referenceHint = videoConfig.useReferenceAssets && referenceAssets.length > 0
    ? ` Keep consistency with these assets: ${referenceAssets.map((a) => a.name).join(', ')}.`
    : '';

  const effectiveRatio = videoConfig.useReferenceAssets
    ? '16:9' as const
    : normalizeAspectRatio(videoConfig.aspectRatio);

  return {
    baseTemplateId: assets.length > 0 && baseTemplateId === 'free_text'
      ? 'multi_image_reference'
      : baseTemplateId,
    overlayTemplateIds: opts.generateAudio ? ['auto_audio'] : [],
    assets,
    prompt: {
      rawPrompt: `${prompt}${referenceHint}`.trim(),
      diagnostics: [],
    },
    options: {
      ratio: effectiveRatio,
      duration: Math.max(1, Math.round(shot.duration || 5)),
      resolution: opts.resolution,
      generateAudio: opts.generateAudio,
      returnLastFrame: opts.returnLastFrame,
      useWebSearch: opts.useWebSearch,
      watermark: opts.watermark,
    },
  };
}

/**
 * Build a SeedanceDraft for transition video generation.
 * Maps firstFrame + lastFrame + prompt into the standard SeedanceDraft format.
 */
export async function buildTransitionSeedanceDraft(
  firstFrameUrl: string,
  lastFrameUrl: string,
  aspectRatio: AspectRatio,
  prompt: string,
  durationSeconds: number,
  options?: Partial<CreativeSeedanceOptions>,
  videoConfig?: Partial<VideoConfig>,
): Promise<SeedanceDraft> {
  const opts = { ...DEFAULT_CREATIVE_SEEDANCE_OPTIONS, ...options };
  const useFirstFrame = videoConfig?.useFirstFrame !== false;
  const useLastFrame = videoConfig?.useLastFrame !== false;

  const [materializedFirst, materializedLast] = await Promise.all([
    materializeImageUrl(firstFrameUrl),
    materializeImageUrl(lastFrameUrl),
  ]);

  const assets: SeedanceInputAsset[] = [];
  if (useFirstFrame && materializedFirst) {
    assets.push({
      id: 'transition-first-frame',
      kind: 'image',
      source: 'upload',
      urlOrData: materializedFirst,
      role: 'first_frame',
      label: '转场首帧（上一镜头尾帧）',
    });
  }
  if (useLastFrame && materializedLast && useFirstFrame) {
    assets.push({
      id: 'transition-last-frame',
      kind: 'image',
      source: 'upload',
      urlOrData: materializedLast,
      role: 'last_frame',
      label: '转场尾帧（下一镜头首帧）',
    });
  } else if (useLastFrame && materializedLast) {
    assets.push({
      id: 'transition-target-reference',
      kind: 'image',
      source: 'upload',
      urlOrData: materializedLast,
      role: 'reference_image',
      label: '转场目标帧（下一镜头首帧）',
    });
  }

  const hasFirstFrame = assets.some((asset) => asset.role === 'first_frame');
  const hasLastFrame = assets.some((asset) => asset.role === 'last_frame');
  const hasReferenceImage = assets.some((asset) => asset.role === 'reference_image');
  const baseTemplateId = hasFirstFrame && hasLastFrame
    ? 'first_last_frame' as const
    : hasFirstFrame
      ? 'first_frame' as const
      : hasReferenceImage
        ? 'multi_image_reference' as const
        : 'free_text' as const;

  return {
    baseTemplateId,
    overlayTemplateIds: opts.generateAudio ? ['auto_audio'] : [],
    assets,
    prompt: {
      rawPrompt: prompt || 'A smooth and natural transition between the two scenes',
      diagnostics: [],
    },
    options: {
      ratio: normalizeAspectRatio(aspectRatio),
      duration: Math.max(4, Math.round(durationSeconds || 4)),
      resolution: opts.resolution,
      generateAudio: opts.generateAudio,
      returnLastFrame: opts.returnLastFrame,
      useWebSearch: opts.useWebSearch,
      watermark: opts.watermark,
    },
  };
}
