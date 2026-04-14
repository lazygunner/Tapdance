import type { Asset, AspectRatio, Shot } from '../../../types.ts';

export type CharacterPrompt = NonNullable<Asset['characterPrompt']>;
export type CharacterDetailFieldKey = Exclude<keyof CharacterPrompt, 'characterType'>;
export type ProductPrompt = NonNullable<Asset['productPrompt']>;
export type ProductDetailFieldKey = keyof ProductPrompt;

export const ASSET_TYPE_LABELS: Record<Asset['type'], string> = {
  character: '角色',
  scene: '场景',
  style: '风格',
  prop: '道具',
  product: '产品',
};

export const ASPECT_RATIO_OPTIONS: Array<{ value: AspectRatio; label: string }> = [
  { value: '21:9', label: '电影宽屏 21:9' },
  { value: '16:9', label: '横屏 16:9' },
  { value: '4:3', label: '经典 4:3' },
  { value: '1:1', label: '正方形 1:1' },
  { value: '3:4', label: '海报 3:4' },
  { value: '9:16', label: '竖屏 9:16' },
];

export function createEmptyAssetDraft(type: Asset['type'] = 'character'): Partial<Asset> {
  return {
    type,
    name: '',
    description: '',
    characterPrompt: type === 'character' ? { characterType: 'human' } : undefined,
    scenePrompt: type === 'scene' ? {} : undefined,
    productPrompt: type === 'product' ? {} : undefined,
  };
}

export function getAspectRatioClass(aspectRatio: AspectRatio = '16:9') {
  if (aspectRatio === '21:9') {
    return 'aspect-[21/9]';
  }
  if (aspectRatio === '9:16') {
    return 'aspect-[9/16]';
  }
  if (aspectRatio === '1:1') {
    return 'aspect-square';
  }
  if (aspectRatio === '4:3') {
    return 'aspect-[4/3]';
  }
  if (aspectRatio === '3:4') {
    return 'aspect-[3/4]';
  }
  return 'aspect-video';
}

export function resequenceShots(shots: Shot[]) {
  return shots.map((shot, index) => ({
    ...shot,
    shotNumber: index + 1,
  }));
}

export function hasLastFramePrompt(shot: Shot) {
  return Boolean((shot.imagePrompt?.lastFrameProfessional || '').trim() || (shot.imagePrompt?.lastFrameProfessionalZh || '').trim());
}

export function getFrameEditPromptKey(shotId: string, frameType: 'first' | 'last') {
  return `${shotId}:${frameType}`;
}

export function getShotVideoOperationKey(shotId: string) {
  return `shot-video-${shotId}`;
}

export function getTransitionVideoOperationKey(shotId: string) {
  return `transition-video-${shotId}`;
}

export function getFrameEditTemplate(templateId: 'camera-angle' | 'replace-object' | 'remove-foreground') {
  if (templateId === 'camera-angle') {
    return '在保持主体身份、服装、材质、背景环境和整体风格一致的前提下，将摄像机视角修改为【填写新视角，例如低机位广角 / 俯拍 / 侧后方三分之二视角】并重新构图。';
  }

  if (templateId === 'replace-object') {
    return '在保持人物、背景环境、光线和其他构图元素尽量不变的前提下，将画面中的【原物体】替换为【新物体】。';
  }

  return '保留当前图片的背景环境、空间结构、光线方向和整体氛围，去除前景中的人物和主要物体，让画面变成干净的空场景。';
}

export const CHARACTER_TYPE_OPTIONS: Array<{ value: NonNullable<CharacterPrompt['characterType']>; label: string }> = [
  { value: 'human', label: '人类 / Human' },
  { value: 'animal', label: '动物 / Animal' },
];

export function normalizeCharacterType(value?: CharacterPrompt['characterType']): NonNullable<CharacterPrompt['characterType']> {
  return value === 'animal' ? 'animal' : 'human';
}

