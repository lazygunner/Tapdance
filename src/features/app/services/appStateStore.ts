import { buildSeedanceBridgeRequestUrl } from '../../../services/seedanceBridgeUrl.ts';

export type PersistedAppStateEntry<T> = {
  key: string;
  value: T | null;
  updatedAt: string | null;
};

async function requestJson<T>(path: string, init?: RequestInit, explicitBaseUrl?: string): Promise<T> {
  const response = await fetch(buildSeedanceBridgeRequestUrl(path, explicitBaseUrl), {
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
