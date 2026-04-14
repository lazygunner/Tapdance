import type { Asset, AspectRatio, Shot, VisualAspectRatio } from '../types.ts';

const DATA_URL_PATTERN = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/;

export type SupportedImageAspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9' | '1:4' | '1:8' | '4:1' | '8:1';

export interface InlineImageData {
  imageBytes: string;
  mimeType: string;
}

export interface StoryboardPart {
  inlineData?: {
    data: string;
    mimeType: string;
  };
  text?: string;
}

export interface StoryboardGenerationInput {
  modelName: string;
  config: {
    imageConfig: {
      aspectRatio: SupportedImageAspectRatio;
      imageSize?: '1K';
    };
  };
  parts: StoryboardPart[];
}

export interface ReferenceImage {
  image: InlineImageData;
  referenceType: 'ASSET';
}

export interface VideoGenerationRequest {
  model: string;
  prompt: string;
  config: {
    numberOfVideos: 1;
    resolution: '720p' | '1080p';
    aspectRatio: '16:9' | '9:16';
    durationSeconds?: number;
    lastFrame?: InlineImageData;
    referenceImages?: ReferenceImage[];
  };
  image?: InlineImageData;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('读取参考图片失败。'));
    reader.readAsDataURL(blob);
  });
}

export function normalizeVideoAspectRatio(aspectRatio: AspectRatio): '16:9' | '9:16' {
  return aspectRatio === '9:16' ? '9:16' : '16:9';
}

type NormalizeGeminiVideoDurationOptions = {
  requireEightSeconds?: boolean;
};

export function normalizeGeminiVideoDurationSeconds(durationSeconds?: number, options: NormalizeGeminiVideoDurationOptions = {}) {
  if (options.requireEightSeconds) {
    return 8;
  }

  const rounded = Math.round(durationSeconds || 4);
  if (rounded <= 4) {
    return 4;
  }
  if (rounded <= 6) {
    return 6;
  }
  return 8;
}

export function parseInlineImageData(dataUrl?: string): InlineImageData | undefined {
  if (!dataUrl) {
    return undefined;
  }

  const match = dataUrl.match(DATA_URL_PATTERN);
  if (!match) {
    return undefined;
  }

  return {
    imageBytes: match[2],
    mimeType: match[1],
  };
}

export async function ensureInlineImageDataUrl(imageUrl?: string): Promise<string | undefined> {
  const normalizedImageUrl = String(imageUrl || '').trim();
  if (!normalizedImageUrl) {
    return undefined;
  }

  if (parseInlineImageData(normalizedImageUrl)) {
    return normalizedImageUrl;
  }

  const response = await fetch(normalizedImageUrl);
  if (!response.ok) {
    throw new Error(`读取参考图片失败 (${response.status})`);
  }

  const blob = await response.blob();
  if (!String(blob.type || '').toLowerCase().startsWith('image/')) {
    throw new Error('参考资源不是有效图片。');
  }

  return blobToDataUrl(blob);
}

export async function materializeAssetImageUrls(referenceAssets: Asset[] = []): Promise<Asset[]> {
  return Promise.all(referenceAssets.map(async (asset) => ({
    ...asset,
    imageUrl: await ensureInlineImageDataUrl(asset.imageUrl),
  })));
}

export async function materializeShotImageUrls(shot: Shot): Promise<Shot> {
  const [imageUrl, lastFrameImageUrl] = await Promise.all([
    ensureInlineImageDataUrl(shot.imageUrl),
    ensureInlineImageDataUrl(shot.lastFrameImageUrl),
  ]);

  return {
    ...shot,
    imageUrl: imageUrl || '',
    lastFrameImageUrl: lastFrameImageUrl || '',
  };
}

export function toStoryboardInlinePart(dataUrl?: string): StoryboardPart | undefined {
  const image = parseInlineImageData(dataUrl);
  if (!image) {
    return undefined;
  }

  return {
    inlineData: {
      data: image.imageBytes,
      mimeType: image.mimeType,
    },
  };
}

export function mapStoryboardAspectRatio(aspectRatio: VisualAspectRatio): SupportedImageAspectRatio {
  if (aspectRatio === '9:16') {
    return '9:16';
  }

  if (aspectRatio === '1:1') {
    return '1:1';
  }

  if (aspectRatio === '4:3') {
    return '4:3';
  }

  if (aspectRatio === '3:4') {
    return '3:4';
  }

  if (aspectRatio === '21:9') {
    return '21:9';
  }

  return '16:9';
}

