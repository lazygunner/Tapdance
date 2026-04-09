export function isBlobUrl(url?: string) {
  return Boolean(url && url.startsWith('blob:'));
}

export function revokeBlobUrl(url?: string) {
  if (!isBlobUrl(url) || typeof URL === 'undefined') {
    return;
  }

  try {
    URL.revokeObjectURL(url);
  } catch {
    // Ignore revoke failures for stale object URLs.
  }
}
