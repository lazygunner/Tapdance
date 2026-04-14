import React, { useState, useEffect, useRef } from 'react';
import packageMetadata from '../package.json';
import { Brief, Asset, Shot, Project, ProjectType, ModelSourceId, PromptLanguage, AspectRatio } from './types';
import type { SeedanceDraft, SeedanceOverlayTemplateId } from './features/seedance/types.ts';
import { generateBriefWithModel } from './services/modelService';
import { Key } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { defaultApiSettings, DEFAULT_MODEL_ROLE_META, formatConfiguredModelDisplay, formatModelPricing, getDefaultModelSource, getModelBillingRule, getModelPricingLabel, getModelRoleFromSourceId, getPricedModelEntries, getProviderDisplayLabel, getProviderModelCatalog, getProviderPromptLanguageCatalog, getUsdToCnyExchangeRate, resolveModelSource, type ModelProviderId, type ModelRole } from './services/apiConfig';
import { getProjectGroupImageAssets, getProjectGroupSummary, type ProjectGroupImageAsset, type ProjectGroupSummary } from './services/projectGroups.ts';
import { applyStyleGuideToPrompt, buildStyleGuideText, findStylePresetById, getStylePresets, matchStylePreset } from './services/styleCatalog';
import { FastFlowWorkspace } from './features/fastVideoFlow/components/FastFlowWorkspace.tsx';
import { createFastVideoFlowActions } from './features/fastVideoFlow/services/createFastVideoFlowActions.ts';
import { useSeedanceRuntime } from './features/fastVideoFlow/hooks/useSeedanceRuntime.ts';
import { FAST_FLOW_TEMPLATE_IDS, SEEDANCE_TEMPLATE_REGISTRY } from './features/seedance/config/seedanceTemplateRegistry.ts';
import { StudioMetricCard, StudioPage, StudioPageHeader, StudioPanel, StudioSelect } from './components/studio/StudioPrimitives.tsx';
import {
  AppChromeBar,
  ProjectDetailHeader,
  StudioSidebar,
  getWorkspaceSurfaceMeta,
  type WorkspaceCreateProjectDraft,
  type WorkspaceHomeViewMode,
  type WorkspaceThemeMode,
  type WorkspaceView,
} from './components/studio/WorkspaceViews.tsx';
import { useProjectActions } from './features/projects/hooks/useProjectActions.ts';
import { useProjectStorage } from './features/projects/hooks/useProjectStorage.ts';
import { createEmptyProject, isProjectDetailView, isProjectEmpty } from './features/projects/utils/projectLifecycle.ts';
import { normalizeProjectRecord, toProjectListEntry, upsertProjectListEntry } from './features/projects/utils/projectRecords.ts';
import { useAssetLibraryState } from './features/assetLibrary/hooks/useAssetLibraryState.ts';
import { applyLibraryItemUrlToProject, buildAssetLibraryStatusItems, countProjectMediaItems, type AssetLibraryStatusItem } from './features/assetLibrary/utils/assetLibraryItems.ts';
import { ProjectDetailPageActions } from './features/app/components/ProjectDetailPageActions.tsx';
import { ProjectOverviewWorkspace } from './features/app/components/ProjectOverviewWorkspace.tsx';
import { useModelInvocationLogs } from './features/app/hooks/useModelInvocationLogs.ts';
import { useProjectDetailNavigation } from './features/app/hooks/useProjectDetailNavigation.ts';
import { useThemeModeStorage } from './features/app/hooks/useThemeModeStorage.ts';
import { resetPersistedAppStateStore } from './features/app/services/appStateStore.ts';
import { StartupSplash } from './features/app/components/StartupSplash.tsx';
import { CreativeFlowWorkspace } from './features/creativeFlow/components/CreativeFlowWorkspace.tsx';
import { useAssetDetailActions } from './features/creativeFlow/hooks/useAssetDetailActions.ts';
import { useCreativeStyleContext } from './features/creativeFlow/hooks/useCreativeStyleContext.ts';
import { useCreativeFlowUiState } from './features/creativeFlow/hooks/useCreativeFlowUiState.ts';
import { useCreativeVideoPolling } from './features/creativeFlow/hooks/useCreativeVideoPolling.ts';
import { ApiConfigWorkspace } from './features/apiConfig/components/ApiConfigWorkspace.tsx';
import { useApiSettingsStorage } from './features/apiConfig/hooks/useApiSettingsStorage.ts';
import { ImagePreviewModal } from './components/modals/ImagePreviewModal.tsx';
import { SeedanceErrorModal } from './components/modals/SeedanceErrorModal.tsx';
import { HistoryMaterialPickerModal } from './components/modals/HistoryMaterialPickerModal.tsx';
import { useModelSelectionPanels } from './features/modelSelection/hooks/useModelSelectionPanels.tsx';
import {
  GEMINI_PROVIDER_MODEL_FIELDS,
  GEMINI_ROLE_SOURCE_OPTIONS,
  MODEL_ROLE_ORDER,
  PROMPT_LANGUAGE_FLAGS,
  PROVIDER_CARD_META,
  VOLCENGINE_PROVIDER_MODEL_FIELDS,
  VOLCENGINE_ROLE_FIELDS,
  VOLCENGINE_ROLE_SOURCE_IDS,
  type GeminiModelField,
  type VolcengineModelField,
} from './features/apiConfig/utils/apiConfigUi.ts';
import { clearModelInvocationLogs } from './services/modelInvocationLog.ts';
import {
  ASPECT_RATIO_OPTIONS,
  ASSET_TYPE_LABELS,
  CHARACTER_DETAIL_FIELDS,
  CHARACTER_TYPE_OPTIONS,
  PRODUCT_DETAIL_FIELDS,
  SCENE_DETAIL_FIELDS,
  createEmptyAssetDraft,
  getAspectRatioClass,
  getFrameEditPromptKey,
  getFrameEditTemplate,
  hasLastFramePrompt,
  normalizeCharacterType,
} from './features/creativeFlow/utils/creativeFlowHelpers.ts';
import { buildVideoExecutionPrompt, getShotVideoPromptBySource } from './features/creativeFlow/utils/videoPromptBuilders.ts';
import { createCreativeFlowActions } from './features/creativeFlow/services/createCreativeFlowActions.ts';
import { useFastVideoTaskPolling } from './features/fastVideoFlow/hooks/useFastVideoTaskPolling.ts';
import { canCancelFastVideoTask, getFastVideoDraftState } from './features/fastVideoFlow/utils/fastVideoTask.ts';
import { useOperationRegistry } from './features/app/hooks/useOperationRegistry.ts';
import { downloadMedia } from './features/app/utils/downloadMedia.ts';
import {
  getGeminiRoleModelOptions,
  getPromptLanguageBySourceId,
  getProviderRoleCatalogOptions,
  getSourceProviderKey,
  getVolcengineRoleModelOptions,
} from './features/modelSelection/utils/modelSelection.ts';

