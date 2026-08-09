export function getVirtualPortraitDescriptionFromFileName(fileName: string) {
  const normalized = String(fileName || '').trim();
  if (!normalized) {
    return '虚拟人像素材';
  }

  const withoutExtension = normalized.replace(/\.[^./\\]+$/u, '').trim();
  return withoutExtension || normalized;
}
