import { useCallback, useEffect, useRef, useState } from 'react';

import type { ApiSettings, Project } from '../../../types.ts';
import { saveMediaToAssetLibrary } from '../../../services/assetLibrary.ts';
import { normalizeProjectGroupName } from '../../../services/projectGroups.ts';
import { loadPersistedAppState, savePersistedAppState } from '../../app/services/appStateStore.ts';
import { submitSeedanceTask, fetchSeedanceTask } from '../services/seedanceBridgeClient.ts';
import {
  countSeedanceCliQueueAhead,
  createEmptySeedanceCliQueueState,
  createSeedanceCliQueueItem,
  getSeedanceCliRetryDelayMs,
  isSeedanceCliQueueActive,
  normalizeSeedanceCliQueueState,
  SEEDANCE_CLI_QUEUE_STATE_KEY,
} from '../services/seedanceCliQueue.ts';
import type { SeedanceCliQueueEnqueueInput, SeedanceCliQueueItem, SeedanceCliQueueState, SeedanceCliQueueToast } from '../types/queueTypes.ts';
import { buildSeedanceCliFailure, isSeedanceConcurrencyLimitError, mapRemoteSeedanceStatus, resolveSeedanceFinishedAt } from '../utils/fastVideoTask.ts';

type UseSeedanceCliQueueArgs = {
  apiSettings: ApiSettings;
  useMockMode: boolean;
  updateProjectRecord: (projectId: string, updater: (current: Project) => Project) => void;
};

function isMacPlatform() {
  if (typeof navigator === 'undefined') {
    return false;
  }
  return /mac/iu.test(navigator.platform || '');
}

function playCompletionSound() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }
    const audioContext = new AudioContextCtor();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(1174.66, audioContext.currentTime + 0.14);
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, audioContext.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.42);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.45);
    window.setTimeout(() => void audioContext.close().catch(() => {}), 700);
  } catch (error) {
    console.warn('Failed to play Seedance queue completion sound:', error);
  }
}

function getQueueItemActiveRank(items: SeedanceCliQueueItem[], itemId: string) {
  const activeItems = items.filter((item) => isSeedanceCliQueueActive(item.status));
  const index = activeItems.findIndex((item) => item.id === itemId);
  return index >= 0 ? index + 1 : 0;
}

function buildCliSources(draft: SeedanceCliQueueItem['draft']) {
  return {
    imageSources: draft.assets.filter((asset) => asset.kind === 'image').map((asset) => asset.urlOrData).filter(Boolean),
    videoSources: draft.assets.filter((asset) => asset.kind === 'video').map((asset) => asset.urlOrData).filter(Boolean),
    audioSources: draft.assets.filter((asset) => asset.kind === 'audio').map((asset) => asset.urlOrData).filter(Boolean),
  };
}

function resolveQueueWaitDurationMs(item: SeedanceCliQueueItem, endIso: string) {
  if (Number.isFinite(item.waitDurationMs)) {
    return item.waitDurationMs;
  }

  const createdAtMs = Date.parse(item.createdAt);
  const endMs = Date.parse(item.startedAt || endIso);
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(endMs)) {
    return undefined;
  }

  return Math.max(0, endMs - createdAtMs);
}

