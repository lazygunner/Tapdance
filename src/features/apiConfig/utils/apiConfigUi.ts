import type { ModelSourceId, PromptLanguage } from '../../../types.ts';
import type { ModelProviderId, ModelRole } from '../../../services/apiConfig.ts';

export type GeminiModelField = 'textModel' | 'imageModel' | 'proImageModel' | 'fastVideoModel' | 'proVideoModel';
export type VolcengineModelField = 'textModel' | 'imageModel' | 'videoModel';
export type OpenAIModelField = 'imageModel';
export type AliyunModelField = 'fastVideoModel';
export type MinimaxModelField = 'videoModel';

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

export const OPENAI_ROLE_SOURCE_IDS: Partial<Record<ModelRole, ModelSourceId>> = {
  image: 'openai.imageModel',
};

export const ALIYUN_ROLE_SOURCE_IDS: Partial<Record<ModelRole, ModelSourceId>> = {
  video: 'aliyun.fastVideoModel',
};

export const MINIMAX_ROLE_SOURCE_IDS: Partial<Record<ModelRole, ModelSourceId>> = {
  video: 'minimax.videoModel',
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

export const ALIYUN_ROLE_FIELDS: Partial<Record<ModelRole, AliyunModelField>> = {
  video: 'fastVideoModel',
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

export const OPENAI_PROVIDER_MODEL_FIELDS: Record<ModelRole, Array<{ field: OpenAIModelField; sourceId: ModelSourceId; label: string }>> = {
  text: [],
  image: [
    { field: 'imageModel', sourceId: 'openai.imageModel', label: '图像模型' },
  ],
  video: [],
};

export const ALIYUN_PROVIDER_MODEL_FIELDS: Record<ModelRole, Array<{ field: AliyunModelField; sourceId: ModelSourceId; label: string }>> = {
  text: [],
  image: [],
  video: [
    { field: 'fastVideoModel', sourceId: 'aliyun.fastVideoModel', label: '视频模型' },
  ],
};

export const MINIMAX_PROVIDER_MODEL_FIELDS: Record<ModelRole, Array<{ field: MinimaxModelField; sourceId: ModelSourceId; label: string }>> = {
  text: [],
  image: [],
  video: [
    { field: 'videoModel', sourceId: 'minimax.videoModel', label: '视频模型' },
  ],
};

export const PROVIDER_CARD_META: Record<ModelProviderId, { title: string }> = {
  gemini: {
    title: 'Google Gemini API',
  },
  volcengine: {
    title: '字节火山引擎 API',
  },
  openai: {
    title: 'OpenAI API',
  },
  aliyun: {
    title: '阿里云百炼 API',
  },
  minimax: {
    title: 'MiniMax API',
  },
};

export const PROMPT_LANGUAGE_FLAGS: Record<PromptLanguage, string> = {
  zh: '🇨🇳',
  en: '🇺🇸',
};
