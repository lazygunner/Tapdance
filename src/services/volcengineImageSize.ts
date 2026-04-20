import type { VisualAspectRatio } from '../types.ts';

export function isSeedreamFiveImageModel(modelName: string) {
  return modelName.toLowerCase().includes('seedream-5');
}

export function mapVolcengineImageSize(aspectRatio: VisualAspectRatio, modelName: string) {
  if (isSeedreamFiveImageModel(modelName)) {
    return '2k';
  }

  if (aspectRatio === '1:1') {
    return '1K';
  }

  return '2K';
}

