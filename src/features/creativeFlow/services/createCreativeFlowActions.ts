import type { ChangeEvent, Dispatch, SetStateAction } from 'react';

import {
  generateAssetImage,
  generateAssetPrompt,
  generatePromptsForShot,
  generateShotList,
  generateStoryboardImage,
  generateTransitionPrompt,
  translatePromptsToEnglish,
} from '../../../services/modelService';
import type { ModelInvocationLogEntry } from '../../../services/modelInvocationLog';
import type { ProjectGroupImageAsset } from '../../../services/projectGroups.ts';
import type { ApiSettings, Asset, Brief, ModelSourceId, Project, PromptLanguage, Shot } from '../../../types.ts';
import { createSeedanceTask, deleteSeedanceTask } from '../../seedance/services/seedanceApiService.ts';
import { submitSeedanceTask } from '../../fastVideoFlow/services/seedanceBridgeClient.ts';
import type { SeedanceDraft } from '../../seedance/types.ts';
import { buildShotSeedanceDraft, buildTransitionSeedanceDraft } from './creativeFlowSeedanceDraft.ts';
import { buildSeedanceCliFailure, mapRemoteSeedanceStatus } from '../../fastVideoFlow/utils/fastVideoTask.ts';
import {
  buildDualModeVideoPrompts,
  getShotImagePromptBySource,
  getTransitionPromptBySource,
} from '../utils/videoPromptBuilders.ts';
import {
  createEmptyAssetDraft,
  getFrameEditPromptKey,
  getShotVideoOperationKey,
  getTransitionVideoOperationKey,
  hasLastFramePrompt,
  normalizeCharacterType,
  resequenceShots,
} from '../utils/creativeFlowHelpers.ts';

type PersistedMedia = {
  url: string;
  storageKey: string;
  relativePath: string;
  absolutePath: string;
  savedToLibrary: boolean;
};

type SeedanceLogEntry = {
  operation: string;
  status: 'success' | 'error';
  request: unknown;
  response?: unknown;
  error?: string;
  executor?: 'ark' | 'cli';
  sourceId?: ModelInvocationLogEntry['sourceId'];
  modelName?: string;
};

type CreativeFlowActionDeps = {
  apiSettings: ApiSettings;
  project: Project;
  newAsset: Partial<Asset>;
  frameEditPrompts: Record<string, string>;
  currentGroupImageAssets: ProjectGroupImageAsset[];
  useMockMode: boolean;
  isCreativeProject: boolean;
  setProject: Dispatch<SetStateAction<Project>>;
  updateProjectRecord: (projectId: string, updater: (current: Project) => Project) => void;
  setView: (view: 'shots') => void;
  setHasKey: Dispatch<SetStateAction<boolean>>;
  setIsGeneratingShots: Dispatch<SetStateAction<boolean>>;
  setGeneratingPrompts: Dispatch<SetStateAction<Record<string, boolean>>>;
  setTranslatingPrompts: Dispatch<SetStateAction<Record<string, boolean>>>;
  setGeneratingImages: Dispatch<SetStateAction<Record<string, boolean>>>;
  setGeneratingAssetPrompts: Dispatch<SetStateAction<Record<string, boolean>>>;
  setGeneratingAssetImages: Dispatch<SetStateAction<Record<string, boolean>>>;
  setIsAddingAsset: Dispatch<SetStateAction<boolean>>;
  setNewAsset: Dispatch<SetStateAction<Partial<Asset>>>;
  getTextModelName: () => string;
  getTextModelSourceId: () => ModelSourceId;
  getOperationSourceId: (operationKey: string, category: 'text' | 'image' | 'video') => ModelSourceId;
  getOperationModelName: (operationKey: string, category: 'text' | 'image' | 'video') => string;
  getPromptLanguageBySourceId: (sourceId: ModelSourceId) => PromptLanguage;
  getTransitionVideoConfig: (shot?: Shot) => { aspectRatio: Project['brief'] extends { aspectRatio: infer T } ? T : never; duration: number };
  withStyledBrief: (brief: Brief) => Brief;
  withStyledPrompt: (prompt: string) => string;
  withStyledShot: (shot: Shot) => Shot;
  getAssetGenerationBrief: () => Brief | null;
  persistGeneratedMediaUrl: (
    sourceUrl: string,
    options: {
      kind: 'image' | 'video';
      assetId: string;
      title: string;
      fileNameHint?: string;
    },
  ) => Promise<PersistedMedia>;
  readFileAsDataUrl: (file: File) => Promise<string>;
  setOperationCancelPending: (operationKey: string, pending: boolean) => void;
  hasPendingOperationCancel: (operationKey: string) => boolean;
  setOperationRecord: (operationKey: string, operation?: any) => void;
  getOperationRecord: (operationKey: string) => any;
  findLoggedShotVideoOperation: (shotId: string) => any;
  findLoggedTransitionVideoOperation: (firstFrameUrl?: string, lastFrameUrl?: string) => any;
  getSeedanceArkModelMeta: (modelKey?: 'standard' | 'fast') => {
    sourceId: ModelInvocationLogEntry['sourceId'];
    modelName: string;
  };
  buildSeedanceSubmitLogRequest: (draft: SeedanceDraft, executor: 'ark' | 'cli') => Record<string, unknown>;
  appendSeedanceLog: (entry: SeedanceLogEntry) => void;
  refreshSeedanceHealth: () => Promise<void>;
};

function isPermissionError(error: any) {
  return Boolean(
    error?.message?.includes('Requested entity was not found')
    || error?.message?.includes('PERMISSION_DENIED')
    || error?.status === 403
    || error?.message?.includes('403'),
  );
}

