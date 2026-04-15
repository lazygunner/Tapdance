import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  ArrowLeft,
  Clapperboard,
  FileText,
  Film,
  Image as ImageIcon,
  LayoutDashboard,
  Moon,
  PanelsTopLeft,
  PlaySquare,
  Plus,
  Settings2,
  Sun,
  Table2,
  Video,
  X,
  Users,
  type LucideIcon,
} from 'lucide-react';

import type { Project, ProjectType } from '../../types.ts';
import { getProjectGroupImageAssets, type ProjectGroupSummary } from '../../services/projectGroups.ts';
import { StudioMetricCard, StudioModal, StudioPage, StudioPageHeader, StudioPanel, StudioSelect, cx } from './StudioPrimitives.tsx';

export type WorkspaceView =
  | 'home'
  | 'assetLibrary'
  | 'portraitLibrary'
  | 'groupDetail'
  | 'input'
  | 'brief'
  | 'shots'
  | 'timeline'
  | 'videos'
  | 'apiConfig'
  | 'fastInput'
  | 'fastStoryboard'
  | 'fastVideo';

export type WorkspaceThemeMode = 'light' | 'dark';
export type WorkspaceHomeViewMode = 'projects' | 'groups';

export type WorkspaceCreateProjectDraft = {
  projectType: ProjectType;
  projectName: string;
  groupMode: 'new' | 'existing';
  newGroupName: string;
  existingGroupId: string;
};

type NavItem = {
  view: WorkspaceView;
  label: string;
  icon: LucideIcon;
};

type SupportedWorkspaceProjectType = 'creative-video' | 'fast-video';

const PROJECT_UI_TYPE_BY_PROJECT_TYPE: Record<ProjectType, SupportedWorkspaceProjectType> = {
  'creative-video': 'creative-video',
  'fast-video': 'fast-video',
};

function getWorkspaceProjectType(projectType: ProjectType): SupportedWorkspaceProjectType {
  return PROJECT_UI_TYPE_BY_PROJECT_TYPE[projectType];
}

function buildProjectContextLabel(project: Project, fallback: string): string {
  const projectName = project.name.trim();
  const groupName = (project.groupName || '').trim();

  if (projectName && groupName) {
    return `${projectName} / ${groupName}`;
  }

  if (projectName) {
    return projectName;
  }

  if (groupName) {
    return groupName;
  }

  return fallback;
}

const PROJECT_META: Record<SupportedWorkspaceProjectType, {
  label: string;
  subtitle: string;
  eyebrow: string;
  icon: LucideIcon;
  chipClassName: string;
  accentTextClassName: string;
  activeNavClassName: string;
  inactiveNavClassName: string;
  completedLineClassName: string;
}> = {
  'creative-video': {
    label: '创意视频',
    subtitle: '故事、资产、分镜与生成',
    eyebrow: 'Creative Workflow',
    icon: Clapperboard,
    chipClassName: 'studio-accent-chip-cyan',
    accentTextClassName: 'studio-accent-text-cyan',
    activeNavClassName: 'studio-accent-chip-cyan shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
    inactiveNavClassName: 'border-transparent text-[var(--studio-muted)] hover:border-white/8 hover:bg-white/5 hover:text-[var(--studio-text)]',
    completedLineClassName: 'studio-accent-line-cyan',
  },
  'fast-video': {
    label: '极速视频',
    subtitle: 'Seedance 快速执行链路',
    eyebrow: 'Fast Workflow',
    icon: PlaySquare,
    chipClassName: 'studio-accent-chip-sky',
    accentTextClassName: 'studio-accent-text-sky',
    activeNavClassName: 'studio-accent-chip-sky shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
    inactiveNavClassName: 'border-transparent text-[var(--studio-muted)] hover:border-white/8 hover:bg-white/5 hover:text-[var(--studio-text)]',
    completedLineClassName: 'studio-accent-line-sky',
  },
};

const NAV_ITEMS_BY_PROJECT: Record<SupportedWorkspaceProjectType, NavItem[]> = {
  'creative-video': [
    { view: 'input', label: '创意输入', icon: LayoutDashboard },
    { view: 'brief', label: '创意简报与资产', icon: FileText },
    { view: 'shots', label: '分镜列表', icon: Film },
    { view: 'timeline', label: '时间线预览', icon: PlaySquare },
    { view: 'videos', label: '视频生成', icon: Video },
  ],
  'fast-video': [
    { view: 'fastInput', label: '极速输入', icon: LayoutDashboard },
    { view: 'fastStoryboard', label: '分镜确认', icon: PanelsTopLeft },
    { view: 'fastVideo', label: '视频生成', icon: Video },
  ],
};

