import type { ChangeEvent, Dispatch, MutableRefObject, ReactNode, SetStateAction } from 'react';

import type { StylePreset } from '../../../services/styleCatalog.ts';
import type { ProjectGroupImageAsset } from '../../../services/projectGroups.ts';
import { copyAssetLibraryFilesToDownloads } from '../../../services/assetLibrary.ts';
import type { AspectRatio, Asset, ModelSourceId, Project, PromptLanguage, Shot, VideoConfig } from '../../../types.ts';
import type { WorkspaceThemeMode, WorkspaceView } from '../../../components/studio/WorkspaceViews.tsx';
import { downloadMedia } from '../../app/utils/downloadMedia.ts';
import { ASPECT_RATIO_OPTIONS } from '../utils/creativeFlowHelpers.ts';
import type { CharacterPrompt, ProductPrompt } from '../utils/creativeFlowHelpers.ts';
import { CreativeInputPage } from './CreativeInputPage.tsx';
import { CreativeBriefPage } from './CreativeBriefPage.tsx';
import { CreativeShotsPage } from './CreativeShotsPage.tsx';
import { CreativeTimelinePage } from './CreativeTimelinePage.tsx';
import { CreativeVideosPage } from './CreativeVideosPage.tsx';

type HistoryMaterialPickerState = {
  shotId: string;
  frameType: 'first' | 'last';
} | null;

type OperationCostUnits = {
  seconds?: number;
  resolution?: '480p' | '720p' | '1080p';
  frameRate?: number;
  aspectRatio?: AspectRatio;
};

type CreativeFlowWorkspaceProps = {
  view: WorkspaceView;
  project: Project;
  idea: string;
  inputAspectRatio: AspectRatio;
  themeMode: WorkspaceThemeMode;
  activeStylePreset?: StylePreset;
  stylePresets: StylePreset[];
  newAsset: Partial<Asset>;
  isGeneratingBrief: boolean;
  isAddingAsset: boolean;
  isGeneratingShots: boolean;
  generatingAssetImages: Record<string, boolean>;
  generatingAssetPrompts: Record<string, boolean>;
  currentGroupImageAssets: ProjectGroupImageAsset[];
  dragOverShotId: string | null;
  draggingShotId: string | null;
  generatingPrompts: Record<string, boolean>;
  generatingImages: Record<string, boolean>;
  translatingPrompts: Record<string, boolean>;
  frameEditPrompts: Record<string, string>;
  videoSectionRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  transitionSectionRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  setProject: Dispatch<SetStateAction<Project>>;
  setPreviewImage: Dispatch<SetStateAction<string | null>>;
  setNewAsset: Dispatch<SetStateAction<Partial<Asset>>>;
  setIsAddingAsset: Dispatch<SetStateAction<boolean>>;
  setDragOverShotId: Dispatch<SetStateAction<string | null>>;
  setDraggingShotId: Dispatch<SetStateAction<string | null>>;
  setFrameEditPrompts: Dispatch<SetStateAction<Record<string, string>>>;
  setHistoryMaterialPicker: Dispatch<SetStateAction<HistoryMaterialPickerState>>;
  renderOperationModelPanel: (operationKey: string, category: 'text' | 'image' | 'video', units?: OperationCostUnits) => ReactNode;
  renderTimelineStrip: (options?: {
    interactive?: boolean;
    onShotClick?: (shotId: string) => void;
    onTransitionClick?: (fromShotId: string) => void;
  }) => ReactNode;
  getTransitionVideoConfig: (shot?: Shot) => { aspectRatio: AspectRatio; duration: number };
  getVideoCostUnits: (shot?: Shot) => OperationCostUnits;
  getOperationSourceId: (operationKey: string, category: 'text' | 'image' | 'video') => ModelSourceId;
  getPromptLanguageBySourceId: (sourceId: ModelSourceId) => PromptLanguage;
  isOperationCancelPending: (operationKey: string) => boolean;
  scrollToVideoSection: (shotId: string) => void;
  scrollToTransitionSection: (fromShotId: string) => void;
  onIdeaChange: (value: string) => void;
  onGenerateBrief: () => void | Promise<void>;
  onInputAspectRatioChange: (value: AspectRatio) => void;
  onClearStyle: () => void;
  onCustomStyleDescriptionChange: (value: string) => void;
  onSelectStylePreset: (styleId: string) => void;
  onGenerateShots: () => void | Promise<void>;
  onGenerateAssetPrompt: (asset: Asset) => void | Promise<void>;
  onGenerateAssetImage: (asset: Asset) => void | Promise<void>;
  onFileUpload: (event: ChangeEvent<HTMLInputElement>, assetId: string) => void | Promise<void>;
  onAddAsset: () => void | Promise<void>;
  onUpdateNewAssetCharacterDetail: (key: keyof CharacterPrompt, value: CharacterPrompt[keyof CharacterPrompt]) => void;
  onUpdateAssetCharacterDetail: (assetId: string, key: keyof CharacterPrompt, value: CharacterPrompt[keyof CharacterPrompt]) => void;
  onUpdateNewAssetSceneDetail: (key: keyof NonNullable<Asset['scenePrompt']>, value: string) => void;
  onUpdateAssetSceneDetail: (assetId: string, key: keyof NonNullable<Asset['scenePrompt']>, value: string) => void;
  onUpdateNewAssetProductDetail: (key: keyof ProductPrompt, value: ProductPrompt[keyof ProductPrompt]) => void;
  onUpdateAssetProductDetail: (assetId: string, key: keyof ProductPrompt, value: ProductPrompt[keyof ProductPrompt]) => void;
  onReorderShots: (draggedShotId: string, targetShotId: string) => void;
  onGeneratePrompts: (shotId: string) => void | Promise<void>;
  onGenerateTransitionPrompt: (shotId: string, nextShotId: string) => void | Promise<void>;
  onGenerateFirstFrame: (shotId: string) => void | Promise<void>;
  onGenerateLastFrame: (shotId: string) => void | Promise<void>;
  onUploadFirstFrame: (event: ChangeEvent<HTMLInputElement>, shotId: string) => void | Promise<void>;
  onUploadLastFrame: (event: ChangeEvent<HTMLInputElement>, shotId: string) => void | Promise<void>;
  onTranslatePrompts: (shotId: string) => void | Promise<void>;
  onToggleShotGroupReferenceImage: (shotId: string, imageId: string) => void;
  onModifyFrameFromCurrentImage: (shotId: string, frameType: 'first' | 'last') => void | Promise<void>;
  onProceedToVideos: () => void;
  onGenerateVideo: (shotId: string) => void | Promise<void>;
  onCancelVideo: (shotId: string) => void | Promise<void>;
  onRegenerateVideoPrompts: (shotId: string) => void | Promise<void>;
  onGenerateTransitionVideo: (shotId: string, nextShotId: string) => void | Promise<void>;
  onCancelTransitionVideo: (shotId: string) => void | Promise<void>;
};

