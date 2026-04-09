import { createEmptyFastVideoProject } from '../../fastVideoFlow/services/fastFlowMappers.ts';
import type { WorkspaceView } from '../../../components/studio/WorkspaceViews.tsx';
import type { Project, ProjectType } from '../../../types.ts';

function isNonEmptyText(value?: string | null) {
  return Boolean(value && value.trim());
}

export function inferProjectType(value: Partial<Project>): ProjectType {
  if (value.projectType === 'fast-video') {
    return 'fast-video';
  }

  return 'creative-video';
}

export function normalizeProjectCreatedAt(value?: string) {
  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp)) {
    return new Date().toISOString();
  }
  return new Date(timestamp).toISOString();
}

export function createEmptyProject(projectType: ProjectType = 'creative-video'): Project {
  return {
    id: crypto.randomUUID(),
    projectType,
    name: '未命名项目',
    nameCustomized: false,
    createdAt: new Date().toISOString(),
    groupId: '',
    groupName: '',
    category: '',
    idea: '',
    selectedStyleId: '',
    customStyleDescription: '',
    styleSelectionMode: 'manual',
    inputAspectRatio: '16:9',
    brief: null,
    assets: [],
    shots: [],
    fastFlow: createEmptyFastVideoProject(),
  };
}

export function isProjectDetailView(view: WorkspaceView) {
  return view !== 'home' && view !== 'assetLibrary' && view !== 'portraitLibrary' && view !== 'groupDetail' && view !== 'apiConfig';
}

export function isProjectEmpty(project: Project): boolean {
  const creativeEmpty = !isNonEmptyText(project.idea)
    && !project.brief
    && project.assets.length === 0
    && project.shots.length === 0;
  const fastEmpty = !(project.fastFlow.input.prompt || '').trim()
    && project.fastFlow.input.referenceImages.length === 0
    && project.fastFlow.scenes.length === 0
    && !project.fastFlow.videoPrompt
    && !project.fastFlow.task.taskId
    && !project.fastFlow.task.submitId
    && !project.fastFlow.task.videoUrl;

  const setupEmpty = !project.nameCustomized
    && !isNonEmptyText(project.groupName)
    && !isNonEmptyText(project.selectedStyleId)
    && !isNonEmptyText(project.customStyleDescription)
    && (project.inputAspectRatio || '16:9') === '16:9';

  return creativeEmpty && fastEmpty && setupEmpty;
}

export function getProjectResumeView(project: Project): WorkspaceView {
  if (project.projectType === 'fast-video') {
    const hasGeneratedVideo = Boolean(project.fastFlow.task.videoUrl)
      || Boolean(project.fastFlow.task.taskId)
      || Boolean(project.fastFlow.task.submitId)
      || project.fastFlow.task.status === 'generating'
      || project.fastFlow.task.status === 'completed';

    if (hasGeneratedVideo) {
      return 'fastVideo';
    }
    if (project.fastFlow.scenes.length > 0) {
      return 'fastStoryboard';
    }
    return 'fastInput';
  }

  const hasGeneratedVideo = project.shots.some((shot) => (
    Boolean(shot.videoUrl)
    || shot.videoStatus === 'generating'
    || shot.videoStatus === 'completed'
    || Boolean(shot.transitionVideoUrl)
    || shot.transitionVideoStatus === 'generating'
    || shot.transitionVideoStatus === 'completed'
  ));

  if (hasGeneratedVideo) {
    return 'videos';
  }
  if (project.shots.length > 0) {
    return 'shots';
  }
  if (project.brief) {
    return 'brief';
  }
  return 'input';
}
