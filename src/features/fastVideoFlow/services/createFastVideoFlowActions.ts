import type { ChangeEvent, Dispatch, MutableRefObject, SetStateAction } from 'react';

import {
  generateFastVideoPlanWithModel,
  generateFastVideoPromptWithModel,
  generateStoryboardImage,
} from '../../../services/modelService';
import type { ModelInvocationLogEntry } from '../../../services/modelInvocationLog';
import type { ProjectGroupImageAsset, ProjectGroupMediaAsset } from '../../../services/projectGroups.ts';
import type { ApiSettings, Asset, ModelSourceId, Project } from '../../../types.ts';
import type {
  FastReferenceAudio,
  FastDirectorCamera,
  FastDirectorState,
  FastReferenceImage,
  FastReferenceVideo,
  FastSceneDraft,
  FastVideoInput,
  FastVideoPromptDraft,
} from '../types/fastTypes.ts';
import type { SeedanceCliQueueEnqueueInput } from '../types/queueTypes.ts';
import {
  createDefaultFastSeedanceDraft,
  createEmptySeedanceTask,
  normalizeFastVideoProject,
  resolveFastVideoTaskProvider,
  syncFastFlowSeedanceDraft,
} from './fastFlowMappers.ts';
import { syncHumanFaceMosaicPrompt } from './fastScenePrompt.ts';
import { createPromptBasedDirectorPlacements, inferPromptCharacterLayout, normalizeFastDirectorState } from './fastDirectorState.ts';
import { fetchSeedanceTask, submitSeedanceTask } from './seedanceBridgeClient.ts';
import { fetchHappyHorseTask, submitHappyHorseTask } from './aliyunHappyHorseService.ts';
import { deleteOrCancelVideoTask, queryVideoTask, startFastVideoGeneration } from '../../../services/minimaxVideoService.ts';
import { createSeedanceTask, deleteSeedanceTask, getSeedanceTask } from '../../seedance/services/seedanceApiService.ts';
import { isTosConfigComplete, uploadFileToTos } from '../../../services/tosUploadService.ts';
import { validateSeedanceDraft } from '../../seedance/services/seedanceDraft.ts';
import type { SeedanceApiModelKey, SeedanceBaseTemplateId, SeedanceDraft, SeedanceExecutorId } from '../../seedance/types.ts';
import { SEEDANCE_TEMPLATE_REGISTRY } from '../../seedance/config/seedanceTemplateRegistry.ts';
import { getSeedanceCapabilities } from '../../seedance/capabilities.ts';
import { FAST_VIDEO_PROMPT_CONFIG } from '../../../config/fastVideoPrompts.ts';
import {
  buildSeedanceCliFailure,
  buildFastProjectName,
  getFastVideoTaskId,
  inferFastFlowTemplateId,
  isSeedanceAssetServiceUnavailable,
  isSeedanceConcurrencyLimitError,
  isSeedanceRealPersonRejection,
  mapRemoteSeedanceStatus,
  resolveSeedanceFinishedAt,
} from '../utils/fastVideoTask.ts';

type PersistedMedia = {
  url: string;
  storageKey: string;
  relativePath: string;
  absolutePath: string;
  savedToLibrary: boolean;
};

type SeedanceErrorModalConfig = {
  eyebrow?: string;
  title: string;
  message: string;
  detail?: string;
  action?: 'redo-images' | 'edit-references';
};

type SeedanceLogEntry = {
  operation: string;
  status: 'success' | 'error';
  request: unknown;
  response?: unknown;
  error?: string;
  executor?: 'ark' | 'cli' | 'aliyun' | 'minimax';
  sourceId?: ModelInvocationLogEntry['sourceId'];
  modelName?: string;
};

type FastVideoFlowActionDeps = {
  apiSettings: ApiSettings;
  project: Project;
  useMockMode: boolean;
  isRefreshingFastVideoTaskRef: MutableRefObject<boolean>;
  setProject: Dispatch<SetStateAction<Project>>;
  setFastFlow: (updater: (current: Project['fastFlow']) => Project['fastFlow']) => void;
  updateProjectRecord: (projectId: string, updater: (current: Project) => Project) => void;
  updateFastFlowByProjectId: (projectId: string, updater: (current: Project['fastFlow']) => Project['fastFlow']) => void;
  setView: (view: 'fastStoryboard' | 'fastDirector' | 'fastVideo') => void;
  setHasKey: Dispatch<SetStateAction<boolean>>;
  setApiSettings: Dispatch<SetStateAction<ApiSettings>>;
  setIsGeneratingFastPlan: Dispatch<SetStateAction<boolean>>;
  setGeneratingFastSceneImages: Dispatch<SetStateAction<Record<string, boolean>>>;
  setIsRegeneratingFastVideoPrompt: Dispatch<SetStateAction<boolean>>;
  setIsRefreshingFastVideoTask: Dispatch<SetStateAction<boolean>>;
  setIsCancellingFastVideoTask: Dispatch<SetStateAction<boolean>>;
  setIsSubmittingFastVideo: Dispatch<SetStateAction<boolean>>;
  readFileAsDataUrl: (file: File) => Promise<string>;
  persistGeneratedMediaUrl: (
    sourceUrl: string,
    options: {
      kind: 'image' | 'video';
      assetId: string;
      title: string;
      fileNameHint?: string;
    },
  ) => Promise<PersistedMedia>;
  openSeedanceErrorModal: (config: SeedanceErrorModalConfig) => void;
  refreshSeedanceHealth: () => Promise<void>;
  getTextModelName: () => string;
  getTextModelSourceId: () => ModelSourceId;
  getOperationSourceId: (operationKey: string, category: 'text' | 'image' | 'video') => ModelSourceId;
  getOperationModelName: (operationKey: string, category: 'text' | 'image' | 'video') => string;
  getSeedanceArkModelMeta: (modelKey?: SeedanceApiModelKey) => {
    sourceId: ModelInvocationLogEntry['sourceId'];
    modelName: string;
  };
  buildSeedanceSubmitLogRequest: (draft: SeedanceDraft, executor: SeedanceExecutorId, apiModelKey?: SeedanceApiModelKey) => Record<string, unknown>;
  appendSeedanceLog: (entry: SeedanceLogEntry) => void;
  onCliConcurrencyLimit?: (input: SeedanceCliQueueEnqueueInput) => void;
};

function inferFastReferenceImageTypeFromMaterial(material: ProjectGroupImageAsset): FastReferenceImage['referenceType'] {
  const sourceText = `${material.sourceType} ${material.sourceLabel}`.toLowerCase();

  if (sourceText.includes('character')) {
    return 'person';
  }
  if (sourceText.includes('product')) {
    return 'product';
  }
  if (sourceText.includes('style')) {
    return 'style';
  }
  if (sourceText.includes('scene') || sourceText.includes('shot') || sourceText.includes('director') || sourceText.includes('分镜') || sourceText.includes('机位预演') || sourceText.includes('首帧') || sourceText.includes('尾帧')) {
    return 'scene';
  }

  return 'other';
}

function createFastReferenceImageFromMaterial(material: ProjectGroupImageAsset): FastReferenceImage {
  return {
    id: crypto.randomUUID?.() || `fast-reference-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    imageUrl: material.imageUrl,
    assetId: '',
    referenceType: inferFastReferenceImageTypeFromMaterial(material),
    description: material.title || material.sourceLabel || '历史素材',
    selectedForVideo: true,
    submitMode: 'auto',
  };
}

const FAST_STORYBOARD_IMAGE_TOKEN_REGEX = /图片\s*([0-9０-９]+)/gu;

function normalizeFastStoryboardImageTokenIndex(value: string) {
  const normalized = value.replace(/[０-９]/gu, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xFEE0));
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed - 1 : null;
}

function getFastReferenceAssetType(referenceType?: FastReferenceImage['referenceType']): Asset['type'] {
  if (referenceType === 'person') {
    return 'character';
  }
  if (referenceType === 'scene') {
    return 'scene';
  }
  if (referenceType === 'product') {
    return 'product';
  }
  if (referenceType === 'style') {
    return 'style';
  }
  return 'prop';
}

function resolveFastSceneReferenceAssets(
  input: FastVideoInput,
  prompt: string,
  selectedReferenceImageIds: string[] = [],
): Asset[] {
  const readyReferenceImages = input.referenceImages.filter((reference) => reference.imageUrl.trim());
  const referencedIndexes = new Set<number>();

  for (const match of prompt.matchAll(FAST_STORYBOARD_IMAGE_TOKEN_REGEX)) {
    const index = normalizeFastStoryboardImageTokenIndex(match[1] || '');
    if (index !== null) {
      referencedIndexes.add(index);
    }
  }

  if (referencedIndexes.size === 0 && selectedReferenceImageIds.length === 0) {
    return [];
  }

  return readyReferenceImages
    .map((reference, index): Asset | null => {
      if (!referencedIndexes.has(index) && !selectedReferenceImageIds.includes(reference.id)) {
        return null;
      }

      const token = `图片${index + 1}`;
      const title = reference.description?.trim() || `参考图 ${index + 1}`;
      return {
        id: reference.assetId?.trim() || reference.id || `fast-reference-${index + 1}`,
        type: getFastReferenceAssetType(reference.referenceType),
        name: `${token} · ${title}`,
        description: title,
        imageUrl: reference.imageUrl,
      };
    })
    .filter((asset): asset is Asset => Boolean(asset));
}

function appendFastSceneReferenceHint(prompt: string, referenceAssets: Asset[]) {
  if (referenceAssets.length === 0) {
    return prompt;
  }

  return [
    prompt,
    `参考图说明：${referenceAssets.map((asset) => `${asset.name}: ${asset.description}`).join('；')}`,
  ].join('\n\n');
}

function syncSeedanceDraftTemplateForScenes(current: Project['fastFlow'], scenes: FastSceneDraft[]) {
  if (!current.seedanceDraft) {
    return current.seedanceDraft;
  }

  const nextBaseTemplateId = inferFastFlowTemplateId(current.input, scenes.length);
  const supportedOverlayIds = new Set(SEEDANCE_TEMPLATE_REGISTRY[nextBaseTemplateId].supportedOverlays);
  return {
    ...current.seedanceDraft,
    baseTemplateId: nextBaseTemplateId,
    overlayTemplateIds: current.seedanceDraft.overlayTemplateIds.filter((item) => supportedOverlayIds.has(item)),
  };
}

function inferFastReferenceVideoTypeFromMaterial(material: ProjectGroupMediaAsset): FastReferenceVideo['referenceType'] {
  const sourceText = `${material.sourceType} ${material.sourceLabel} ${material.title}`.toLowerCase();

  if (sourceText.includes('transition') || sourceText.includes('转场') || sourceText.includes('edit') || sourceText.includes('剪辑')) {
    return 'edit';
  }
  if (sourceText.includes('camera') || sourceText.includes('运镜')) {
    return 'camera';
  }
  if (sourceText.includes('effect') || sourceText.includes('特效')) {
    return 'effect';
  }
  if (sourceText.includes('extend') || sourceText.includes('延长')) {
    return 'extend';
  }
  if (sourceText.includes('shot') || sourceText.includes('镜头') || sourceText.includes('video') || sourceText.includes('视频')) {
    return 'motion';
  }

  return 'other';
}

function inferFastReferenceAudioTypeFromMaterial(material: ProjectGroupMediaAsset): FastReferenceAudio['referenceType'] {
  const sourceText = `${material.sourceType} ${material.sourceLabel} ${material.title}`.toLowerCase();

  if (sourceText.includes('dialogue') || sourceText.includes('对白') || sourceText.includes('台词')) {
    return 'dialogue';
  }
  if (sourceText.includes('effect') || sourceText.includes('音效')) {
    return 'effect';
  }
  if (sourceText.includes('rhythm') || sourceText.includes('节奏')) {
    return 'rhythm';
  }
  if (sourceText.includes('music') || sourceText.includes('音乐')) {
    return 'music';
  }

  return 'other';
}

function createFastReferenceVideoFromMaterial(material: ProjectGroupMediaAsset): FastReferenceVideo {
  return {
    id: crypto.randomUUID?.() || `fast-reference-video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    videoUrl: material.url,
    referenceType: inferFastReferenceVideoTypeFromMaterial(material),
    description: material.title || material.sourceLabel || '历史素材',
    selectedForVideo: true,
    videoMeta: null,
  };
}

