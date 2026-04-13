import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { getSeedanceTask } from '../../seedance/services/seedanceApiService.ts';
import { fetchSeedanceTask } from '../../fastVideoFlow/services/seedanceBridgeClient.ts';
import { mapRemoteSeedanceStatus } from '../../fastVideoFlow/utils/fastVideoTask.ts';
import type { Project } from '../../../types.ts';
import { getMockVideoUrl } from '../../../services/mockMedia.ts';
import { getShotVideoOperationKey, getTransitionVideoOperationKey } from '../utils/creativeFlowHelpers.ts';

type PersistedMedia = {
  url: string;
  storageKey: string;
  relativePath: string;
  absolutePath: string;
  savedToLibrary: boolean;
};

type UseCreativeVideoPollingArgs = {
  project: Project;
  useMockMode: boolean;
  seedanceBridgeUrl: string;
  setProject: Dispatch<SetStateAction<Project>>;
  getOperationRecord: (operationKey: string) => any;
  setOperationRecord: (operationKey: string, operation?: any) => void;
  persistGeneratedMediaUrl: (
    sourceUrl: string,
    options: {
      kind: 'image' | 'video';
      assetId: string;
      title: string;
      fileNameHint?: string;
    },
  ) => Promise<PersistedMedia>;
};

function isCancellationMessage(message?: string) {
  const normalized = (message || '').toLowerCase();
  if (!normalized) {
    return false;
  }
  return normalized.includes('cancel') || normalized.includes('cancell') || normalized.includes('已取消') || normalized.includes('用户取消');
}

async function pollSeedanceOperation(operation: any, seedanceBridgeUrl: string): Promise<{
  done: boolean;
  videoUrl?: string;
  lastFrameUrl?: string;
  error?: string;
  cancelled?: boolean;
}> {
  const provider: 'ark' | 'cli' = operation?.provider || 'ark';
  const taskId = (operation?.taskId || '').trim();
  const submitId = (operation?.submitId || '').trim();
  const isMockOperation = taskId.startsWith('mock-') || submitId.startsWith('mock-');

  if (isMockOperation) {
    return {
      done: true,
      videoUrl: await getMockVideoUrl(),
    };
  }

  if (provider === 'cli' && submitId) {
    try {
      const result = await fetchSeedanceTask(submitId, seedanceBridgeUrl);
      const genStatus = result?.genStatus || '';
      const mappedStatus = mapRemoteSeedanceStatus(genStatus);

      if (mappedStatus === 'completed') {
        const videoUrl = result?.downloadedFiles?.[0]?.url || '';
        return { done: true, videoUrl };
      }

      if (mappedStatus === 'failed') {
        const raw = result?.raw as Record<string, any> | undefined;
        const errMsg = raw?.error?.message || raw?.error || '视频生成失败。';
        return { done: true, error: String(errMsg) };
      }

      if (mappedStatus === 'cancelled') {
        return { done: true, cancelled: true };
      }

      return { done: false };
    } catch (error: any) {
      console.error('Error polling CLI seedance task:', error);
      return { done: true, error: error?.message || '查询 CLI 任务状态失败。' };
    }
  }

  if (taskId) {
    try {
      const task = await getSeedanceTask(taskId);
      const mappedStatus = mapRemoteSeedanceStatus(task.status);

      if (mappedStatus === 'completed') {
        return {
          done: true,
          videoUrl: task.videoUrl || '',
          lastFrameUrl: task.lastFrameUrl || '',
        };
      }

      if (mappedStatus === 'failed') {
        const errMsg = task.error?.message || '视频生成失败。';
        const cancelled = isCancellationMessage(errMsg);
        return { done: true, error: cancelled ? '' : errMsg, cancelled };
      }

      if (mappedStatus === 'cancelled') {
        return { done: true, cancelled: true };
      }

      return { done: false };
    } catch (error: any) {
      console.error('Error polling Ark seedance task:', error);
      return { done: true, error: error?.message || '查询 Ark 任务状态失败。' };
    }
  }

  return { done: false };
}