export function useSeedanceCliQueue({
  apiSettings,
  useMockMode,
  updateProjectRecord,
}: UseSeedanceCliQueueArgs) {
  const [queueState, setQueueState] = useState<SeedanceCliQueueState>(createEmptySeedanceCliQueueState);
  const [isLoaded, setIsLoaded] = useState(false);
  const [toasts, setToasts] = useState<SeedanceCliQueueToast[]>([]);
  const queueRef = useRef(queueState);
  const processingRef = useRef(false);
  const loadGenerationRef = useRef(0);

  useEffect(() => {
    queueRef.current = queueState;
  }, [queueState]);

  useEffect(() => {
    const loadId = loadGenerationRef.current + 1;
    loadGenerationRef.current = loadId;
    setIsLoaded(false);
    void loadPersistedAppState<SeedanceCliQueueState>(SEEDANCE_CLI_QUEUE_STATE_KEY, apiSettings.seedance.bridgeUrl)
      .then((entry) => {
        if (loadGenerationRef.current !== loadId) {
          return;
        }
        setQueueState(normalizeSeedanceCliQueueState(entry.value));
      })
      .catch((error) => {
        console.error('Failed to load Seedance CLI queue:', error);
        if (loadGenerationRef.current === loadId) {
          setQueueState(createEmptySeedanceCliQueueState());
        }
      })
      .finally(() => {
        if (loadGenerationRef.current === loadId) {
          setIsLoaded(true);
        }
      });
  }, [apiSettings.seedance.bridgeUrl]);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void savePersistedAppState(SEEDANCE_CLI_QUEUE_STATE_KEY, queueState, apiSettings.seedance.bridgeUrl)
        .catch((error) => console.error('Failed to save Seedance CLI queue:', error));
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [apiSettings.seedance.bridgeUrl, isLoaded, queueState]);

  const pushToast = useCallback((toast: Omit<SeedanceCliQueueToast, 'id'>) => {
    const id = crypto.randomUUID?.() || `queue-toast-${Date.now()}`;
    setToasts((current) => [...current.slice(-2), { id, ...toast }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 6400);
  }, []);

  const notify = useCallback(async (title: string, message: string, tone: SeedanceCliQueueToast['tone'], options?: { sound?: boolean }) => {
    pushToast({ title, message, tone });
    if (options?.sound) {
      playCompletionSound();
    }

    if (!isMacPlatform() || typeof Notification === 'undefined') {
      return;
    }

    try {
      const permission = Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission;
      if (permission === 'granted') {
        new Notification(title, { body: message });
      }
    } catch (error) {
      console.warn('Failed to show system notification:', error);
    }
  }, [pushToast]);

  const patchQueueItem = useCallback((itemId: string, patcher: (item: SeedanceCliQueueItem) => SeedanceCliQueueItem) => {
    setQueueState((current) => ({
      ...current,
      items: current.items.map((item) => item.id === itemId ? patcher(item) : item),
    }));
  }, []);

  const markProjectQueued = useCallback((item: SeedanceCliQueueItem, items: SeedanceCliQueueItem[]) => {
    const rank = getQueueItemActiveRank(items, item.id);
    updateProjectRecord(item.projectId, (current) => ({
      ...current,
      fastFlow: {
        ...current.fastFlow,
        task: {
          ...current.fastFlow.task,
          provider: 'cli',
          taskId: '',
          submitId: '',
          status: 'queued',
          remoteStatus: item.status === 'retry_wait' ? 'local_retry_wait' : 'local_queued',
          queueStatus: rank ? `本地排队第 ${rank} 位，前方 ${Math.max(0, rank - 1)} 个任务` : '本地排队中',
          raw: { queueItemId: item.id },
          error: '',
          lastCheckedAt: new Date().toISOString(),
        },
      },
    }));
  }, [updateProjectRecord]);

  const enqueueFastVideo = useCallback(async (input: SeedanceCliQueueEnqueueInput) => {
    if (isMacPlatform() && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission().catch(() => {});
    }

    const item = createSeedanceCliQueueItem(input);
    const nextItems = [...queueRef.current.items, item];
    setQueueState((current) => ({
      ...current,
      items: [...current.items, item],
    }));
    markProjectQueued(item, nextItems);

    return item;
  }, [markProjectQueued]);

  const persistQueueVideo = useCallback(async (item: SeedanceCliQueueItem, sourceUrl: string) => {
    const savedFile = await saveMediaToAssetLibrary({
      sourceUrl,
      kind: 'video',
      assetId: `${item.projectId}:fast-task:video`,
      title: '极速视频成片',
      groupName: normalizeProjectGroupName(item.groupName) || '未分组',
      projectName: item.projectName || '未命名项目',
      baseUrl: apiSettings.seedance.bridgeUrl,
    });
    return savedFile.url;
  }, [apiSettings.seedance.bridgeUrl]);

  const startQueuedItem = useCallback(async (item: SeedanceCliQueueItem) => {
    const nowIso = new Date().toISOString();
    patchQueueItem(item.id, (current) => ({
      ...current,
      status: 'submitting',
      startedAt: current.startedAt || nowIso,
      waitDurationMs: resolveQueueWaitDurationMs(current, nowIso),
      lastCheckedAt: nowIso,
      error: '',
    }));
    updateProjectRecord(item.projectId, (current) => ({
      ...current,
      fastFlow: {
        ...current.fastFlow,
        task: {
          ...current.fastFlow.task,
          provider: 'cli',
          status: 'submitting',
          remoteStatus: 'local_queue_submitting',
          queueStatus: '本地队列自动提交中',
          error: '',
          startedAt: current.fastFlow.task.startedAt || nowIso,
          finishedAt: '',
          raw: { queueItemId: item.id },
        },
      },
    }));

    if (useMockMode) {
      const mockSubmitId = `mock-queued-${Date.now()}`;
      patchQueueItem(item.id, (current) => ({
        ...current,
        status: 'running',
        submitId: mockSubmitId,
        lastCheckedAt: new Date().toISOString(),
      }));
      updateProjectRecord(item.projectId, (current) => ({
        ...current,
        fastFlow: {
          ...current.fastFlow,
          task: {
            ...current.fastFlow.task,
            provider: 'cli',
            taskId: mockSubmitId,
            submitId: mockSubmitId,
            status: 'generating',
            remoteStatus: 'querying',
            queueStatus: '本地队列 Mock 生成中',
            raw: { queueItemId: item.id },
          },
        },
      }));
      return;
    }

    const sources = buildCliSources(item.draft);
    const result = await submitSeedanceTask({
      projectId: item.projectId,
      prompt: item.draft.prompt.rawPrompt,
      imageSources: sources.imageSources,
      videoSources: sources.videoSources,
      audioSources: sources.audioSources,
      options: item.cliOptions,
      baseUrl: apiSettings.seedance.bridgeUrl,
    });
    const submitStatus = mapRemoteSeedanceStatus(result.genStatus);
    if (submitStatus === 'failed') {
      const failure = buildSeedanceCliFailure(result.raw, '提交 Seedance 失败。');
      const error = new Error(failure.detail);
      (error as any).userMessage = failure.userMessage;
      (error as any).response = result;
      throw error;
    }

    patchQueueItem(item.id, (current) => ({
      ...current,
      status: 'running',
      submitId: result.submitId,
      attemptCount: current.attemptCount + 1,
      lastCheckedAt: new Date().toISOString(),
    }));
    updateProjectRecord(item.projectId, (current) => ({
      ...current,
      fastFlow: {
        ...current.fastFlow,
        task: {
          ...current.fastFlow.task,
          provider: 'cli',
          taskId: result.submitId,
          submitId: result.submitId,
          status: mapRemoteSeedanceStatus(result.genStatus),
          remoteStatus: result.genStatus,
          queueStatus: '本地队列已提交，等待云端处理',
          raw: result.raw,
          error: '',
          lastCheckedAt: new Date().toISOString(),
        },
      },
    }));
  }, [apiSettings.seedance.bridgeUrl, patchQueueItem, updateProjectRecord, useMockMode]);

  const pollRunningItem = useCallback(async (item: SeedanceCliQueueItem) => {
    if (useMockMode) {
      const nowIso = new Date().toISOString();
      patchQueueItem(item.id, (current) => ({
        ...current,
        status: 'completed',
        finishedAt: current.finishedAt || nowIso,
        lastCheckedAt: nowIso,
      }));
      updateProjectRecord(item.projectId, (current) => ({
        ...current,
        fastFlow: {
          ...current.fastFlow,
          task: {
            ...current.fastFlow.task,
            provider: 'cli',
            status: 'completed',
            remoteStatus: 'success',
            queueStatus: '本地队列任务完成',
            videoUrl: current.fastFlow.task.videoUrl || 'https://www.w3schools.com/html/mov_bbb.mp4',
            error: '',
            lastCheckedAt: nowIso,
            finishedAt: resolveSeedanceFinishedAt('completed', current.fastFlow.task.finishedAt, nowIso),
          },
        },
      }));
      await notify('Seedance 队列任务完成', `${item.projectName} · ${item.label}`, 'success', { sound: true });
      return;
    }

    if (!item.submitId) {
      throw new Error('队列任务缺少 submitId。');
    }

    const result = await fetchSeedanceTask(item.submitId, apiSettings.seedance.bridgeUrl);
    const normalizedStatus = mapRemoteSeedanceStatus(result.genStatus);
    const nowIso = new Date().toISOString();

    if (normalizedStatus === 'completed') {
      const latestVideoUrl = result.downloadedFiles?.[0]?.url || '';
      const persistedUrl = latestVideoUrl ? await persistQueueVideo(item, latestVideoUrl) : '';
      patchQueueItem(item.id, (current) => ({
        ...current,
        status: 'completed',
        finishedAt: current.finishedAt || nowIso,
        lastCheckedAt: nowIso,
        error: '',
      }));
      updateProjectRecord(item.projectId, (current) => ({
        ...current,
        fastFlow: {
          ...current.fastFlow,
          task: {
            ...current.fastFlow.task,
            provider: 'cli',
            taskId: item.submitId,
            submitId: item.submitId,
            status: 'completed',
            remoteStatus: result.genStatus,
            queueStatus: '本地队列任务完成',
            raw: result.raw,
            videoUrl: persistedUrl || current.fastFlow.task.videoUrl,
            videoStorageKey: '',
            error: '',
            lastCheckedAt: nowIso,
            finishedAt: resolveSeedanceFinishedAt('completed', current.fastFlow.task.finishedAt, nowIso),
          },
        },
      }));
      await notify('Seedance 队列任务完成', `${item.projectName} · ${item.label}`, 'success', { sound: true });
      return;
    }

    if (normalizedStatus === 'failed') {
      const failure = buildSeedanceCliFailure(result.raw, 'Seedance 任务失败，请查看日志。');
      patchQueueItem(item.id, (current) => ({
        ...current,
        status: 'failed',
        error: failure.detail,
        finishedAt: current.finishedAt || nowIso,
        lastCheckedAt: nowIso,
      }));
      updateProjectRecord(item.projectId, (current) => ({
        ...current,
        fastFlow: {
          ...current.fastFlow,
          task: {
            ...current.fastFlow.task,
            provider: 'cli',
            taskId: item.submitId,
            submitId: item.submitId,
            status: 'failed',
            remoteStatus: result.genStatus,
            queueStatus: '本地队列任务失败',
            raw: result.raw,
            error: failure.detail,
            lastCheckedAt: nowIso,
            finishedAt: resolveSeedanceFinishedAt('failed', current.fastFlow.task.finishedAt, nowIso),
          },
        },
      }));
      await notify('Seedance 队列任务失败', failure.userMessage, 'error');
      return;
    }

    patchQueueItem(item.id, (current) => ({
      ...current,
      status: 'running',
      lastCheckedAt: nowIso,
    }));
    updateProjectRecord(item.projectId, (current) => ({
      ...current,
      fastFlow: {
        ...current.fastFlow,
        task: {
          ...current.fastFlow.task,
          provider: 'cli',
          taskId: item.submitId,
          submitId: item.submitId,
          status: 'generating',
          remoteStatus: result.genStatus || current.fastFlow.task.remoteStatus,
          queueStatus: result.queueInfo?.queue_status || '本地队列任务生成中',
          raw: result.raw,
          error: '',
          lastCheckedAt: nowIso,
        },
      },
    }));
  }, [apiSettings.seedance.bridgeUrl, notify, patchQueueItem, persistQueueVideo, updateProjectRecord, useMockMode]);

  const processQueue = useCallback(async () => {
    if (!isLoaded || processingRef.current) {
      return;
    }

    processingRef.current = true;
    try {
      const currentItems = queueRef.current.items;
      const runningItem = currentItems.find((item) => item.status === 'running' || item.status === 'submitting');
      if (runningItem) {
        if (runningItem.status === 'running') {
          await pollRunningItem(runningItem);
        }
        return;
      }

      const nowMs = Date.now();
      const nextItem = currentItems.find((item) => (
        item.status === 'queued'
        || (item.status === 'retry_wait' && (!item.nextRetryAt || Date.parse(item.nextRetryAt) <= nowMs))
      ));
      if (!nextItem) {
        return;
      }

      try {
        await startQueuedItem(nextItem);
      } catch (error: any) {
        const errorMessage = error?.message || '提交 Seedance 失败。';
        if (isSeedanceConcurrencyLimitError(errorMessage)) {
          const nowIso = new Date().toISOString();
          const nextAttemptCount = nextItem.attemptCount + 1;
          const nextRetryAt = new Date(Date.now() + getSeedanceCliRetryDelayMs(nextAttemptCount)).toISOString();
          patchQueueItem(nextItem.id, (current) => ({
            ...current,
            status: 'retry_wait',
            attemptCount: nextAttemptCount,
            error: errorMessage,
            lastCheckedAt: nowIso,
            nextRetryAt,
          }));
          updateProjectRecord(nextItem.projectId, (current) => ({
            ...current,
            fastFlow: {
              ...current.fastFlow,
              task: {
                ...current.fastFlow.task,
                provider: 'cli',
                status: 'queued',
                remoteStatus: 'local_retry_wait',
                queueStatus: 'CLI 并发占用中，本地队列稍后重试',
                raw: error?.response?.raw ?? { queueItemId: nextItem.id },
                error: '',
                lastCheckedAt: nowIso,
              },
            },
          }));
          return;
        }

        const nowIso = new Date().toISOString();
        patchQueueItem(nextItem.id, (current) => ({
          ...current,
          status: 'failed',
          error: errorMessage,
          finishedAt: current.finishedAt || nowIso,
          lastCheckedAt: nowIso,
        }));
        updateProjectRecord(nextItem.projectId, (current) => ({
          ...current,
          fastFlow: {
            ...current.fastFlow,
            task: {
              ...current.fastFlow.task,
              provider: 'cli',
              status: 'failed',
              remoteStatus: error?.response?.genStatus || current.fastFlow.task.remoteStatus,
              queueStatus: '本地队列任务失败',
              raw: error?.response?.raw ?? current.fastFlow.task.raw,
              error: errorMessage,
              lastCheckedAt: nowIso,
              finishedAt: resolveSeedanceFinishedAt('failed', current.fastFlow.task.finishedAt, nowIso),
            },
          },
        }));
        await notify('Seedance 队列任务失败', error?.userMessage || errorMessage, 'error');
      }
    } finally {
      processingRef.current = false;
    }
  }, [isLoaded, notify, patchQueueItem, pollRunningItem, startQueuedItem, updateProjectRecord]);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    void processQueue();
    const interval = window.setInterval(() => {
      void processQueue();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [isLoaded, processQueue]);

  const cancelItem = useCallback((itemId: string) => {
    const item = queueRef.current.items.find((candidate) => candidate.id === itemId);
    if (!item || item.status === 'running' || item.status === 'submitting') {
      return;
    }
    const nowIso = new Date().toISOString();
    patchQueueItem(itemId, (current) => ({
      ...current,
      status: 'cancelled',
      finishedAt: current.finishedAt || nowIso,
      waitDurationMs: resolveQueueWaitDurationMs(current, nowIso),
      lastCheckedAt: nowIso,
      error: '',
    }));
    updateProjectRecord(item.projectId, (current) => ({
      ...current,
      fastFlow: {
        ...current.fastFlow,
        task: {
          ...current.fastFlow.task,
          status: 'cancelled',
          remoteStatus: 'local_cancelled',
          queueStatus: '本地队列任务已取消',
          error: '',
          lastCheckedAt: nowIso,
          finishedAt: resolveSeedanceFinishedAt('cancelled', current.fastFlow.task.finishedAt, nowIso),
        },
      },
    }));
  }, [patchQueueItem, updateProjectRecord]);

  const removeItem = useCallback((itemId: string) => {
    setQueueState((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== itemId),
    }));
  }, []);

  const clearTerminalItems = useCallback(() => {
    setQueueState((current) => ({
      ...current,
      items: current.items.filter((item) => isSeedanceCliQueueActive(item.status)),
    }));
  }, []);

  const clearWaitingItems = useCallback(() => {
    const waitingItems = queueRef.current.items.filter((item) => item.status === 'queued' || item.status === 'retry_wait');
    for (const item of waitingItems) {
      cancelItem(item.id);
    }
  }, [cancelItem]);

  const activeCount = queueState.items.filter((item) => isSeedanceCliQueueActive(item.status)).length;
  const waitingCount = queueState.items.filter((item) => item.status === 'queued' || item.status === 'retry_wait').length;

  return {
    queueState,
    queueToasts: toasts,
    activeCount,
    waitingCount,
    countAhead: () => countSeedanceCliQueueAhead(queueRef.current.items),
    enqueueFastVideo,
    cancelItem,
    removeItem,
    clearTerminalItems,
    clearWaitingItems,
  };
}