function attachSceneAssetsToShots(shots: Shot[], assets: Asset[]) {
  const sceneAssets = assets.filter((asset) => asset.type === 'scene');
  if (sceneAssets.length === 0) {
    return shots;
  }

  return shots.map((shot) => {
    const existing = new Set(shot.referenceAssets || []);
    const hasSceneRef = sceneAssets.some((asset) => existing.has(asset.id));
    if (hasSceneRef) {
      return shot;
    }

    const text = `${shot.action || ''} ${shot.subject || ''}`.toLowerCase();
    const matched = sceneAssets.find((asset) => text.includes(asset.name.toLowerCase())) || sceneAssets[0];

    return {
      ...shot,
      referenceAssets: [...existing, matched.id],
    };
  });
}

function resolveShotGroupReferenceAssets(
  shot: Shot,
  currentGroupImageAssets: ProjectGroupImageAsset[],
  excludeImageUrls: string[] = [],
): Asset[] {
  const selectedIds = new Set(shot.groupReferenceImageIds || []);
  if (selectedIds.size === 0) {
    return [];
  }

  const excluded = new Set(excludeImageUrls.filter(Boolean));

  return currentGroupImageAssets
    .filter((item) => selectedIds.has(item.id) && !excluded.has(item.imageUrl))
    .map((item) => ({
      id: item.id,
      type: 'style' as const,
      name: `${item.projectName} / ${item.title}`,
      description: `${item.sourceLabel} 参考图`,
      imageUrl: item.imageUrl,
    }));
}

function dedupeAssets(assets: Asset[]) {
  return assets.filter((asset, index, list) => list.findIndex((item) => item.id === asset.id) === index);
}