export function buildStoryboardGenerationInput(
  prompt: string,
  aspectRatio: VisualAspectRatio,
  modelName: string = 'gemini-2.5-flash-image',
  referenceAssets: Asset[] = [],
  baseImageBase64?: string,
): StoryboardGenerationInput {
  const parts: StoryboardPart[] = [];
  const baseImagePart = toStoryboardInlinePart(baseImageBase64);

  if (baseImagePart) {
    parts.push(baseImagePart);
  }

  for (const asset of referenceAssets) {
    const assetPart = toStoryboardInlinePart(asset.imageUrl);
    if (assetPart) {
      parts.push(assetPart);
    }
  }

  parts.push({ text: prompt });

  return {
    modelName,
    config: {
      imageConfig: {
        aspectRatio: mapStoryboardAspectRatio(aspectRatio),
      },
    },
    parts,
  };
}

export function buildVideoGenerationRequest(
  shot: Shot,
  defaultAspectRatio: AspectRatio,
  referenceAssets: Asset[] = [],
  modelName: string = 'veo-3.1-fast-generate-preview',
  fallbackReferenceModelName: string = 'veo-3.1-generate-preview',
): VideoGenerationRequest {
  const videoConfig = shot.videoConfig || {
    resolution: '720p' as const,
    frameRate: 24,
    aspectRatio: defaultAspectRatio === '9:16' ? '9:16' as const : '16:9' as const,
    useFirstFrame: true,
    useLastFrame: true,
    useReferenceAssets: false,
  };

  const request: VideoGenerationRequest = {
    model: modelName,
    prompt: shot.videoPrompt?.imageToVideo || shot.videoPrompt?.textToVideo || shot.action,
    config: {
      numberOfVideos: 1,
      resolution: videoConfig.resolution,
      aspectRatio: normalizeVideoAspectRatio(videoConfig.aspectRatio),
      durationSeconds: normalizeGeminiVideoDurationSeconds(shot.duration),
    },
  };

  if (videoConfig.useFirstFrame) {
    const firstFrame = parseInlineImageData(shot.imageUrl);
    if (firstFrame) {
      request.image = firstFrame;
    }
  }

  if (videoConfig.useLastFrame) {
    const lastFrame = parseInlineImageData(shot.lastFrameImageUrl);
    if (lastFrame) {
      request.config.lastFrame = lastFrame;
      request.config.resolution = '720p';
    }
  }

  if (videoConfig.useReferenceAssets) {
    const referenceImages = referenceAssets
      .map((asset) => parseInlineImageData(asset.imageUrl))
      .filter((image): image is InlineImageData => Boolean(image))
      .slice(0, 3)
      .map((image) => ({
        image,
        referenceType: 'ASSET' as const,
      }));

    if (referenceImages.length > 0) {
      request.model = fallbackReferenceModelName;
      request.config.aspectRatio = '16:9';
      request.config.resolution = '720p';
      request.config.referenceImages = referenceImages;
      delete request.config.lastFrame;
    }
  }

  request.config.durationSeconds = normalizeGeminiVideoDurationSeconds(shot.duration, {
    requireEightSeconds: request.config.resolution !== '720p' || Boolean(request.config.referenceImages?.length) || Boolean(request.config.lastFrame),
  });

  return request;
}

export function buildTransitionVideoGenerationRequest(
  firstFrameUrl: string,
  lastFrameUrl: string,
  aspectRatio: AspectRatio,
  prompt: string = 'A smooth and natural transition between the two scenes',
  durationSeconds: number = 3,
  modelName: string = 'veo-3.1-fast-generate-preview',
): VideoGenerationRequest {
  const request: VideoGenerationRequest = {
    model: modelName,
    prompt,
    config: {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio: normalizeVideoAspectRatio(aspectRatio),
      durationSeconds: normalizeGeminiVideoDurationSeconds(durationSeconds),
    },
  };

  const firstFrame = parseInlineImageData(firstFrameUrl);
  if (firstFrame) {
    request.image = firstFrame;
  }

  const lastFrame = parseInlineImageData(lastFrameUrl);
  if (lastFrame) {
    request.config.lastFrame = lastFrame;
  }

  return request;
}
