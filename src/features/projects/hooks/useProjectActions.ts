import type { Dispatch, SetStateAction } from 'react';

import { buildDefaultGroupName, normalizeProjectGroupName, type ProjectGroupSummary } from '../../../services/projectGroups.ts';
import { createEmptyFastVideoProject } from '../../fastVideoFlow/services/fastFlowMappers.ts';
import { createEmptyProject, getProjectResumeView } from '../utils/projectLifecycle.ts';
import { normalizeProjectRecord, toProjectListEntry } from '../utils/projectRecords.ts';
import type { ApiSettings, Project, ProjectType } from '../../../types.ts';
import type { WorkspaceCreateProjectDraft, WorkspaceView } from '../../../components/studio/WorkspaceViews.tsx';

type UseProjectActionsArgs = {
  apiSettings: ApiSettings;
  project: Project;
  projects: Project[];
  projectGroups: ProjectGroupSummary[];
  createProjectDraft: WorkspaceCreateProjectDraft | null;
  setProject: Dispatch<SetStateAction<Project>>;
  setProjects: Dispatch<SetStateAction<Project[]>>;
  setIdea: Dispatch<SetStateAction<string>>;
  setView: Dispatch<SetStateAction<WorkspaceView>>;
  setCreateProjectDraft: Dispatch<SetStateAction<WorkspaceCreateProjectDraft | null>>;
};

export function useProjectActions({
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
}: UseProjectActionsArgs) {
  const startNewProject = (projectType: ProjectType) => {
    const firstGroup = projectGroups[0];
    setCreateProjectDraft({
      projectType,
      projectName: '',
      groupMode: firstGroup ? 'existing' : 'new',
      newGroupName: buildDefaultGroupName(projects),
      existingGroupId: firstGroup?.id || '',
    });
  };

  const confirmCreateProject = () => {
    if (!createProjectDraft) {
      return;
    }

    const selectedGroup = projectGroups.find((group) => group.id === createProjectDraft.existingGroupId) || projectGroups[0];
    const shouldUseExistingGroup = createProjectDraft.groupMode === 'existing' && selectedGroup;
    const groupId = shouldUseExistingGroup ? selectedGroup.id : crypto.randomUUID();
    const groupName = shouldUseExistingGroup
      ? selectedGroup.name
      : normalizeProjectGroupName(createProjectDraft.newGroupName) || buildDefaultGroupName(projects);
    const projectName = createProjectDraft.projectName.trim() || '未命名项目';
    const newProject = normalizeProjectRecord({
      ...createEmptyProject(createProjectDraft.projectType),
      name: projectName,
      nameCustomized: Boolean(createProjectDraft.projectName.trim()),
      groupId,
      groupName,
      category: '',
      fastFlow: {
        ...createEmptyFastVideoProject(),
        executionConfig: {
          executor: apiSettings.seedance.defaultExecutor,
          apiModelKey: 'standard',
          cliModelVersion: apiSettings.seedance.cliModelVersion,
          pollIntervalSec: apiSettings.seedance.pollIntervalSec,
          videoResolution: '720p',
        },
      },
    });

    setProject(newProject);
    setIdea('');
    setCreateProjectDraft(null);
    setView(createProjectDraft.projectType === 'fast-video' ? 'fastInput' : 'input');
  };

  const openProject = (target: Project) => {
    const normalizedProject = normalizeProjectRecord(target);
    setProject(normalizedProject);
    setIdea(normalizedProject.idea);
    setView(getProjectResumeView(normalizedProject));
  };

  const updateProjectRecord = (projectId: string, updater: (current: Project) => Project) => {
    setProjects((prev) => prev.map((item) => item.id === projectId ? toProjectListEntry(updater(normalizeProjectRecord(item))) : item));
    setProject((prev) => prev.id === projectId ? normalizeProjectRecord(updater(normalizeProjectRecord(prev))) : prev);
  };

  const updateGroupName = (groupId: string, groupName: string) => {
    const normalizedGroupName = groupName;
    setProjects((prev) => prev.map((item) => item.groupId === groupId ? toProjectListEntry({ ...item, groupName: normalizedGroupName }) : item));
    setProject((prev) => prev.groupId === groupId ? normalizeProjectRecord({ ...prev, groupName: normalizedGroupName }) : prev);
  };

  const handleDeleteProject = (projectToDelete: Project) => {
    setProjects((prev) => prev.filter((item) => item.id !== projectToDelete.id));
    if (project.id === projectToDelete.id) {
      setProject(createEmptyProject(projectToDelete.projectType));
      setIdea('');
    }
  };

  return {
    startNewProject,
    confirmCreateProject,
    openProject,
    updateProjectRecord,
    updateGroupName,
    handleDeleteProject,
  };
}