export function createCreativeFlowActions({
  apiSettings,
  project,
  newAsset,
  frameEditPrompts,
  currentGroupImageAssets,
  useMockMode,
  isCreativeProject,
  setProject,
  updateProjectRecord,
  setView,
  setHasKey,
  setIsGeneratingShots,
  setGeneratingPrompts,
  setTranslatingPrompts,
  setGeneratingImages,
  setGeneratingAssetPrompts,
  setGeneratingAssetImages,
  setIsAddingAsset,
  setNewAsset,
  getTextModelName,
  getTextModelSourceId,
  getOperationSourceId,
  getOperationModelName,
  getPromptLanguageBySourceId,
  getTransitionVideoConfig,
  withStyledBrief,
  withStyledPrompt,
  withStyledShot,
  getAssetGenerationBrief,
  persistGeneratedMediaUrl,
  readFileAsDataUrl,
  setOperationCancelPending,
  hasPendingOperationCancel,
  setOperationRecord,
  getOperationRecord,
  findLoggedShotVideoOperation,
  findLoggedTransitionVideoOperation,
  getSeedanceArkModelMeta,
  buildSeedanceSubmitLogRequest,
  appendSeedanceLog,
  refreshSeedanceHealth,
}: CreativeFlowActionDeps) {
  const toggleShotGroupReferenceImage = (shotId: string, imageId: string) => {
    setProject((prev) => ({
      ...prev,
      shots: prev.shots.map((item) => {
        if (item.id !== shotId) {
          return item;
        }

        const selectedIds = item.groupReferenceImageIds || [];
        if (selectedIds.includes(imageId)) {
          return {
            ...item,
            groupReferenceImageIds: selectedIds.filter((id) => id !== imageId),
          };
        }

        if (selectedIds.length >= 4) {
          alert('同组图片参考最多选择 4 张。');
          return item;
        }

        return {
          ...item,
          groupReferenceImageIds: [...selectedIds, imageId],
        };
      }),
    }));
  };

  const handleGenerateShots = async () => {
    if (!project.brief) {
      return;
    }

    setIsGeneratingShots(true);
    try {
      const shots = await generateShotList(
        withStyledBrief(project.brief),
        project.assets,
        5,
        useMockMode,
        getTextModelName(),
        getTextModelSourceId(),
      );
      setProject((prev) => ({ ...prev, shots: resequenceShots(attachSceneAssetsToShots(shots, prev.assets)) }));
      setView('shots');
    } catch (error: any) {
      console.error('Failed to generate shots:', error);
      if (isPermissionError(error)) {
        setHasKey(false);
      } else {
        alert('生成分镜列表失败，请查看控制台。');
      }
    } finally {
      setIsGeneratingShots(false);
    }
  };

  const handleGeneratePrompts = async (shotId: string) => {
    if (!project.brief) {
      return;
    }
    const shot = project.shots.find((item) => item.id === shotId);
    if (!shot) {
      return;
    }

    setGeneratingPrompts((prev) => ({ ...prev, [shotId]: true }));
    try {
      const updatedShot = await generatePromptsForShot(
        shot,
        withStyledBrief(project.brief),
        project.assets,
        project.shots,
        useMockMode,
        getOperationModelName(`shot-prompt-${shotId}`, 'text'),
        getOperationSourceId(`shot-prompt-${shotId}`, 'text'),
      );
      setProject((prev) => ({
        ...prev,
        shots: prev.shots.map((item) => item.id === shotId ? updatedShot : item),
      }));
    } catch (error: any) {
      console.error('Failed to generate prompts:', error);
      if (isPermissionError(error)) {
        setHasKey(false);
      } else {
        alert('生成提示词失败。');
      }
    } finally {
      setGeneratingPrompts((prev) => ({ ...prev, [shotId]: false }));
    }
  };

  const handleTranslatePrompts = async (shotId: string) => {
    const shot = project.shots.find((item) => item.id === shotId);
    if (!shot || !shot.imagePrompt) {
      return;
    }

    setTranslatingPrompts((prev) => ({ ...prev, [shotId]: true }));
    try {
      const updatedShot = await translatePromptsToEnglish(
        shot,
        useMockMode,
        getOperationModelName(`shot-prompt-${shotId}`, 'text'),
        getOperationSourceId(`shot-prompt-${shotId}`, 'text'),
      );
      setProject((prev) => ({
        ...prev,
        shots: prev.shots.map((item) => item.id === shotId ? updatedShot : item),
      }));
    } catch (error: any) {
      console.error('Failed to translate prompts:', error);
      if (isPermissionError(error)) {
        setHasKey(false);
      } else {
        alert('翻译提示词失败。');
      }
    } finally {
      setTranslatingPrompts((prev) => ({ ...prev, [shotId]: false }));
    }
  };

  const handleGenerateFirstFrame = async (shotId: string) => {
    if (!project.brief) {
      return;
    }
    const shot = project.shots.find((item) => item.id === shotId);
    if (!shot || !shot.imagePrompt) {
      return;
    }

    setGeneratingImages((prev) => ({ ...prev, [`${shotId}_first`]: true }));
    try {
      const shotIndex = project.shots.findIndex((item) => item.id === shotId);
      const previousShot = shotIndex > 0 ? project.shots[shotIndex - 1] : undefined;
      const previousBackgroundImage = shot.usePreviousShotBackground
        ? previousShot?.lastFrameImageUrl || previousShot?.imageUrl
        : undefined;
      const projectReferenceAssets = project.assets.filter((asset) => shot.referenceAssets?.includes(asset.id));
      const groupReferenceAssets = resolveShotGroupReferenceAssets(
        shot,
        currentGroupImageAssets,
        [previousBackgroundImage || '', shot.imageUrl || '', shot.lastFrameImageUrl || ''],
      );
      const referenceAssets = dedupeAssets([...projectReferenceAssets, ...groupReferenceAssets]);
      const imageSourceId = getOperationSourceId(`shot-image-${shotId}`, 'image');
      const continuityInstruction = previousBackgroundImage
        ? '\n\nBackground continuity: keep the environment layout, lighting direction, depth hierarchy, and major background landmarks aligned with the provided reference image. Only change the foreground action required by this shot.'
        : '';
      const imageUrl = await generateStoryboardImage(
        withStyledPrompt(getShotImagePromptBySource(apiSettings, shot, imageSourceId, 'first')) + continuityInstruction,
        project.brief.aspectRatio,
        getOperationModelName(`shot-image-${shotId}`, 'image'),
        referenceAssets,
        useMockMode,
        previousBackgroundImage,
        imageSourceId,
      );
      const persistedImage = await persistGeneratedMediaUrl(imageUrl, {
        kind: 'image',
        assetId: `${project.id}:shot:${shotId}:first`,
        title: `镜头 ${shot.shotNumber} 首帧`,
      });

      setProject((prev) => ({
        ...prev,
        shots: prev.shots.map((item) => item.id === shotId ? { ...item, imageUrl: persistedImage.url } : item),
      }));
    } catch (error: any) {
      console.error('Failed to generate first frame:', error);
      if (isPermissionError(error)) {
        setHasKey(false);
      } else {
        alert('生成首帧失败。');
      }
    } finally {
      setGeneratingImages((prev) => ({ ...prev, [`${shotId}_first`]: false }));
    }
  };

  const handleGenerateLastFrame = async (shotId: string) => {
    if (!project.brief) {
      return;
    }
    const shot = project.shots.find((item) => item.id === shotId);
    if (!shot || !shot.imagePrompt || !hasLastFramePrompt(shot)) {
      return;
    }

    setGeneratingImages((prev) => ({ ...prev, [`${shotId}_last`]: true }));
    try {
      const projectReferenceAssets = project.assets.filter((asset) => shot.referenceAssets?.includes(asset.id));
      const groupReferenceAssets = resolveShotGroupReferenceAssets(
        shot,
        currentGroupImageAssets,
        [shot.imageUrl || '', shot.lastFrameImageUrl || ''],
      );
      const referenceAssets = dedupeAssets([...projectReferenceAssets, ...groupReferenceAssets]);
      const imageSourceId = getOperationSourceId(`shot-image-${shotId}`, 'image');
      const lastFrameImageUrl = await generateStoryboardImage(
        withStyledPrompt(getShotImagePromptBySource(apiSettings, shot, imageSourceId, 'last')),
        project.brief.aspectRatio,
        getOperationModelName(`shot-image-${shotId}`, 'image'),
        referenceAssets,
        useMockMode,
        shot.imageUrl,
        imageSourceId,
      );
      const persistedImage = await persistGeneratedMediaUrl(lastFrameImageUrl, {
        kind: 'image',
        assetId: `${project.id}:shot:${shotId}:last`,
        title: `镜头 ${shot.shotNumber} 尾帧`,
      });

      setProject((prev) => ({
        ...prev,
        shots: prev.shots.map((item) => item.id === shotId ? { ...item, lastFrameImageUrl: persistedImage.url } : item),
      }));
    } catch (error: any) {
      console.error('Failed to generate last frame:', error);
      if (isPermissionError(error)) {
        setHasKey(false);
      } else {
        alert('生成尾帧失败。');
      }
    } finally {
      setGeneratingImages((prev) => ({ ...prev, [`${shotId}_last`]: false }));
    }
  };

  const handleUploadFirstFrame = async (event: ChangeEvent<HTMLInputElement>, shotId: string) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const shot = project.shots.find((item) => item.id === shotId);
    try {
      const base64 = await readFileAsDataUrl(file);
      const persistedImage = await persistGeneratedMediaUrl(base64, {
        kind: 'image',
        assetId: `${project.id}:shot:${shotId}:first`,
        title: `镜头 ${shot?.shotNumber || ''} 首帧`.trim(),
        fileNameHint: file.name,
      });
      setProject((prev) => ({
        ...prev,
        shots: prev.shots.map((item) => item.id === shotId ? { ...item, imageUrl: persistedImage.url } : item),
      }));
    } catch (error: any) {
      console.error('Failed to upload first frame:', error);
      alert(error?.message || '上传首帧失败。');
    } finally {
      event.target.value = '';
    }
  };

  const handleUploadLastFrame = async (event: ChangeEvent<HTMLInputElement>, shotId: string) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const shot = project.shots.find((item) => item.id === shotId);
    try {
      const base64 = await readFileAsDataUrl(file);
      const persistedImage = await persistGeneratedMediaUrl(base64, {
        kind: 'image',
        assetId: `${project.id}:shot:${shotId}:last`,
        title: `镜头 ${shot?.shotNumber || ''} 尾帧`.trim(),
        fileNameHint: file.name,
      });
      setProject((prev) => ({
        ...prev,
        shots: prev.shots.map((item) => item.id === shotId ? { ...item, lastFrameImageUrl: persistedImage.url } : item),
      }));
    } catch (error: any) {
      console.error('Failed to upload last frame:', error);
      alert(error?.message || '上传尾帧失败。');
    } finally {
      event.target.value = '';
    }
  };

  const handleReorderShots = (sourceShotId: string, targetShotId: string) => {
    if (!sourceShotId || !targetShotId || sourceShotId === targetShotId) {
      return;
    }

    setProject((prev) => {
      const sourceIndex = prev.shots.findIndex((shot) => shot.id === sourceShotId);
      const targetIndex = prev.shots.findIndex((shot) => shot.id === targetShotId);
      if (sourceIndex === -1 || targetIndex === -1) {
        return prev;
      }

      const reorderedShots = [...prev.shots];
      const [movedShot] = reorderedShots.splice(sourceIndex, 1);
      reorderedShots.splice(targetIndex, 0, movedShot);

      return {
        ...prev,
        shots: resequenceShots(reorderedShots),
      };
    });
  };

  const handleModifyFrameFromCurrentImage = async (shotId: string, frameType: 'first' | 'last') => {
    if (!project.brief) {
      return;
    }

    const shot = project.shots.find((item) => item.id === shotId);
    if (!shot) {
      return;
    }

    const currentImage = frameType === 'first' ? shot.imageUrl : shot.lastFrameImageUrl;
    if (!currentImage) {
      alert('请先生成或上传当前图片，再进行修改。');
      return;
    }

    const promptKey = getFrameEditPromptKey(shotId, frameType);
    const editPrompt = (frameEditPrompts[promptKey] || '').trim();
    if (!editPrompt) {
      alert('请先输入修改提示词。');
      return;
    }

    setGeneratingImages((prev) => ({ ...prev, [`${shotId}_${frameType}_edit`]: true }));
    try {
      const projectReferenceAssets = project.assets.filter((asset) => shot.referenceAssets?.includes(asset.id));
      const groupReferenceAssets = resolveShotGroupReferenceAssets(
        shot,
        currentGroupImageAssets,
        [shot.imageUrl || '', shot.lastFrameImageUrl || ''],
      );
      const referenceAssets = dedupeAssets([...projectReferenceAssets, ...groupReferenceAssets]);
      const imageSourceId = getOperationSourceId(`shot-image-${shotId}`, 'image');
      const modifiedImageUrl = await generateStoryboardImage(
        withStyledPrompt(editPrompt),
        project.brief.aspectRatio,
        getOperationModelName(`shot-image-${shotId}`, 'image'),
        referenceAssets,
        useMockMode,
        currentImage,
        imageSourceId,
      );
      const persistedImage = await persistGeneratedMediaUrl(modifiedImageUrl, {
        kind: 'image',
        assetId: frameType === 'first'
          ? `${project.id}:shot:${shotId}:first`
          : `${project.id}:shot:${shotId}:last`,
        title: frameType === 'first'
          ? `镜头 ${shot.shotNumber} 首帧`
          : `镜头 ${shot.shotNumber} 尾帧`,
      });

      setProject((prev) => ({
        ...prev,
        shots: prev.shots.map((item) => item.id === shotId
          ? {
            ...item,
            ...(frameType === 'first'
              ? { imageUrl: persistedImage.url }
              : { lastFrameImageUrl: persistedImage.url }),
          }
          : item),
      }));
    } catch (error: any) {
      console.error(`Failed to modify ${frameType} frame:`, error);
      alert(error?.message || `修改${frameType === 'first' ? '首帧' : '尾帧'}失败。`);
    } finally {
      setGeneratingImages((prev) => ({ ...prev, [`${shotId}_${frameType}_edit`]: false }));
    }
  };

  const handleGenerateVideo = async (shotId: string) => {
    const targetProjectId = project.id;
    if (!project.brief) {
      return;
    }
    const operationKey = getShotVideoOperationKey(shotId);
    const shot = project.shots.find((item) => item.id === shotId);
    if (!shot) {
      return;
    }

    const referenceAssets = project.assets.filter((asset) => shot.referenceAssets?.includes(asset.id));
    const executor = apiSettings.seedance.defaultExecutor;

    setOperationCancelPending(operationKey, false);
    setOperationRecord(operationKey);
    setProject((prev) => ({
      ...prev,
      shots: prev.shots.map((item) => item.id === shotId ? { ...item, videoStatus: 'generating', videoError: '', videoOperation: undefined } : item),
    }));

    try {
      const patchedVideoPrompt = buildDualModeVideoPrompts(shot, referenceAssets, withStyledPrompt);
      const promptLanguage = getPromptLanguageBySourceId(getOperationSourceId(operationKey, 'video'));
      const selectedExecutionPrompt = promptLanguage === 'zh'
        ? (patchedVideoPrompt.imageToVideoZh || patchedVideoPrompt.textToVideoZh || patchedVideoPrompt.imageToVideo || patchedVideoPrompt.textToVideo || shot.action)
        : (patchedVideoPrompt.imageToVideo || patchedVideoPrompt.textToVideo || patchedVideoPrompt.imageToVideoZh || patchedVideoPrompt.textToVideoZh || shot.action);

      const styledShot = withStyledShot({
        ...shot,
        videoPrompt: {
          ...patchedVideoPrompt,
          textToVideo: selectedExecutionPrompt,
          imageToVideo: selectedExecutionPrompt,
        },
      });

      if (useMockMode) {
        const mockOp = { provider: executor, taskId: `mock-shot-${shotId}-${Date.now()}`, submitId: executor === 'cli' ? `mock-shot-${shotId}-${Date.now()}` : '' };
        setOperationRecord(operationKey, mockOp);
        updateProjectRecord(targetProjectId, (current) => ({
          ...current,
          shots: current.shots.map((item) => item.id === shotId ? { ...item, videoOperation: mockOp } : item),
        }));
        return;
      }

      const draft = await buildShotSeedanceDraft(styledShot, project.brief.aspectRatio, referenceAssets);
      await refreshSeedanceHealth();

      let operation: any;
      if (executor === 'ark') {
        const arkModelMeta = getSeedanceArkModelMeta();
        const result = await createSeedanceTask(draft);
        operation = { provider: 'ark', taskId: result.id, submitId: '' };
        appendSeedanceLog({
          operation: 'seedanceSubmit',
          status: 'success',
          executor: 'ark',
          sourceId: arkModelMeta.sourceId,
          modelName: arkModelMeta.modelName,
          request: buildSeedanceSubmitLogRequest(draft, 'ark'),
          response: result,
        });
      } else {
        const imageSources = draft.assets
          .filter((asset) => asset.kind === 'image')
          .map((asset) => asset.urlOrData)
          .filter(Boolean);
        const result = await submitSeedanceTask({
          projectId: targetProjectId,
          prompt: draft.prompt.rawPrompt,
          imageSources,
          options: {
            modelVersion: apiSettings.seedance.cliModelVersion,
            ratio: draft.options.ratio === 'adaptive' || draft.options.ratio === '3:4' || draft.options.ratio === '21:9'
              ? project.brief.aspectRatio
              : draft.options.ratio,
            duration: draft.options.duration || Math.max(1, Math.round(shot.duration || 5)),
            videoResolution: draft.options.resolution === '480p' ? '480p' : '720p',
          },
          baseUrl: apiSettings.seedance.bridgeUrl,
        });
        if (mapRemoteSeedanceStatus(result.genStatus) === 'failed') {
          const failure = buildSeedanceCliFailure(result.raw, '启动视频生成失败。');
          const submitError = new Error(failure.detail);
          (submitError as any).userMessage = failure.userMessage;
          throw submitError;
        }
        operation = { provider: 'cli', taskId: result.submitId, submitId: result.submitId };
        appendSeedanceLog({
          operation: 'seedanceSubmit',
          status: 'success',
          executor: 'cli',
          request: {
            ...buildSeedanceSubmitLogRequest(draft, 'cli'),
            imageCount: imageSources.length,
          },
          response: result,
        });
      }

      setOperationRecord(operationKey, operation);

      if (hasPendingOperationCancel(operationKey)) {
        try {
          if (operation.provider === 'ark') {
            await deleteSeedanceTask(operation.taskId);
          }
          setOperationRecord(operationKey);
          updateProjectRecord(targetProjectId, (current) => ({
            ...current,
            shots: current.shots.map((item) => item.id === shotId
              ? { ...item, videoStatus: 'cancelled', videoOperation: undefined, videoError: '' }
              : item),
          }));
        } catch (error: any) {
          console.error('Failed to cancel video generation after operation was created:', error);
          updateProjectRecord(targetProjectId, (current) => ({
            ...current,
            shots: current.shots.map((item) => item.id === shotId ? { ...item, videoOperation: operation } : item),
          }));
          alert(error?.message || '取消视频生成失败。');
        } finally {
          setOperationCancelPending(operationKey, false);
        }
        return;
      }

      updateProjectRecord(targetProjectId, (current) => ({
        ...current,
        shots: current.shots.map((item) => item.id === shotId ? { ...item, videoOperation: operation } : item),
      }));
    } catch (error: any) {
      setOperationRecord(operationKey);
      setOperationCancelPending(operationKey, false);
      console.error('Failed to start video generation:', error);
      appendSeedanceLog({
        operation: 'seedanceSubmit',
        status: 'error',
        executor,
        request: { shotId, executor },
        error: error?.message || '启动视频生成失败。',
      });
      updateProjectRecord(targetProjectId, (current) => ({
        ...current,
        shots: current.shots.map((item) => item.id === shotId ? { ...item, videoStatus: 'failed', videoError: error.message || '启动生成失败。' } : item),
      }));
      if (isPermissionError(error)) {
        setHasKey(false);
      } else {
        alert(error?.userMessage || error?.message || '启动视频生成失败。');
      }
    }
  };

  const handleCancelVideo = async (shotId: string) => {
    const targetProjectId = project.id;
    const operationKey = getShotVideoOperationKey(shotId);
    const shot = project.shots.find((item) => item.id === shotId);
    if (shot?.videoStatus !== 'generating') {
      return;
    }

    setOperationCancelPending(operationKey, true);
    const operation = shot.videoOperation || getOperationRecord(operationKey) || findLoggedShotVideoOperation(shotId);
    if (!operation) {
      console.warn('No shot video operation found for cancellation', { shotId, operationKey });
      setOperationCancelPending(operationKey, false);
      alert('当前还没有拿到可取消的任务 ID，请稍后再试。');
      return;
    }
    setOperationRecord(operationKey, operation);

    try {
      if (operation.provider === 'cli') {
        throw new Error('当前本地 CLI 执行器暂不支持取消已提交任务。');
      }
      const taskId = operation.taskId || '';
      if (!taskId) {
        throw new Error('缺少任务 ID，无法取消。');
      }
      await deleteSeedanceTask(taskId);
      appendSeedanceLog({
        operation: 'seedanceCancel',
        status: 'success',
        executor: operation.provider || 'ark',
        request: { taskId, executor: operation.provider || 'ark' },
      });
      setOperationRecord(operationKey);
      updateProjectRecord(targetProjectId, (current) => ({
        ...current,
        shots: current.shots.map((item) => item.id === shotId
          ? {
            ...item,
            videoStatus: 'cancelled',
            videoOperation: undefined,
            videoError: '',
          } : item),
      }));
    } catch (error: any) {
      console.error('Failed to cancel video generation:', error);
      appendSeedanceLog({
        operation: 'seedanceCancel',
        status: 'error',
        executor: operation.provider || 'ark',
        request: { taskId: operation.taskId, executor: operation.provider || 'ark' },
        error: error?.message || '取消视频生成失败。',
      });
      alert(error?.message || '取消视频生成失败。');
    } finally {
      setOperationCancelPending(operationKey, false);
    }
  };

  const handleRegenerateVideoPrompts = (shotId: string) => {
    const shot = project.shots.find((item) => item.id === shotId);
    if (!shot) {
      return;
    }

    const key = `${shotId}_video_prompt`;
    const referenceAssets = project.assets.filter((asset) => shot.referenceAssets?.includes(asset.id));
    setGeneratingPrompts((prev) => ({ ...prev, [key]: true }));
    const patchedVideoPrompt = buildDualModeVideoPrompts(shot, referenceAssets, withStyledPrompt);
    setProject((prev) => ({
      ...prev,
      shots: prev.shots.map((item) => item.id === shotId
        ? {
          ...item,
          videoPrompt: patchedVideoPrompt,
        }
        : item),
    }));
    setGeneratingPrompts((prev) => ({ ...prev, [key]: false }));
  };

  const handleGenerateTransitionPrompt = async (currentShotId: string, nextShotId: string) => {
    if (!project.brief) {
      return;
    }
    const currentShot = project.shots.find((item) => item.id === currentShotId);
    const nextShot = project.shots.find((item) => item.id === nextShotId);

    if (!currentShot || !nextShot) {
      return;
    }

    setGeneratingPrompts((prev) => ({ ...prev, [`${currentShotId}_transition`]: true }));
    try {
      const { prompt, promptZh } = await generateTransitionPrompt(
        currentShot,
        nextShot,
        withStyledBrief(project.brief),
        useMockMode,
        getOperationModelName(`transition-prompt-${currentShotId}`, 'text'),
        getOperationSourceId(`transition-prompt-${currentShotId}`, 'text'),
      );
      setProject((prev) => ({
        ...prev,
        shots: prev.shots.map((item) => item.id === currentShotId ? { ...item, transitionVideoPrompt: prompt, transitionVideoPromptZh: promptZh } : item),
      }));
    } catch (error) {
      console.error('Failed to generate transition prompt:', error);
      alert('生成转场提示词失败。');
    } finally {
      setGeneratingPrompts((prev) => ({ ...prev, [`${currentShotId}_transition`]: false }));
    }
  };

  const handleGenerateTransitionVideo = async (currentShotId: string, nextShotId: string) => {
    const targetProjectId = project.id;
    if (!project.brief) {
      return;
    }
    const operationKey = getTransitionVideoOperationKey(currentShotId);
    const currentShot = project.shots.find((item) => item.id === currentShotId);
    const nextShot = project.shots.find((item) => item.id === nextShotId);
    const executor = apiSettings.seedance.defaultExecutor;

    if (!currentShot || !nextShot || !currentShot.lastFrameImageUrl || !nextShot.imageUrl) {
      alert('需要当前镜头的尾帧和下一个镜头的首帧才能生成转场视频。');
      return;
    }

    setOperationCancelPending(operationKey, false);
    setOperationRecord(operationKey);
    setProject((prev) => ({
      ...prev,
      shots: prev.shots.map((item) => item.id === currentShotId ? { ...item, transitionVideoStatus: 'generating', transitionVideoError: '', transitionVideoOperation: undefined } : item),
    }));

    try {
      const transitionVideoSourceId = getOperationSourceId(operationKey, 'video');
      const prompt = withStyledPrompt(getTransitionPromptBySource(apiSettings, currentShot, transitionVideoSourceId));
      const transitionConfig = getTransitionVideoConfig(currentShot);

      if (useMockMode) {
        const mockOp = { provider: executor, taskId: `mock-transition-${currentShotId}-${Date.now()}`, submitId: executor === 'cli' ? `mock-transition-${currentShotId}-${Date.now()}` : '' };
        setOperationRecord(operationKey, mockOp);
        updateProjectRecord(targetProjectId, (current) => ({
          ...current,
          shots: current.shots.map((item) => item.id === currentShotId ? { ...item, transitionVideoOperation: mockOp } : item),
        }));
        return;
      }

      const draft = await buildTransitionSeedanceDraft(
        currentShot.lastFrameImageUrl,
        nextShot.imageUrl,
        transitionConfig.aspectRatio,
        prompt,
        transitionConfig.duration,
      );
      await refreshSeedanceHealth();

      let operation: any;
      if (executor === 'ark') {
        const arkModelMeta = getSeedanceArkModelMeta();
        const result = await createSeedanceTask(draft);
        operation = { provider: 'ark', taskId: result.id, submitId: '' };
        appendSeedanceLog({
          operation: 'seedanceSubmit',
          status: 'success',
          executor: 'ark',
          sourceId: arkModelMeta.sourceId,
          modelName: arkModelMeta.modelName,
          request: buildSeedanceSubmitLogRequest(draft, 'ark'),
          response: result,
        });
      } else {
        const imageSources = draft.assets
          .filter((asset) => asset.kind === 'image')
          .map((asset) => asset.urlOrData)
          .filter(Boolean);
        const result = await submitSeedanceTask({
          projectId: targetProjectId,
          prompt: draft.prompt.rawPrompt,
          imageSources,
          options: {
            modelVersion: apiSettings.seedance.cliModelVersion,
            ratio: draft.options.ratio === 'adaptive' || draft.options.ratio === '3:4' || draft.options.ratio === '21:9'
              ? transitionConfig.aspectRatio
              : draft.options.ratio,
            duration: draft.options.duration || Math.max(1, Math.round(transitionConfig.duration || 3)),
            videoResolution: draft.options.resolution === '480p' ? '480p' : '720p',
          },
          baseUrl: apiSettings.seedance.bridgeUrl,
        });
        if (mapRemoteSeedanceStatus(result.genStatus) === 'failed') {
          const failure = buildSeedanceCliFailure(result.raw, '启动转场视频生成失败。');
          const submitError = new Error(failure.detail);
          (submitError as any).userMessage = failure.userMessage;
          throw submitError;
        }
        operation = { provider: 'cli', taskId: result.submitId, submitId: result.submitId };
        appendSeedanceLog({
          operation: 'seedanceSubmit',
          status: 'success',
          executor: 'cli',
          request: {
            ...buildSeedanceSubmitLogRequest(draft, 'cli'),
            imageCount: imageSources.length,
          },
          response: result,
        });
      }

      setOperationRecord(operationKey, operation);

      if (hasPendingOperationCancel(operationKey)) {
        try {
          if (operation.provider === 'ark') {
            await deleteSeedanceTask(operation.taskId);
          }
          setOperationRecord(operationKey);
          updateProjectRecord(targetProjectId, (current) => ({
            ...current,
            shots: current.shots.map((item) => item.id === currentShotId
              ? {
                ...item,
                transitionVideoStatus: 'cancelled',
                transitionVideoOperation: undefined,
                transitionVideoError: '',
              } : item),
          }));
        } catch (error: any) {
          console.error('Failed to cancel transition video generation after operation was created:', error);
          updateProjectRecord(targetProjectId, (current) => ({
            ...current,
            shots: current.shots.map((item) => item.id === currentShotId ? { ...item, transitionVideoOperation: operation } : item),
          }));
          alert(error?.message || '取消转场视频生成失败。');
        } finally {
          setOperationCancelPending(operationKey, false);
        }
        return;
      }

      updateProjectRecord(targetProjectId, (current) => ({
        ...current,
        shots: current.shots.map((item) => item.id === currentShotId ? { ...item, transitionVideoOperation: operation } : item),
      }));
    } catch (error: any) {
      setOperationRecord(operationKey);
      setOperationCancelPending(operationKey, false);
      console.error('Failed to start transition video generation:', error);
      appendSeedanceLog({
        operation: 'seedanceSubmit',
        status: 'error',
        executor,
        request: { currentShotId, nextShotId, executor },
        error: error?.message || '启动转场视频生成失败。',
      });
      updateProjectRecord(targetProjectId, (current) => ({
        ...current,
        shots: current.shots.map((item) => item.id === currentShotId ? { ...item, transitionVideoStatus: 'failed', transitionVideoError: error.message || '启动生成失败。' } : item),
      }));
      if (isPermissionError(error)) {
        setHasKey(false);
      } else {
        alert(error?.userMessage || error?.message || '启动转场视频生成失败。');
      }
    }
  };

  const handleCancelTransitionVideo = async (currentShotId: string) => {
    const targetProjectId = project.id;
    const operationKey = getTransitionVideoOperationKey(currentShotId);
    const currentShot = project.shots.find((item) => item.id === currentShotId);
    if (currentShot?.transitionVideoStatus !== 'generating') {
      return;
    }

    setOperationCancelPending(operationKey, true);
    const currentIndex = project.shots.findIndex((item) => item.id === currentShotId);
    const nextShot = currentIndex >= 0 ? project.shots[currentIndex + 1] : undefined;
    const operation = currentShot.transitionVideoOperation
      || getOperationRecord(operationKey)
      || findLoggedTransitionVideoOperation(currentShot.lastFrameImageUrl, nextShot?.imageUrl);
    if (!operation) {
      console.warn('No transition video operation found for cancellation', { currentShotId, operationKey });
      setOperationCancelPending(operationKey, false);
      alert('当前还没有拿到可取消的任务 ID，请稍后再试。');
      return;
    }
    setOperationRecord(operationKey, operation);

    try {
      if (operation.provider === 'cli') {
        throw new Error('当前本地 CLI 执行器暂不支持取消已提交任务。');
      }
      const taskId = operation.taskId || '';
      if (!taskId) {
        throw new Error('缺少任务 ID，无法取消。');
      }
      await deleteSeedanceTask(taskId);
      appendSeedanceLog({
        operation: 'seedanceCancel',
        status: 'success',
        executor: operation.provider || 'ark',
        request: { taskId, executor: operation.provider || 'ark' },
      });
      setOperationRecord(operationKey);
      updateProjectRecord(targetProjectId, (current) => ({
        ...current,
        shots: current.shots.map((item) => item.id === currentShotId
          ? {
            ...item,
            transitionVideoStatus: 'cancelled',
            transitionVideoOperation: undefined,
            transitionVideoError: '',
          } : item),
      }));
    } catch (error: any) {
      console.error('Failed to cancel transition video generation:', error);
      appendSeedanceLog({
        operation: 'seedanceCancel',
        status: 'error',
        executor: operation.provider || 'ark',
        request: { taskId: operation.taskId, executor: operation.provider || 'ark' },
        error: error?.message || '取消转场视频生成失败。',
      });
      alert(error?.message || '取消转场视频生成失败。');
    } finally {
      setOperationCancelPending(operationKey, false);
    }
  };

  const handleAddAsset = () => {
    const type = newAsset.type as Asset['type'];
    if (!newAsset.name?.trim()) {
      return;
    }
    if (type !== 'character' && type !== 'scene' && !newAsset.description?.trim()) {
      return;
    }

    const asset: Asset = {
      id: crypto.randomUUID(),
      type,
      name: newAsset.name.trim(),
      description: (newAsset.description || '').trim(),
      characterPrompt: type === 'character'
        ? {
          ...(newAsset.characterPrompt || {}),
          characterType: normalizeCharacterType(newAsset.characterPrompt?.characterType),
        }
        : undefined,
      scenePrompt: type === 'scene' ? { ...(newAsset.scenePrompt || {}) } : undefined,
      productPrompt: type === 'product' ? { ...(newAsset.productPrompt || {}) } : undefined,
    };
    setProject((prev) => ({ ...prev, assets: [...prev.assets, asset] }));
    setIsAddingAsset(false);
    setNewAsset(createEmptyAssetDraft());
  };

  const handleGenerateAssetPrompt = async (asset: Asset) => {
    const assetBrief = getAssetGenerationBrief();
    if (!assetBrief) {
      return;
    }
    setGeneratingAssetPrompts((prev) => ({ ...prev, [asset.id]: true }));
    try {
      const prompt = await generateAssetPrompt(
        asset,
        assetBrief,
        useMockMode,
        getOperationModelName(`asset-prompt-${asset.id}`, 'text'),
        getOperationSourceId(`asset-prompt-${asset.id}`, 'text'),
      );
      setProject((prev) => ({
        ...prev,
        assets: prev.assets.map((item) => item.id === asset.id ? { ...item, imagePrompt: prompt } : item),
      }));
    } catch (error: any) {
      console.error('Failed to generate asset prompt:', error);
      alert(`Failed to generate asset prompt:\n${error.message || JSON.stringify(error)}`);
    } finally {
      setGeneratingAssetPrompts((prev) => ({ ...prev, [asset.id]: false }));
    }
  };

  const handleGenerateAssetImage = async (asset: Asset) => {
    const assetBrief = getAssetGenerationBrief();
    if (!assetBrief) {
      return;
    }
    setGeneratingAssetImages((prev) => ({ ...prev, [asset.id]: true }));
    try {
      const styledAsset = asset.imagePrompt
        ? { ...asset, imagePrompt: isCreativeProject ? withStyledPrompt(asset.imagePrompt) : asset.imagePrompt }
        : asset;
      const imageUrl = await generateAssetImage(
        styledAsset,
        assetBrief,
        getOperationModelName(`asset-image-${asset.id}`, 'image'),
        useMockMode,
        getOperationModelName(`asset-prompt-${asset.id}`, 'text'),
        getOperationSourceId(`asset-image-${asset.id}`, 'image'),
        getOperationSourceId(`asset-prompt-${asset.id}`, 'text'),
      );
      const persistedImage = await persistGeneratedMediaUrl(imageUrl, {
        kind: 'image',
        assetId: `${project.id}:asset:${asset.id}`,
        title: asset.name || '一致性资产',
      });
      setProject((prev) => ({
        ...prev,
        assets: prev.assets.map((item) => item.id === asset.id ? { ...item, imageUrl: persistedImage.url } : item),
      }));
    } catch (error: any) {
      console.error('Failed to generate asset image:', error);
      if (isPermissionError(error)) {
        setHasKey(false);
      } else {
        alert('生成资产图片失败。');
      }
    } finally {
      setGeneratingAssetImages((prev) => ({ ...prev, [asset.id]: false }));
    }
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>, assetId: string) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const asset = project.assets.find((item) => item.id === assetId);
    try {
      const base64 = await readFileAsDataUrl(file);
      const persistedImage = await persistGeneratedMediaUrl(base64, {
        kind: 'image',
        assetId: `${project.id}:asset:${assetId}`,
        title: asset?.name || '一致性资产',
        fileNameHint: file.name,
      });
      setProject((prev) => ({
        ...prev,
        assets: prev.assets.map((item) => item.id === assetId ? { ...item, imageUrl: persistedImage.url } : item),
      }));
    } catch (error: any) {
      console.error('Failed to upload asset image:', error);
      alert(error?.message || '上传资产图片失败。');
    } finally {
      event.target.value = '';
    }
  };

  return {
    toggleShotGroupReferenceImage,
    handleGenerateShots,
    handleGeneratePrompts,
    handleTranslatePrompts,
    handleGenerateFirstFrame,
    handleGenerateLastFrame,
    handleUploadFirstFrame,
    handleUploadLastFrame,
    handleReorderShots,
    handleModifyFrameFromCurrentImage,
    handleGenerateVideo,
    handleCancelVideo,
    handleRegenerateVideoPrompts,
    handleGenerateTransitionPrompt,
    handleGenerateTransitionVideo,
    handleCancelTransitionVideo,
    handleAddAsset,
    handleGenerateAssetPrompt,
    handleGenerateAssetImage,
    handleFileUpload,
  };
}