export const CHARACTER_DETAIL_FIELDS: Array<{ key: CharacterDetailFieldKey; label: string; placeholder: string }> = [
  { key: 'gender', label: '性别 / Gender（非必填）', placeholder: '例如：male / female / androgynous' },
  { key: 'ageVibe', label: '年龄感 / Age vibe（非必填）', placeholder: '例如：early 20s, mature 30s' },
  { key: 'ethnicityOrAppearance', label: '种族或外貌类型 / Ethnicity or appearance type（非必填）', placeholder: '例如：East Asian appearance' },
  { key: 'build', label: '体型 / Build（非必填）', placeholder: '例如：lean athletic' },
  { key: 'faceHairstyle', label: '脸与发型特征 / Face + hairstyle（非必填）', placeholder: '例如：sharp jawline, long black hair' },
  { key: 'topOuterwear', label: '上半身穿着 / Top & outerwear（非必填）', placeholder: '例如：embroidered long robe with shoulder armor' },
  { key: 'bottomsFootwear', label: '下半身穿着 / Bottoms & footwear（非必填）', placeholder: '例如：dark trousers and leather boots' },
  { key: 'mainColors', label: '配色 / Main colors（非必填）', placeholder: '例如：indigo, silver, gold' },
  { key: 'uniqueMark', label: '识别特征 / Unique mark（非必填）', placeholder: '例如：scar on left eyebrow' },
  { key: 'signatureProp', label: '标志性道具 / Signature prop（非必填）', placeholder: '例如：jade flute' },
];

export const SCENE_DETAIL_FIELDS: Array<{ key: keyof NonNullable<Asset['scenePrompt']>; label: string; placeholder: string }> = [
  { key: 'locationType', label: '场景类型 / Location type（非必填）', placeholder: '例如：mountain temple courtyard' },
  { key: 'eraOrWorld', label: '时代或世界观 / Era or world（非必填）', placeholder: '例如：ancient wuxia fantasy' },
  { key: 'architectureLandscape', label: '建筑与地貌 / Architecture & landscape（非必填）', placeholder: '例如：stone pavilion, misty peaks' },
  { key: 'timeOfDay', label: '时间 / Time of day（非必填）', placeholder: '例如：dawn / moonlit night' },
  { key: 'weatherAtmosphere', label: '天气与氛围 / Weather & atmosphere（非必填）', placeholder: '例如：light fog, drifting petals' },
  { key: 'lighting', label: '光线 / Lighting（非必填）', placeholder: '例如：soft rim light with cool fill' },
  { key: 'mainColors', label: '主色 / Main colors（非必填）', placeholder: '例如：slate blue, pale jade' },
  { key: 'foregroundElements', label: '前景元素 / Foreground（非必填）', placeholder: '例如：stone lanterns, steps' },
  { key: 'backgroundLandmark', label: '背景地标 / Background landmark（非必填）', placeholder: '例如：distant mountain gate' },
  { key: 'avoidElements', label: '需规避元素 / Avoid elements（非必填）', placeholder: '例如：modern buildings, crowd' },
];

export const PRODUCT_DETAIL_FIELDS: Array<{ key: ProductDetailFieldKey; label: string; placeholder: string }> = [
  { key: 'category', label: '产品类别 / Category（非必填）', placeholder: '例如：portable charcoal grill' },
  { key: 'formFactor', label: '外形结构 / Form factor（非必填）', placeholder: '例如：rectangular tabletop grill' },
  { key: 'materialFinish', label: '材质与表面 / Material & finish（非必填）', placeholder: '例如：matte black steel shell' },
  { key: 'mainColors', label: '主色 / Main colors（非必填）', placeholder: '例如：matte black, stainless silver' },
  { key: 'heroFeatures', label: '核心特征 / Hero features（非必填）', placeholder: '例如：side vents, removable grill rack' },
  { key: 'logoBranding', label: 'Logo / 品牌识别（非必填）', placeholder: '例如：engraved logo on front panel' },
  { key: 'packagingDetails', label: '包装 / 配件（非必填）', placeholder: '例如：with branded box and detachable tray' },
  { key: 'usageScene', label: '典型使用场景 / Usage context（非必填）', placeholder: '例如：clean kitchen countertop packshot' },
  { key: 'avoidElements', label: '需规避元素 / Avoid elements（非必填）', placeholder: '例如：hands, food crumbs, extra utensils' },
];
