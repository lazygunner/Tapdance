import type { SeedanceBaseTemplateId, SeedanceTemplateDefinition } from '../types.ts';

export const SEEDANCE_TEMPLATE_REGISTRY: Record<SeedanceBaseTemplateId, SeedanceTemplateDefinition> = {
  free_text: {
    id: 'free_text',
    title: '文生视频',
    description: '仅使用文本生成视频。',
    requires: [
      { role: 'text', minCount: 1 },
    ],
    supportedOverlays: ['auto_audio', 'subtitle', 'bubble_dialogue', 'slogan', 'return_last_frame', 'web_search'],
  },
  first_frame: {
    id: 'first_frame',
    title: '首帧图生',
    description: '用首帧图片启动视频生成。',
    requires: [
      { role: 'text', minCount: 1 },
      { role: 'first_frame', minCount: 1, maxCount: 1 },
    ],
    supportedOverlays: ['auto_audio', 'subtitle', 'bubble_dialogue', 'slogan', 'return_last_frame', 'web_search'],
  },
  first_last_frame: {
    id: 'first_last_frame',
    title: '首尾帧图生',
    description: '用首帧和尾帧控制开头与收尾画面。',
    requires: [
      { role: 'text', minCount: 1 },
      { role: 'first_frame', minCount: 1, maxCount: 1 },
      { role: 'last_frame', minCount: 1, maxCount: 1 },
    ],
    supportedOverlays: ['auto_audio', 'subtitle', 'bubble_dialogue', 'slogan', 'return_last_frame', 'web_search'],
  },
  multi_image_reference: {
    id: 'multi_image_reference',
    title: '多图参考',
    description: '使用 1-9 张参考图锁定主体、场景或元素组合。',
    requires: [
      { role: 'text', minCount: 1 },
      { role: 'reference_image', minCount: 1, maxCount: 9 },
    ],
    supportedOverlays: ['auto_audio', 'subtitle', 'bubble_dialogue', 'slogan', 'logo_reveal', 'return_last_frame', 'web_search'],
  },
  motion_reference: {
    id: 'motion_reference',
    title: '动作参考',
    description: '参考已有视频中的动作节奏生成新画面。',
    requires: [
      { role: 'text', minCount: 1 },
      { role: 'reference_video', minCount: 1, maxCount: 3 },
    ],
    supportedOverlays: ['auto_audio', 'subtitle', 'return_last_frame', 'web_search'],
  },
  camera_reference: {
    id: 'camera_reference',
    title: '运镜参考',
    description: '参考已有视频的运镜方式生成新视频。',
    requires: [
      { role: 'text', minCount: 1 },
      { role: 'reference_video', minCount: 1, maxCount: 3 },
    ],
    supportedOverlays: ['auto_audio', 'subtitle', 'return_last_frame', 'web_search'],
  },
  effect_reference: {
    id: 'effect_reference',
    title: '特效参考',
    description: '参考已有视频的特效与轨迹生成新视频。',
    requires: [
      { role: 'text', minCount: 1 },
      { role: 'reference_video', minCount: 1, maxCount: 3 },
    ],
    supportedOverlays: ['auto_audio', 'subtitle', 'return_last_frame', 'web_search'],
  },
  video_edit: {
    id: 'video_edit',
    title: '视频编辑',
    description: '对现有视频做元素增删改。',
    requires: [
      { role: 'text', minCount: 1 },
      { role: 'reference_video', minCount: 1, maxCount: 3 },
    ],
    supportedOverlays: ['auto_audio', 'subtitle', 'bubble_dialogue', 'slogan', 'logo_reveal', 'return_last_frame', 'web_search'],
  },
  video_extend: {
    id: 'video_extend',
    title: '视频延长',
    description: '对现有视频做向前或向后延长。',
    requires: [
      { role: 'text', minCount: 1 },
      { role: 'reference_video', minCount: 1, maxCount: 1 },
    ],
    supportedOverlays: ['auto_audio', 'subtitle', 'return_last_frame', 'web_search'],
  },
  video_stitch: {
    id: 'video_stitch',
    title: '轨道补齐',
    description: '将 2-3 段视频按提示词进行拼接与补间。',
    requires: [
      { role: 'text', minCount: 1 },
      { role: 'reference_video', minCount: 2, maxCount: 3 },
    ],
    supportedOverlays: ['auto_audio', 'subtitle', 'return_last_frame', 'web_search'],
  },
  audio_guided: {
    id: 'audio_guided',
    title: '音频驱动',
    description: '结合视觉素材与参考音频驱动视频生成。',
    requires: [
      { role: 'text', minCount: 1 },
      { role: 'reference_audio', minCount: 1, maxCount: 3 },
    ],
    supportedOverlays: ['subtitle', 'bubble_dialogue', 'slogan', 'return_last_frame', 'web_search'],
  },
};

export const FAST_FLOW_TEMPLATE_IDS: SeedanceBaseTemplateId[] = [
  'free_text',
  'first_frame',
  'first_last_frame',
  'multi_image_reference',
];
