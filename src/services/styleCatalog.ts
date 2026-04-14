import stylePresetsConfig from '../config/stylePresets.json';

export interface StylePreset {
  id: string;
  name: string;
  description: string;
  reversePrompt: string;
  keywords: string[];
  tags: string[];
  swatch: string;
  previewImage?: string;
}

function resolveStylePreviewImage(previewImage?: string) {
  const normalized = String(previewImage || '').trim();
  if (!normalized) {
    return undefined;
  }

  if (/^(https?:|data:|blob:|file:)/iu.test(normalized)) {
    return normalized;
  }

  if (typeof document === 'undefined') {
    return normalized;
  }

  const relativePath = normalized.replace(/^\/+/u, '');
  return new URL(relativePath, document.baseURI).toString();
}

const STYLE_PRESETS = (stylePresetsConfig.styles as StylePreset[]).map((preset) => ({
  ...preset,
  previewImage: resolveStylePreviewImage(preset.previewImage),
}));

export function getStylePresets() {
  return STYLE_PRESETS;
}

export function findStylePresetById(styleId?: string) {
  if (!styleId) {
    return undefined;
  }
  return STYLE_PRESETS.find((item) => item.id === styleId);
}

function scoreStylePreset(input: string, preset: StylePreset) {
  const normalizedInput = input.toLowerCase();
  const byKeyword = preset.keywords.reduce((acc, keyword) => {
    if (!keyword.trim()) {
      return acc;
    }
    return normalizedInput.includes(keyword.toLowerCase()) ? acc + 1 : acc;
  }, 0);

  const nameHit = normalizedInput.includes(preset.name.toLowerCase()) ? 2 : 0;
  return byKeyword + nameHit;
}

export function matchStylePreset(input: string) {
  const normalizedInput = input.trim();
  if (!normalizedInput) {
    return STYLE_PRESETS[0];
  }

  const scored = STYLE_PRESETS
    .map((preset) => ({
      preset,
      score: scoreStylePreset(normalizedInput, preset),
    }))
    .sort((a, b) => b.score - a.score);

  if (scored[0]?.score && scored[0].score > 0) {
    return scored[0].preset;
  }

  return STYLE_PRESETS[0];
}

export function buildStyleGuideText(style?: StylePreset) {
  if (!style) {
    return '';
  }

  return `${style.name}。${style.reversePrompt}`;
}

export function applyStyleGuideToPrompt(prompt: string, styleGuide: string) {
  const normalizedPrompt = prompt.trim();
  if (!styleGuide.trim()) {
    return normalizedPrompt;
  }
  if (!normalizedPrompt) {
    return styleGuide;
  }
  if (normalizedPrompt.includes(styleGuide)) {
    return normalizedPrompt;
  }

  return `${normalizedPrompt}\n\nStyle consistency:\n${styleGuide}`;
}
