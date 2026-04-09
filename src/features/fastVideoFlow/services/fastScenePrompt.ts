const HUMAN_FACE_MOSAIC_SUFFIX = 'all human face fully mosaic';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const HUMAN_FACE_MOSAIC_SUFFIX_PATTERN = new RegExp(escapeRegExp(HUMAN_FACE_MOSAIC_SUFFIX), 'i');
const HUMAN_FACE_MOSAIC_SUFFIX_GLOBAL_PATTERN = new RegExp(escapeRegExp(HUMAN_FACE_MOSAIC_SUFFIX), 'ig');

function normalizePromptSegments(prompt: string) {
  return prompt
    .split(/[,，]/u)
    .map((segment) => segment.replace(/[ \t]+/gu, ' ').trim())
    .filter(Boolean)
    .join(', ');
}

export function hasHumanFaceMosaicSuffix(prompt: string) {
  return HUMAN_FACE_MOSAIC_SUFFIX_PATTERN.test(prompt.trim());
}

export function syncHumanFaceMosaicPrompt(prompt: string, enabled?: boolean) {
  const normalizedPrompt = normalizePromptSegments(
    prompt
      .trim()
      .replace(HUMAN_FACE_MOSAIC_SUFFIX_GLOBAL_PATTERN, ''),
  );

  if (!enabled) {
    return normalizedPrompt;
  }

  return normalizedPrompt ? `${normalizedPrompt} ${HUMAN_FACE_MOSAIC_SUFFIX}` : HUMAN_FACE_MOSAIC_SUFFIX;
}

export { HUMAN_FACE_MOSAIC_SUFFIX };