export function CreativeFlowWorkspace({
  view,
  project,
  idea,
  inputAspectRatio,
  themeMode,
  activeStylePreset,
  stylePresets,
  newAsset,
  isGeneratingBrief,
  isAddingAsset,
  isGeneratingShots,
  generatingAssetImages,
  generatingAssetPrompts,
  currentGroupImageAssets,
  dragOverShotId,
  draggingShotId,
  generatingPrompts,
  generatingImages,
  translatingPrompts,
  frameEditPrompts,
  videoSectionRefs,
  transitionSectionRefs,
  setProject,
  setPreviewImage,
  setNewAsset,
  setIsAddingAsset,
  setDragOverShotId,
  setDraggingShotId,
  setFrameEditPrompts,
  setHistoryMaterialPicker,
  renderOperationModelPanel,
  renderTimelineStrip,
  getTransitionVideoConfig,
  getVideoCostUnits,
  getOperationSourceId,
  getPromptLanguageBySourceId,
  isOperationCancelPending,
  scrollToVideoSection,
  scrollToTransitionSection,
  onIdeaChange,
  onGenerateBrief,
  onInputAspectRatioChange,
  onClearStyle,
  onCustomStyleDescriptionChange,
  onSelectStylePreset,
  onGenerateShots,
  onGenerateAssetPrompt,
  onGenerateAssetImage,
  onFileUpload,
  onAddAsset,
  onUpdateNewAssetCharacterDetail,
  onUpdateAssetCharacterDetail,
  onUpdateNewAssetSceneDetail,
  onUpdateAssetSceneDetail,
  onUpdateNewAssetProductDetail,
  onUpdateAssetProductDetail,
  onReorderShots,
  onGeneratePrompts,
  onGenerateTransitionPrompt,
  onGenerateFirstFrame,
  onGenerateLastFrame,
  onUploadFirstFrame,
  onUploadLastFrame,
  onTranslatePrompts,
  onToggleShotGroupReferenceImage,
  onModifyFrameFromCurrentImage,
  onProceedToVideos,
  onGenerateVideo,
  onCancelVideo,
  onRegenerateVideoPrompts,
  onGenerateTransitionVideo,
  onCancelTransitionVideo,
}: CreativeFlowWorkspaceProps) {
  const handleDownloadImage = (url: string, filename: string) => {
    downloadMedia(url, filename);
  };

  const handleCopyVideosToDownloads = async (relativePaths: string[]) => {
    try {
      const result = await copyAssetLibraryFilesToDownloads({ relativePaths });
      alert(`已复制 ${result.copiedFiles.length} 个视频到下载目录。`);
    } catch (error: any) {
      alert(error?.message || '复制视频到下载目录失败。');
    }
  };

  const updateShotVideoConfig = (shotId: string, configUpdates: Partial<VideoConfig>) => {
    setProject((prev) => ({
      ...prev,
      shots: prev.shots.map((shot) => {
        if (shot.id !== shotId) {
          return shot;
        }

        const currentConfig = shot.videoConfig || {
          resolution: '720p',
          frameRate: 24,
          aspectRatio: prev.brief?.aspectRatio || '16:9',
          useFirstFrame: true,
          useLastFrame: true,
          useReferenceAssets: false,
          generateAudio: false,
          returnLastFrame: false,
          useWebSearch: false,
          watermark: false,
        };

        return { ...shot, videoConfig: { ...currentConfig, ...configUpdates } };
      }),
    }));
  };

  const updateTransitionVideoConfig = (
    shotId: string,
    updates: Partial<Pick<Shot, 'transitionVideoDuration' | 'transitionVideoAspectRatio' | 'transitionVideoConfig'>>,
  ) => {
    const normalizedUpdates = updates.transitionVideoDuration === undefined
      ? updates
      : {
        ...updates,
        transitionVideoDuration: Math.max(4, Math.round(Number(updates.transitionVideoDuration) || 4)),
      };

    setProject((prev) => ({
      ...prev,
      shots: prev.shots.map((shot) => (shot.id === shotId ? { ...shot, ...normalizedUpdates } : shot)),
    }));
  };

  if (view === 'input') {
    return (
      <CreativeInputPage
        idea={idea}
        isGeneratingBrief={isGeneratingBrief}
        inputAspectRatio={inputAspectRatio}
        customStyleDescription={project.customStyleDescription || ''}
        selectedStyleId={project.selectedStyleId || ''}
        activeStylePreset={activeStylePreset}
        stylePresets={stylePresets}
        aspectRatioOptions={ASPECT_RATIO_OPTIONS}
        onIdeaChange={onIdeaChange}
        onGenerateBrief={() => void onGenerateBrief()}
        onInputAspectRatioChange={onInputAspectRatioChange}
        onClearStyle={onClearStyle}
        onCustomStyleDescriptionChange={onCustomStyleDescriptionChange}
        onSelectStylePreset={onSelectStylePreset}
      />
    );
  }

  if (view === 'brief') {
    return (
      <CreativeBriefPage
        project={project}
        newAsset={newAsset}
        isAddingAsset={isAddingAsset}
        isGeneratingShots={isGeneratingShots}
        generatingAssetImages={generatingAssetImages}
        generatingAssetPrompts={generatingAssetPrompts}
        setProject={setProject}
        setPreviewImage={setPreviewImage}
        setNewAsset={setNewAsset}
        setIsAddingAsset={setIsAddingAsset}
        renderOperationModelPanel={renderOperationModelPanel}
        onGenerateShots={() => void onGenerateShots()}
        onDownloadImage={handleDownloadImage}
        onGenerateAssetPrompt={(asset) => void onGenerateAssetPrompt(asset)}
        onGenerateAssetImage={(asset) => void onGenerateAssetImage(asset)}
        onFileUpload={(event, assetId) => void onFileUpload(event, assetId)}
        onAddAsset={() => void onAddAsset()}
        onUpdateNewAssetCharacterDetail={onUpdateNewAssetCharacterDetail}
        onUpdateAssetCharacterDetail={onUpdateAssetCharacterDetail}
        onUpdateNewAssetSceneDetail={onUpdateNewAssetSceneDetail}
        onUpdateAssetSceneDetail={onUpdateAssetSceneDetail}
        onUpdateNewAssetProductDetail={onUpdateNewAssetProductDetail}
        onUpdateAssetProductDetail={onUpdateAssetProductDetail}
      />
    );
  }

  if (view === 'shots') {
    return (
      <CreativeShotsPage
        project={project}
        themeMode={themeMode}
        currentGroupImageAssets={currentGroupImageAssets}
        dragOverShotId={dragOverShotId}
        draggingShotId={draggingShotId}
        generatingPrompts={generatingPrompts}
        generatingImages={generatingImages}
        translatingPrompts={translatingPrompts}
        frameEditPrompts={frameEditPrompts}
        setProject={setProject}
        setPreviewImage={setPreviewImage}
        setDragOverShotId={setDragOverShotId}
        setDraggingShotId={setDraggingShotId}
        setFrameEditPrompts={setFrameEditPrompts}
        setHistoryMaterialPicker={setHistoryMaterialPicker}
        renderOperationModelPanel={renderOperationModelPanel}
        handleReorderShots={onReorderShots}
        handleGeneratePrompts={(shotId) => void onGeneratePrompts(shotId)}
        handleGenerateTransitionPrompt={(shotId, nextShotId) => void onGenerateTransitionPrompt(shotId, nextShotId)}
        handleGenerateFirstFrame={(shotId) => void onGenerateFirstFrame(shotId)}
        handleGenerateLastFrame={(shotId) => void onGenerateLastFrame(shotId)}
        handleUploadFirstFrame={(event, shotId) => void onUploadFirstFrame(event, shotId)}
        handleUploadLastFrame={(event, shotId) => void onUploadLastFrame(event, shotId)}
        handleTranslatePrompts={(shotId) => void onTranslatePrompts(shotId)}
        handleDownloadImage={handleDownloadImage}
        toggleShotGroupReferenceImage={onToggleShotGroupReferenceImage}
        handleModifyFrameFromCurrentImage={(shotId, frameType) => void onModifyFrameFromCurrentImage(shotId, frameType)}
      />
    );
  }

  if (view === 'timeline') {
    return (
      <CreativeTimelinePage
        project={project}
        renderTimelineStrip={() => renderTimelineStrip()}
        onProceedToVideos={onProceedToVideos}
      />
    );
  }

  if (view === 'videos') {
    return (
      <CreativeVideosPage
        project={project}
        themeMode={themeMode}
        generatingPrompts={generatingPrompts}
        videoSectionRefs={videoSectionRefs}
        transitionSectionRefs={transitionSectionRefs}
        setProject={setProject}
        setPreviewImage={setPreviewImage}
        renderTimelineStrip={renderTimelineStrip}
        renderOperationModelPanel={renderOperationModelPanel}
        getTransitionVideoConfig={getTransitionVideoConfig}
        getVideoCostUnits={getVideoCostUnits}
        getOperationSourceId={getOperationSourceId}
        getPromptLanguageBySourceId={getPromptLanguageBySourceId}
        isOperationCancelPending={isOperationCancelPending}
        scrollToVideoSection={scrollToVideoSection}
        scrollToTransitionSection={scrollToTransitionSection}
        updateShotVideoConfig={updateShotVideoConfig}
        updateTransitionVideoConfig={updateTransitionVideoConfig}
        handleGenerateVideo={(shotId) => void onGenerateVideo(shotId)}
        handleCancelVideo={(shotId) => void onCancelVideo(shotId)}
        handleRegenerateVideoPrompts={(shotId) => void onRegenerateVideoPrompts(shotId)}
        handleGenerateTransitionPrompt={(shotId, nextShotId) => void onGenerateTransitionPrompt(shotId, nextShotId)}
        handleGenerateTransitionVideo={(shotId, nextShotId) => void onGenerateTransitionVideo(shotId, nextShotId)}
        handleCancelTransitionVideo={(shotId) => void onCancelTransitionVideo(shotId)}
        onCopyVideosToDownloads={(relativePaths) => void handleCopyVideosToDownloads(relativePaths)}
      />
    );
  }

  return null;
}
