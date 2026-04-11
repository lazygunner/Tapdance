import { Image as ImageIcon, RefreshCw, Upload, Video } from 'lucide-react';

import { StudioMetricCard, StudioPage, StudioPageHeader, StudioPanel } from '../../../components/studio/StudioPrimitives.tsx';
import type { AssetLibraryConfig } from '../../../services/assetLibrary.ts';
import type { ProjectType } from '../../../types.ts';

type AssetLibraryStatusItem = {
  id: string;
  kind: 'image' | 'video';
  url: string;
  projectId: string;
  projectName: string;
  projectType: ProjectType;
  groupName: string;
  title: string;
  sourceLabel: string;
  savedToLibrary: boolean;
  savedRelativePath: string;
};

type AssetLibraryWorkspaceProps = {
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
  onRefreshAssetLibrarySettings: () => void;
  onApplyAssetLibraryRoot: (rootPath: string) => void;
  onSyncAssetLibrary: () => void;
  onPreviewImage: (url: string) => void;
  onPersistAssetLibraryItem: (item: AssetLibraryStatusItem) => void;
  onOpenProject: (projectId: string) => void;
};

export function AssetLibraryWorkspace({
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
  onPreviewImage,
  onPersistAssetLibraryItem,
  onOpenProject,
}: AssetLibraryWorkspaceProps) {
  const groupedItems = Array.from(assetLibraryItems.reduce((groupMap, item) => {
    const existingGroup = groupMap.get(item.groupName) || {
      groupName: item.groupName,
      projects: new Map<string, {
        projectId: string;
        projectName: string;
        items: AssetLibraryStatusItem[];
      }>(),
    };
    const projectKey = `${item.projectId}:${item.projectName}`;
    const existingProject = existingGroup.projects.get(projectKey) || {
      projectId: item.projectId,
      projectName: item.projectName,
      items: [],
    };

    existingProject.items.push(item);
    existingGroup.projects.set(projectKey, existingProject);
    groupMap.set(item.groupName, existingGroup);
    return groupMap;
  }, new Map<string, {
    groupName: string;
    projects: Map<string, {
      projectId: string;
      projectName: string;
      items: AssetLibraryStatusItem[];
    }>;
  }>()).values())
    .map((group) => ({
      groupName: group.groupName,
      projects: Array.from(group.projects.values())
        .sort((left, right) => left.projectName.localeCompare(right.projectName, 'zh-Hans-CN'))
        .map((projectEntry) => ({
          ...projectEntry,
          items: [...projectEntry.items].sort((left, right) => left.title.localeCompare(right.title, 'zh-Hans-CN')),
        })),
    }))
    .sort((left, right) => left.groupName.localeCompare(right.groupName, 'zh-Hans-CN'));

  return (
    <StudioPage className="studio-page-wide">
      <StudioPageHeader
        eyebrow="Asset Library"
        title="资产库"
        description={(
          <p>
            汇总所有项目的图片与视频，按项目写入本地目录。
          </p>
        )}
        actions={(
          <>
            <StudioPanel className="min-w-[10rem] px-4 py-4" tone="soft">
              <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--studio-muted)]">资产总数</div>
              <div className="mt-3 text-2xl font-semibold text-[var(--studio-text)]">{assetLibraryItems.length}</div>
              <div className="mt-2 text-xs text-[var(--studio-dim)]">跨全部项目聚合</div>
            </StudioPanel>
            <StudioMetricCard label="图片" value={libraryImageCount} detail="包含资产、分镜和参考图" />
            <StudioMetricCard label="视频" value={libraryVideoCount} detail="包含镜头、转场和成片" />
            <StudioMetricCard label="已入库" value={savedAssetLibraryCount} detail={`${unsavedAssetLibraryCount} 项待保存`} />
          </>
        )}
      />

      <StudioPanel className="mt-8 space-y-5 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="studio-eyebrow">Storage</div>
              <h2 className="mt-2 text-xl font-semibold text-[var(--studio-text)]">资产库存储</h2>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <label className="block min-w-0">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--studio-dim)]">本地路径</span>
            <input
              value={assetLibraryRootDraft}
              onChange={(event) => onAssetLibraryRootDraftChange(event.target.value)}
              placeholder={assetLibraryConfig?.defaultRootPath || 'local_asset_library'}
              className="studio-input mt-2"
            />
          </label>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <button
              type="button"
              onClick={() => onApplyAssetLibraryRoot(assetLibraryRootDraft)}
              disabled={isSavingAssetLibraryConfig}
              className="studio-button studio-button-primary px-4"
            >
              {isSavingAssetLibraryConfig ? <img src="./assets/loading.gif" alt="" className="h-4 w-4" /> : <Upload className="h-4 w-4 rotate-180" />}
              保存路径
            </button>
            <button
              type="button"
              onClick={() => onApplyAssetLibraryRoot('')}
              disabled={isSavingAssetLibraryConfig}
              className="studio-button studio-button-secondary px-4"
            >
              恢复默认
            </button>
          </div>
        </div>
      </StudioPanel>

      {assetLibraryItems.length === 0 ? (
        <StudioPanel className="mt-8 px-8 py-16 text-center" tone="soft">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/8 text-white">
            <ImageIcon className="h-6 w-6" />
          </div>
          <h3 className="mt-5 text-xl font-semibold text-[var(--studio-text)]">资产库还是空的</h3>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[var(--studio-muted)]">
            先去“视频制作”里生成图片或视频，这里会自动汇总展示，并支持写入本地目录。
          </p>
        </StudioPanel>
      ) : (
        <div className="mt-8 space-y-8">
          {groupedItems.map((group) => (
            <section key={group.groupName} className="space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="studio-eyebrow">Group</div>
                  <h2 className="mt-2 text-2xl font-semibold text-[var(--studio-text)]">{group.groupName}</h2>
                </div>
                <span className="studio-chip">
                  {group.projects.reduce((total, projectEntry) => total + projectEntry.items.length, 0)} 项资产
                </span>
              </div>

              <div className="space-y-5">
                {group.projects.map((projectEntry) => (
                  <StudioPanel key={`${group.groupName}-${projectEntry.projectId}`} className="p-5">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <div className="text-lg font-semibold text-[var(--studio-text)]">{projectEntry.projectName}</div>
                        <div className="mt-1 text-xs text-[var(--studio-dim)]">
                          {group.groupName}/{projectEntry.projectName}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="studio-chip">{projectEntry.items.length} 项</span>
                        <button
                          type="button"
                          onClick={() => onOpenProject(projectEntry.projectId)}
                          className="studio-button studio-button-secondary px-3 py-2 text-xs"
                        >
                          打开项目
                        </button>
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                      {projectEntry.items.map((item) => {
                        const kindChipClass = item.kind === 'image'
                          ? 'studio-accent-chip-cyan'
                          : 'studio-accent-chip-emerald';
                        const isSaving = Boolean(savingAssetLibraryItems[item.id]);

                        return (
                          <StudioPanel key={item.id} className="overflow-hidden">
                            <div className="relative">
                              {item.kind === 'image' ? (
                                <button
                                  type="button"
                                  onClick={() => onPreviewImage(item.url)}
                                  className="block w-full text-left"
                                >
                                  <div className="aspect-[4/3] overflow-hidden bg-black/20">
                                    <img src={item.url} alt={item.title} className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02]" />
                                  </div>
                                </button>
                              ) : (
                                <div className="aspect-video overflow-hidden bg-black">
                                  <video src={item.url} controls preload="metadata" className="h-full w-full bg-black" />
                                </div>
                              )}

                              <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
                                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium ${kindChipClass}`}>
                                  {item.kind === 'image' ? <ImageIcon className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />}
                                  {item.kind === 'image' ? '图片' : '视频'}
                                </span>
                              </div>
                            </div>

                            <div className="space-y-3 p-4">
                              <div>
                                <div className="text-[11px] text-[var(--studio-dim)]">
                                  {item.sourceLabel}
                                </div>
                                <div className="mt-2 text-base font-semibold text-[var(--studio-text)] line-clamp-2">{item.title}</div>
                              </div>

                              <div className="space-y-2 text-sm text-[var(--studio-muted)]">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${item.savedToLibrary ? 'studio-accent-chip-emerald' : 'studio-accent-chip-amber'}`}>
                                    {item.savedToLibrary ? '已入库' : '待保存'}
                                  </span>
                                </div>
                                {item.savedRelativePath ? (
                                  <div className="line-clamp-2 text-[11px] leading-5 text-[var(--studio-dim)] break-all">
                                    {item.savedRelativePath}
                                  </div>
                                ) : null}
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => onPersistAssetLibraryItem(item)}
                                  disabled={isSaving}
                                  className="studio-button studio-button-secondary px-3 py-2 text-xs"
                                >
                                  {isSaving ? <img src="./assets/loading.gif" alt="" className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5 rotate-180" />}
                                  {item.savedToLibrary ? '重新保存' : '保存到资产库'}
                                </button>
                              </div>
                            </div>
                          </StudioPanel>
                        );
                      })}
                    </div>
                  </StudioPanel>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </StudioPage>
  );
}
