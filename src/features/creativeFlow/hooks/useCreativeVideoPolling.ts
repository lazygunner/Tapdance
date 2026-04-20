import { useEffect } from 'react';

import { getSeedanceTask } from '../../seedance/services/seedanceApiService.ts';
import { fetchSeedanceTask } from '../../fastVideoFlow/services/seedanceBridgeClient.ts';
import { buildSeedanceCliFailure, mapRemoteSeedanceStatus } from '../../fastVideoFlow/utils/fastVideoTask.ts';
import type { ApiSettings, Project } from '../../../types.ts';
import { getMockVideoUrl } from '../../../services/mockMedia.ts';
import { checkVideoStatus, fetchVideoBlobUrl } from '../../../services/modelService.ts';
import { setCachedApiSettings } from '../../../services/apiConfig.ts';
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
  apiSettings: ApiSettings;
  useMockMode: boolean;
  seedanceBridgeUrl: string;
  updateProjectRecord: (projectId: string, updater: (current: Project) => Project) => void;
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
        return { done: true, error: buildSeedanceCliFailure(result?.raw, '视频生成失败。').detail };
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

async function pollModelServiceOperation(operation: any, apiSettings: ApiSettings, useMockMode: boolean): Promise<{
  done: boolean;
  videoUrl?: string;
  error?: string;
  cancelled?: boolean;
}> {
  try {
    setCachedApiSettings(apiSettings);
    const status = await checkVideoStatus(operation, useMockMode);
    if (!status?.done) {
      return { done: false };
    }

    const generatedVideo = status?.response?.generatedVideos?.[0]?.video;
    const uri = generatedVideo?.uri || generatedVideo?.url || '';
    if (uri) {
      return {
        done: true,
        videoUrl: await fetchVideoBlobUrl(uri, useMockMode),
      };
    }

    const reasons = status?.response?.raiMediaFilteredReasons;
    if (Array.isArray(reasons) && reasons.length > 0) {
      const message = reasons.map((item) => String(item)).filter(Boolean).join('\n');
      return { done: true, error: message || '视频生成失败。' };
    }

    return { done: true, error: '生成失败，未返回视频。' };
  } catch (error: any) {
    console.error('Error polling model video task:', error);
    return { done: true, error: error?.message || '查询视频任务状态失败。' };
  }
}

async function pollCreativeVideoOperation(operation: any, apiSettings: ApiSettings, useMockMode: boolean, seedanceBridgeUrl: string) {
  const provider = operation?.provider || 'ark';
  if (provider === 'gemini' || provider === 'volcengine') {
    return pollModelServiceOperation(operation, apiSettings, useMockMode);
  }

  return pollSeedanceOperation(operation, seedanceBridgeUrl);
}

export function useCreativeVideoPolling({
  project,
  apiSettings,
  useMockMode,
  seedanceBridgeUrl,
  updateProjectRecord,
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
          const result = await pollCreativeVideoOperation(shotVideoOperation, apiSettings, useMockMode, seedanceBridgeUrl);
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
          const result = await pollCreativeVideoOperation(transitionVideoOperation, apiSettings, useMockMode, seedanceBridgeUrl);
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
        updateProjectRecord(project.id, (current) => ({
          ...current,
          shots: newShots,
        }));
      }
    }, pollIntervalMs);

    return () => clearInterval(interval);
  }, [project.id, project.shots, apiSettings, useMockMode, seedanceBridgeUrl]);
}
