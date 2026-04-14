import crypto from 'node:crypto';
import { extname } from 'node:path';

export function createAssetBaseName(assetId, title, sanitizePathSegment) {
  const titleSlug = sanitizePathSegment(title, 'asset').replace(/\s+/gu, '-');
  const hash = crypto.createHash('sha1').update(String(assetId || titleSlug)).digest('hex').slice(0, 8);
  return `${titleSlug}-${hash}`.slice(0, 120);
}

export function buildAssetLibraryFileName({
  assetId,
  title,
  fileName,
  mimeType,
  kind,
  sanitizePathSegment,
  getMimeExtension,
}) {
  const explicitFileName = sanitizePathSegment(fileName, '');
  const uniqueBaseName = createAssetBaseName(assetId, title, sanitizePathSegment);
  const extension = explicitFileName && extname(explicitFileName)
    ? extname(explicitFileName).replace(/^\./u, '')
    : getMimeExtension(mimeType, kind);

  return `${uniqueBaseName}.${extension}`;
}
