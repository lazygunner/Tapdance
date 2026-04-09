import type { Dispatch, SetStateAction } from 'react';

import {
  GroupDetailWorkspace,
  HomeWorkspace,
  type WorkspaceCreateProjectDraft,
  type WorkspaceHomeViewMode,
  type WorkspaceThemeMode,
  type WorkspaceView,
} from '../../../components/studio/WorkspaceViews.tsx';
import { PortraitLibraryView } from '../../portraitLibrary/components/PortraitLibraryView.tsx';
import { AssetLibraryWorkspace } from '../../assetLibrary/components/AssetLibraryWorkspace.tsx';
import { ProjectCard } from '../../projects/components/ProjectCard.tsx';
import { formatProjectCreatedAt, getProjectSummary } from '../../projects/utils/projectUi.ts';
import type { AssetLibraryConfig } from '../../../services/assetLibrary.ts';
import type { ProjectGroupSummary } from '../../../services/projectGroups.ts';
import type { AssetLibraryStatusItem } from '../../assetLibrary/utils/assetLibraryItems.ts';
import type { Project, ProjectType } from '../../../types.ts';

type ProjectOverviewWorkspaceProps = {
  view: WorkspaceView;
  themeMode: WorkspaceThemeMode;
  projects: Project[];
  projectGroups: ProjectGroupSummary[];
  homeViewMode: WorkspaceHomeViewMode;
  setHomeViewMode: Dispatch<SetStateAction<WorkspaceHomeViewMode>>;
  createProjectDraft: WorkspaceCreateProjectDraft | null;
  setCreateProjectDraft: Dispatch<SetStateAction<WorkspaceCreateProjectDraft | null>>;
  startNewProject: (projectType: ProjectType) => void;
  confirmCreateProject: () => void;
  selectedGroupId: string | null;
  onOpenGroupDetail: (groupId: string) => void;
  onBackFromGroupDetail: () => void;
  onUpdateGroupName: (groupId: string, value: string) => void;
  onPreviewImage: (url: string) => void;
  onOpenProject: (project: Project) => void | Promise<void>;
  onDeleteProject: (project: Project) => void;
  getProjectTypeLabel: (projectType: ProjectType) => string;
  assetLibraryItems: AssetLibraryStatusItem[];
  libraryImageCount: number;
  libraryVideoCount: number;
  savedAssetLibraryCount: number;
  unsavedAssetLibraryCount: number;
  assetLibraryConfig: AssetLibraryConfig | null;
  assetLibraryRootDraft: string;
  isRefreshingAssetLibraryConfig: boolean;
  isSavingAssetLibraryConfig: boolean;
  isSyncingAssetLibrary: boolean;
  savingAssetLibraryItems: Record<string, boolean>;
  onAssetLibraryRootDraftChange: (value: string) => void;
  onRefreshAssetLibrarySettings: () => void | Promise<void>;
  onApplyAssetLibraryRoot: (rootPath: string) => void | Promise<void>;
  onSyncAssetLibrary: () => void | Promise<void>;
  onPersistAssetLibraryItem: (item: AssetLibraryStatusItem) => void | Promise<void>;
  onOpenProjectById: (projectId: string) => void | Promise<void>;
};

export function ProjectOverviewWorkspace({
  view,
  themeMode,
  projects,
  projectGroups,
  homeViewMode,
  setHomeViewMode,
  createProjectDraft,
  setCreateProjectDraft,
  startNewProject,
  confirmCreateProject,
  selectedGroupId,
  onOpenGroupDetail,
  onBackFromGroupDetail,
  onUpdateGroupName,
  onPreviewImage,
  onOpenProject,
  onDeleteProject,
  getProjectTypeLabel,
  assetLibraryItems,
  libraryImageCount,
  libraryVideoCount,
  savedAssetLibraryCount,
  unsavedAssetLibraryCount,
  assetLibraryConfig,
  assetLibraryRootDraft,
  isRefreshingAssetLibraryConfig,
  isSavingAssetLibraryConfig,
  isSyncingAssetLibrary,
  savingAssetLibraryItems,
  onAssetLibraryRootDraftChange,
  onRefreshAssetLibrarySettings,
  onApplyAssetLibraryRoot,
  onSyncAssetLibrary,
  onPersistAssetLibraryItem,
  onOpenProjectById,
}: ProjectOverviewWorkspaceProps) {
  const renderProjectCard = (projectItem: Project) => (
    <ProjectCard
      project={projectItem}
      groupName={projectGroups.find((group) => group.id === projectItem.groupId)?.name || (projectItem.groupName || '').trim() || '未分组'}
      projectTypeLabel={getProjectTypeLabel(projectItem.projectType)}
      summary={getProjectSummary(projectItem)}
      createdAtLabel={formatProjectCreatedAt(projectItem.createdAt)}
      onOpen={onOpenProject}
      onDelete={(projectToDelete) => {
        if (!confirm('确定要删除这个项目吗？')) {
          return;
        }
        onDeleteProject(projectToDelete);
      }}
    />
  );

  if (view === 'home') {
    return (
      <HomeWorkspace
        projects={projects}
        projectGroups={projectGroups}
        themeMode={themeMode}
        homeViewMode={homeViewMode}
        setHomeViewMode={setHomeViewMode}
        createProjectDraft={createProjectDraft}
        setCreateProjectDraft={setCreateProjectDraft}
        startNewProject={startNewProject}
        confirmCreateProject={confirmCreateProject}
        openGroupDetail={onOpenGroupDetail}
        renderProjectCard={renderProjectCard}
      />
    );
  }

  if (view === 'groupDetail') {
    return (
      <GroupDetailWorkspace
        selectedGroupId={selectedGroupId}
        projectGroups={projectGroups}
        projects={projects}
        updateGroupName={onUpdateGroupName}
        onBack={onBackFromGroupDetail}
        onPreviewImage={onPreviewImage}
        renderProjectCard={renderProjectCard}
      />
    );
  }

  if (view === 'assetLibrary') {
    return (
      <AssetLibraryWorkspace
        assetLibraryItems={assetLibraryItems}
        libraryImageCount={libraryImageCount}
        libraryVideoCount={libraryVideoCount}
        savedAssetLibraryCount={savedAssetLibraryCount}
        unsavedAssetLibraryCount={unsavedAssetLibraryCount}
        assetLibraryConfig={assetLibraryConfig}
        assetLibraryRootDraft={assetLibraryRootDraft}
        isRefreshingAssetLibraryConfig={isRefreshingAssetLibraryConfig}
        isSavingAssetLibraryConfig={isSavingAssetLibraryConfig}
        isSyncingAssetLibrary={isSyncingAssetLibrary}
        savingAssetLibraryItems={savingAssetLibraryItems}
        onAssetLibraryRootDraftChange={onAssetLibraryRootDraftChange}
        onRefreshAssetLibrarySettings={() => void onRefreshAssetLibrarySettings()}
        onApplyAssetLibraryRoot={(rootPath) => void onApplyAssetLibraryRoot(rootPath)}
        onSyncAssetLibrary={() => void onSyncAssetLibrary()}
        onPreviewImage={onPreviewImage}
        onPersistAssetLibraryItem={(item) => void onPersistAssetLibraryItem(item)}
        onOpenProject={(projectId) => void onOpenProjectById(projectId)}
      />
    );
  }

  if (view === 'portraitLibrary') {
    return <PortraitLibraryView themeMode={themeMode} />;
  }

  return null;
}