export function useCreativeVideoPolling({
  project,
  useMockMode,
  seedanceBridgeUrl,
  setProject,
  getOperationRecord,
  setOperationRecord,
  persistGeneratedMediaUrl,
}: UseCreativeVideoPollingArgs) {
  useEffect(() => {
    project.shots.forEach((shot) => {
      if (shot.videoOperation) {
        setOperationRecord(getShotVideoOperationKey(shot.id), shot.videoOperation);
      }
      if (shot.transitionVideoOperation) {
        setOperationRecord(getTransitionVideoOperationKey(shot.id), shot.transitionVideoOperation);
      }
    });
  }, [project.shots]);

  useEffect(() => {
    if (!project.shots.some((shot) => shot.videoStatus === 'generating' || shot.transitionVideoStatus === 'generating')) {
      return;
    }

    const pollIntervalMs = useMockMode ? 500 : 10000;
    const interval = window.setInterval(async () => {
      let updated = false;
      const newShots = [...project.shots];

      for (let index = 0; index < newShots.length; index += 1) {
        const shot = newShots[index];

        // ── Shot video polling ──
        const shotVideoOperationKey = getShotVideoOperationKey(shot.id);
        const shotVideoOperation = shot.videoOperation || getOperationRecord(shotVideoOperationKey);
        if (shot.videoStatus === 'generating' && shotVideoOperation) {
          const result = await pollSeedanceOperation(shotVideoOperation, seedanceBridgeUrl);
          if (result.done) {
            if (result.cancelled) {
              newShots[index] = {
                ...shot,
                videoStatus: 'cancelled',
                videoUrl: undefined,
                videoStorageKey: '',
                videoOperation: undefined,
                videoError: undefined,
              };
              setOperationRecord(shotVideoOperationKey);
              updated = true;
            } else if (result.videoUrl) {
              try {
                const persistedVideo = await persistGeneratedMediaUrl(result.videoUrl, {
                  kind: 'video',
                  assetId: `${project.id}:shot:${shot.id}:video`,
                  title: `镜头 ${shot.shotNumber} 视频`,
                });
                newShots[index] = {
                  ...shot,
                  videoStatus: 'completed',
                  videoUrl: persistedVideo.url,
                  videoStorageKey: '',
                  videoOperation: undefined,
                  videoError: undefined,
                };
              } catch (persistError: any) {
                console.error('Failed to persist shot video:', persistError);
                newShots[index] = {
                  ...shot,
                  videoStatus: 'completed',
                  videoUrl: result.videoUrl,
                  videoStorageKey: '',
                  videoOperation: undefined,
                  videoError: undefined,
                };
              }
              setOperationRecord(shotVideoOperationKey);
              updated = true;
            } else if (result.error) {
              newShots[index] = {
                ...shot,
                videoStatus: isCancellationMessage(result.error) ? 'cancelled' : 'failed',
                videoOperation: undefined,
                videoError: isCancellationMessage(result.error) ? '' : result.error,
              };
              setOperationRecord(shotVideoOperationKey);
              updated = true;
            } else {
              newShots[index] = {
                ...shot,
                videoStatus: 'failed',
                videoOperation: undefined,
                videoError: '生成失败，未返回视频。',
              };
              setOperationRecord(shotVideoOperationKey);
              updated = true;
            }
          }
        }

        // ── Transition video polling ──
        const transitionVideoOperationKey = getTransitionVideoOperationKey(shot.id);
        const transitionVideoOperation = shot.transitionVideoOperation || getOperationRecord(transitionVideoOperationKey);
        if (shot.transitionVideoStatus === 'generating' && transitionVideoOperation) {
          const result = await pollSeedanceOperation(transitionVideoOperation, seedanceBridgeUrl);
          if (result.done) {
            if (result.cancelled) {
              newShots[index] = {
                ...newShots[index],
                transitionVideoStatus: 'cancelled',
                transitionVideoUrl: undefined,
                transitionVideoStorageKey: '',
                transitionVideoOperation: undefined,
                transitionVideoError: undefined,
              };
              setOperationRecord(transitionVideoOperationKey);
              updated = true;
            } else if (result.videoUrl) {
              try {
                const persistedVideo = await persistGeneratedMediaUrl(result.videoUrl, {
                  kind: 'video',
                  assetId: `${project.id}:shot:${shot.id}:transition`,
                  title: `镜头 ${shot.shotNumber} 转场`,
                });
                newShots[index] = {
                  ...newShots[index],
                  transitionVideoStatus: 'completed',
                  transitionVideoUrl: persistedVideo.url,
                  transitionVideoStorageKey: '',
                  transitionVideoOperation: undefined,
                  transitionVideoError: undefined,
                };
              } catch (persistError: any) {
                console.error('Failed to persist transition video:', persistError);
                newShots[index] = {
                  ...newShots[index],
                  transitionVideoStatus: 'completed',
                  transitionVideoUrl: result.videoUrl,
                  transitionVideoStorageKey: '',
                  transitionVideoOperation: undefined,
                  transitionVideoError: undefined,
                };
              }
              setOperationRecord(transitionVideoOperationKey);
              updated = true;
            } else if (result.error) {
              newShots[index] = {
                ...newShots[index],
                transitionVideoStatus: isCancellationMessage(result.error) ? 'cancelled' : 'failed',
                transitionVideoOperation: undefined,
                transitionVideoError: isCancellationMessage(result.error) ? '' : result.error,
              };
              setOperationRecord(transitionVideoOperationKey);
              updated = true;
            } else {
              newShots[index] = {
                ...newShots[index],
                transitionVideoStatus: 'failed',
                transitionVideoOperation: undefined,
                transitionVideoError: '生成失败，未返回视频。',
              };
              setOperationRecord(transitionVideoOperationKey);
              updated = true;
            }
          }
        }
      }

      if (updated) {
        setProject((prev) => ({
          ...prev,
          shots: newShots,
        }));
      }
    }, pollIntervalMs);

    return () => clearInterval(interval);
  }, [project.id, project.shots, useMockMode, seedanceBridgeUrl]);
}
