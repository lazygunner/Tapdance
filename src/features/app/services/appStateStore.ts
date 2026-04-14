import { buildSeedanceBridgeRequestUrl } from '../../../services/seedanceBridgeUrl.ts';

export type PersistedAppStateEntry<T> = {
  key: string;
  value: T | null;
  updatedAt: string | null;
};

export type ResetPersistedAppStateResult = {
  ok: boolean;
  resetAt: string;
};

async function requestJson<T>(path: string, init?: RequestInit, explicitBaseUrl?: string): Promise<T> {
  const url = buildSeedanceBridgeRequestUrl(path, explicitBaseUrl);
  console.log(`[AppStateStore] ${init?.method || 'GET'} ${url}`);

  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  const text = await response.text();
  let payload: any = {};

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { error: text || `HTTP ${response.status}` };
  }

  if (!response.ok) {
    console.error(`[AppStateStore] Error: ${response.status} for ${url}`, payload);
    throw new Error(payload?.error || payload?.message || `HTTP ${response.status}`);
  }

  return payload as T;
}

export function loadPersistedAppState<T>(key: string, baseUrl?: string) {
  return requestJson<PersistedAppStateEntry<T>>(`/state/${encodeURIComponent(key)}`, {
    method: 'GET',
  }, baseUrl);
}

export function savePersistedAppState<T>(key: string, value: T, baseUrl?: string) {
  return requestJson<PersistedAppStateEntry<T>>(`/state/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  }, baseUrl);
}

export function resetPersistedAppStateStore(baseUrl?: string) {
  return requestJson<ResetPersistedAppStateResult>('/state/reset', {
    method: 'POST',
  }, baseUrl);
}
