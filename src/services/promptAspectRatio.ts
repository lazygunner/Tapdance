import type { AspectRatio } from '../types.ts';

type FramePromptLike = {
  professional?: string;
  professionalZh?: string;
  lastFrameProfessional?: string;
  lastFrameProfessionalZh?: string;
};

const ASPECT_RATIO_PATTERN = /\b(16\s*:\s*9|9\s*:\s*16|1\s*:\s*1|4\s*:\s*3)\b/u;

function normalizeAspectRatio(value: string): AspectRatio | undefined {
  const normalized = value.replace(/\s+/gu, '');
  if (normalized === '16:9' || normalized === '9:16' || normalized === '1:1' || normalized === '4:3') {
    return normalized;
  }
  return undefined;
}

function appendConstraint(prompt: string, constraint: string, separator: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return constraint;
  }
  return `${trimmed}${separator}${constraint}`;
}

function hasEnglishAspectRatioConstraint(prompt: string, aspectRatio: AspectRatio): boolean {
  if (!prompt.includes(aspectRatio)) {
    return false;
  }
  return /(aspect ratio|aspect-ratio|ratio)/iu.test(prompt);
}

function hasChineseAspectRatioConstraint(prompt: string, aspectRatio: AspectRatio): boolean {
  if (!prompt.includes(aspectRatio)) {
    return false;
  }
  return /(比例|宽高比|纵横比|画幅)/u.test(prompt);
}

export function ensureEnglishAspectRatioConstraint(prompt: string, aspectRatio: AspectRatio): string {
  if (hasEnglishAspectRatioConstraint(prompt, aspectRatio)) {
    return prompt.trim();
  }
  return appendConstraint(prompt, `aspect ratio ${aspectRatio}`, ', ');
}

export function ensureChineseAspectRatioConstraint(prompt: string, aspectRatio: AspectRatio): string {
  if (hasChineseAspectRatioConstraint(prompt, aspectRatio)) {
    return prompt.trim();
  }
  return appendConstraint(prompt, `画面比例${aspectRatio}`, '，');
}

export function enforceFramePromptAspectRatio<T extends FramePromptLike>(imagePrompt: T | undefined, aspectRatio: AspectRatio): T | undefined {
  if (!imagePrompt) {
    return imagePrompt;
  }

  const next: T = { ...imagePrompt };
  if (typeof next.professional === 'string') {
    next.professional = ensureEnglishAspectRatioConstraint(next.professional, aspectRatio);
  }
  if (typeof next.lastFrameProfessional === 'string') {
    next.lastFrameProfessional = ensureEnglishAspectRatioConstraint(next.lastFrameProfessional, aspectRatio);
  }
  if (typeof next.professionalZh === 'string') {
    next.professionalZh = ensureChineseAspectRatioConstraint(next.professionalZh, aspectRatio);
  }
  if (typeof next.lastFrameProfessionalZh === 'string') {
    next.lastFrameProfessionalZh = ensureChineseAspectRatioConstraint(next.lastFrameProfessionalZh, aspectRatio);
  }
  return next;
}

export function inferAspectRatioFromFramePrompts(imagePrompt: FramePromptLike | undefined): AspectRatio | undefined {
  if (!imagePrompt) {
    return undefined;
  }

  const candidates = [
    imagePrompt.professional,
    imagePrompt.professionalZh,
    imagePrompt.lastFrameProfessional,
    imagePrompt.lastFrameProfessionalZh,
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const matched = candidate.match(ASPECT_RATIO_PATTERN);
    if (!matched) {
      continue;
    }
    const normalized = normalizeAspectRatio(matched[1]);
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}
