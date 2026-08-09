const LEGACY_PROMPT_REFERENCE_TAG_REGEX = /@(图(?:片)?|视频|音频)\s*([0-9０-９]+)/gu;

function normalizeDigits(value: string) {
  return value.replace(/[０-９]/gu, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xFEE0));
}

export function parsePromptReferenceTags(
  prompt: string,
  availableTokens: Iterable<string>,
): { value: string; replacementCount: number } {
  const tokenSet = new Set(availableTokens);
  let replacementCount = 0;
  const value = prompt.replace(LEGACY_PROMPT_REFERENCE_TAG_REGEX, (source, kind: string, digits: string) => {
    const normalizedKind = kind === '图' || kind === '图片' ? '图片' : kind;
    const token = `${normalizedKind}${normalizeDigits(digits)}`;
    if (!tokenSet.has(token)) {
      return source;
    }
    replacementCount += 1;
    return token;
  });

  return { value, replacementCount };
}
