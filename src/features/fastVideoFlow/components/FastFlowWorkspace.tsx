import type { ChangeEvent, ReactNode } from 'react';

import type { ApiSettings, Project } from '../../../types.ts';
import type { ProjectGroupImageAsset, ProjectGroupMediaAsset } from '../../../services/projectGroups.ts';
import type { WorkspaceThemeMode, WorkspaceView } from '../../../components/studio/WorkspaceViews.tsx';
import type { SeedanceHealth, FastReferenceAudio, FastReferenceImage, FastReferenceVideo, FastSceneDraft, FastVideoInput, FastVideoPromptDraft } from '../types/fastTypes.ts';
import type { SeedanceDraft } from '../../seedance/types.ts';
import { FastInputView } from './FastInputView.tsx';
import { FastStoryboardView } from './FastStoryboardView.tsx';
import { FastVideoView } from './FastVideoView.tsx';
import { SeedanceHealthPanel } from './SeedanceHealthPanel.tsx';
import { canCancelFastVideoTask, getFastVideoDraftState } from '../utils/fastVideoTask.ts';

type FastFlowWorkspaceProps = {
  view: WorkspaceView;
  project: Project;
  themeMode: WorkspaceThemeMode;
  tosConfig: ApiSettings['tos'];
  historyImageMaterials: ProjectGroupImageAsset[];
  historyMediaMaterials: ProjectGroupMediaAsset[];
  seedanceHealth: SeedanceHealth | null;
  isRefreshingSeedanceHealth: boolean;
  isGeneratingFastPlan: boolean;
  generatingFastSceneImages: Record<string, boolean>;
  isSubmittingFastVideo: boolean;
  isRefreshingFastVideoTask: boolean;
  isCancellingFastVideoTask: boolean;
  isRegeneratingFastVideoPrompt: boolean;
  operationPanel: ReactNode;
  renderImageModelPanel: (sceneId: string) => ReactNode;
  onRefreshSeedanceHealth: () => void | Promise<void>;
  onChangeFastInput: (patch: Partial<FastVideoInput>) => void;
  onGenerateFastPlan: () => void | Promise<void>;
  onGoFastVideo: () => void;
  onOpenApiConfig: () => void;
  onAddReferenceImage: () => string | void;
  onAddReferenceImagesFromHistory: (materials: ProjectGroupImageAsset[]) => string[] | void;
  onReplaceReferenceImageFromHistory: (referenceId: string, material: ProjectGroupImageAsset) => void;
  onAddReferenceVideosFromHistory: (materials: ProjectGroupMediaAsset[]) => string[] | void;
  onReplaceReferenceVideoFromHistory: (referenceId: string, material: ProjectGroupMediaAsset) => void;
  onAddReferenceAudiosFromHistory: (materials: ProjectGroupMediaAsset[]) => string[] | void;
  onReplaceReferenceAudioFromHistory: (referenceId: string, material: ProjectGroupMediaAsset) => void;
  onUploadReferenceImage: (event: ChangeEvent<HTMLInputElement>, referenceId: string) => void | Promise<void>;
  onPasteReferenceImage: (file: File, referenceId: string) => void | Promise<void>;
  onUpdateReferenceImage: (referenceId: string, patch: Partial<FastReferenceImage>) => void;
  onRemoveReferenceImage: (referenceId: string) => void;
  onAddReferenceVideo: () => string | void;
  onUpdateReferenceVideo: (referenceId: string, patch: Partial<FastReferenceVideo>) => void;
  onRemoveReferenceVideo: (referenceId: string) => void;
  onToggleReferenceVideoSelection: (referenceId: string) => void;
  onAddReferenceAudio: () => string | void;
  onUpdateReferenceAudio: (referenceId: string, patch: Partial<FastReferenceAudio>) => void;
  onRemoveReferenceAudio: (referenceId: string) => void;
  onUpdateScene: (sceneId: string, patch: Partial<FastSceneDraft>) => void;
  onAddScene: () => string | void;
  onDeleteScene: (sceneId: string) => void;
  onGenerateSceneImage: (sceneId: string, mode: 'text-only' | 'previous-scene') => void | Promise<void>;
  onToggleSceneSelection: (sceneId: string) => void;
  onUploadSceneImage: (event: ChangeEvent<HTMLInputElement>, sceneId: string) => void | Promise<void>;
  onPreviewImage: (url: string | null) => void;
  onSkipStoryboard: () => void;
  onUpdatePrompt: (patch: Partial<FastVideoPromptDraft>) => void;
  onUpdateDraft: (patch: Partial<Omit<SeedanceDraft, 'options' | 'prompt'>> & {
    options?: Partial<SeedanceDraft['options']>;
    prompt?: Partial<SeedanceDraft['prompt']>;
  }) => void;
  onUpdateExecutionConfig: (patch: Partial<Project['fastFlow']['executionConfig']>) => void;
  onRegeneratePrompt: () => void | Promise<void>;
  onSubmit: () => void | Promise<void>;
  onRefreshStatus: () => void | Promise<void>;
  onCancelTask: () => void | Promise<void>;
  onToggleReferenceSelection: (referenceId: string) => void;
  onToggleReferenceAudioSelection: (referenceId: string) => void;
};

