import { Play, Sparkles, X } from 'lucide-react';

import type { Project } from '../../../types.ts';
import type { WorkspaceView } from '../../../components/studio/WorkspaceViews.tsx';
import { canCancelFastVideoTask } from '../../fastVideoFlow/utils/fastVideoTask.ts';

type ProjectDetailPageActionsProps = {
  view: WorkspaceView;
  project: Project;
  draftIssueCount: number;
  isGeneratingFastPlan: boolean;
  isSubmittingFastVideo: boolean;
  isRefreshingFastVideoTask: boolean;
  isCancellingFastVideoTask: boolean;
  onGenerateFastPlan: () => void | Promise<void>;
  onGoFastVideo: () => void;
  onSkipFastStoryboard: () => void;
  onSubmitFastVideo: () => void | Promise<void>;
  onCancelFastVideoTask: () => void | Promise<void>;
};

export function ProjectDetailPageActions({
  view,
  project,
  draftIssueCount,
  isGeneratingFastPlan,
  isSubmittingFastVideo,
  isRefreshingFastVideoTask,
  isCancellingFastVideoTask,
  onGenerateFastPlan,
  onGoFastVideo,
  onSkipFastStoryboard,
  onSubmitFastVideo,
  onCancelFastVideoTask,
}: ProjectDetailPageActionsProps) {
  if (view === 'fastInput') {
    const canGenerate = Boolean(project.fastFlow.input.prompt.trim()) && !isGeneratingFastPlan;
    const canGoDirectToVideo = Boolean(
      project.fastFlow.videoPrompt?.prompt?.trim()
      || project.fastFlow.input.prompt.trim(),
    ) && !isGeneratingFastPlan;

    return (
      <>
        <button
          type="button"
          onClick={() => void onGenerateFastPlan()}
          disabled={!canGenerate}
          className="studio-button studio-button-fast-plan px-3 py-1.5 text-xs"
        >
          {isGeneratingFastPlan ? <span className="inline-flex items-center gap-1.5"><img src="./assets/loading.gif" alt="" className="w-3.5 h-3.5" />生成中</span> : <span className="inline-flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />{project.fastFlow.input.quickCutEnabled ? '生成快剪提示词' : '生成分镜'}</span>}
        </button>
        <button
          type="button"
          onClick={onSkipFastStoryboard}
          disabled={!canGoDirectToVideo}
          className="studio-button studio-button-direct-video px-3 py-1.5 text-xs"
        >
          直接生成视频
        </button>
      </>
    );
  }

  if (view === 'fastStoryboard') {
    const readyReferenceImages = project.fastFlow.input.referenceImages.filter((reference) => reference.imageUrl.trim());
    const readyReferenceVideos = project.fastFlow.input.referenceVideos.filter((reference) => reference.videoUrl.trim());
    const readyReferenceAudios = project.fastFlow.input.referenceAudios.filter((reference) => reference.audioUrl.trim());
    const readyImageCount = project.fastFlow.scenes.filter((scene) => scene.imageUrl && scene.selectedForVideo !== false).length;
    const canProceedToVideo = (
      readyImageCount > 0
      || readyReferenceImages.length > 0
      || readyReferenceVideos.length > 0
      || readyReferenceAudios.length > 0
    ) && Boolean(project.fastFlow.videoPrompt?.prompt);
    const canSkipStoryboard = Boolean(project.fastFlow.videoPrompt?.prompt?.trim());

    return (
      <>
        <button
          type="button"
          onClick={onGoFastVideo}
          disabled={!canProceedToVideo}
          className="studio-button studio-button-primary"
        >
          进入视频生成
        </button>
        <button
          type="button"
          onClick={onSkipFastStoryboard}
          disabled={!canSkipStoryboard}
          className="studio-button studio-button-secondary"
        >
          跳过分镜图
        </button>
      </>
    );
  }

  if (view === 'fastVideo') {
    const videoPrompt = project.fastFlow.videoPrompt;
    const task = project.fastFlow.task;
    const taskActive = task.status === 'queued' || task.status === 'submitting' || task.status === 'generating';
    const canSubmit = draftIssueCount === 0
      && Boolean(videoPrompt?.prompt.trim())
      && !isSubmittingFastVideo
      && !isRefreshingFastVideoTask
      && !isCancellingFastVideoTask
      && !taskActive;
    const showCancelTaskAction = canCancelFastVideoTask(task);
    const primaryActionBusy = isSubmittingFastVideo || taskActive;

    return (
      <>
        <button
          type="button"
          onClick={() => void onSubmitFastVideo()}
          disabled={!canSubmit}
          className="studio-button studio-button-primary"
        >
          {primaryActionBusy
            ? <span className="inline-flex items-center gap-2"><img src="./assets/loading.gif" alt="" className="w-4 h-4" />生成中</span>
            : <span className="inline-flex items-center gap-2"><Play className="w-4 h-4" />生成视频</span>}
        </button>
        {showCancelTaskAction ? (
          <button
            type="button"
            onClick={() => void onCancelFastVideoTask()}
            disabled={isCancellingFastVideoTask || isRefreshingFastVideoTask}
            className="studio-button studio-button-secondary border-[var(--studio-accent-red-border)] bg-[var(--studio-accent-red-bg)] text-[var(--studio-accent-red-text)]"
          >
            {isCancellingFastVideoTask
              ? <span className="inline-flex items-center gap-2"><img src="./assets/loading.gif" alt="" className="w-4 h-4" />取消中</span>
              : <span className="inline-flex items-center gap-2"><X className="w-4 h-4" />取消生成任务</span>}
          </button>
        ) : null}
      </>
    );
  }

  return null;
}
