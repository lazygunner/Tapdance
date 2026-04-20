import type { ModelSourceId, PromptLanguage } from '../../../types.ts';
import type { ModelProviderId, ModelRole } from '../../../services/apiConfig.ts';

export type GeminiModelField = 'textModel' | 'imageModel' | 'proImageModel' | 'fastVideoModel' | 'proVideoModel';
export type VolcengineModelField = 'textModel' | 'imageModel' | 'videoModel';

export const MODEL_ROLE_ORDER: ModelRole[] = ['text', 'image', 'video'];

export const GEMINI_ROLE_SOURCE_OPTIONS: Record<ModelRole, ModelSourceId[]> = {
  text: ['gemini.textModel'],
  image: ['gemini.imageModel', 'gemini.proImageModel'],
  video: ['gemini.fastVideoModel', 'gemini.proVideoModel'],
};

export const VOLCENGINE_ROLE_SOURCE_IDS: Record<ModelRole, ModelSourceId> = {
  text: 'volcengine.textModel',
  image: 'volcengine.imageModel',
  video: 'volcengine.videoModel',
};

export const GEMINI_ROLE_FIELDS: Record<ModelRole, GeminiModelField> = {
  text: 'textModel',
  image: 'imageModel',
  video: 'fastVideoModel',
};

export const VOLCENGINE_ROLE_FIELDS: Record<ModelRole, VolcengineModelField> = {
  text: 'textModel',
  image: 'imageModel',
  video: 'videoModel',
};

export const GEMINI_PROVIDER_MODEL_FIELDS: Record<ModelRole, Array<{ field: GeminiModelField; sourceId: ModelSourceId; label: string }>> = {
  text: [
    { field: 'textModel', sourceId: 'gemini.textModel', label: '文本模型' },
  ],
  image: [
    { field: 'imageModel', sourceId: 'gemini.imageModel', label: '图像模型' },
  ],
  video: [
    { field: 'fastVideoModel', sourceId: 'gemini.fastVideoModel', label: '视频模型' },
  ],
};

export const VOLCENGINE_PROVIDER_MODEL_FIELDS: Record<ModelRole, Array<{ field: VolcengineModelField; sourceId: ModelSourceId; label: string }>> = {
  text: [
    { field: 'textModel', sourceId: 'volcengine.textModel', label: '文本模型 / 接入点' },
  ],
  image: [
    { field: 'imageModel', sourceId: 'volcengine.imageModel', label: '图像模型 / 接入点' },
  ],
  video: [
    { field: 'videoModel', sourceId: 'volcengine.videoModel', label: '视频模型 / 接入点' },
  ],
};

export const PROVIDER_CARD_META: Record<ModelProviderId, { title: string }> = {
  gemini: {
    title: 'Google Gemini API',
  },
  volcengine: {
    title: '字节火山引擎 API',
  },
};

export const PROMPT_LANGUAGE_FLAGS: Record<PromptLanguage, string> = {
  zh: '🇨🇳',
  en: '🇺🇸',
};