function createFastReferenceAudioFromMaterial(material: ProjectGroupMediaAsset): FastReferenceAudio {
  return {
    id: crypto.randomUUID?.() || `fast-reference-audio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    audioUrl: material.url,
    referenceType: inferFastReferenceAudioTypeFromMaterial(material),
    description: material.title || material.sourceLabel || '历史素材',
    selectedForVideo: true,
    audioMeta: null,
  };
}

function isPermissionError(error: any) {
  return Boolean(
    error?.message?.includes('Requested entity was not found')
    || error?.message?.includes('PERMISSION_DENIED')
    || error?.status === 403
    || error?.message?.includes('403'),
  );
}

function isCloudAccessibleImageUrl(imageUrl: string) {
  try {
    const url = new URL(imageUrl);
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && url.hostname !== '127.0.0.1'
      && url.hostname !== 'localhost'
      && url.hostname !== '::1';
  } catch {
    return false;
  }
}

export function createFastVideoFlowActions({
  apiSettings,
  project,
  useMockMode,
  isRefreshingFastVideoTaskRef,
  setProject,
  setFastFlow,
  updateProjectRecord,
  updateFastFlowByProjectId,
  setView,
  setHasKey,
  setApiSettings,
  setIsGeneratingFastPlan,
  setGeneratingFastSceneImages,
  setIsRegeneratingFastVideoPrompt,
  setIsRefreshingFastVideoTask,
  setIsCancellingFastVideoTask,
  setIsSubmittingFastVideo,
  readFileAsDataUrl,
  persistGeneratedMediaUrl,
  openSeedanceErrorModal,
  refreshSeedanceHealth,
  getTextModelName,
  getTextModelSourceId,
  getOperationSourceId,
  getOperationModelName,
  getSeedanceArkModelMeta,
  buildSeedanceSubmitLogRequest,
  appendSeedanceLog,
  onCliConcurrencyLimit,
}: FastVideoFlowActionDeps) {
  const handleFastInputChange = (patch: Partial<FastVideoInput>) => {
    setFastFlow((current) => ({
      ...current,
      input: {
        ...current.input,
        ...patch,
      },
    }));
  };

  const handleSyncFastDirector = () => {
    setFastFlow((current) => ({
      ...current,
      director: normalizeFastDirectorState(
        current.director,
        current.input.referenceImages,
        current.scenes,
        current.characters,
      ),
    }));
  };

  const handleUpdateFastDirector = (
    updater: (current: FastDirectorState) => FastDirectorState,
  ) => {
    setFastFlow((current) => ({
      ...current,
      director: updater(current.director),
    }));
  };

  const handlePreviewFastScene3d = (sceneId: string) => {
    setFastFlow((current) => {
      const syncedDirector = normalizeFastDirectorState(
        current.director,
        current.input.referenceImages,
        current.scenes,
        current.characters,
      );
      const storyboardScene = current.scenes.find((scene) => scene.id === sceneId);
      if (!storyboardScene) {
        return current;
      }
      const layout = inferPromptCharacterLayout(storyboardScene);
      const nextCharacters = [...syncedDirector.characters];
      const palette = ['#4f8cff', '#ef5b5b', '#14b8a6', '#f59e0b', '#a855f7', '#ec4899', '#84cc16', '#06b6d4'];
      while (nextCharacters.length < layout.count) {
        const index = nextCharacters.length;
        const isMain = index === 0 && Boolean(layout.mainName);
        nextCharacters.push({
          id: `director-character-preview-${sceneId}-${index + 1}`,
          roleId: `角色${index + 1}`,
          bodyType: 'mannequin',
          name: isMain
            ? layout.mainName
            : layout.groupName
              ? `${layout.groupName} ${isMain ? '' : index}`.trim()
              : `角色 ${index + 1}`,
          description: '根据分镜提示词自动创建',
          color: palette[index % palette.length],
        });
      }
      if (layout.mainName) {
        let mainIndex = nextCharacters.findIndex((character) => (
          `${character.name} ${character.description || ''}`.includes(layout.mainName)
        ));
        if (mainIndex < 0) {
          mainIndex = nextCharacters.findIndex((character) => /^角色\s*\d+$/u.test(character.name));
          if (mainIndex >= 0) {
            nextCharacters[mainIndex] = { ...nextCharacters[mainIndex], name: layout.mainName };
          }
        }
        if (layout.groupCount > 0) {
          const groupCharacters = nextCharacters
            .map((character, index) => ({ character, index }))
            .filter(({ index }) => index !== mainIndex)
            .slice(0, layout.groupCount);
          groupCharacters.forEach(({ character, index }, groupIndex) => {
            if (/^角色\s*\d+$/u.test(character.name)) {
              nextCharacters[index] = {
                ...character,
                name: `${layout.groupName || '群体角色'} ${groupIndex + 1}`,
              };
            }
          });
        }
      }
      const placements = createPromptBasedDirectorPlacements(storyboardScene, nextCharacters);
      return {
        ...current,
        director: {
          ...syncedDirector,
          characters: nextCharacters,
          activeSceneId: sceneId,
          scenes: syncedDirector.scenes.map((scene) => scene.sceneId === sceneId ? {
            ...scene,
            placements,
            camera: storyboardScene.directorLayout?.camera
              ? {
                ...scene.camera,
                position: [...storyboardScene.directorLayout.camera.position],
                target: [...storyboardScene.directorLayout.camera.target],
                fov: storyboardScene.directorLayout.camera.fov,
              }
              : layout.mainName
                ? {
                  ...scene.camera,
                  position: [0, 1.6, 4.2],
                  target: [0, 1.05, 0],
                  fov: 38,
                }
                : scene.camera,
            updatedAt: new Date().toISOString(),
          } : scene),
        },
      };
    });
    setView('fastDirector');
  };

  const handleRegenerateFastScene3d = async (sceneId: string) => {
    const sourceScene = project.fastFlow.scenes.find((scene) => scene.id === sceneId);
    if (!sourceScene) return;
    const generatedPlan = await generateFastVideoPlanWithModel(
      {
        ...project.fastFlow.input,
        prompt: sourceScene.imagePromptZh?.trim() || sourceScene.imagePrompt,
        preferredSceneCount: 1,
        quickCutEnabled: false,
      },
      getTextModelName(),
      useMockMode,
      getTextModelSourceId(),
    );
    const generatedScene = generatedPlan.scenes[0];
    if (!generatedScene) {
      throw new Error('文本模型未返回 3D 场景布局。');
    }
    setFastFlow((current) => {
      const nextCharacters = [...current.characters];
      const roleMap = new Map<string, string>();
      let nextRoleNumber = nextCharacters.reduce((maximum, character) => {
        const match = character.id.match(/(\d+)$/u);
        return match ? Math.max(maximum, Number(match[1])) : maximum;
      }, 0) + 1;
      (generatedPlan.characters || []).forEach((generatedCharacter) => {
        const existing = nextCharacters.find((character) => (
          character.name === generatedCharacter.name
          || character.description.includes(generatedCharacter.name)
        ));
        if (existing) {
          roleMap.set(generatedCharacter.id, existing.id);
          return;
        }
        const roleId = `角色${nextRoleNumber++}`;
        roleMap.set(generatedCharacter.id, roleId);
        nextCharacters.push({ ...generatedCharacter, id: roleId });
      });
      const remapRoleId = (roleId: string) => roleMap.get(roleId) || roleId;
      const nextScenes = current.scenes.map((scene) => scene.id === sceneId ? {
        ...scene,
        characterIds: (generatedScene.characterIds || []).map(remapRoleId),
        directorLayout: generatedScene.directorLayout ? {
          ...generatedScene.directorLayout,
          characters: generatedScene.directorLayout.characters.map((entry) => ({
            ...entry,
            roleId: remapRoleId(entry.roleId),
          })),
        } : undefined,
      } : scene);
      const syncedDirector = normalizeFastDirectorState(
        current.director,
        current.input.referenceImages,
        nextScenes,
        nextCharacters,
      );
      const nextScene = nextScenes.find((scene) => scene.id === sceneId)!;
      return {
        ...current,
        characters: nextCharacters,
        scenes: nextScenes,
        director: {
          ...syncedDirector,
          activeSceneId: sceneId,
          scenes: syncedDirector.scenes.map((scene) => scene.sceneId === sceneId ? {
            ...scene,
            placements: createPromptBasedDirectorPlacements(nextScene, syncedDirector.characters),
            camera: nextScene.directorLayout?.camera ? {
              ...scene.camera,
              position: [...nextScene.directorLayout.camera.position],
              target: [...nextScene.directorLayout.camera.target],
              fov: nextScene.directorLayout.camera.fov,
            } : scene.camera,
            updatedAt: new Date().toISOString(),
          } : scene),
        },
      };
    });
  };

  const handleCaptureFastDirector = async ({
    sceneId,
    dataUrl,
    camera,
    aspectRatio,
  }: {
    sceneId: string;
    dataUrl: string;
    camera: FastDirectorCamera;
    aspectRatio: FastVideoInput['aspectRatio'];
  }) => {
    const captureId = crypto.randomUUID?.() || `director-capture-${Date.now()}`;
    const referenceImageId = `fast-director-reference-${captureId}`;
    const storyboardScene = project.fastFlow.scenes.find((scene) => scene.id === sceneId);
    const tosConfig = apiSettings.tos;
    if (!isTosConfigComplete(tosConfig)) {
      throw new Error('导出机位截图前，请先在 API 配置中启用并完整填写 TOS 配置。分镜图生成必须使用云端可访问的截图 URL。');
    }
    const captureBlob = await fetch(dataUrl).then((response) => response.blob());
    const captureFile = new File(
      [captureBlob],
      `director-${sceneId}-${captureId}.png`,
      { type: captureBlob.type || 'image/png' },
    );
    const tosImage = await uploadFileToTos(captureFile, tosConfig!, {
      mediaLabel: '3D 机位截图',
      defaultPrefix: 'director-captures',
    });
    await persistGeneratedMediaUrl(dataUrl, {
      kind: 'image',
      assetId: `${project.id}:fast-director:${sceneId}:${captureId}`,
      title: `${storyboardScene?.title || '分镜'} 3D 机位预演`,
      fileNameHint: `director-${sceneId}-${captureId}.png`,
    });
    const description = '3D 白模机位预演图，仅用于约束人物数量、位置、动作姿态、朝向、景别、构图和摄影机角度。人物身份、面部、服装和视觉风格以人物参考图为准，不得继承白模外观。';

    setFastFlow((current) => {
      const syncedDirector = normalizeFastDirectorState(
        current.director,
        current.input.referenceImages,
        current.scenes,
        current.characters,
      );
      const now = new Date().toISOString();

      return {
        ...current,
        input: {
          ...current.input,
          referenceImages: [
            ...current.input.referenceImages,
            {
              id: referenceImageId,
              imageUrl: tosImage.url,
              assetId: '',
              referenceType: 'scene',
              description,
              selectedForVideo: true,
              submitMode: 'reference_image',
              origin: {
                kind: 'director-capture',
                sceneId,
                captureId,
              },
            },
          ],
        },
        director: {
          ...syncedDirector,
          scenes: syncedDirector.scenes.map((scene) => (
            scene.sceneId === sceneId
              ? {
                ...scene,
                captures: [
                  ...scene.captures,
                  {
                    id: captureId,
                    imageUrl: tosImage.url,
                    referenceImageId,
                    camera,
                    aspectRatio,
                    createdAt: now,
                  },
                ],
                updatedAt: now,
              }
              : scene
          )),
        },
        seedanceDraft: {
          ...(current.seedanceDraft || createDefaultFastSeedanceDraft(current.input, current.videoPrompt?.prompt)),
          baseTemplateId: 'multi_image_reference',
        },
      };
    });
  };

  const handleDeleteFastDirectorCapture = (sceneId: string, captureId: string) => {
    setFastFlow((current) => {
      const capture = current.director.scenes
        .find((scene) => scene.sceneId === sceneId)
        ?.captures.find((item) => item.id === captureId);
      if (!capture) {
        return current;
      }
      return {
        ...current,
        input: {
          ...current.input,
          referenceImages: current.input.referenceImages.filter((reference) => (
            reference.id !== capture.referenceImageId
          )),
        },
        scenes: current.scenes.map((scene) => ({
          ...scene,
          selectedReferenceImageIds: scene.selectedReferenceImageIds?.filter((id) => (
            id !== capture.referenceImageId
          )),
        })),
        director: {
          ...current.director,
          scenes: current.director.scenes.map((scene) => scene.sceneId === sceneId ? {
            ...scene,
            captures: scene.captures.filter((item) => item.id !== captureId),
            updatedAt: new Date().toISOString(),
          } : scene),
        },
      };
    });
  };

  const handleAddFastReferenceImage = () => {
    const referenceId = crypto.randomUUID?.() || `fast-reference-${Date.now()}`;
    setFastFlow((current) => ({
      ...current,
      input: {
        ...current.input,
        referenceImages: [
          ...current.input.referenceImages,
          {
            id: referenceId,
            imageUrl: '',
            assetId: '',
            referenceType: 'other',
            description: '',
            selectedForVideo: true,
            submitMode: 'auto',
          },
        ],
      },
    }));
    return referenceId;
  };

  const handleUpdateFastReferenceImage = (referenceId: string, patch: Partial<FastReferenceImage>) => {
    setFastFlow((current) => ({
      ...current,
      input: {
        ...current.input,
        referenceImages: current.input.referenceImages.map((item) => item.id === referenceId ? { ...item, ...patch } : item),
      },
    }));
  };

  const handleAddFastReferenceImagesFromHistory = (materials: ProjectGroupImageAsset[]) => {
    const existingUrls = new Set(project.fastFlow.input.referenceImages.map((item) => item.imageUrl.trim()).filter(Boolean));
    const referencesToAdd = materials
      .filter((material) => material.imageUrl.trim())
      .filter((material) => {
        const url = material.imageUrl.trim();
        if (existingUrls.has(url)) {
          return false;
        }
        existingUrls.add(url);
        return true;
      })
      .map((material) => createFastReferenceImageFromMaterial(material));

    if (referencesToAdd.length === 0) {
      return [];
    }

    setFastFlow((current) => {
      const currentUrls = new Set(current.input.referenceImages.map((item) => item.imageUrl.trim()).filter(Boolean));
      const dedupedReferences = referencesToAdd.filter((reference) => {
        const url = reference.imageUrl.trim();
        if (!url || currentUrls.has(url)) {
          return false;
        }
        currentUrls.add(url);
        return true;
      });

      if (dedupedReferences.length === 0) {
        return current;
      }

      return {
        ...current,
        input: {
          ...current.input,
          referenceImages: [
            ...current.input.referenceImages,
            ...dedupedReferences,
          ],
        },
      };
    });

    return referencesToAdd.map((reference) => reference.id);
  };

  const handleReplaceFastReferenceImageFromHistory = (referenceId: string, material: ProjectGroupImageAsset) => {
    handleUpdateFastReferenceImage(referenceId, {
      imageUrl: material.imageUrl,
      assetId: '',
      referenceType: inferFastReferenceImageTypeFromMaterial(material),
      description: material.title || material.sourceLabel || '历史素材',
      selectedForVideo: true,
      submitMode: 'auto',
    });
  };

  const handleAddFastReferenceVideosFromHistory = (materials: ProjectGroupMediaAsset[]) => {
    const existingUrls = new Set((project.fastFlow.input.referenceVideos || []).map((item) => item.videoUrl.trim()).filter(Boolean));
    const referencesToAdd = materials
      .filter((material) => material.kind === 'video' && material.url.trim())
      .filter((material) => {
        const url = material.url.trim();
        if (existingUrls.has(url)) {
          return false;
        }
        existingUrls.add(url);
        return true;
      })
      .map((material) => createFastReferenceVideoFromMaterial(material));

    if (referencesToAdd.length === 0) {
      return [];
    }

    setFastFlow((current) => {
      const currentUrls = new Set((current.input.referenceVideos || []).map((item) => item.videoUrl.trim()).filter(Boolean));
      const dedupedReferences = referencesToAdd.filter((reference) => {
        const url = reference.videoUrl.trim();
        if (!url || currentUrls.has(url)) {
          return false;
        }
        currentUrls.add(url);
        return true;
      });

      if (dedupedReferences.length === 0) {
        return current;
      }

      return {
        ...current,
        input: {
          ...current.input,
          referenceVideos: [
            ...(current.input.referenceVideos || []),
            ...dedupedReferences,
          ],
        },
      };
    });

    return referencesToAdd.map((reference) => reference.id);
  };

  const handleReplaceFastReferenceVideoFromHistory = (referenceId: string, material: ProjectGroupMediaAsset) => {
    if (material.kind !== 'video') {
      return;
    }
    handleUpdateFastReferenceVideo(referenceId, {
      videoUrl: material.url,
      referenceType: inferFastReferenceVideoTypeFromMaterial(material),
      description: material.title || material.sourceLabel || '历史素材',
      selectedForVideo: true,
      videoMeta: null,
    });
  };

  const handleAddFastReferenceAudiosFromHistory = (materials: ProjectGroupMediaAsset[]) => {
    const existingUrls = new Set((project.fastFlow.input.referenceAudios || []).map((item) => item.audioUrl.trim()).filter(Boolean));
    const referencesToAdd = materials
      .filter((material) => material.kind === 'audio' && material.url.trim())
      .filter((material) => {
        const url = material.url.trim();
        if (existingUrls.has(url)) {
          return false;
        }
        existingUrls.add(url);
        return true;
      })
      .map((material) => createFastReferenceAudioFromMaterial(material));

    if (referencesToAdd.length === 0) {
      return [];
    }

    setFastFlow((current) => {
      const currentUrls = new Set((current.input.referenceAudios || []).map((item) => item.audioUrl.trim()).filter(Boolean));
      const dedupedReferences = referencesToAdd.filter((reference) => {
        const url = reference.audioUrl.trim();
        if (!url || currentUrls.has(url)) {
          return false;
        }
        currentUrls.add(url);
        return true;
      });

      if (dedupedReferences.length === 0) {
        return current;
      }

      return {
        ...current,
        input: {
          ...current.input,
          referenceAudios: [
            ...(current.input.referenceAudios || []),
            ...dedupedReferences,
          ],
        },
      };
    });

    return referencesToAdd.map((reference) => reference.id);
  };

  const handleReplaceFastReferenceAudioFromHistory = (referenceId: string, material: ProjectGroupMediaAsset) => {
    if (material.kind !== 'audio') {
      return;
    }
    handleUpdateFastReferenceAudio(referenceId, {
      audioUrl: material.url,
      referenceType: inferFastReferenceAudioTypeFromMaterial(material),
      description: material.title || material.sourceLabel || '历史素材',
      selectedForVideo: true,
      audioMeta: null,
    });
  };

  const handleAddFastReferenceFiles = async (kind: 'image' | 'video' | 'audio', files: File[]) => {
    const capability = getSeedanceCapabilities(project.fastFlow.executionConfig.apiModelKey);
    const existingCount = kind === 'image'
      ? project.fastFlow.input.referenceImages.length
      : kind === 'video'
        ? (project.fastFlow.input.referenceVideos || []).length
        : (project.fastFlow.input.referenceAudios || []).length;
    const maxCount = kind === 'image' ? capability.maxImages : kind === 'video' ? capability.maxVideos : capability.maxAudios;
    const filesToAdd = files.slice(0, Math.max(0, maxCount - existingCount));
    if (filesToAdd.length === 0) return [];

    try {
      if (kind === 'image') {
        const references = await Promise.all(filesToAdd.map(async (file, index) => {
          const id = crypto.randomUUID?.() || `fast-reference-image-${Date.now()}-${index}`;
          const dataUrl = await readFileAsDataUrl(file);
          const persisted = await persistGeneratedMediaUrl(dataUrl, {
            kind: 'image',
            assetId: `${project.id}:fast-reference:${id}`,
            title: file.name,
            fileNameHint: file.name,
          });
          return {
            id,
            imageUrl: persisted.url,
            referenceType: 'other' as const,
            description: file.name,
            selectedForVideo: true,
            submitMode: 'auto' as const,
          };
        }));
        setFastFlow((current) => ({
          ...current,
          input: { ...current.input, referenceImages: [...current.input.referenceImages, ...references] },
        }));
        return references.map((reference) => reference.id);
      }

      const tosConfig = apiSettings.tos;
      if (!isTosConfigComplete(tosConfig)) {
        throw new Error('上传本地视频或音频前，请先在 API 配置中完整填写 TOS 配置。');
      }
      const uploaded = await Promise.all(filesToAdd.map(async (file, index) => {
        const id = crypto.randomUUID?.() || `fast-reference-${kind}-${Date.now()}-${index}`;
        const result = await uploadFileToTos(file, tosConfig, {
          mediaLabel: kind === 'video' ? '参考视频' : '参考音频',
          defaultPrefix: kind === 'video' ? 'reference-videos' : 'reference-audios',
        });
        return { id, url: result.url, name: file.name };
      }));

      setFastFlow((current) => kind === 'video' ? ({
        ...current,
        input: {
          ...current.input,
          referenceVideos: [
            ...(current.input.referenceVideos || []),
            ...uploaded.map((item) => ({
              id: item.id,
              videoUrl: item.url,
              referenceType: 'other' as const,
              description: item.name,
              selectedForVideo: true,
              videoMeta: null,
            })),
          ],
        },
      }) : ({
        ...current,
        input: {
          ...current.input,
          referenceAudios: [
            ...(current.input.referenceAudios || []),
            ...uploaded.map((item) => ({
              id: item.id,
              audioUrl: item.url,
              referenceType: 'other' as const,
              description: item.name,
              selectedForVideo: true,
              audioMeta: null,
            })),
          ],
        },
      }));
      return uploaded.map((item) => item.id);
    } catch (error) {
      openSeedanceErrorModal({
        eyebrow: 'Fast Video',
        title: '添加本地素材失败',
        message: error instanceof Error ? error.message : '本地素材上传失败，请重试。',
      });
      throw error;
    }
  };

  const handleUploadFastReferenceImage = async (event: ChangeEvent<HTMLInputElement>, referenceId: string) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const referenceIndex = project.fastFlow.input.referenceImages.findIndex((item) => item.id === referenceId);
      const reference = project.fastFlow.input.referenceImages[referenceIndex];
      const persistedImage = await persistGeneratedMediaUrl(dataUrl, {
        kind: 'image',
        assetId: `${project.id}:fast-reference:${referenceId}`,
        title: reference?.description || `参考图 ${referenceIndex + 1}`,
        fileNameHint: file.name,
      });
      handleUpdateFastReferenceImage(referenceId, { imageUrl: persistedImage.url, submitMode: 'auto' });
    } catch (error) {
      console.error('Failed to upload fast reference image:', error);
      openSeedanceErrorModal({
        eyebrow: 'Fast Video',
        title: '上传参考图失败',
        message: '当前参考图上传失败，请重试。',
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      event.target.value = '';
    }
  };

  const handlePasteFastReferenceImage = async (file: File, referenceId: string) => {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const referenceIndex = project.fastFlow.input.referenceImages.findIndex((item) => item.id === referenceId);
      const reference = project.fastFlow.input.referenceImages[referenceIndex];
      const persistedImage = await persistGeneratedMediaUrl(dataUrl, {
        kind: 'image',
        assetId: `${project.id}:fast-reference:${referenceId}`,
        title: reference?.description || `参考图 ${referenceIndex + 1}`,
        fileNameHint: file.name,
      });
      handleUpdateFastReferenceImage(referenceId, { imageUrl: persistedImage.url, submitMode: 'auto' });
    } catch (error) {
      console.error('Failed to paste fast reference image:', error);
      openSeedanceErrorModal({
        eyebrow: 'Fast Video',
        title: '粘贴参考图失败',
        message: '当前参考图粘贴失败，请重新粘贴或改用上传。',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleRemoveFastReferenceImage = (referenceId: string) => {
    setFastFlow((current) => ({
      ...current,
      input: {
        ...current.input,
        referenceImages: current.input.referenceImages.filter((item) => item.id !== referenceId),
      },
    }));
  };

  const handleToggleFastReferenceSelection = (referenceId: string) => {
    setFastFlow((current) => ({
      ...current,
      input: {
        ...current.input,
        referenceImages: current.input.referenceImages.map((item) => item.id === referenceId ? {
          ...item,
          selectedForVideo: item.selectedForVideo === false,
        } : item),
      },
    }));
  };

  const handleAddFastReferenceVideo = () => {
    const referenceId = crypto.randomUUID?.() || `fast-reference-video-${Date.now()}`;
    setFastFlow((current) => ({
      ...current,
      input: {
        ...current.input,
        referenceVideos: [
          ...(current.input.referenceVideos || []),
          {
            id: referenceId,
            videoUrl: '',
            referenceType: 'other',
            description: '',
            selectedForVideo: true,
          },
        ],
      },
    }));
    return referenceId;
  };

  const handleUpdateFastReferenceVideo = (referenceId: string, patch: Partial<FastReferenceVideo>) => {
    setFastFlow((current) => ({
      ...current,
      input: {
        ...current.input,
        referenceVideos: (current.input.referenceVideos || []).map((item) => item.id === referenceId ? { ...item, ...patch } : item),
      },
    }));
  };

  const handleRemoveFastReferenceVideo = (referenceId: string) => {
    setFastFlow((current) => ({
      ...current,
      input: {
        ...current.input,
        referenceVideos: (current.input.referenceVideos || []).filter((item) => item.id !== referenceId),
      },
    }));
  };

  const handleToggleFastReferenceVideoSelection = (referenceId: string) => {
    setFastFlow((current) => ({
      ...current,
      input: {
        ...current.input,
        referenceVideos: (current.input.referenceVideos || []).map((item) => item.id === referenceId ? {
          ...item,
          selectedForVideo: item.selectedForVideo === false,
        } : item),
      },
    }));
  };

  const handleAddFastReferenceAudio = () => {
    const referenceId = crypto.randomUUID?.() || `fast-reference-audio-${Date.now()}`;
    setFastFlow((current) => ({
      ...current,
      input: {
        ...current.input,
        referenceAudios: [
          ...(current.input.referenceAudios || []),
          {
            id: referenceId,
            audioUrl: '',
            referenceType: 'other',
            description: '',
            selectedForVideo: true,
          },
        ],
      },
    }));
    return referenceId;
  };

  const handleUpdateFastReferenceAudio = (referenceId: string, patch: Partial<FastReferenceAudio>) => {
    setFastFlow((current) => ({
      ...current,
      input: {
        ...current.input,
        referenceAudios: (current.input.referenceAudios || []).map((item) => item.id === referenceId ? { ...item, ...patch } : item),
      },
    }));
  };

  const handleRemoveFastReferenceAudio = (referenceId: string) => {
    setFastFlow((current) => ({
      ...current,
      input: {
        ...current.input,
        referenceAudios: (current.input.referenceAudios || []).filter((item) => item.id !== referenceId),
      },
    }));
  };

  const handleToggleFastReferenceAudioSelection = (referenceId: string) => {
    setFastFlow((current) => ({
      ...current,
      input: {
        ...current.input,
        referenceAudios: (current.input.referenceAudios || []).map((item) => item.id === referenceId ? {
          ...item,
          selectedForVideo: item.selectedForVideo === false,
        } : item),
      },
    }));
  };

  const handleGenerateFastPlan = async () => {
    const fastInput = project.fastFlow.input;
    const targetProjectId = project.id;
    if (!fastInput.prompt.trim()) {
      return;
    }

    setIsGeneratingFastPlan(true);
    try {
      const plan = await generateFastVideoPlanWithModel(
        fastInput,
        getOperationModelName('fast-plan', 'text') || getTextModelName(),
        useMockMode,
        getOperationSourceId('fast-plan', 'text') || getTextModelSourceId(),
      );

      updateProjectRecord(targetProjectId, (current) => ({
        ...current,
        projectType: 'fast-video',
        name: current.nameCustomized ? current.name : buildFastProjectName(current.fastFlow.input),
        fastFlow: normalizeFastVideoProject({
          ...current.fastFlow,
          characters: plan.characters || [],
          scenes: plan.scenes,
          videoPrompt: {
            prompt: plan.videoPrompt.promptZh || plan.videoPrompt.prompt,
            promptZh: plan.videoPrompt.promptZh || plan.videoPrompt.prompt,
          },
          seedanceDraft: {
            ...createDefaultFastSeedanceDraft(current.fastFlow.input, plan.videoPrompt.promptZh || plan.videoPrompt.prompt),
            baseTemplateId: inferFastFlowTemplateId(current.fastFlow.input, plan.scenes.length),
          },
          executionConfig: {
            ...current.fastFlow.executionConfig,
            executor: current.fastFlow.executionConfig.executor || apiSettings.seedance.defaultExecutor,
            cliModelVersion: current.fastFlow.executionConfig.cliModelVersion || apiSettings.seedance.cliModelVersion,
            pollIntervalSec: current.fastFlow.executionConfig.pollIntervalSec || apiSettings.seedance.pollIntervalSec,
            videoResolution: '720p',
          },
          task: {
            provider: current.fastFlow.executionConfig.executor || apiSettings.seedance.defaultExecutor,
            taskId: '',
            status: 'idle',
            submitId: '',
            remoteStatus: '',
            queueStatus: '',
            error: '',
            raw: undefined,
            videoUrl: '',
            lastFrameUrl: '',
            videoStorageKey: '',
            lastFrameStorageKey: '',
            lastCheckedAt: '',
            startedAt: '',
            finishedAt: '',
          },
        }),
      }));
      setView(fastInput.quickCutEnabled ? 'fastVideo' : 'fastStoryboard');
    } catch (error: any) {
      console.error('Failed to generate fast video plan:', error);
      if (isPermissionError(error)) {
        setHasKey(false);
      } else {
        openSeedanceErrorModal({
          eyebrow: 'Fast Video',
          title: '生成流程草稿失败',
          message: '极速视频流程草稿生成失败，请检查输入或模型配置后重试。',
          detail: error?.message || '生成极速视频流程失败，请查看控制台。',
        });
      }
    } finally {
      setIsGeneratingFastPlan(false);
    }
  };

  const handleUpdateFastScene = (sceneId: string, patch: Partial<FastSceneDraft>) => {
    setFastFlow((current) => ({
      ...current,
      scenes: current.scenes.map((scene) => {
        if (scene.id !== sceneId) {
          return scene;
        }

        const nextScene = { ...scene, ...patch };
        if (Object.prototype.hasOwnProperty.call(patch, 'imagePrompt') || Object.prototype.hasOwnProperty.call(patch, 'humanFaceMosaic')) {
          nextScene.imagePrompt = syncHumanFaceMosaicPrompt(nextScene.imagePrompt, nextScene.humanFaceMosaic);
        }

        return nextScene;
      }),
    }));
  };

  const handleAddFastScene = () => {
    const sceneId = crypto.randomUUID?.() || `fast-scene-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setFastFlow((current) => {
      const sceneNumber = current.scenes.length + 1;
      const nextScenes: FastSceneDraft[] = [
        ...current.scenes,
        {
          id: sceneId,
          title: `分镜 ${sceneNumber}`,
          summary: '',
          imagePrompt: '',
          humanFaceMosaic: false,
          imagePromptZh: '',
          negativePrompt: current.input.negativePrompt || FAST_VIDEO_PROMPT_CONFIG.fallback.defaultNegativePrompt,
          negativePromptZh: current.input.negativePrompt || FAST_VIDEO_PROMPT_CONFIG.fallback.defaultNegativePromptZh,
          continuityAnchors: [],
          characterIds: current.characters.map((character) => character.id),
          imageUrl: '',
          imageStorageKey: '',
          locked: false,
          selectedForVideo: true,
          status: 'idle',
          error: '',
        },
      ];

      return {
        ...current,
        scenes: nextScenes,
        seedanceDraft: syncSeedanceDraftTemplateForScenes(current, nextScenes),
      };
    });
    return sceneId;
  };

  const handleDeleteFastScene = (sceneId: string) => {
    setFastFlow((current) => {
      const nextScenes = current.scenes.filter((scene) => scene.id !== sceneId);
      return {
        ...current,
        scenes: nextScenes,
        seedanceDraft: syncSeedanceDraftTemplateForScenes(current, nextScenes),
      };
    });
    setGeneratingFastSceneImages((prev) => {
      const next = { ...prev };
      delete next[sceneId];
      return next;
    });
  };

  const handleToggleFastSceneSelection = (sceneId: string) => {
    setFastFlow((current) => ({
      ...current,
      scenes: current.scenes.map((scene) => scene.id === sceneId ? {
        ...scene,
        selectedForVideo: scene.selectedForVideo === false,
      } : scene),
    }));
  };

  const resolveFastScenePreviousImage = (sceneId: string) => {
    const scenes = project.fastFlow.scenes;
    const sceneIndex = scenes.findIndex((scene) => scene.id === sceneId);
    if (sceneIndex <= 0) {
      return '';
    }

    return scenes[sceneIndex - 1]?.imageUrl || '';
  };

  const handleGenerateFastSceneImage = async (sceneId: string, mode: 'text-only' | 'previous-scene' = 'text-only') => {
    const scene = project.fastFlow.scenes.find((item) => item.id === sceneId);
    const prompt = scene?.imagePromptZh?.trim() || scene?.imagePrompt.trim() || '';
    if (!scene || !prompt) {
      return;
    }

    const previousSceneImage = resolveFastScenePreviousImage(sceneId);
    if (mode === 'previous-scene' && !previousSceneImage) {
      alert('请先生成上一张分镜图，再使用参考前一张生成。');
      return;
    }

    setGeneratingFastSceneImages((prev) => ({ ...prev, [sceneId]: true }));
    setFastFlow((current) => ({
      ...current,
      scenes: current.scenes.map((item) => item.id === sceneId ? { ...item, status: 'generating', error: '' } : item),
    }));
    try {
      const imageSourceId = getOperationSourceId(`fast-scene-image-${sceneId}`, 'image');
      const resolvedReferenceAssets = resolveFastSceneReferenceAssets(
        project.fastFlow.input,
        prompt,
        scene.selectedReferenceImageIds,
      );
      const referenceAssets = await Promise.all(resolvedReferenceAssets.map(async (asset) => {
        if (isCloudAccessibleImageUrl(asset.imageUrl || '')) {
          return asset;
        }
        const tosConfig = apiSettings.tos;
        if (!isTosConfigComplete(tosConfig)) {
          throw new Error('选中的参考图仍是本地地址。请先在 API 配置中启用并完整填写 TOS 配置。');
        }
        const sourceUrl = asset.imageUrl || '';
        const response = await fetch(sourceUrl);
        if (!response.ok) {
          throw new Error(`读取本地参考图失败：HTTP ${response.status}`);
        }
        const blob = await response.blob();
        const file = new File(
          [blob],
          `storyboard-reference-${sceneId}-${Date.now()}.png`,
          { type: blob.type || 'image/png' },
        );
        const uploaded = await uploadFileToTos(file, tosConfig!, {
          mediaLabel: '分镜参考图',
          defaultPrefix: 'storyboard-references',
        });
        setFastFlow((current) => ({
          ...current,
          input: {
            ...current.input,
            referenceImages: current.input.referenceImages.map((reference) => (
              reference.imageUrl === sourceUrl ? { ...reference, imageUrl: uploaded.url } : reference
            )),
          },
          director: {
            ...current.director,
            scenes: current.director.scenes.map((directorScene) => ({
              ...directorScene,
              captures: directorScene.captures.map((capture) => (
                capture.imageUrl === sourceUrl ? { ...capture, imageUrl: uploaded.url } : capture
              )),
            })),
          },
        }));
        return { ...asset, imageUrl: uploaded.url };
      }));
      const promptWithReferenceHint = appendFastSceneReferenceHint(prompt, referenceAssets);
      const imageUrl = await generateStoryboardImage(
        promptWithReferenceHint,
        project.fastFlow.input.aspectRatio,
        getOperationModelName(`fast-scene-image-${sceneId}`, 'image'),
        referenceAssets,
        useMockMode,
        mode === 'previous-scene' ? previousSceneImage : undefined,
        imageSourceId,
      );
      const persistedImage = await persistGeneratedMediaUrl(imageUrl, {
        kind: 'image',
        assetId: `${project.id}:fast-scene:${sceneId}`,
        title: scene.title || '极速分镜',
      });
      setFastFlow((current) => ({
        ...current,
        scenes: current.scenes.map((item) => item.id === sceneId ? {
          ...item,
          imageUrl: persistedImage.url,
          imageStorageKey: '',
          status: 'completed',
          error: '',
        } : item),
      }));
    } catch (error: any) {
      console.error('Failed to generate fast storyboard image:', error);
      if (isPermissionError(error)) {
        setHasKey(false);
      }
      setFastFlow((current) => ({
        ...current,
        scenes: current.scenes.map((item) => item.id === sceneId ? {
          ...item,
          status: 'failed',
          error: error?.message || '生成分镜图失败。',
        } : item),
      }));
    } finally {
      setGeneratingFastSceneImages((prev) => ({ ...prev, [sceneId]: false }));
    }
  };

  const handleSkipFastStoryboard = () => {
    const fallbackPrompt = project.fastFlow.videoPrompt?.prompt?.trim() || project.fastFlow.input.prompt.trim();
    if (!fallbackPrompt) {
      return;
    }

    setFastFlow((current) => {
      const prompt = current.videoPrompt?.prompt?.trim() || current.input.prompt.trim();
      const currentDraft = current.seedanceDraft || createDefaultFastSeedanceDraft(current.input, prompt);
      const selectedReferenceImages = current.input.referenceImages.filter((item) => item.imageUrl.trim() && item.selectedForVideo !== false);
      const selectedReferenceVideos = current.input.referenceVideos.filter((item) => item.videoUrl.trim() && item.selectedForVideo !== false);
      const nextBaseTemplateId: SeedanceBaseTemplateId = selectedReferenceImages.length > 0 || selectedReferenceVideos.length > 0
        ? 'multi_image_reference'
        : 'free_text';
      const nextTask = createEmptySeedanceTask();
      const supportedOverlayIds = new Set(SEEDANCE_TEMPLATE_REGISTRY[nextBaseTemplateId].supportedOverlays);

      return {
        ...current,
        videoPrompt: {
          prompt,
          promptZh: current.videoPrompt?.promptZh || prompt,
        },
        scenes: current.scenes.map((scene) => (
          scene.selectedForVideo === false
            ? scene
            : { ...scene, selectedForVideo: false }
        )),
        seedanceDraft: {
          ...currentDraft,
          baseTemplateId: nextBaseTemplateId,
          overlayTemplateIds: currentDraft.overlayTemplateIds.filter((item) => supportedOverlayIds.has(item)),
          prompt: {
            ...currentDraft.prompt,
            rawPrompt: prompt,
          },
        },
        task: {
          ...nextTask,
          provider: current.executionConfig.executor,
        },
      };
    });
    setView('fastVideo');
  };

  const handleUploadFastSceneImage = async (event: ChangeEvent<HTMLInputElement>, sceneId: string) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const scene = project.fastFlow.scenes.find((item) => item.id === sceneId);
      const persistedImage = await persistGeneratedMediaUrl(
        dataUrl,
        {
          kind: 'image',
          assetId: `${project.id}:fast-scene:${sceneId}`,
          title: scene?.title || '极速分镜',
          fileNameHint: file.name,
        },
      );
      setFastFlow((current) => ({
        ...current,
        scenes: current.scenes.map((item) => item.id === sceneId ? {
          ...item,
          imageUrl: persistedImage.url,
          imageStorageKey: '',
          status: 'completed',
          error: '',
        } : item),
      }));
    } catch (error) {
      console.error('Failed to upload fast storyboard image:', error);
      openSeedanceErrorModal({
        eyebrow: 'Fast Video',
        title: '上传分镜图失败',
        message: '当前分镜图上传失败，请重试。',
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      event.target.value = '';
    }
  };

  const handleUpdateFastVideoPrompt = (patch: Partial<FastVideoPromptDraft>) => {
    setFastFlow((current) => ({
      ...current,
      videoPrompt: {
        ...(current.videoPrompt || { prompt: '', promptZh: '' }),
        ...patch,
      },
      seedanceDraft: current.seedanceDraft
        ? {
          ...current.seedanceDraft,
          prompt: {
            ...current.seedanceDraft.prompt,
            rawPrompt: typeof patch.prompt === 'string' ? patch.prompt : (current.seedanceDraft.prompt.rawPrompt || ''),
          },
        }
        : createDefaultFastSeedanceDraft(current.input, typeof patch.prompt === 'string' ? patch.prompt : current.videoPrompt?.prompt),
    }));
  };

  const handleRegenerateFastVideoPrompt = async () => {
    if (!project.fastFlow.input.prompt.trim()) {
      return;
    }

    setIsRegeneratingFastVideoPrompt(true);
    try {
      const regeneratedPrompt = await generateFastVideoPromptWithModel(
        project.fastFlow.input,
        project.fastFlow.scenes,
        getOperationModelName('fast-plan', 'text') || getTextModelName(),
        useMockMode,
        getOperationSourceId('fast-plan', 'text') || getTextModelSourceId(),
      );

      handleUpdateFastVideoPrompt({
        prompt: regeneratedPrompt.promptZh || regeneratedPrompt.prompt,
        promptZh: regeneratedPrompt.promptZh || regeneratedPrompt.prompt,
      });
    } catch (error: any) {
      console.error('Failed to regenerate fast video prompt:', error);
      if (isPermissionError(error)) {
        setHasKey(false);
      } else {
        openSeedanceErrorModal({
          eyebrow: 'Fast Video',
          title: '重新生成提示词失败',
          message: '视频提示词重新生成失败，请检查输入或模型配置后重试。',
          detail: error?.message || '重新生成视频提示词失败，请查看控制台。',
        });
      }
    } finally {
      setIsRegeneratingFastVideoPrompt(false);
    }
  };

  const handleUpdateFastExecutionConfig = (patch: Partial<Project['fastFlow']['executionConfig']>) => {
    setFastFlow((current) => ({
      ...current,
      executionConfig: {
        ...current.executionConfig,
        ...patch,
      },
    }));
    setApiSettings((prev) => ({
      ...prev,
      seedance: {
        ...prev.seedance,
        ...(patch.executor === 'ark' || patch.executor === 'cli' ? { defaultExecutor: patch.executor } : {}),
        ...(patch.cliModelVersion ? { cliModelVersion: patch.cliModelVersion } : {}),
        ...(typeof patch.pollIntervalSec === 'number' ? { pollIntervalSec: patch.pollIntervalSec } : {}),
      },
    }));
  };

  const handleUpdateFastSeedanceDraft = (
    patch: Partial<Omit<SeedanceDraft, 'options' | 'prompt'>> & {
      options?: Partial<SeedanceDraft['options']>;
      prompt?: Partial<SeedanceDraft['prompt']>;
    },
  ) => {
    setFastFlow((current) => {
      const currentDraft = current.seedanceDraft || createDefaultFastSeedanceDraft(current.input, current.videoPrompt?.prompt);
      const nextBaseTemplateId = patch.baseTemplateId ?? currentDraft.baseTemplateId;
      const supportedOverlayIds = new Set(SEEDANCE_TEMPLATE_REGISTRY[nextBaseTemplateId].supportedOverlays);
      const nextOverlayTemplateIds = (patch.overlayTemplateIds ?? currentDraft.overlayTemplateIds)
        .filter((item) => supportedOverlayIds.has(item));
      return {
        ...current,
        seedanceDraft: {
          ...currentDraft,
          ...patch,
          baseTemplateId: nextBaseTemplateId,
          overlayTemplateIds: nextOverlayTemplateIds,
          prompt: patch.prompt
            ? {
              ...currentDraft.prompt,
              ...patch.prompt,
              rawPrompt: patch.prompt.rawPrompt ?? currentDraft.prompt.rawPrompt,
              diagnostics: patch.prompt.diagnostics ?? currentDraft.prompt.diagnostics,
            }
            : currentDraft.prompt,
          options: patch.options
            ? {
              ...currentDraft.options,
              ...patch.options,
              ratio: patch.options.ratio ?? currentDraft.options.ratio,
              resolution: patch.options.resolution ?? currentDraft.options.resolution,
              generateAudio: patch.options.generateAudio ?? currentDraft.options.generateAudio,
              returnLastFrame: patch.options.returnLastFrame ?? currentDraft.options.returnLastFrame,
              useWebSearch: patch.options.useWebSearch ?? currentDraft.options.useWebSearch,
              watermark: patch.options.watermark ?? currentDraft.options.watermark,
              moduleSettings: patch.options.moduleSettings
                ? {
                  ...(currentDraft.options.moduleSettings || {}),
                  ...patch.options.moduleSettings,
                }
                : currentDraft.options.moduleSettings,
            }
            : currentDraft.options,
        },
      };
    });
  };

  const handleRefreshFastVideoTask = async (taskIdOverride?: string, executorOverride?: SeedanceExecutorId) => {
    const targetProjectId = project.id;
    const taskId = (taskIdOverride || project.fastFlow.task.taskId || project.fastFlow.task.submitId || '').trim();
    const taskExecutor = executorOverride || resolveFastVideoTaskProvider(
      project.fastFlow.task,
      project.fastFlow.executionConfig.executor,
    );
    if (!taskId) {
      return;
    }

    if (isRefreshingFastVideoTaskRef.current) {
      return;
    }

    isRefreshingFastVideoTaskRef.current = true;
    setIsRefreshingFastVideoTask(true);

    try {
      if (useMockMode && (taskExecutor === 'aliyun' || taskExecutor === 'minimax')) {
        const nowIso = new Date().toISOString();
        updateFastFlowByProjectId(targetProjectId, (current) => ({
          ...current,
          task: {
            ...current.task,
            provider: taskExecutor,
            taskId,
            submitId: '',
            status: 'completed',
            remoteStatus: 'success',
            queueStatus: 'MockDone',
            videoUrl: current.task.videoUrl || 'https://www.w3schools.com/html/mov_bbb.mp4',
            lastCheckedAt: nowIso,
            error: '',
            startedAt: current.task.startedAt || nowIso,
            finishedAt: current.task.finishedAt || nowIso,
          },
        }));
        return;
      }

      if (taskExecutor === 'aliyun') {
        const result = await fetchHappyHorseTask(taskId, apiSettings.aliyun.apiKey, apiSettings.aliyun.baseUrl);
        appendSeedanceLog({
          operation: 'happyhorseQueryResult',
          status: 'success',
          executor: 'aliyun' as any,
          request: { taskId, executor: 'aliyun' },
          response: result,
        });

        const latestVideoUrl = result.downloadedFiles?.[0]?.url || '';
        const persistedVideo = result.genStatus === 'completed' && latestVideoUrl
          ? await persistGeneratedMediaUrl(latestVideoUrl, {
            kind: 'video',
            assetId: `${targetProjectId}:fast-task:video`,
            title: '极速视频成片',
          })
          : undefined;
        const nowIso = new Date().toISOString();

        updateFastFlowByProjectId(targetProjectId, (current) => ({
          ...current,
          task: {
            ...current.task,
            provider: 'aliyun',
            taskId,
            submitId: taskId,
            status: result.genStatus as any,
            remoteStatus: result.raw?.output?.task_status || current.task.remoteStatus,
            queueStatus: result.raw?.output?.task_status || current.task.queueStatus,
            raw: result.raw,
            error: result.genStatus === 'failed' ? (result.error?.message || '生成失败') : '',
            videoUrl: persistedVideo?.url || current.task.videoUrl,
            lastCheckedAt: nowIso,
            finishedAt: resolveSeedanceFinishedAt(result.genStatus as any, current.task.finishedAt, nowIso),
          },
        }));
        return;
      }

      if (taskExecutor === 'minimax') {
        const result = await queryVideoTask(taskId);
        appendSeedanceLog({
          operation: 'minimaxVideoQuery',
          status: 'success',
          executor: 'minimax',
          sourceId: 'minimax.videoModel',
          modelName: result.model || apiSettings.minimax.videoModel,
          request: { taskId, executor: 'minimax' },
          response: result,
        });
        const normalizedStatus = mapRemoteSeedanceStatus(result.status);
        const persistedVideo = normalizedStatus === 'completed' && result.content?.url
          ? await persistGeneratedMediaUrl(result.content.url, {
            kind: 'video',
            assetId: `${targetProjectId}:fast-task:video`,
            title: '极速视频成片',
          })
          : undefined;
        const nowIso = new Date().toISOString();
        updateFastFlowByProjectId(targetProjectId, (current) => ({
          ...current,
          task: {
            ...current.task,
            provider: 'minimax',
            taskId,
            submitId: '',
            status: normalizedStatus,
            remoteStatus: result.status,
            queueStatus: result.status,
            raw: result,
            error: normalizedStatus === 'failed' ? (result.error?.message || 'MiniMax H3 任务失败。') : '',
            videoUrl: persistedVideo?.url || current.task.videoUrl,
            videoStorageKey: '',
            lastCheckedAt: nowIso,
            finishedAt: resolveSeedanceFinishedAt(normalizedStatus, current.task.finishedAt, nowIso),
          },
        }));
        return;
      }

      if (taskExecutor === 'ark') {
        const result = await getSeedanceTask(taskId);
        appendSeedanceLog({
          operation: 'seedanceQueryResult',
          status: 'success',
          executor: 'ark',
          modelName: result.model || getSeedanceArkModelMeta(project.fastFlow.executionConfig.apiModelKey).modelName,
          request: { taskId, executor: 'ark' },
          response: result,
        });

        const normalizedStatus = mapRemoteSeedanceStatus(result.status);
        const shouldPersistOutputs = normalizedStatus === 'completed';
        const persistedVideo = shouldPersistOutputs && result.videoUrl
          ? await persistGeneratedMediaUrl(result.videoUrl, {
            kind: 'video',
            assetId: `${targetProjectId}:fast-task:video`,
            title: '极速视频成片',
          })
          : undefined;
        const persistedLastFrame = shouldPersistOutputs && result.lastFrameUrl
          ? await persistGeneratedMediaUrl(result.lastFrameUrl, {
            kind: 'image',
            assetId: `${targetProjectId}:fast-task:last-frame`,
            title: '极速视频尾帧',
          })
          : undefined;
        const nowIso = new Date().toISOString();

        updateFastFlowByProjectId(targetProjectId, (current) => ({
          ...current,
          task: {
            ...current.task,
            provider: 'ark',
            taskId,
            submitId: '',
            status: normalizedStatus,
            remoteStatus: result.status || current.task.remoteStatus,
            queueStatus: result.status || current.task.queueStatus,
            raw: result.raw,
            error: normalizedStatus === 'failed'
              ? result.error?.code === 'InvalidParameter.TaskTypeConstraint'
                ? '任务类型参数不匹配：视频编辑请使用 adaptive 画幅和自动时长；首尾帧或视频延长请使用 adaptive 画幅。'
                : (result.error?.message || 'Seedance 任务失败，请查看日志。')
              : '',
            videoUrl: persistedVideo?.url || current.task.videoUrl,
            lastFrameUrl: persistedLastFrame?.url || current.task.lastFrameUrl,
            videoStorageKey: '',
            lastFrameStorageKey: '',
            lastCheckedAt: nowIso,
            finishedAt: resolveSeedanceFinishedAt(normalizedStatus, current.task.finishedAt, nowIso),
          },
        }));
        return;
      }

      const result = await fetchSeedanceTask(taskId, apiSettings.seedance.bridgeUrl);
      appendSeedanceLog({
        operation: 'seedanceQueryResult',
        status: 'success',
        executor: 'cli',
        request: { taskId, executor: 'cli', bridgeUrl: apiSettings.seedance.bridgeUrl || '/api/seedance' },
        response: result,
      });

      const normalizedStatus = mapRemoteSeedanceStatus(result.genStatus);
      const latestVideoUrl = result.downloadedFiles?.[0]?.url || '';
      const persistedVideo = normalizedStatus === 'completed' && latestVideoUrl
        ? await persistGeneratedMediaUrl(latestVideoUrl, {
          kind: 'video',
          assetId: `${targetProjectId}:fast-task:video`,
          title: '极速视频成片',
        })
        : undefined;
      const nowIso = new Date().toISOString();

      updateFastFlowByProjectId(targetProjectId, (current) => ({
        ...current,
        task: {
          ...current.task,
          provider: 'cli',
          taskId,
          submitId: taskId,
          status: normalizedStatus,
          remoteStatus: result.genStatus || current.task.remoteStatus,
          queueStatus: result.queueInfo?.queue_status || current.task.queueStatus,
          raw: result.raw,
          error: normalizedStatus === 'failed' ? buildSeedanceCliFailure(result.raw).detail : '',
          videoUrl: persistedVideo?.url || current.task.videoUrl,
          videoStorageKey: '',
          lastCheckedAt: nowIso,
          finishedAt: resolveSeedanceFinishedAt(normalizedStatus, current.task.finishedAt, nowIso),
        },
      }));
    } catch (error: any) {
      console.error('Failed to refresh fast video task:', error);
      appendSeedanceLog({
        operation: 'seedanceQueryResult',
        status: 'error',
        executor: taskExecutor,
        request: { taskId, executor: taskExecutor },
        error: error?.message || '查询 Seedance 任务失败。',
      });
      updateFastFlowByProjectId(targetProjectId, (current) => ({
        ...current,
        task: {
          ...current.task,
          status: 'failed',
          error: error?.message || '查询 Seedance 任务失败。',
          lastCheckedAt: new Date().toISOString(),
        },
      }));
    } finally {
      isRefreshingFastVideoTaskRef.current = false;
      setIsRefreshingFastVideoTask(false);
    }
  };

  const handleCancelFastVideoTask = async () => {
    const targetProjectId = project.id;
    const task = project.fastFlow.task;
    const taskId = getFastVideoTaskId(task);
    if (!taskId) {
      return;
    }

    setIsCancellingFastVideoTask(true);
    try {
      if (useMockMode) {
        const nowIso = new Date().toISOString();
        updateFastFlowByProjectId(targetProjectId, (current) => ({
          ...current,
          task: {
            ...current.task,
            status: 'cancelled',
            remoteStatus: 'cancelled',
            queueStatus: 'cancelled',
            error: '',
            lastCheckedAt: nowIso,
            finishedAt: resolveSeedanceFinishedAt('cancelled', current.task.finishedAt, nowIso),
          },
        }));
        return;
      }

      if (task.provider !== 'ark' && task.provider !== 'minimax') {
        throw new Error('当前本地 CLI 执行器暂不支持取消已提交任务。');
      }

      if (task.provider === 'minimax') {
        await deleteOrCancelVideoTask(taskId);
      } else {
        await deleteSeedanceTask(taskId);
      }
      appendSeedanceLog({
        operation: task.provider === 'minimax' ? 'minimaxVideoCancel' : 'seedanceCancel',
        status: 'success',
        executor: task.provider,
        request: { taskId, executor: task.provider },
      });

      const nowIso = new Date().toISOString();
      updateFastFlowByProjectId(targetProjectId, (current) => ({
        ...current,
        task: {
          ...current.task,
          status: 'cancelled',
          remoteStatus: 'cancelled',
          queueStatus: 'cancelled',
          error: '',
          lastCheckedAt: nowIso,
          finishedAt: resolveSeedanceFinishedAt('cancelled', current.task.finishedAt, nowIso),
        },
      }));
    } catch (error: any) {
      const errorMessage = error?.message || '取消生成任务失败。';
      console.error('Failed to cancel fast video task:', error);
      const taskExecutor = task.provider === 'ark' || task.provider === 'minimax' ? task.provider : 'cli';
      appendSeedanceLog({
        operation: 'seedanceCancel',
        status: 'error',
        executor: taskExecutor,
        request: { taskId, executor: taskExecutor },
        error: errorMessage,
      });
      openSeedanceErrorModal({
        eyebrow: 'Seedance',
        title: '取消生成任务失败',
        message: (task.provider === 'ark' || task.provider === 'minimax') && String(task.remoteStatus || '').trim().toLowerCase() === 'running'
          ? `${task.provider === 'minimax' ? 'MiniMax H3' : 'Ark'} 当前只支持取消排队中的任务，running 状态暂不能取消。`
          : '取消生成任务失败，请稍后重试。',
        detail: errorMessage,
      });
    } finally {
      setIsCancellingFastVideoTask(false);
    }
  };

  const handleSubmitFastVideo = async () => {
    const targetProjectId = project.id;
    const draft = syncFastFlowSeedanceDraft(project.fastFlow);
    const submitExecutor = project.fastFlow.executionConfig.executor;
    const validation = validateSeedanceDraft(
      draft,
      submitExecutor === 'ark' ? project.fastFlow.executionConfig.apiModelKey : 'standard',
    );
    const cliVisualAssetCount = draft.assets.filter((asset) => asset.kind === 'image' || asset.kind === 'video').length;
    const cliOptions: SeedanceCliQueueEnqueueInput['cliOptions'] = {
      modelVersion: project.fastFlow.executionConfig.cliModelVersion,
      ratio: draft.options.ratio === 'adaptive' || draft.options.ratio === '3:4' || draft.options.ratio === '21:9'
        ? project.fastFlow.input.aspectRatio
        : draft.options.ratio,
      duration: draft.options.duration || project.fastFlow.input.durationSec,
      videoResolution: draft.options.resolution,
    };
    const cliExtraErrors = submitExecutor === 'cli' && draft.baseTemplateId !== 'free_text' && cliVisualAssetCount === 0
      ? ['CLI 执行器至少需要 1 个图片或视频素材。']
      : [];
    const submitErrors = [...validation.errors, ...cliExtraErrors];
    if (submitErrors.length > 0) {
      openSeedanceErrorModal({
        eyebrow: 'Fast Video',
        title: '提交前校验失败',
        message: submitErrors[0],
      });
      return;
    }

    setIsSubmittingFastVideo(true);
    const submitStartedAt = new Date().toISOString();
    updateFastFlowByProjectId(targetProjectId, (current) => ({
      ...current,
      task: {
        ...current.task,
        provider: submitExecutor,
        status: 'submitting',
        error: '',
        startedAt: submitStartedAt,
        finishedAt: '',
      },
    }));
    try {
      if (!useMockMode && (submitExecutor === 'ark' || submitExecutor === 'cli')) {
        await refreshSeedanceHealth();
      }

      if (useMockMode && (submitExecutor === 'aliyun' || submitExecutor === 'minimax')) {
        const mockTaskId = `mock-${Date.now()}`;
        const finishedAt = new Date().toISOString();
        updateFastFlowByProjectId(targetProjectId, (current) => ({
          ...current,
          task: {
            ...current.task,
            provider: submitExecutor,
            taskId: mockTaskId,
            submitId: '',
            status: 'completed',
            remoteStatus: 'success',
            queueStatus: 'MockDone',
            error: '',
            videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
            lastCheckedAt: finishedAt,
            startedAt: current.task.startedAt || submitStartedAt,
            finishedAt,
          },
        }));
        setView('fastVideo');
        return;
      }

      if (submitExecutor === 'minimax') {
        const result = await startFastVideoGeneration(
          draft,
          project.fastFlow.input.aspectRatio,
          false,
          apiSettings.minimax.videoModel,
        );
        appendSeedanceLog({
          operation: 'minimaxVideoSubmit',
          status: 'success',
          executor: 'minimax',
          sourceId: 'minimax.videoModel',
          modelName: apiSettings.minimax.videoModel,
          request: buildSeedanceSubmitLogRequest(draft, 'minimax'),
          response: result,
        });
        updateFastFlowByProjectId(targetProjectId, (current) => ({
          ...current,
          task: {
            ...current.task,
            provider: 'minimax',
            taskId: result.taskId,
            submitId: '',
            status: 'queued',
            remoteStatus: 'queued',
            queueStatus: 'queued',
            raw: result,
            error: '',
            lastCheckedAt: new Date().toISOString(),
            startedAt: current.task.startedAt || submitStartedAt,
            finishedAt: '',
          },
        }));
        setView('fastVideo');
        await handleRefreshFastVideoTask(result.taskId, 'minimax');
      } else if (submitExecutor === 'aliyun') {
        const imageSources = draft.assets
          .filter((asset) => asset.kind === 'image')
          .map((asset) => asset.urlOrData)
          .filter(Boolean);
        const happyHorseModel = draft.baseTemplateId === 'multi_image_reference'
          ? 'happyhorse-1.0-r2v'
          : draft.baseTemplateId === 'first_frame' || draft.baseTemplateId === 'first_last_frame'
            ? 'happyhorse-1.0-i2v'
            : 'happyhorse-1.0-t2v';
        const result = await submitHappyHorseTask({
          prompt: draft.prompt.rawPrompt,
          imageSources,
          model: happyHorseModel,
          options: {
            ratio: project.fastFlow.input.aspectRatio,
            duration: project.fastFlow.input.durationSec,
            videoResolution: draft.options.resolution,
          },
          apiKey: apiSettings.aliyun.apiKey,
          baseUrl: apiSettings.aliyun.baseUrl,
        });

        appendSeedanceLog({
          operation: 'happyhorseSubmit',
          status: 'success',
          executor: 'aliyun' as any,
          request: {
            prompt: draft.prompt.rawPrompt,
            imageCount: imageSources.length,
            ratio: project.fastFlow.input.aspectRatio,
            duration: project.fastFlow.input.durationSec,
            resolution: draft.options.resolution,
          },
          response: result,
        });

        updateFastFlowByProjectId(targetProjectId, (current) => ({
          ...current,
          task: {
            ...current.task,
            provider: 'aliyun',
            taskId: result.submitId,
            submitId: result.submitId,
            status: 'queued',
            remoteStatus: 'PENDING',
            queueStatus: 'PENDING',
            raw: result.raw,
            error: '',
            lastCheckedAt: new Date().toISOString(),
            startedAt: current.task.startedAt || submitStartedAt,
            finishedAt: '',
          },
        }));
        setView('fastVideo');
        await handleRefreshFastVideoTask(result.submitId, 'aliyun');
      } else if (submitExecutor === 'ark') {
        const submitRequestLog = buildSeedanceSubmitLogRequest(draft, 'ark');
        const arkModelMeta = getSeedanceArkModelMeta(project.fastFlow.executionConfig.apiModelKey);
        const result = await createSeedanceTask(draft, project.fastFlow.executionConfig.apiModelKey);
        appendSeedanceLog({
          operation: 'seedanceSubmit',
          status: 'success',
          executor: 'ark',
          sourceId: arkModelMeta.sourceId,
          modelName: arkModelMeta.modelName,
          request: submitRequestLog,
          response: result,
        });

        updateFastFlowByProjectId(targetProjectId, (current) => ({
          ...current,
          task: {
            ...current.task,
            provider: 'ark',
            taskId: result.id,
            submitId: '',
            status: mapRemoteSeedanceStatus(result.status),
            remoteStatus: result.status,
            queueStatus: result.status,
            raw: result.raw,
            error: '',
            lastCheckedAt: new Date().toISOString(),
            startedAt: current.task.startedAt || submitStartedAt,
            finishedAt: resolveSeedanceFinishedAt(mapRemoteSeedanceStatus(result.status), current.task.finishedAt),
          },
        }));
        setView('fastVideo');
        await handleRefreshFastVideoTask(result.id, 'ark');
      } else {
        const imageSources = draft.assets
          .filter((asset) => asset.kind === 'image')
          .map((asset) => asset.urlOrData)
          .filter(Boolean);
        const videoSources = draft.assets
          .filter((asset) => asset.kind === 'video')
          .map((asset) => asset.urlOrData)
          .filter(Boolean);
        const audioSources = draft.assets
          .filter((asset) => asset.kind === 'audio')
          .map((asset) => asset.urlOrData)
          .filter(Boolean);
        const submitRequestLog = buildSeedanceSubmitLogRequest(draft, 'cli');
        const result = await submitSeedanceTask({
          projectId: targetProjectId,
          prompt: draft.prompt.rawPrompt,
          imageSources,
          videoSources,
          audioSources,
          options: cliOptions,
          baseUrl: apiSettings.seedance.bridgeUrl,
        });
        const submitStatus = mapRemoteSeedanceStatus(result.genStatus);
        if (submitStatus === 'failed') {
          const failure = buildSeedanceCliFailure(result.raw, '提交 Seedance 失败。');
          const submitError = new Error(failure.detail);
          (submitError as any).userMessage = failure.userMessage;
          (submitError as any).response = result;
          throw submitError;
        }

        appendSeedanceLog({
          operation: 'seedanceSubmit',
          status: 'success',
          executor: 'cli',
          request: {
            ...submitRequestLog,
            imageCount: imageSources.length,
            videoCount: videoSources.length,
            audioCount: audioSources.length,
            ratio: draft.options.ratio,
            duration: draft.options.duration || project.fastFlow.input.durationSec,
            resolution: draft.options.resolution,
          },
          response: result,
        });

        updateFastFlowByProjectId(targetProjectId, (current) => ({
          ...current,
          task: {
            ...current.task,
            provider: 'cli',
            taskId: result.submitId,
            submitId: result.submitId,
            status: mapRemoteSeedanceStatus(result.genStatus),
            remoteStatus: result.genStatus,
            queueStatus: result.genStatus === 'success' ? 'Success' : 'querying',
            raw: result.raw,
            error: '',
            lastCheckedAt: new Date().toISOString(),
            startedAt: current.task.startedAt || submitStartedAt,
            finishedAt: resolveSeedanceFinishedAt(mapRemoteSeedanceStatus(result.genStatus), current.task.finishedAt),
          },
        }));
        setView('fastVideo');
        await handleRefreshFastVideoTask(result.submitId, 'cli');
      }
    } catch (error: any) {
      console.error('Failed to submit fast video task:', error);
      const errorMessage = error?.message || '提交 Seedance 失败。';
      const userMessage = error?.userMessage || (
        isSeedanceConcurrencyLimitError(errorMessage)
          ? '视频提交失败：当前并发任务数已达上限，请等待已有任务完成后重试。'
          : '视频提交失败，请检查当前提示词、参考图或执行器配置后重试。'
      );
      appendSeedanceLog({
        operation: 'seedanceSubmit',
        status: 'error',
        executor: submitExecutor,
        request: buildSeedanceSubmitLogRequest(draft, submitExecutor),
        response: error?.response,
        error: errorMessage,
      });
      updateFastFlowByProjectId(targetProjectId, (current) => ({
        ...current,
        task: {
          ...current.task,
          status: 'failed',
          submitId: typeof error?.response?.submitId === 'string' ? error.response.submitId : current.task.submitId,
          remoteStatus: typeof error?.response?.genStatus === 'string' ? error.response.genStatus : current.task.remoteStatus,
          queueStatus: typeof error?.response?.genStatus === 'string' ? error.response.genStatus : current.task.queueStatus,
          raw: error?.response?.raw ?? current.task.raw,
          error: errorMessage,
          lastCheckedAt: new Date().toISOString(),
          startedAt: current.task.startedAt || submitStartedAt,
          finishedAt: current.task.finishedAt || new Date().toISOString(),
        },
      }));
      if (isSeedanceRealPersonRejection(errorMessage)) {
        openSeedanceErrorModal({
          title: '参考图疑似包含真人',
          message: 'Seedance 当前拒绝了这次请求，因为输入图片可能包含真人内容。请回到分镜确认页，重新生成或替换相关图片后再提交。',
          detail: errorMessage,
          action: 'redo-images',
        });
      } else if (isSeedanceAssetServiceUnavailable(errorMessage)) {
        openSeedanceErrorModal({
          title: 'Asset Service 未开通',
          message: '当前账号还没有开通火山引擎 Asset Service，所以 `asset://...` 素材无法用于 Seedance 请求。你可以先去控制台开通服务，或者返回极速输入页清空这张图的 assetId，改为直接使用图片提交。',
          detail: errorMessage,
          action: 'edit-references',
        });
      } else if (submitExecutor === 'cli' && isSeedanceConcurrencyLimitError(errorMessage) && onCliConcurrencyLimit) {
        onCliConcurrencyLimit({
          project,
          draft,
          cliOptions,
          sourceFailureDetail: errorMessage,
        });
      } else {
        openSeedanceErrorModal({
          eyebrow: 'Seedance',
          title: '提交 Seedance 失败',
          message: userMessage,
          detail: errorMessage,
        });
      }
    } finally {
      setIsSubmittingFastVideo(false);
    }
  };

  return {
    handleFastInputChange,
    handleSyncFastDirector,
    handleUpdateFastDirector,
    handlePreviewFastScene3d,
    handleRegenerateFastScene3d,
    handleCaptureFastDirector,
    handleDeleteFastDirectorCapture,
    handleAddFastReferenceImage,
    handleAddFastReferenceImagesFromHistory,
    handleReplaceFastReferenceImageFromHistory,
    handleAddFastReferenceVideosFromHistory,
    handleReplaceFastReferenceVideoFromHistory,
    handleAddFastReferenceAudiosFromHistory,
    handleReplaceFastReferenceAudioFromHistory,
    handleAddFastReferenceFiles,
    handleUploadFastReferenceImage,
    handlePasteFastReferenceImage,
    handleUpdateFastReferenceImage,
    handleRemoveFastReferenceImage,
    handleToggleFastReferenceSelection,
    handleAddFastReferenceVideo,
    handleUpdateFastReferenceVideo,
    handleRemoveFastReferenceVideo,
    handleToggleFastReferenceVideoSelection,
    handleAddFastReferenceAudio,
    handleUpdateFastReferenceAudio,
    handleRemoveFastReferenceAudio,
    handleToggleFastReferenceAudioSelection,
    handleGenerateFastPlan,
    handleUpdateFastScene,
    handleAddFastScene,
    handleDeleteFastScene,
    handleToggleFastSceneSelection,
    handleGenerateFastSceneImage,
    handleSkipFastStoryboard,
    handleUploadFastSceneImage,
    handleUpdateFastVideoPrompt,
    handleRegenerateFastVideoPrompt,
    handleUpdateFastExecutionConfig,
    handleUpdateFastSeedanceDraft,
    handleRefreshFastVideoTask,
    handleCancelFastVideoTask,
    handleSubmitFastVideo,
  };
}