type View = WorkspaceView;
type ThemeMode = WorkspaceThemeMode;
type HomeViewMode = WorkspaceHomeViewMode;
type CreateProjectDraft = WorkspaceCreateProjectDraft;
const EMPTY_PROJECT_GROUPS: ProjectGroupSummary[] = [];
const EMPTY_ASSET_LIBRARY_ITEMS: AssetLibraryStatusItem[] = [];
const EMPTY_PROJECT_GROUP_IMAGE_ASSETS: ProjectGroupImageAsset[] = [];
const PROJECT_LIST_SYNC_DELAY_MS = 240;
const PROJECT_PERSIST_DELAY_MS = 800;
const STARTUP_SPLASH_SESSION_KEY = 'tapdance-startup-dismissed';
const MOCK_MODE_SESSION_KEY = 'tapdance-use-mock-mode';

const PROMPT_LANGUAGE_LABELS: Record<PromptLanguage, string> = {
  zh: '中文',
  en: 'English',
};

const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  'creative-video': '创意视频',
  'fast-video': '极速视频',
};

const isNonEmptyText = (value?: string | null) => Boolean(value && value.trim());

function getProjectTypeLabel(projectType: ProjectType): string {
  return PROJECT_TYPE_LABELS[projectType];
}

function shouldStartInMockMode(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.sessionStorage.getItem(MOCK_MODE_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export default function App() {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [showStartupSplash, setShowStartupSplash] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }

    try {
      return window.sessionStorage.getItem(STARTUP_SPLASH_SESSION_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const [useMockMode] = useState(shouldStartInMockMode);
  const [view, setView] = useState<View>('home');
  const [isReinitializingAppDatabase, setIsReinitializingAppDatabase] = useState(false);
  const { themeMode, setThemeMode, isThemeModeLoaded } = useThemeModeStorage('dark', isReinitializingAppDatabase);
  const { apiSettings, setApiSettings } = useApiSettingsStorage(isReinitializingAppDatabase);
  const { modelInvocationLogs } = useModelInvocationLogs();
  const [idea, setIdea] = useState('');
  const [isGeneratingBrief, setIsGeneratingBrief] = useState(false);
  const [isGeneratingShots, setIsGeneratingShots] = useState(false);

  const [project, setProject] = useState<Project>(createEmptyProject());
  const [homeViewMode, setHomeViewMode] = useState<HomeViewMode>('projects');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [createProjectDraft, setCreateProjectDraft] = useState<CreateProjectDraft | null>(null);
  const [generatingPrompts, setGeneratingPrompts] = useState<Record<string, boolean>>({});
  const [generatingImages, setGeneratingImages] = useState<Record<string, boolean>>({});
  const [generatingAssetImages, setGeneratingAssetImages] = useState<Record<string, boolean>>({});
  const [generatingAssetPrompts, setGeneratingAssetPrompts] = useState<Record<string, boolean>>({});
  const [translatingPrompts, setTranslatingPrompts] = useState<Record<string, boolean>>({});
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [seedanceErrorModal, setSeedanceErrorModal] = useState<null | {
    eyebrow?: string;
    title: string;
    message: string;
    detail?: string;
    action?: 'redo-images' | 'edit-references';
  }>(null);
  const [isAddingAsset, setIsAddingAsset] = useState(false);
  const [newAsset, setNewAsset] = useState<Partial<Asset>>(createEmptyAssetDraft());
  const [isGeneratingFastPlan, setIsGeneratingFastPlan] = useState(false);
  const [generatingFastSceneImages, setGeneratingFastSceneImages] = useState<Record<string, boolean>>({});
  const [isRegeneratingFastVideoPrompt, setIsRegeneratingFastVideoPrompt] = useState(false);
  const [isSubmittingFastVideo, setIsSubmittingFastVideo] = useState(false);
  const [isRefreshingFastVideoTask, setIsRefreshingFastVideoTask] = useState(false);
  const [isCancellingFastVideoTask, setIsCancellingFastVideoTask] = useState(false);
  const [appVersion, setAppVersion] = useState(packageMetadata.version);
  const isRefreshingFastVideoTaskRef = useRef(false);

  const openSeedanceErrorModal = (config: {
    eyebrow?: string;
    title: string;
    message: string;
    detail?: string;
    action?: 'redo-images' | 'edit-references';
  }) => {
    setSeedanceErrorModal(config);
  };
  const hasManualGeminiKey = apiSettings.gemini.apiKey.trim().length > 0;
  const usdToCnyRate = getUsdToCnyExchangeRate();
  const {
    stylePresets,
    inputAspectRatio,
    customStyleDescription,
    activeStylePreset,
    activeStyleGuide,
    withStyledPrompt,
    withStyledBrief,
    getAssetGenerationBrief,
    withStyledShot,
  } = useCreativeStyleContext(project);
  const isCreativeProject = project.projectType === 'creative-video';
  const {
    seedanceHealth,
    isRefreshingSeedanceHealth,
    refreshSeedanceHealth,
    getSeedanceArkModelMeta,
    buildSeedanceSubmitLogRequest,
    appendSeedanceLog,
  } = useSeedanceRuntime({
    apiSettings,
    project,
    useMockMode,
  });
  const { handleBackToHome } = useProjectDetailNavigation({
    view,
    isProjectDetailView,
    setView,
    setSelectedGroupId,
    homeView: 'home',
  });

  const { projects, setProjects, isLoaded } = useProjectStorage({
    project,
    view,
    isProjectDetailView,
    isProjectEmpty,
    toProjectListEntry,
    upsertProjectListEntry,
    projectListSyncDelayMs: PROJECT_LIST_SYNC_DELAY_MS,
    projectPersistDelayMs: PROJECT_PERSIST_DELAY_MS,
    suspendPersistence: isReinitializingAppDatabase,
  });
  const shouldComputeProjectGroups = view === 'home' || view === 'groupDetail' || createProjectDraft !== null;
  const projectGroups = shouldComputeProjectGroups ? getProjectGroupSummary(projects) : EMPTY_PROJECT_GROUPS;
  const projectMediaCounts = countProjectMediaItems(projects);
  const shouldComputeAssetLibraryItems = view === 'assetLibrary';
  const assetLibraryItems = shouldComputeAssetLibraryItems ? buildAssetLibraryStatusItems(projects) : EMPTY_ASSET_LIBRARY_ITEMS;
  const libraryImageItems = shouldComputeAssetLibraryItems ? assetLibraryItems.filter((item) => item.kind === 'image') : EMPTY_ASSET_LIBRARY_ITEMS;
  const libraryVideoItems = shouldComputeAssetLibraryItems ? assetLibraryItems.filter((item) => item.kind === 'video') : EMPTY_ASSET_LIBRARY_ITEMS;
  const savedAssetLibraryCount = shouldComputeAssetLibraryItems ? assetLibraryItems.filter((item) => item.savedToLibrary).length : 0;
  const unsavedAssetLibraryCount = shouldComputeAssetLibraryItems ? assetLibraryItems.length - savedAssetLibraryCount : 0;
  const shouldComputeCurrentGroupImageAssets = project.projectType === 'creative-video'
    && Boolean(project.groupId);
  const currentGroupImageAssets = shouldComputeCurrentGroupImageAssets
    ? getProjectGroupImageAssets(project.groupId || '', projects)
    : EMPTY_PROJECT_GROUP_IMAGE_ASSETS;
  const {
    frameEditPrompts,
    setFrameEditPrompts,
    historyMaterialPicker,
    setHistoryMaterialPicker,
    draggingShotId,
    setDraggingShotId,
    dragOverShotId,
    setDragOverShotId,
    videoSectionRefs,
    transitionSectionRefs,
    scrollToVideoSection,
    scrollToTransitionSection,
    historyMaterialTargetShot,
    availableHistoryMaterials,
  } = useCreativeFlowUiState(project, currentGroupImageAssets);
  const {
    startNewProject,
    confirmCreateProject,
    openProject,
    updateProjectRecord,
    updateGroupName,
    handleDeleteProject,
  } = useProjectActions({
    apiSettings,
    project,
    projects,
    projectGroups,
    createProjectDraft,
    setProject,
    setProjects,
    setIdea,
    setView,
    setCreateProjectDraft,
  });

  const setFastFlow = (updater: (current: Project['fastFlow']) => Project['fastFlow']) => {
    setProject((prev) => ({
      ...prev,
      fastFlow: updater(prev.fastFlow),
    }));
  };

  const {
    isOperationCancelPending,
    hasPendingOperationCancel,
    setOperationCancelPending,
    setOperationRecord,
    getOperationRecord,
    findLoggedShotVideoOperation,
    findLoggedTransitionVideoOperation,
  } = useOperationRegistry(modelInvocationLogs);

  const {
    assetLibraryConfig,
    assetLibraryRootDraft,
    isRefreshingAssetLibraryConfig,
    isSavingAssetLibraryConfig,
    savingAssetLibraryItems,
    isSyncingAssetLibrary,
    setAssetLibraryRootDraft,
    refreshAssetLibrarySettings,
    persistGeneratedMediaUrl,
    persistAssetLibraryItem,
    handleApplyAssetLibraryRoot,
    handleSyncAssetLibrary,
  } = useAssetLibraryState({
    apiBaseUrl: apiSettings.seedance.bridgeUrl,
    project,
    useMockMode,
    assetLibraryItems,
    applyLibraryItemToProjectRecord: (projectId, itemId, nextUrl) => {
      updateProjectRecord(projectId, (current) => applyLibraryItemUrlToProject(current, itemId, nextUrl));
    },
  });
  const {
    updateNewAssetCharacterDetail,
    updateAssetCharacterDetail,
    updateNewAssetSceneDetail,
    updateAssetSceneDetail,
    updateNewAssetProductDetail,
    updateAssetProductDetail,
  } = useAssetDetailActions({
    setProject,
    setNewAsset,
  });

  const downloadTextFile = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('读取图片失败。'));
    reader.readAsDataURL(file);
  });

  const updateGeminiRoleModel = (role: ModelRole, modelId: string) => {
    setApiSettings((prev) => {
      if (role === 'image') {
        return {
          ...prev,
          gemini: {
            ...prev.gemini,
            imageModel: modelId,
            proImageModel: modelId,
          },
        };
      }

      if (role === 'video') {
        return {
          ...prev,
          gemini: {
            ...prev.gemini,
            fastVideoModel: modelId,
            proVideoModel: modelId,
          },
        };
      }

      return {
        ...prev,
        gemini: {
          ...prev.gemini,
          textModel: modelId,
        },
      };
    });
  };

  const {
    getTextModelSourceId,
    getTextModelName,
    getOperationSourceId,
    getOperationModelName,
    getVideoCostUnits,
    getTransitionVideoConfig,
    renderTimelineStrip,
    renderOperationModelPanel,
    renderCompactOperationModelPanel,
    resetFlowModelOverrides,
  } = useModelSelectionPanels({
    apiSettings,
    themeMode,
    shots: project.shots,
    defaultAspectRatio: project.brief?.aspectRatio || '16:9',
  });

  const {
    handleFastInputChange,
    handleAddFastReferenceImage,
    handleUploadFastReferenceImage,
    handlePasteFastReferenceImage,
    handleUpdateFastReferenceImage,
    handleRemoveFastReferenceImage,
    handleToggleFastReferenceSelection,
    handleAddFastReferenceVideo,
    handleUpdateFastReferenceVideo,
    handleRemoveFastReferenceVideo,
    handleToggleFastReferenceVideoSelection,
    handleGenerateFastPlan,
    handleUpdateFastScene,
    handleToggleFastSceneLock,
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
  } = createFastVideoFlowActions({
    apiSettings,
    project,
    useMockMode,
    isRefreshingFastVideoTaskRef,
    setProject,
    setFastFlow,
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
  });

  useCreativeVideoPolling({
    project,
    useMockMode,
    seedanceBridgeUrl: apiSettings.seedance.bridgeUrl,
    setProject,
    getOperationRecord,
    setOperationRecord,
    persistGeneratedMediaUrl,
  });

  useFastVideoTaskPolling({
    taskId: project.fastFlow.task.taskId,
    submitId: project.fastFlow.task.submitId,
    status: project.fastFlow.task.status,
    pollIntervalSec: project.fastFlow.executionConfig.pollIntervalSec,
    onRefreshTask: handleRefreshFastVideoTask,
  });

  useEffect(() => {
    const checkKey = async () => {
      // In Electron, we assume the user might have provided a key in config or env
      // but we still let the UI decide if it wants to show the block.
      // For now, if it's Electron, we can be more lenient or check local storage.
      if (typeof window !== 'undefined' && (window as any).electronAPI?.isElectron) {
        setHasKey(true);
        return;
      }
      
      try {
        if ((window as any).aistudio && (window as any).aistudio.hasSelectedApiKey) {
          const has = await (window as any).aistudio.hasSelectedApiKey();
          setHasKey(has);
        } else {
          setHasKey(true); // Fallback if not in AI Studio
        }
      } catch (e) {
        setHasKey(true);
      }
    };
    checkKey();
  }, []);

  useEffect(() => {
    if (!['apiConfig', 'fastInput', 'fastStoryboard', 'fastVideo'].includes(view)) {
      return;
    }

    void refreshSeedanceHealth();
  }, [view, useMockMode, apiSettings.seedance.bridgeUrl]);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    void refreshAssetLibrarySettings();
  }, [isLoaded, apiSettings.seedance.bridgeUrl]);

  const handleSelectKey = async () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.isElectron) {
      setView('apiConfig');
      return;
    }

    try {
      if ((window as any).aistudio && (window as any).aistudio.openSelectKey) {
        await (window as any).aistudio.openSelectKey();
        setHasKey(true); // Assume success to avoid race condition
      }
    } catch (e) {
      console.error('Failed to open key selection dialog', e);
    }
  };

  const handleEnterStartupSplash = () => {
    try {
      window.sessionStorage.setItem(STARTUP_SPLASH_SESSION_KEY, '1');
    } catch {
      // Ignore session storage failures and continue into the app.
    }

    setShowStartupSplash(false);
  };
  const startupSplashOverlay = showStartupSplash
    ? <StartupSplash onEnter={handleEnterStartupSplash} />
    : null;

  useEffect(() => {
    if (!isThemeModeLoaded || typeof window === 'undefined' || !window.electronAPI?.isElectron) {
      return;
    }

    void window.electronAPI.setWindowAppearance(themeMode).catch((error) => {
      console.error('Failed to sync Electron window appearance', error);
    });
  }, [isThemeModeLoaded, themeMode]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI?.isElectron) {
      return;
    }

    let cancelled = false;

    void window.electronAPI.getAppVersion().then((version) => {
      if (!cancelled && version) {
        setAppVersion(version);
      }
    }).catch((error) => {
      console.error('Failed to load app version', error);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (hasKey === null) {
    return (
      <>
        <div className={`theme-${themeMode} app-shell flex h-screen text-zinc-100 font-sans items-center justify-center`}>
          <img src="./assets/loading.gif" alt="" className="w-20 h-20 opacity-80" />
        </div>
        {startupSplashOverlay}
      </>
    );
  }

  if (hasKey === false && !hasManualGeminiKey && view !== 'apiConfig') {
    return (
      <>
        <div className={`theme-${themeMode} app-shell flex h-screen text-zinc-100 font-sans items-center justify-center p-4`}>
          <div className="bg-zinc-900 p-8 rounded-xl border border-zinc-800 max-w-md text-center w-full">
            <div className="w-16 h-16 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Key className="w-8 h-8 text-indigo-500" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-4">需要 API Key</h2>
            <p className="text-zinc-400 mb-8 leading-relaxed">
              此应用程序需要可用的 Gemini API Key。你可以直接使用 AI Studio 选择的 Key，
              也可以进入 API 配置页填写手动 Key。
            </p>
            <div className="space-y-3">
              <button
                onClick={handleSelectKey}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg font-medium transition-colors w-full flex items-center justify-center gap-2"
              >
                <Key className="w-4 h-4" />
                选择 AI Studio Key
              </button>
              <button
                onClick={() => setView('apiConfig')}
                className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-3 rounded-lg font-medium transition-colors w-full flex items-center justify-center gap-2"
              >
                <Key className="w-4 h-4" />
                打开 API 配置
              </button>
            </div>
            <p className="text-xs text-zinc-500 mt-6">
              当前功能已接入 Gemini；火山云配置页已接入 API Key 和模型接入点字段。<br />
              <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline mt-1 inline-block">
                了解 Gemini 计费
              </a>
            </p>
          </div>
        </div>
        {startupSplashOverlay}
      </>
    );
  }

  const handleGenerateBrief = async () => {
    if (!idea.trim()) return;
    setIsGeneratingBrief(true);
    try {
      const manualStyle = customStyleDescription ? undefined : findStylePresetById(project.selectedStyleId);
      const matchedStyle = customStyleDescription ? undefined : (manualStyle || matchStylePreset(idea));
      const brief = await generateBriefWithModel(idea, getTextModelName(), useMockMode, getTextModelSourceId());
      const finalAspectRatio = inputAspectRatio;
      const styledBrief: Brief = {
        ...brief,
        style: customStyleDescription ? (brief.style || '自定义风格') : (matchedStyle?.name || brief.style),
        stylePresetId: matchedStyle?.id,
        stylePrompt: customStyleDescription || buildStyleGuideText(matchedStyle),
        aspectRatio: finalAspectRatio,
      };
      const characterAssets: Asset[] = styledBrief.characters.map((name) => ({
        id: crypto.randomUUID(),
        type: 'character',
        name,
        description: '',
        characterPrompt: { characterType: 'human' },
      }));
      const sceneAssets: Asset[] = styledBrief.scenes.map((name) => ({
        id: crypto.randomUUID(),
        type: 'scene',
        name,
        description: '',
        scenePrompt: {},
      }));
      const newAssets: Asset[] = [...characterAssets, ...sceneAssets];
      setProject(prev => ({
        ...prev,
        projectType: 'creative-video',
        idea,
        selectedStyleId: matchedStyle?.id || prev.selectedStyleId,
        styleSelectionMode: customStyleDescription ? 'custom' : manualStyle ? 'manual' : 'auto',
        inputAspectRatio: finalAspectRatio,
        brief: styledBrief,
        name: prev.nameCustomized ? prev.name : `${styledBrief.theme} 项目`,
        assets: newAssets,
      }));
      setView('brief');
    } catch (error: any) {
      console.error('Failed to generate brief:', error);
      if (error?.message?.includes('Requested entity was not found') || error?.message?.includes('PERMISSION_DENIED') || error?.status === 403 || error?.message?.includes('403')) {
        setHasKey(false);
      } else {
        alert('生成简报失败，请查看控制台。');
      }
    } finally {
      setIsGeneratingBrief(false);
    }
  };

  const handleNavigatePrimaryView = (targetView: 'home' | 'assetLibrary' | 'portraitLibrary') => {
    setSelectedGroupId(null);

    if (targetView === 'home') {
      setHomeViewMode('projects');
      setView('home');
      return;
    }

    setView(targetView);
  };

  const handleProjectNameChange = (value: string) => {
    setProject((prev) => ({
      ...prev,
      name: value,
      nameCustomized: Boolean(value.trim()),
    }));
  };

  const handleProjectGroupNameChange = (value: string) => {
    if (project.groupId) {
      updateGroupName(project.groupId, value);
      return;
    }
    setProject((prev) => ({
      ...prev,
      groupName: value,
    }));
  };

  const {
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
  } = createCreativeFlowActions({
    apiSettings,
    project,
    newAsset,
    frameEditPrompts,
    currentGroupImageAssets,
    useMockMode,
    isCreativeProject,
    setProject,
    setView: (nextView) => setView(nextView),
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
    getPromptLanguageBySourceId: (sourceId) => getPromptLanguageBySourceId(apiSettings, sourceId),
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
  });

  const { draftIssues } = getFastVideoDraftState(project);
  const currentSurfaceMeta = getWorkspaceSurfaceMeta(view, project);
  const handleInitializeAppDatabase = async () => {
    if (isReinitializingAppDatabase) {
      return;
    }

    setIsReinitializingAppDatabase(true);

    try {
      clearModelInvocationLogs();
      await resetPersistedAppStateStore(apiSettings.seedance.bridgeUrl);
      window.location.reload();
    } catch (error) {
      console.error('Failed to reinitialize app database', error);
      alert(error instanceof Error ? error.message : '初始化数据库失败，请稍后重试。');
      setIsReinitializingAppDatabase(false);
    }
  };

  const currentWorkspace = view === 'apiConfig'
    ? (
      <ApiConfigWorkspace
        apiSettings={apiSettings}
        setApiSettings={setApiSettings}
        seedanceHealth={seedanceHealth}
        isRefreshingSeedanceHealth={isRefreshingSeedanceHealth}
        onRefreshSeedanceHealth={() => void refreshSeedanceHealth()}
        usdToCnyRate={usdToCnyRate}
        modelInvocationLogs={modelInvocationLogs}
        onRestoreDefaults={() => {
          setApiSettings(defaultApiSettings);
          resetFlowModelOverrides();
        }}
        onInitializeDatabase={() => void handleInitializeAppDatabase()}
        isInitializingDatabase={isReinitializingAppDatabase}
        getSourceProviderKey={getSourceProviderKey}
        getGeminiRoleModelOptions={(role) => getGeminiRoleModelOptions(apiSettings, role)}
        getVolcengineRoleModelOptions={(role) => getVolcengineRoleModelOptions(apiSettings, role)}
        getProviderRoleCatalogOptions={(currentApiSettings, providerId, role, configuredValue) => getProviderRoleCatalogOptions(currentApiSettings, providerId, role, configuredValue)}
        updateGeminiRoleModel={updateGeminiRoleModel}
      />
    )
    : view === 'fastInput' || view === 'fastStoryboard' || view === 'fastVideo'
      ? (
        <FastFlowWorkspace
          view={view}
          project={project}
          themeMode={themeMode}
          tosConfig={apiSettings.tos}
          seedanceHealth={seedanceHealth}
          isRefreshingSeedanceHealth={isRefreshingSeedanceHealth}
          isGeneratingFastPlan={isGeneratingFastPlan}
          generatingFastSceneImages={generatingFastSceneImages}
          isSubmittingFastVideo={isSubmittingFastVideo}
          isRefreshingFastVideoTask={isRefreshingFastVideoTask}
          isCancellingFastVideoTask={isCancellingFastVideoTask}
          isRegeneratingFastVideoPrompt={isRegeneratingFastVideoPrompt}
          operationPanel={renderOperationModelPanel('fast-plan', 'text')}
          renderImageModelPanel={(sceneId) => renderCompactOperationModelPanel(`fast-scene-image-${sceneId}`, 'image')}
          onRefreshSeedanceHealth={() => void refreshSeedanceHealth()}
          onChangeFastInput={handleFastInputChange}
          onGenerateFastPlan={() => void handleGenerateFastPlan()}
          onGoFastVideo={() => setView('fastVideo')}
          onOpenApiConfig={() => setView('apiConfig')}
          onAddReferenceImage={handleAddFastReferenceImage}
          onUploadReferenceImage={handleUploadFastReferenceImage}
          onPasteReferenceImage={handlePasteFastReferenceImage}
          onUpdateReferenceImage={handleUpdateFastReferenceImage}
          onRemoveReferenceImage={handleRemoveFastReferenceImage}
          onAddReferenceVideo={handleAddFastReferenceVideo}
          onUpdateReferenceVideo={handleUpdateFastReferenceVideo}
          onRemoveReferenceVideo={handleRemoveFastReferenceVideo}
          onToggleReferenceVideoSelection={handleToggleFastReferenceVideoSelection}
          onUpdateScene={handleUpdateFastScene}
          onGenerateSceneImage={handleGenerateFastSceneImage}
          onToggleSceneLock={handleToggleFastSceneLock}
          onUploadSceneImage={handleUploadFastSceneImage}
          onPreviewImage={setPreviewImage}
          onSkipStoryboard={handleSkipFastStoryboard}
          onUpdatePrompt={handleUpdateFastVideoPrompt}
          onUpdateDraft={handleUpdateFastSeedanceDraft}
          onUpdateExecutionConfig={handleUpdateFastExecutionConfig}
          onRegeneratePrompt={handleRegenerateFastVideoPrompt}
          onSubmit={handleSubmitFastVideo}
          onRefreshStatus={() => void handleRefreshFastVideoTask()}
          onCancelTask={() => void handleCancelFastVideoTask()}
          onToggleReferenceSelection={handleToggleFastReferenceSelection}
          onToggleSceneSelection={handleToggleFastSceneSelection}
        />
      )
      : view === 'home' || view === 'groupDetail' || view === 'assetLibrary' || view === 'portraitLibrary'
        ? (
          <ProjectOverviewWorkspace
            view={view}
            themeMode={themeMode}
            projects={projects}
            projectGroups={projectGroups}
            homeViewMode={homeViewMode}
            setHomeViewMode={setHomeViewMode}
            createProjectDraft={createProjectDraft}
            setCreateProjectDraft={setCreateProjectDraft}
            startNewProject={startNewProject}
            confirmCreateProject={confirmCreateProject}
            selectedGroupId={selectedGroupId}
            onOpenGroupDetail={(groupId) => {
              setSelectedGroupId(groupId);
              setView('groupDetail');
            }}
            onBackFromGroupDetail={() => {
              setHomeViewMode('groups');
              setSelectedGroupId(null);
              setView('home');
            }}
            onUpdateGroupName={updateGroupName}
            onPreviewImage={setPreviewImage}
            onOpenProject={openProject}
            onDeleteProject={handleDeleteProject}
            getProjectTypeLabel={getProjectTypeLabel}
            assetLibraryItems={assetLibraryItems}
            libraryImageCount={libraryImageItems.length}
            libraryVideoCount={libraryVideoItems.length}
            savedAssetLibraryCount={savedAssetLibraryCount}
            unsavedAssetLibraryCount={unsavedAssetLibraryCount}
            assetLibraryConfig={assetLibraryConfig}
            assetLibraryRootDraft={assetLibraryRootDraft}
            isRefreshingAssetLibraryConfig={isRefreshingAssetLibraryConfig}
            isSavingAssetLibraryConfig={isSavingAssetLibraryConfig}
            isSyncingAssetLibrary={isSyncingAssetLibrary}
            savingAssetLibraryItems={savingAssetLibraryItems}
            onAssetLibraryRootDraftChange={setAssetLibraryRootDraft}
            onRefreshAssetLibrarySettings={() => void refreshAssetLibrarySettings()}
            onApplyAssetLibraryRoot={(rootPath) => void handleApplyAssetLibraryRoot(rootPath)}
            onSyncAssetLibrary={() => void handleSyncAssetLibrary()}
            onPersistAssetLibraryItem={(item) => void persistAssetLibraryItem(item)}
            onOpenProjectById={(projectId) => {
              const linkedProject = projects.find((candidate) => candidate.id === projectId);
              if (linkedProject) {
                void openProject(linkedProject);
              }
            }}
          />
        )
        : (
          <CreativeFlowWorkspace
            view={view}
            project={project}
            idea={idea}
            inputAspectRatio={inputAspectRatio}
            themeMode={themeMode}
            activeStylePreset={activeStylePreset}
            stylePresets={stylePresets}
            newAsset={newAsset}
            isGeneratingBrief={isGeneratingBrief}
            isAddingAsset={isAddingAsset}
            isGeneratingShots={isGeneratingShots}
            generatingAssetImages={generatingAssetImages}
            generatingAssetPrompts={generatingAssetPrompts}
            currentGroupImageAssets={currentGroupImageAssets}
            dragOverShotId={dragOverShotId}
            draggingShotId={draggingShotId}
            generatingPrompts={generatingPrompts}
            generatingImages={generatingImages}
            translatingPrompts={translatingPrompts}
            frameEditPrompts={frameEditPrompts}
            videoSectionRefs={videoSectionRefs}
            transitionSectionRefs={transitionSectionRefs}
            setProject={setProject}
            setPreviewImage={setPreviewImage}
            setNewAsset={setNewAsset}
            setIsAddingAsset={setIsAddingAsset}
            setDragOverShotId={setDragOverShotId}
            setDraggingShotId={setDraggingShotId}
            setFrameEditPrompts={setFrameEditPrompts}
            setHistoryMaterialPicker={setHistoryMaterialPicker}
            renderOperationModelPanel={renderOperationModelPanel}
            renderTimelineStrip={renderTimelineStrip}
            getTransitionVideoConfig={getTransitionVideoConfig}
            getVideoCostUnits={getVideoCostUnits}
            getOperationSourceId={getOperationSourceId}
            getPromptLanguageBySourceId={(sourceId) => getPromptLanguageBySourceId(apiSettings, sourceId)}
            isOperationCancelPending={isOperationCancelPending}
            scrollToVideoSection={scrollToVideoSection}
            scrollToTransitionSection={scrollToTransitionSection}
            onIdeaChange={setIdea}
            onGenerateBrief={() => void handleGenerateBrief()}
            onInputAspectRatioChange={(value) => setProject((prev) => ({ ...prev, inputAspectRatio: value }))}
            onClearStyle={() => setProject((prev) => ({ ...prev, selectedStyleId: '', customStyleDescription: '', styleSelectionMode: 'auto' }))}
            onCustomStyleDescriptionChange={(value) => setProject((prev) => ({
              ...prev,
              customStyleDescription: value,
              styleSelectionMode: value.trim() ? 'custom' : (prev.selectedStyleId ? 'manual' : 'auto'),
            }))}
            onSelectStylePreset={(styleId) => setProject((prev) => ({ ...prev, selectedStyleId: styleId, customStyleDescription: '', styleSelectionMode: 'manual' }))}
            onGenerateShots={handleGenerateShots}
            onGenerateAssetPrompt={handleGenerateAssetPrompt}
            onGenerateAssetImage={handleGenerateAssetImage}
            onFileUpload={handleFileUpload}
            onAddAsset={handleAddAsset}
            onUpdateNewAssetCharacterDetail={updateNewAssetCharacterDetail}
            onUpdateAssetCharacterDetail={updateAssetCharacterDetail}
            onUpdateNewAssetSceneDetail={updateNewAssetSceneDetail}
            onUpdateAssetSceneDetail={updateAssetSceneDetail}
            onUpdateNewAssetProductDetail={updateNewAssetProductDetail}
            onUpdateAssetProductDetail={updateAssetProductDetail}
            onReorderShots={handleReorderShots}
            onGeneratePrompts={handleGeneratePrompts}
            onGenerateTransitionPrompt={handleGenerateTransitionPrompt}
            onGenerateFirstFrame={handleGenerateFirstFrame}
            onGenerateLastFrame={handleGenerateLastFrame}
            onUploadFirstFrame={handleUploadFirstFrame}
            onUploadLastFrame={handleUploadLastFrame}
            onTranslatePrompts={handleTranslatePrompts}
            onToggleShotGroupReferenceImage={toggleShotGroupReferenceImage}
            onModifyFrameFromCurrentImage={handleModifyFrameFromCurrentImage}
            onProceedToVideos={() => setView('videos')}
            onGenerateVideo={handleGenerateVideo}
            onCancelVideo={handleCancelVideo}
            onRegenerateVideoPrompts={handleRegenerateVideoPrompts}
            onGenerateTransitionVideo={handleGenerateTransitionVideo}
            onCancelTransitionVideo={handleCancelTransitionVideo}
          />
        );

  return (
    <div className={`theme-${themeMode} app-shell flex h-screen flex-col text-zinc-100 font-sans overflow-hidden`}>
      <div className="studio-backdrop">
        <div className="studio-orb studio-orb-1" />
        <div className="studio-orb studio-orb-2" />
        <div className="studio-orb studio-orb-3" />
      </div>
      <AppChromeBar version={`v${appVersion}`} />
      <div className="app-workspace">
        <StudioSidebar
          view={view}
          projectCount={projects.length}
          mediaCount={projectMediaCounts.total}
          themeMode={themeMode}
          onNavigate={handleNavigatePrimaryView}
          onThemeModeChange={setThemeMode}
          onOpenApiConfig={() => setView('apiConfig')}
        />
        <main className="app-main flex-1 overflow-y-auto">
          <div className="px-4 sm:px-6 xl:px-8">
            {isProjectDetailView(view) ? (
              <div className="w-full pt-6">
                <ProjectDetailHeader
                  project={project}
                  activeView={view}
                  onGoHome={handleBackToHome}
                  onSelectView={setView}
                  onProjectNameChange={handleProjectNameChange}
                  onProjectGroupNameChange={handleProjectGroupNameChange}
                  pageEyebrow={currentSurfaceMeta.eyebrow}
                  pageTitle={currentSurfaceMeta.title}
                  pageDescription={currentSurfaceMeta.description}
                  pageActions={(
                    <ProjectDetailPageActions
                      view={view}
                      project={project}
                      draftIssueCount={draftIssues.length}
                      isGeneratingFastPlan={isGeneratingFastPlan}
                      isSubmittingFastVideo={isSubmittingFastVideo}
                      isRefreshingFastVideoTask={isRefreshingFastVideoTask}
                      isCancellingFastVideoTask={isCancellingFastVideoTask}
                      onGenerateFastPlan={() => void handleGenerateFastPlan()}
                      onGoFastVideo={() => setView('fastVideo')}
                      onSkipFastStoryboard={handleSkipFastStoryboard}
                      onSubmitFastVideo={() => void handleSubmitFastVideo()}
                      onCancelFastVideoTask={() => void handleCancelFastVideoTask()}
                    />
                  )}
                />
              </div>
            ) : null}
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                {currentWorkspace}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      <ImagePreviewModal
        previewImage={previewImage}
        onClose={() => setPreviewImage(null)}
        onDownload={downloadMedia}
      />

      <SeedanceErrorModal
        themeMode={themeMode}
        seedanceErrorModal={seedanceErrorModal}
        onClose={() => setSeedanceErrorModal(null)}
        onAction={(action) => {
          setSeedanceErrorModal(null);
          if (action === 'redo-images') {
            setView('fastStoryboard');
            return;
          }
          setView('fastInput');
        }}
      />

      <HistoryMaterialPickerModal
        themeMode={themeMode}
        historyMaterialPicker={historyMaterialPicker}
        historyMaterialTargetShot={historyMaterialTargetShot}
        availableHistoryMaterials={availableHistoryMaterials}
        onClose={() => setHistoryMaterialPicker(null)}
        onSelectImage={(imageUrl) => {
          if (!historyMaterialPicker || !historyMaterialTargetShot) {
            return;
          }
          setProject((prev) => ({
            ...prev,
            shots: prev.shots.map((shot) => shot.id === historyMaterialTargetShot.id
              ? {
                ...shot,
                ...(historyMaterialPicker.frameType === 'first'
                  ? { imageUrl }
                  : { lastFrameImageUrl: imageUrl }),
              }
              : shot),
          }));
          setHistoryMaterialPicker(null);
        }}
      />
      {startupSplashOverlay}
    </div>
  );
}
