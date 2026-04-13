const DEFAULT_BRIDGE_BASE_URL = '/api/seedance';
const URL_SCHEME_PATTERN = /^[a-z][a-z\d+\-.]*:/iu;

function trimTrailingSlashes(value: string) {
  return value.replace(/\/+$/u, '');
}

function trimLeadingSlashes(value: string) {
  return value.replace(/^\/+/u, '');
}

function joinUrlPath(basePath: string, nextPath: string) {
  const normalizedBasePath = trimTrailingSlashes(basePath);
  const normalizedNextPath = trimLeadingSlashes(nextPath);

  if (!normalizedBasePath) {
    return normalizedNextPath ? `/${normalizedNextPath}` : '/';
  }

  if (!normalizedNextPath) {
    return normalizedBasePath;
  }

  return `${normalizedBasePath}/${normalizedNextPath}`;
}

export function getSeedanceBridgeBaseUrl(explicitBaseUrl?: string) {
  const normalizedExplicitBaseUrl = (explicitBaseUrl || '').trim();
  if (normalizedExplicitBaseUrl) {
    return normalizedExplicitBaseUrl;
  }

  // Electron environment support
  if (typeof window !== 'undefined' && (window as any).electronAPI?.isElectron) {
    return (window as any).__ELECTRON_BRIDGE_URL__ || DEFAULT_BRIDGE_BASE_URL;
  }

  const envBaseUrl = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_SEEDANCE_BRIDGE_URL;
  const normalized = (envBaseUrl || '').trim();
  return normalized || DEFAULT_BRIDGE_BASE_URL;
}

export function buildSeedanceBridgeRequestUrl(path: string, explicitBaseUrl?: string) {
  const normalizedPath = String(path || '').trim();
  if (!normalizedPath) {
    return '';
  }

  if (
    normalizedPath.startsWith('data:')
    || normalizedPath.startsWith('blob:')
    || URL_SCHEME_PATTERN.test(normalizedPath)
  ) {
    return normalizedPath;
  }

  const bridgeBaseUrl = getSeedanceBridgeBaseUrl(explicitBaseUrl);
  if (URL_SCHEME_PATTERN.test(bridgeBaseUrl)) {
    const base = new URL(bridgeBaseUrl);
    return new URL(joinUrlPath(base.pathname, normalizedPath), `${base.origin}/`).toString();
  }

  return joinUrlPath(bridgeBaseUrl, normalizedPath);
}

export function resolveSeedanceBridgeUrl(pathOrUrl: string, explicitBaseUrl?: string) {
  const normalizedPathOrUrl = String(pathOrUrl || '').trim();
  if (!normalizedPathOrUrl) {
    return '';
  }

  if (normalizedPathOrUrl.startsWith('data:') || normalizedPathOrUrl.startsWith('blob:')) {
    return normalizedPathOrUrl;
  }

  if (URL_SCHEME_PATTERN.test(normalizedPathOrUrl)) {
    return normalizedPathOrUrl;
  }

  const bridgeBaseUrl = getSeedanceBridgeBaseUrl(explicitBaseUrl);
  if (URL_SCHEME_PATTERN.test(bridgeBaseUrl)) {
    const base = new URL(bridgeBaseUrl);
    if (normalizedPathOrUrl.startsWith('/')) {
      return new URL(normalizedPathOrUrl, `${base.origin}/`).toString();
    }
    return new URL(normalizedPathOrUrl, `${base.origin}${joinUrlPath(base.pathname, '/')}/`).toString();
  }

  if (normalizedPathOrUrl.startsWith('/')) {
    return normalizedPathOrUrl;
  }

  return joinUrlPath(bridgeBaseUrl, normalizedPathOrUrl);
}