export function FastFlowWorkspace({
  view,
  project,
  themeMode,
  tosConfig,
  historyImageMaterials,
  historyMediaMaterials,
  seedanceHealth,
  isRefreshingSeedanceHealth,
  isGeneratingFastPlan,
  generatingFastSceneImages,
  isSubmittingFastVideo,
  isRefreshingFastVideoTask,
  isCancellingFastVideoTask,
  isRegeneratingFastVideoPrompt,
  operationPanel,
  renderImageModelPanel,
  onRefreshSeedanceHealth,
  onChangeFastInput,
  onGenerateFastPlan,
  onGoFastVideo,
  onOpenApiConfig,
  onAddReferenceImage,
  onAddReferenceImagesFromHistory,
  onReplaceReferenceImageFromHistory,
  onAddReferenceVideosFromHistory,
  onReplaceReferenceVideoFromHistory,
  onAddReferenceAudiosFromHistory,
  onReplaceReferenceAudioFromHistory,
  onUploadReferenceImage,
  onPasteReferenceImage,
  onUpdateReferenceImage,
  onRemoveReferenceImage,
  onAddReferenceVideo,
  onUpdateReferenceVideo,
  onRemoveReferenceVideo,
  onToggleReferenceVideoSelection,
  onAddReferenceAudio,
  onUpdateReferenceAudio,
  onRemoveReferenceAudio,
  onUpdateScene,
  onAddScene,
  onDeleteScene,
  onGenerateSceneImage,
  onToggleSceneSelection,
  onUploadSceneImage,
  onPreviewImage,
  onSkipStoryboard,
  onUpdatePrompt,
  onUpdateDraft,
  onUpdateExecutionConfig,
  onRegeneratePrompt,
  onSubmit,
  onRefreshStatus,
  onCancelTask,
  onToggleReferenceSelection,
  onToggleReferenceAudioSelection,
}: FastFlowWorkspaceProps) {
  if (view === 'fastInput') {
    return (
      <FastInputView
        input={project.fastFlow.input}
        isGenerating={isGeneratingFastPlan}
        hasPlan={project.fastFlow.scenes.length > 0}
        projectId={project.id}
        currentGroupId={project.groupId || ''}
        historyImageMaterials={historyImageMaterials}
        historyMediaMaterials={historyMediaMaterials}
        onChange={onChangeFastInput}
        onGenerate={onGenerateFastPlan}
        onSkipStoryboard={onSkipStoryboard}
        onAddReferenceImage={onAddReferenceImage}
        onAddReferenceImagesFromHistory={onAddReferenceImagesFromHistory}
        onReplaceReferenceImageFromHistory={onReplaceReferenceImageFromHistory}
        onAddReferenceVideosFromHistory={onAddReferenceVideosFromHistory}
        onReplaceReferenceVideoFromHistory={onReplaceReferenceVideoFromHistory}
        onAddReferenceAudiosFromHistory={onAddReferenceAudiosFromHistory}
        onReplaceReferenceAudioFromHistory={onReplaceReferenceAudioFromHistory}
        onUploadReferenceImage={onUploadReferenceImage}
        onPasteReferenceImage={onPasteReferenceImage}
        onUpdateReferenceImage={onUpdateReferenceImage}
        onRemoveReferenceImage={onRemoveReferenceImage}
        onAddReferenceVideo={onAddReferenceVideo}
        onUpdateReferenceVideo={onUpdateReferenceVideo}
        onRemoveReferenceVideo={onRemoveReferenceVideo}
        onToggleReferenceVideoSelection={onToggleReferenceVideoSelection}
        onAddReferenceAudio={onAddReferenceAudio}
        onUpdateReferenceAudio={onUpdateReferenceAudio}
        onRemoveReferenceAudio={onRemoveReferenceAudio}
        onTosUploadConfig={tosConfig}
        onOpenApiConfig={onOpenApiConfig}
        operationPanel={operationPanel}
        hideHeader
      />
    );
  }

  if (view === 'fastStoryboard') {
    return (
      <FastStoryboardView
        input={project.fastFlow.input}
        scenes={project.fastFlow.scenes}
        videoPrompt={project.fastFlow.videoPrompt}
        generatingImages={generatingFastSceneImages}
        onUpdateScene={onUpdateScene}
        onAddScene={onAddScene}
        onDeleteScene={onDeleteScene}
        onUpdatePrompt={onUpdatePrompt}
        onGenerateImage={(sceneId) => onGenerateSceneImage(sceneId, 'text-only')}
        onGenerateImageWithPrevious={(sceneId) => onGenerateSceneImage(sceneId, 'previous-scene')}
        onToggleSelection={onToggleSceneSelection}
        onUploadSceneImage={onUploadSceneImage}
        onPreviewImage={(url) => onPreviewImage(url)}
        onNextVideo={onGoFastVideo}
        onSkipStoryboard={onSkipStoryboard}
        renderImageModelPanel={renderImageModelPanel}
        themeMode={themeMode}
        hideHeader
      />
    );
  }

  if (view === 'fastVideo') {
    const { seedanceDraft, draftIssues } = getFastVideoDraftState(project);
    return (
      <FastVideoView
        input={project.fastFlow.input}
        scenes={project.fastFlow.scenes}
        videoPrompt={project.fastFlow.videoPrompt}
        seedanceDraft={seedanceDraft}
        draftIssues={draftIssues}
        task={project.fastFlow.task}
        executionConfig={project.fastFlow.executionConfig}
        health={seedanceHealth}
        isSubmitting={isSubmittingFastVideo}
        isRefreshingStatus={isRefreshingFastVideoTask}
        isCancellingTask={isCancellingFastVideoTask}
        canCancelTask={canCancelFastVideoTask(project.fastFlow.task)}
        isRegeneratingPrompt={isRegeneratingFastVideoPrompt}
        onUpdatePrompt={onUpdatePrompt}
        onUpdateDraft={onUpdateDraft}
        onUpdateExecutionConfig={onUpdateExecutionConfig}
        onRegeneratePrompt={onRegeneratePrompt}
        onSubmit={onSubmit}
        onRefreshStatus={onRefreshStatus}
        onCancelTask={onCancelTask}
        onPreviewImage={(url) => onPreviewImage(url)}
        onToggleReferenceSelection={onToggleReferenceSelection}
        onToggleReferenceVideoSelection={onToggleReferenceVideoSelection}
        onToggleReferenceAudioSelection={onToggleReferenceAudioSelection}
        onToggleSceneSelection={onToggleSceneSelection}
        themeMode={themeMode}
        healthPanel={(
          <SeedanceHealthPanel
            seedanceHealth={seedanceHealth}
            isRefreshingSeedanceHealth={isRefreshingSeedanceHealth}
            onRefreshSeedanceHealth={onRefreshSeedanceHealth}
          />
        )}
        hideHeader
      />
    );
  }

  return null;
}