const HOME_ENTRY_COPY: Record<SupportedWorkspaceProjectType, { title: string; description: string; cornerBadge?: string }> = {
  'creative-video': {
    title: '故事、资产、分镜与生成',
    description: '从故事、角色和风格出发，进入简报、资产、分镜与视频生成的完整导演流程。支持 Seedance 和 Veo。',
    cornerBadge: 'Legacy',
  },
  'fast-video': {
    title: '一句提示词全能参考视频生成',
    description: '全新 Seedance 2.0 API 和 CLI支持, 真人素材库, 视频参考等功能均已支持。',
    cornerBadge: 'New',
  },
};

export type WorkspaceSurfaceMeta = {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  chipClassName: string;
  badgeLabel: string;
};

export function getWorkspaceSurfaceMeta(view: WorkspaceView, project: Project): WorkspaceSurfaceMeta {
  switch (view) {
    case 'home':
      return {
        eyebrow: 'Workspace',
        title: '视频制作',
        description: '项目、分组与双工作流调度',
        icon: Clapperboard,
        chipClassName: 'studio-accent-chip-sky',
        badgeLabel: 'Workspace',
      };
    case 'assetLibrary':
      return {
        eyebrow: 'Library',
        title: '资产库',
        description: '统一管理图片、视频和可复用素材',
        icon: ImageIcon,
        chipClassName: 'studio-accent-chip-cyan',
        badgeLabel: 'Assets',
      };
    case 'portraitLibrary':
      return {
        eyebrow: 'Library',
        title: '人像素材库',
        description: '浏览平台公开与真人人像资产',
        icon: Users,
        chipClassName: 'studio-accent-chip-amber',
        badgeLabel: 'Portraits',
      };
    case 'groupDetail':
      return {
        eyebrow: 'Collection',
        title: '项目分组',
        description: '按系列查看和整理关联项目',
        icon: Table2,
        chipClassName: 'studio-accent-chip-amber',
        badgeLabel: 'Groups',
      };
    case 'apiConfig':
      return {
        eyebrow: 'System',
        title: 'API 配置',
        description: '同步模型、密钥和调用环境',
        icon: Settings2,
        chipClassName: 'studio-accent-chip-indigo',
        badgeLabel: 'Config',
      };
    default: {
      const workspaceProjectType = getWorkspaceProjectType(project.projectType);
      const projectMeta = PROJECT_META[workspaceProjectType];
      const navItem = NAV_ITEMS_BY_PROJECT[workspaceProjectType].find((item) => item.view === view);

      return {
        eyebrow: projectMeta.eyebrow,
        title: navItem?.label || projectMeta.label,
        description: buildProjectContextLabel(project, projectMeta.subtitle),
        icon: navItem?.icon || projectMeta.icon,
        chipClassName: projectMeta.chipClassName,
        badgeLabel: projectMeta.label,
      };
    }
  }
}

function isNavItemDisabled(project: Project, view: WorkspaceView) {
  if (view === 'brief' || view === 'shots') {
    return !project.brief;
  }
  if (view === 'timeline' || view === 'videos') {
    return project.shots.length === 0;
  }
  if (view === 'fastStoryboard') {
    return project.fastFlow.scenes.length === 0;
  }
  if (view === 'fastVideo') {
    return !project.fastFlow.videoPrompt?.prompt?.trim();
  }
  return false;
}

type StudioSidebarProps = {
  view: WorkspaceView;
  projectCount: number;
  mediaCount: number;
  themeMode: WorkspaceThemeMode;
  onNavigate: (view: 'home' | 'assetLibrary' | 'portraitLibrary') => void;
  onThemeModeChange: (mode: WorkspaceThemeMode) => void;
  onOpenApiConfig: () => void;
};

