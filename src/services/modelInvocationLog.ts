import type { ModelSourceId } from '../types.ts';
import { loadPersistedAppState, savePersistedAppState } from '../features/app/services/appStateStore.ts';

export const MODEL_INVOCATION_LOG_STATE_KEY = 'model_invocation_logs';
export const MODEL_INVOCATION_LOG_EVENT = 'ai-director-model-log-updated';

export type ModelInvocationProviderId = 'gemini' | 'volcengine' | 'seedance-cli' | 'seedance-ark';
export type ModelInvocationSourceId =
  | ModelSourceId
  | 'seedance.apiModel'
  | 'seedance.fastApiModel'
  | 'seedance.cliModelVersion'
  | 'seedance.bridgeUrl';

export interface ModelInvocationLogEntry {
  id: string;
  timestamp: string;
  provider: ModelInvocationProviderId;
  operation: string;
  status: 'success' | 'error';
  sourceId: ModelInvocationSourceId;
  modelName: string;
  request: unknown;
  response?: unknown;
  error?: string;
}

const MAX_LOG_COUNT = 50;
const MAX_STRING_LENGTH = 800;

let cachedLogs: ModelInvocationLogEntry[] = [];
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function inferSeedanceProvider(request: unknown): ModelInvocationProviderId | undefined {
  if (!isRecord(request)) {
    return undefined;
  }

  const executor = typeof request.executor === 'string'
    ? request.executor
    : typeof request.provider === 'string'
      ? request.provider
      : '';
  if (executor === 'ark') {
    return 'seedance-ark';
  }
  if (executor === 'cli') {
    return 'seedance-cli';
  }
  return undefined;
}

function inferSeedanceSourceId(entry: Pick<ModelInvocationLogEntry, 'provider' | 'operation' | 'request' | 'sourceId'>): ModelInvocationSourceId {
  if (entry.sourceId) {
    return entry.sourceId;
  }

  if (entry.operation === 'seedanceHealthCheck') {
    return 'seedance.bridgeUrl';
  }

  if (isRecord(entry.request) && entry.request.modelKey === 'fast') {
    return 'seedance.fastApiModel';
  }

  if (entry.provider === 'seedance-ark') {
    return 'seedance.apiModel';
  }

  if (entry.provider === 'seedance-cli') {
    return 'seedance.cliModelVersion';
  }

  return '';
}

function normalizeLegacyLogEntry(entry: ModelInvocationLogEntry): ModelInvocationLogEntry {
  const inferredSeedanceProvider = entry.provider === 'seedance-cli'
    ? inferSeedanceProvider(entry.request)
    : undefined;
  const provider = inferredSeedanceProvider || entry.provider;

  return {
    ...entry,
    provider,
    sourceId: inferSeedanceSourceId({
      provider,
      operation: entry.operation,
      request: entry.request,
      sourceId: entry.sourceId,
    }),
  };
}

function truncateString(value: string) {
  if (value.startsWith('data:')) {
    return `[data-url, length=${value.length}]`;
  }

  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_STRING_LENGTH)}... [truncated ${value.length - MAX_STRING_LENGTH} chars]`;
}

export function sanitizeLogPayload(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return truncateString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => sanitizeLogPayload(item, seen));
  }

  if (typeof value === 'object') {
    if (seen.has(value as object)) {
      return '[circular]';
    }

    seen.add(value as object);
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 30);
    return Object.fromEntries(entries.map(([key, item]) => [key, sanitizeLogPayload(item, seen)]));
  }

  return String(value);
}

function normalizeLogEntries(logs: ModelInvocationLogEntry[]) {
  const deduped = new Map<string, ModelInvocationLogEntry>();

  logs.forEach((entry) => {
    const normalized = normalizeLegacyLogEntry(entry);
    deduped.set(normalized.id, normalized);
  });

  return Array.from(deduped.values())
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, MAX_LOG_COUNT);
}

function notifyLogUpdate() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(MODEL_INVOCATION_LOG_EVENT));
}

async function persistLogsNow() {
  try {
    await savePersistedAppState(MODEL_INVOCATION_LOG_STATE_KEY, cachedLogs);
  } catch (error) {
    console.error('Failed to save model invocation logs', error);
  }
}

function scheduleLogPersistence() {
  if (persistTimer) {
    clearTimeout(persistTimer);
  }

  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistLogsNow();
  }, 120);
}

export async function hydrateModelInvocationLogs() {
  try {
    const persisted = await loadPersistedAppState<ModelInvocationLogEntry[]>(MODEL_INVOCATION_LOG_STATE_KEY);
    const nextLogs = Array.isArray(persisted.value) ? persisted.value : [];
    cachedLogs = normalizeLogEntries([...cachedLogs, ...nextLogs]);
  } catch (error) {
    console.error('Failed to load model invocation logs', error);
  }

  notifyLogUpdate();
  return loadModelInvocationLogs();
}

export function loadModelInvocationLogs(): ModelInvocationLogEntry[] {
  return [...cachedLogs];
}

export function appendModelInvocationLog(entry: Omit<ModelInvocationLogEntry, 'id' | 'timestamp' | 'request' | 'response'> & { request: unknown; response?: unknown }) {
  const nextEntry = normalizeLegacyLogEntry({
    ...entry,
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    timestamp: new Date().toISOString(),
    request: sanitizeLogPayload(entry.request),
    response: sanitizeLogPayload(entry.response),
  });

  cachedLogs = normalizeLogEntries([nextEntry, ...cachedLogs]);
  notifyLogUpdate();
  scheduleLogPersistence();
}

export function clearModelInvocationLogs() {
  cachedLogs = [];
  notifyLogUpdate();
  scheduleLogPersistence();
}