export function StudioSidebar({
  view,
  projectCount,
  mediaCount,
  themeMode,
  onNavigate,
  onThemeModeChange,
  onOpenApiConfig,
}: StudioSidebarProps) {
  const activePrimaryView: 'home' | 'assetLibrary' | 'portraitLibrary' =
    view === 'assetLibrary' ? 'assetLibrary' : view === 'portraitLibrary' ? 'portraitLibrary' : 'home';
  const primaryNavItems: Array<{
    view: 'home' | 'assetLibrary' | 'portraitLibrary';
    label: string;
    description: string;
    countLabel: string;
    icon: LucideIcon;
  }> = [
      {
        view: 'home',
        label: '视频制作',
        description: '项目、分组与制作流程',
        countLabel: `${projectCount} 个项目`,
        icon: Clapperboard,
      },
      {
        view: 'assetLibrary',
        label: '资产库',
        description: '所有项目中的图片与视频',
        countLabel: `${mediaCount} 项资产`,
        icon: ImageIcon,
      },
      {
        view: 'portraitLibrary',
        label: '人像素材库',
        description: '平台公开与真人人像',
        countLabel: '公开 + 真人',
        icon: Users,
      },
    ];

  return (
    <aside className="app-sidebar flex h-full w-[19rem] shrink-0 flex-col">
      <div className="px-4 pt-4">
        <StudioPanel className="overflow-hidden p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[0.8rem] font-bold tracking-[0.35em] uppercase text-[var(--studio-accent-sky-text)]">
                Tapdance
              </div>
              <div className="mt-1 text-2xl font-bold tracking-tight text-[var(--studio-text)]">
                AI导演工作台
              </div>
            </div>
            <div className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-white/10 bg-white/5 shadow-[0_14px_32px_rgba(15,23,42,0.25)] overflow-hidden">
              <img src="./assets/tapdance_logo.png" alt="Tapdance Logo" className="h-12 w-12 object-contain scale-[1.5]" />
            </div>
          </div>
        </StudioPanel>
      </div>

      <div className="px-4 pt-4">
        <StudioPanel className="space-y-2 p-3" tone="soft">
          <div className="px-1">
            <div className="studio-eyebrow">Navigation</div>
          </div>
          <div className="space-y-1">
            {primaryNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activePrimaryView === item.view;
              return (
                <button
                  key={item.view}
                  type="button"
                  onClick={() => onNavigate(item.view)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cx(
                    'group flex w-full items-start gap-3 rounded-[1rem] border px-3 py-3 text-left transition-all duration-200',
                    isActive
                      ? 'border-cyan-300/24 bg-[linear-gradient(135deg,rgba(56,189,248,0.11),rgba(255,255,255,0.045))] text-[var(--studio-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]'
                      : 'border-transparent bg-transparent text-[var(--studio-muted)] hover:border-white/10 hover:bg-white/[0.045] hover:text-[var(--studio-text)]',
                  )}
                >
                  <span
                    className={cx(
                      'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border transition-colors',
                      isActive
                        ? 'border-cyan-300/24 bg-cyan-400/10 text-cyan-100'
                        : 'border-white/10 bg-white/[0.04] text-[var(--studio-dim)] group-hover:text-[var(--studio-text)]',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 pt-0.5">
                    <span className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-[var(--studio-text)]">{item.label}</span>
                      <span
                        className={cx(
                          'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                          isActive
                            ? 'border-cyan-300/22 bg-cyan-400/10 text-cyan-100'
                            : 'border-white/10 bg-white/[0.03] text-[var(--studio-dim)]',
                        )}
                      >
                        {item.countLabel}
                      </span>
                    </span>
                    <span
                      className={cx(
                        'mt-1 block text-[11px] leading-5',
                        isActive ? 'text-[var(--studio-muted)]' : 'text-[var(--studio-dim)]',
                      )}
                    >
                      {item.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </StudioPanel>
      </div>

      <div className="mt-auto px-4 py-4">
        <StudioPanel className="space-y-4 p-4" tone="soft">
          <div className="theme-toggle">
            <button
              onClick={() => onThemeModeChange('light')}
              className={cx('theme-toggle-button', themeMode === 'light' && 'active')}
              type="button"
            >
              <Sun className="h-3.5 w-3.5" />
              Light
            </button>
            <button
              onClick={() => onThemeModeChange('dark')}
              className={cx('theme-toggle-button', themeMode === 'dark' && 'active')}
              type="button"
            >
              <Moon className="h-3.5 w-3.5" />
              Dark
            </button>
          </div>

          <button type="button" onClick={onOpenApiConfig} className="studio-button studio-button-secondary w-full justify-between">
            <span>API 配置</span>
            <Settings2 className="h-4 w-4 text-[var(--studio-dim)]" />
          </button>
        </StudioPanel>
      </div>
    </aside>
  );
}

type AppChromeBarProps = {
  version: string;
};

export function AppChromeBar({ version }: AppChromeBarProps) {
  return (
    <header className="app-chrome shrink-0">
      <div className="app-chrome__title-wrap">
        <span className="app-chrome__title">Tapdance</span>
        <span className="app-chrome__version">{version}</span>
      </div>
    </header>
  );
}

type ProjectDetailHeaderProps = {
  project: Project;
  activeView: WorkspaceView;
  onGoHome: () => void;
  onSelectView: (view: WorkspaceView) => void;
  onProjectNameChange: (value: string) => void;
  onProjectGroupNameChange: (value: string) => void;
  pageEyebrow?: string;
  pageTitle?: string;
  pageDescription?: ReactNode;
  pageActions?: ReactNode;
};

export function ProjectDetailHeader({
  project,
  activeView,
  onGoHome,
  onSelectView,
  onProjectNameChange,
  onProjectGroupNameChange,
  pageEyebrow,
  pageTitle,
  pageDescription,
  pageActions,
}: ProjectDetailHeaderProps) {
  const workspaceProjectType = getWorkspaceProjectType(project.projectType);
  const projectMeta = PROJECT_META[workspaceProjectType];
  const ProjectIcon = projectMeta.icon;
  const navItems = NAV_ITEMS_BY_PROJECT[workspaceProjectType];
  const activeIndex = navItems.findIndex((item) => item.view === activeView);

  return (
    <StudioPanel className="space-y-4 p-4" tone="soft">
      <div className="flex flex-wrap items-center gap-3 xl:flex-nowrap">
        <button type="button" onClick={onGoHome} className="studio-button studio-button-secondary shrink-0 px-4 py-3">
          <ArrowLeft className="h-4 w-4" />
          返回首页
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-3 xl:gap-4">
          <div className={cx('inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium', projectMeta.chipClassName)}>
            <ProjectIcon className="h-3.5 w-3.5" />
            {projectMeta.eyebrow}
          </div>
          <div className="min-w-0 flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-[var(--studio-text)]">{projectMeta.label}</span>
            <span className="hidden text-sm text-[var(--studio-dim)] 2xl:inline">{projectMeta.subtitle}</span>
          </div>

          {pageTitle ? (
            <div className="min-w-0 border-l border-[var(--studio-border)] pl-4">
              {pageEyebrow ? (
                <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--studio-dim)]">
                  {pageEyebrow}
                </div>
              ) : null}
              <div className="mt-1 flex min-w-0 items-center gap-2">
                <span className="truncate text-base font-semibold text-[var(--studio-text)]">{pageTitle}</span>
                {pageDescription ? (
                  <span className="hidden truncate text-sm text-[var(--studio-muted)] xl:inline">{pageDescription}</span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-3 xl:w-auto">
          <label className="flex min-w-0 items-center gap-3 rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-field)] px-3 py-2 md:w-[15rem] xl:w-[14rem]">
            <span className="shrink-0 text-[11px] uppercase tracking-[0.22em] text-[var(--studio-dim)]">项目</span>
            <input
              value={project.name}
              onChange={(event) => onProjectNameChange(event.target.value)}
              placeholder="项目名称"
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-[var(--studio-text)] outline-none placeholder:text-[var(--studio-dim)]"
            />
          </label>

          <label className="flex min-w-0 items-center gap-3 rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-field)] px-3 py-2 md:w-[15rem] xl:w-[14rem]">
            <span className="shrink-0 text-[11px] uppercase tracking-[0.22em] text-[var(--studio-dim)]">分组</span>
            <input
              value={project.groupName || ''}
              onChange={(event) => onProjectGroupNameChange(event.target.value)}
              placeholder="分组名称"
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-[var(--studio-text)] outline-none placeholder:text-[var(--studio-dim)]"
            />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
        <div className="min-w-0 flex flex-1 items-center gap-4 overflow-x-auto">
          <div className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--studio-dim)]">
            工作流 / Workflow
          </div>
          <div className="flex min-w-max items-center gap-0 pb-1">
            {navItems.map((item, index) => {
              const Icon = item.icon;
              const isDisabled = isNavItemDisabled(project, item.view);
              const isActive = activeView === item.view;
              const isCompleted = !isDisabled && activeIndex > index;
              const circleClassName = isDisabled
                ? 'border-[var(--studio-border)] bg-transparent text-[var(--studio-dim)]'
                : isActive
                  ? projectMeta.chipClassName
                  : isCompleted
                    ? 'border-white/12 bg-white/8 text-[var(--studio-text)]'
                    : 'border-[var(--studio-border)] bg-transparent text-[var(--studio-muted)]';
              const itemClassName = isDisabled
                ? 'cursor-not-allowed opacity-50'
                : isActive
                  ? 'text-[var(--studio-text)]'
                  : 'text-[var(--studio-muted)] hover:text-[var(--studio-text)]';
              const connectorClassName = isCompleted
                ? projectMeta.completedLineClassName
                : 'bg-[var(--studio-border-strong)]';

              return (
                <div key={item.view} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => onSelectView(item.view)}
                    disabled={isDisabled}
                    className={cx('flex items-center gap-3 rounded-2xl px-2 py-2 text-left text-sm font-medium transition-colors', itemClassName)}
                  >
                    <span className={cx('inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors', circleClassName)}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="whitespace-nowrap">{item.label}</span>
                  </button>
                  {index < navItems.length - 1 ? (
                    <span className={cx('mx-2 h-[2px] w-9 shrink-0 rounded-full transition-colors', connectorClassName)} />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
        {pageActions ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{pageActions}</div> : null}
      </div>
    </StudioPanel>
  );
}

type HomeWorkspaceProps = {
  projects: Project[];
  projectGroups: ProjectGroupSummary[];
  themeMode: WorkspaceThemeMode;
  homeViewMode: WorkspaceHomeViewMode;
  setHomeViewMode: Dispatch<SetStateAction<WorkspaceHomeViewMode>>;
  createProjectDraft: WorkspaceCreateProjectDraft | null;
  setCreateProjectDraft: Dispatch<SetStateAction<WorkspaceCreateProjectDraft | null>>;
  startNewProject: (projectType: ProjectType) => void;
  confirmCreateProject: () => void;
  openGroupDetail: (groupId: string) => void;
  renderProjectCard: (project: Project) => ReactNode;
};

const HOME_ENTRY_TYPES: SupportedWorkspaceProjectType[] = ['fast-video', 'creative-video'];

export function HomeWorkspace({
  projects,
  projectGroups,
  themeMode,
  homeViewMode,
  setHomeViewMode,
  createProjectDraft,
  setCreateProjectDraft,
  startNewProject,
  confirmCreateProject,
  openGroupDetail,
  renderProjectCard,
}: HomeWorkspaceProps) {
  const hasExistingGroups = projectGroups.length > 0;
  const createProjectMeta = createProjectDraft ? PROJECT_META[getWorkspaceProjectType(createProjectDraft.projectType)] : null;
  const CreateProjectIcon = createProjectMeta?.icon;
  const selectedExistingGroup = createProjectDraft
    ? projectGroups.find((group) => group.id === createProjectDraft.existingGroupId) || projectGroups[0] || null
    : null;
  const modalGlowClass = themeMode === 'light'
    ? 'bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_58%)]'
    : 'bg-[radial-gradient(circle_at_top_left,rgba(96,165,250,0.18),transparent_58%)]';
  const optionIconClass = themeMode === 'light'
    ? 'border-[rgba(110,124,145,0.16)] bg-white text-[var(--studio-text)] shadow-[0_10px_24px_rgba(148,163,184,0.14)]'
    : 'border-white/10 bg-white/8 text-[var(--studio-text)]';
  const modalGhostHoverClass = themeMode === 'light'
    ? 'hover:bg-[rgba(255,255,255,0.86)]'
    : 'hover:bg-white/6';

  return (
    <StudioPage className="studio-page-wide">
      <StudioPageHeader
        eyebrow="Workspace Overview"
        title="视频制作"
        actions={(
          <>
            <StudioMetricCard compact label="项目总数" value={projects.length} detail="当前所有视频制作项目" />
            <StudioMetricCard compact label="分组总数" value={projectGroups.length} detail="按分组沉淀素材与画面" />
          </>
        )}
      />

      <div className="mt-8 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.7fr)]">
        <StudioPanel className="space-y-5 p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="studio-eyebrow">Create Project</div>
              <h2 className="mt-2 text-2xl font-semibold text-[var(--studio-text)]">开始一个视频项目</h2>

            </div>
            <div className="studio-segmented">
              <button
                type="button"
                onClick={() => setHomeViewMode('projects')}
                className={cx('studio-segmented-button', homeViewMode === 'projects' && 'active')}
              >
                <Table2 className="h-3.5 w-3.5" />
                项目视图
              </button>
              <button
                type="button"
                onClick={() => setHomeViewMode('groups')}
                className={cx('studio-segmented-button', homeViewMode === 'groups' && 'active')}
              >
                <PanelsTopLeft className="h-3.5 w-3.5" />
                分组视图
              </button>
            </div>
          </div>

          <div className="grid max-w-5xl grid-cols-1 gap-4 md:grid-cols-2">
            {HOME_ENTRY_TYPES.map((projectType) => {
              const meta = PROJECT_META[projectType];
              const Icon = meta.icon;
              const copy = HOME_ENTRY_COPY[projectType];
              const hasCornerBadge = Boolean(copy.cornerBadge);

              return (
                <button
                  key={projectType}
                  type="button"
                  onClick={() => startNewProject(projectType)}
                  className="group relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.1),rgba(255,255,255,0.02))] p-6 text-left shadow-[0_24px_48px_rgba(2,6,23,0.16)] transition-all duration-300 hover:-translate-y-0.5 hover:border-white/16"
                >
                  {copy.cornerBadge ? (
                    <div className={cx(
                      'absolute right-[-2.35rem] top-4 z-20 w-32 rotate-45 border py-1 text-center text-[11px] font-bold shadow-[0_10px_24px_rgba(2,6,23,0.28)]',
                      projectType === 'fast-video'
                        ? 'border-sky-100/40 bg-sky-300 text-slate-950'
                        : 'border-white/30 bg-zinc-100 text-zinc-950',
                    )}>
                      {copy.cornerBadge}
                    </div>
                  ) : null}
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.16),transparent_36%)] opacity-80" />
                  <div className="relative flex items-start justify-between gap-4">
                    <div>
                      <div className={cx('inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium', meta.chipClassName)}>
                        <Icon className="h-3.5 w-3.5" />
                        {meta.label}
                      </div>
                      <h3 className="mt-5 text-2xl font-semibold text-[var(--studio-text)]">{copy.title}</h3>
                      <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--studio-muted)]">
                        {copy.description}
                      </p>
                    </div>
                    <div className={cx(
                      'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/8 text-white',
                      hasCornerBadge && 'mt-10',
                    )}>
                      <Plus className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </StudioPanel>
      </div>

      <StudioModal
        open={Boolean(createProjectDraft)}
        onClose={() => setCreateProjectDraft(null)}
        themeMode={themeMode}
        className="max-w-[44rem]"
      >
        {createProjectDraft && createProjectMeta && CreateProjectIcon ? (
          <div className="relative">
            <div className={cx('pointer-events-none absolute inset-x-0 top-0 h-44', modalGlowClass)} />
            <div className="relative p-6 md:p-8">
              <div className="flex items-start justify-between gap-5">
                <div className="max-w-xl">
                  <div className="studio-eyebrow">Project Setup</div>
                  <div className={cx('mt-5 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium', createProjectMeta.chipClassName)}>
                    <CreateProjectIcon className="h-3.5 w-3.5" />
                    {createProjectMeta.label}
                  </div>
                  <h3 className="mt-5 text-[2.55rem] leading-[0.96] font-semibold tracking-[-0.05em] text-[var(--studio-text)]">
                    创建 {createProjectMeta.label} 项目
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setCreateProjectDraft(null)}
                  className={cx(
                    'inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--studio-border)] bg-white/6 text-[var(--studio-muted)] transition-colors hover:border-[var(--studio-border-strong)] hover:text-[var(--studio-text)]',
                    modalGhostHoverClass,
                  )}
                  aria-label="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-7 max-w-[39rem] space-y-5">
                <div className="space-y-2.5">
                  <span className="text-sm font-medium text-[var(--studio-muted)]">项目名称</span>
                  <input
                    value={createProjectDraft.projectName}
                    onChange={(event) => setCreateProjectDraft((prev) => (prev ? { ...prev, projectName: event.target.value } : prev))}
                    placeholder="未命名项目"
                    className="studio-input"
                    autoFocus
                  />
                </div>

                <div className="space-y-0.5">
                  <div>
                    <span className="text-sm font-medium text-[var(--studio-muted)]">分组方式</span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => hasExistingGroups && setCreateProjectDraft((prev) => (
                        prev
                          ? {
                            ...prev,
                            groupMode: 'existing',
                            existingGroupId: prev.existingGroupId || projectGroups[0]?.id || '',
                          }
                          : prev
                      ))}
                      disabled={!hasExistingGroups}
                      className={cx(
                        'group rounded-[1.4rem] border p-4 text-left transition-all duration-200',
                        createProjectDraft.groupMode === 'existing'
                          ? 'border-sky-400/40 bg-sky-400/10 shadow-[0_16px_36px_rgba(14,165,233,0.12)]'
                          : 'border-[var(--studio-border)] bg-[var(--studio-field)] hover:border-[var(--studio-border-strong)]',
                        createProjectDraft.groupMode !== 'existing' && modalGhostHoverClass,
                        !hasExistingGroups && 'cursor-not-allowed opacity-50 hover:border-[var(--studio-border)] hover:bg-[var(--studio-field)]',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3.5">
                        <div className="flex items-center gap-3.5">
                          <div className={cx('flex h-11 w-11 items-center justify-center rounded-2xl border', optionIconClass)}>
                            <PanelsTopLeft className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-[var(--studio-text)]">加入已有分组</div>
                            {hasExistingGroups ? (
                              <div className="mt-1 text-xs leading-5 text-[var(--studio-muted)]">
                                {selectedExistingGroup ? selectedExistingGroup.name : '选择一个已有分组'}
                              </div>
                            ) : (
                              <div className="mt-1 text-xs leading-5 text-[var(--studio-muted)]">
                                当前还没有可加入的分组
                              </div>
                            )}
                          </div>
                        </div>
                        {createProjectDraft.groupMode === 'existing' ? (
                          <span className="studio-chip">默认</span>
                        ) : null}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCreateProjectDraft((prev) => (prev ? { ...prev, groupMode: 'new' } : prev))}
                      className={cx(
                        'group rounded-[1.4rem] border p-4 text-left transition-all duration-200',
                        createProjectDraft.groupMode === 'new'
                          ? 'border-amber-400/40 bg-amber-400/10 shadow-[0_16px_36px_rgba(245,158,11,0.12)]'
                          : 'border-[var(--studio-border)] bg-[var(--studio-field)] hover:border-[var(--studio-border-strong)]',
                        createProjectDraft.groupMode !== 'new' && modalGhostHoverClass,
                      )}
                    >
                      <div className="flex items-start justify-between gap-3.5">
                        <div className="flex items-center gap-3.5">
                          <div className={cx('flex h-11 w-11 items-center justify-center rounded-2xl border', optionIconClass)}>
                            <Plus className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-[var(--studio-text)]">新建分组</div>
                            <div className="mt-1 text-xs leading-5 text-[var(--studio-muted)]">
                              为这个项目创建一个新的分组入口，后续再在分组视图中统一管理。
                            </div>
                          </div>
                        </div>
                        {createProjectDraft.groupMode === 'new' ? (
                          <span className="studio-chip">当前</span>
                        ) : null}
                      </div>
                    </button>
                  </div>
                </div>

                {createProjectDraft.groupMode === 'existing' ? (
                  <label className="space-y-2.5">
                    <span className="text-sm font-medium text-[var(--studio-muted)]">选择已有分组</span>
                    <StudioSelect
                      value={createProjectDraft.existingGroupId || projectGroups[0]?.id || ''}
                      onChange={(event) => setCreateProjectDraft((prev) => (prev ? { ...prev, existingGroupId: event.target.value } : prev))}
                      className="studio-select"
                    >
                      {projectGroups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}（{group.projects.length} 个项目）
                        </option>
                      ))}
                    </StudioSelect>
                  </label>
                ) : (
                  <label className="space-y-2.5">
                    <span className="text-sm font-medium text-[var(--studio-muted)]">新分组名称</span>
                    <input
                      value={createProjectDraft.newGroupName}
                      onChange={(event) => setCreateProjectDraft((prev) => (prev ? { ...prev, newGroupName: event.target.value } : prev))}
                      placeholder="新分组 1"
                      className="studio-input"
                    />
                    <p className="text-xs leading-5 text-[var(--studio-dim)]">
                      创建后项目会自动放进这个新分组中，便于后续按主题或客户管理。
                    </p>
                  </label>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-[var(--studio-border)] px-6 py-4 md:px-8">
              <button type="button" onClick={() => setCreateProjectDraft(null)} className="studio-button studio-button-secondary">
                取消
              </button>
              <button type="button" onClick={confirmCreateProject} className="studio-button studio-button-primary">
                创建项目
              </button>
            </div>
          </div>
        ) : null}
      </StudioModal>

      {projects.length === 0 ? (
        <StudioPanel className="mt-6 px-8 py-16 text-center" tone="soft">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/8 text-white">
            <Film className="h-6 w-6" />
          </div>
          <h3 className="mt-5 text-xl font-semibold text-[var(--studio-text)]">还没有项目</h3>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[var(--studio-muted)]">
            先从上方创建一个视频制作项目，后续所有图片和视频会自动汇总到资产库。
          </p>
        </StudioPanel>
      ) : homeViewMode === 'projects' ? (
        <div className="mt-8 space-y-8">
          {projectGroups.map((group) => (
            <section key={group.id} className="space-y-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex min-w-0 items-center gap-3">
                  <h3 className="min-w-0 truncate text-xl font-semibold text-[var(--studio-text)]" title={group.name}>
                    {group.name}
                  </h3>
                  <span className="inline-flex min-w-[6.75rem] shrink-0 items-center justify-center rounded-full border border-[var(--studio-border)] bg-[var(--studio-surface-soft)] px-3 py-1 text-sm font-medium text-[var(--studio-muted)] whitespace-nowrap">
                    {group.projects.length} 个项目
                  </span>
                </div>
                <button type="button" onClick={() => openGroupDetail(group.id)} className="studio-button studio-button-secondary">
                  查看分组详情
                </button>
              </div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {group.projects.map((project) => renderProjectCard(project))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {projectGroups.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => openGroupDetail(group.id)}
              className="text-left"
            >
              <StudioPanel className="h-full space-y-4 p-5 transition-transform duration-300 hover:-translate-y-0.5">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1 truncate text-lg font-semibold text-[var(--studio-text)]" title={group.name}>
                    {group.name}
                  </div>
                  <div className="inline-flex shrink-0 items-center rounded-full border border-[var(--studio-border)] bg-[var(--studio-surface-soft)] px-3 py-1 text-xs font-medium text-[var(--studio-muted)] whitespace-nowrap">
                    {group.projects.length} 个项目
                  </div>
                </div>

                {group.previewImages.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {group.previewImages.map((imageUrl, index) => (
                      <div key={`${group.id}-${index}`} className="overflow-hidden rounded-2xl border border-white/10 bg-black/10 aspect-video">
                        <img src={imageUrl} alt={`${group.name}-${index + 1}`} className="h-full w-full object-cover" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {Array.from({ length: 4 }, (_, index) => (
                      <div key={`${group.id}-placeholder-${index}`} className="flex aspect-video items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 text-[10px] text-[var(--studio-dim)]">
                        暂无截图
                      </div>
                    ))}
                  </div>
                )}

                <div className="inline-flex items-center gap-2 text-sm text-[var(--studio-text)]">
                  <PanelsTopLeft className="h-4 w-4 text-[var(--studio-muted)]" />
                  进入分组详情
                </div>
              </StudioPanel>
            </button>
          ))}
        </div>
      )}
    </StudioPage>
  );
}

type GroupDetailWorkspaceProps = {
  selectedGroupId: string | null;
  projectGroups: ProjectGroupSummary[];
  projects: Project[];
  updateGroupName: (groupId: string, value: string) => void;
  onBack: () => void;
  onPreviewImage: (url: string) => void;
  renderProjectCard: (project: Project) => ReactNode;
};

export function GroupDetailWorkspace({
  selectedGroupId,
  projectGroups,
  projects,
  updateGroupName,
  onBack,
  onPreviewImage,
  renderProjectCard,
}: GroupDetailWorkspaceProps) {
  const selectedGroup = projectGroups.find((group) => group.id === selectedGroupId);

  if (!selectedGroup) {
    return (
      <StudioPage>
        <StudioPanel className="px-8 py-12 text-center">
          <h2 className="text-2xl font-semibold text-[var(--studio-text)]">分组不存在</h2>
          <p className="mt-3 text-sm text-[var(--studio-muted)]">该分组可能已被删除，或者当前状态还未同步。</p>
          <button type="button" onClick={onBack} className="studio-button studio-button-secondary mt-6">
            返回分组视图
          </button>
        </StudioPanel>
      </StudioPage>
    );
  }

  const selectedGroupImages = getProjectGroupImageAssets(selectedGroup.id, projects);

  return (
    <StudioPage className="studio-page-wide">
      <StudioPageHeader
        eyebrow="Group Detail"
        title={selectedGroup.name}
        description={(
          <p>
            这个分组页被整理成两个层级：上面只展示分组状态与图片资产，下面列出组内项目，继续进入各自流程。
          </p>
        )}
        actions={(
          <>
            <StudioMetricCard label="组内项目" value={selectedGroup.projects.length} detail="点击项目卡片继续流程" />
            <StudioMetricCard label="已生成图片" value={selectedGroupImages.length} detail="来自资产、分镜与极速图像" />
          </>
        )}
      />

      <div className="mt-6 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="studio-button studio-button-secondary">
            返回分组视图
          </button>
          <input
            value={selectedGroup.name}
            onChange={(event) => updateGroupName(selectedGroup.id, event.target.value)}
            className="studio-inline-input min-w-[14rem]"
          />
        </div>
        <span className="studio-chip">{selectedGroup.projects.length} 个项目</span>
      </div>

      {selectedGroup.previewImages.length > 0 ? (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {selectedGroup.previewImages.map((imageUrl, index) => (
            <button
              key={`${selectedGroup.id}-detail-${index}`}
              type="button"
              onClick={() => onPreviewImage(imageUrl)}
              className="overflow-hidden rounded-[1.4rem] border border-white/10 bg-black/10 text-left shadow-[0_18px_40px_rgba(2,6,23,0.14)]"
            >
              <img src={imageUrl} alt={`${selectedGroup.name}-${index + 1}`} className="aspect-video h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <StudioPanel className="p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="studio-eyebrow">Generated Assets</div>
              <h3 className="mt-2 text-xl font-semibold text-[var(--studio-text)]">分组图片资产</h3>
            </div>
            <span className="text-xs text-[var(--studio-dim)]">{selectedGroupImages.length} 张可预览图片</span>
          </div>

          {selectedGroupImages.length > 0 ? (
            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {selectedGroupImages.map((image) => (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => onPreviewImage(image.imageUrl)}
                  className="overflow-hidden rounded-[1.35rem] border border-white/10 bg-black/10 text-left transition-transform duration-300 hover:-translate-y-0.5"
                >
                  <div className="aspect-square overflow-hidden bg-black/10">
                    <img src={image.imageUrl} alt={image.title} className="h-full w-full object-cover" />
                  </div>
                  <div className="space-y-1 p-3">
                    <div className="text-[11px] text-[var(--studio-dim)]">{image.projectName}</div>
                    <div className="text-sm font-medium text-[var(--studio-text)] line-clamp-2">{image.title}</div>
                    <div className="text-[11px] text-[var(--studio-muted)]">{image.sourceLabel}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-[1.4rem] border border-dashed border-white/10 bg-black/8 px-6 py-12 text-center text-sm text-[var(--studio-muted)]">
              当前分组还没有已生成图片。
            </div>
          )}
        </StudioPanel>

        <StudioPanel className="space-y-4 p-6" tone="soft">
          <div className="studio-eyebrow">Reading Order</div>
          <h3 className="text-xl font-semibold text-[var(--studio-text)]">页面信息结构</h3>
          <ul className="space-y-3 text-sm leading-6 text-[var(--studio-muted)]">
            <li>先看分组头部，确认数量和代表性画面。</li>
            <li>再看组内图片资产，横向检查风格连续性。</li>
            <li>最后进入单个项目，继续各自的生成流程。</li>
          </ul>
        </StudioPanel>
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="studio-eyebrow">Projects In Group</div>
            <h3 className="mt-2 text-xl font-semibold text-[var(--studio-text)]">组内项目</h3>
          </div>
          <span className="text-xs text-[var(--studio-dim)]">点击卡片继续对应流程</span>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {selectedGroup.projects.map((project) => renderProjectCard(project))}
        </div>
      </div>
    </StudioPage>
  );
}
