import { useState } from 'react';

import { fetchAssetLibraryConfig, saveMediaToAssetLibrary, updateAssetLibraryConfig, type AssetLibraryConfig } from '../../../services/assetLibrary.ts';
import { revokeBlobUrl } from '../../../services/mediaStorage.ts';
import { normalizeProjectGroupName } from '../../../services/projectGroups.ts';
import type { Project } from '../../../types.ts';
import type { AssetLibraryStatusItem } from '../utils/assetLibraryItems.ts';

type PersistedMedia = {
  url: string;
  storageKey: string;
  relativePath: string;
  absolutePath: string;
  savedToLibrary: boolean;
};

type UseAssetLibraryStateArgs = {
  apiBaseUrl?: string;
  project: Project;
  useMockMode: boolean;
  assetLibraryItems: AssetLibraryStatusItem[];
  applyLibraryItemToProjectRecord: (projectId: string, itemId: string, nextUrl: string) => void;
};

export function useAssetLibraryState({
  apiBaseUrl,
  project,
  useMockMode,
  assetLibraryItems,
  applyLibraryItemToProjectRecord,
}: UseAssetLibraryStateArgs) {
  const [assetLibraryConfig, setAssetLibraryConfig] = useState<AssetLibraryConfig | null>(null);
  const [assetLibraryRootDraft, setAssetLibraryRootDraft] = useState('');
  const [isRefreshingAssetLibraryConfig, setIsRefreshingAssetLibraryConfig] = useState(false);
  const [isSavingAssetLibraryConfig, setIsSavingAssetLibraryConfig] = useState(false);
  const [savingAssetLibraryItems, setSavingAssetLibraryItems] = useState<Record<string, boolean>>({});
  const [isSyncingAssetLibrary, setIsSyncingAssetLibrary] = useState(false);

  const refreshAssetLibrarySettings = async () => {
    setIsRefreshingAssetLibraryConfig(true);
    try {
      const config = await fetchAssetLibraryConfig(apiBaseUrl);
      setAssetLibraryConfig(config);
      setAssetLibraryRootDraft(config.rootPath);
    } catch (error) {
      console.error('Failed to fetch asset library config:', error);
    } finally {
      setIsRefreshingAssetLibraryConfig(false);
    }
  };

  const persistGeneratedMediaUrl = async (
    sourceUrl: string,
    options: {
      kind: 'image' | 'video';
      assetId: string;
      title: string;
      fileNameHint?: string;
    },
  ): Promise<PersistedMedia> => {
    const groupName = normalizeProjectGroupName(project.groupName) || '未分组';
    const projectName = project.name.trim() || '未命名项目';
    try {
      const savedFile = await saveMediaToAssetLibrary({
        sourceUrl,
        kind: options.kind,
        assetId: options.assetId,
        title: options.title,
        groupName,
        projectName,
        fileNameHint: options.fileNameHint,
        baseUrl: apiBaseUrl,
      });
      if (sourceUrl !== savedFile.url) {
        revokeBlobUrl(sourceUrl);
      }
      return {
        url: savedFile.url,
        storageKey: '',
        relativePath: savedFile.relativePath,
        absolutePath: savedFile.absolutePath,
        savedToLibrary: true,
      };
    } catch (assetLibraryError) {
      console.error(`Failed to save media to asset library (${options.assetId}):`, assetLibraryError);
      if (useMockMode) {
        return {
          url: sourceUrl,
          storageKey: '',
          relativePath: '',
          absolutePath: '',
          savedToLibrary: false,
        };
      }
      throw new Error(
        `${options.kind === 'video' ? '视频' : '图片'}已生成，但自动保存到本地资产库失败：${
          assetLibraryError instanceof Error ? assetLibraryError.message : String(assetLibraryError)
        }`,
      );
    }
  };

  const persistAssetLibraryItem = async (item: AssetLibraryStatusItem, silent = false) => {
    setSavingAssetLibraryItems((prev) => ({ ...prev, [item.id]: true }));
    try {
      const savedFile = await saveMediaToAssetLibrary({
        sourceUrl: item.url,
        kind: item.kind,
        assetId: item.id,
        title: item.title,
        groupName: item.groupName,
        projectName: item.projectName,
        baseUrl: apiBaseUrl,
      });

      applyLibraryItemToProjectRecord(item.projectId, item.id, savedFile.url);
      return true;
    } catch (error: any) {
      console.error(`Failed to persist asset library item ${item.id}:`, error);
      if (!silent) {
        alert(error?.message || '写入资产库失败。');
      }
      return false;
    } finally {
      setSavingAssetLibraryItems((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }
  };

  const handleApplyAssetLibraryRoot = async (rootPath: string) => {
    setIsSavingAssetLibraryConfig(true);
    try {
      const nextConfig = await updateAssetLibraryConfig({
        rootPath,
        migrateExistingFiles: true,
        baseUrl: apiBaseUrl,
      });
      setAssetLibraryConfig(nextConfig);
      setAssetLibraryRootDraft(nextConfig.rootPath);
    } catch (error: any) {
      console.error('Failed to update asset library root:', error);
      alert(error?.message || '更新资产库路径失败。');
    } finally {
      setIsSavingAssetLibraryConfig(false);
    }
  };

  const handleSyncAssetLibrary = async () => {
    const pendingItems = assetLibraryItems.filter((item) => !item.savedToLibrary);
    if (pendingItems.length === 0) {
      return;
    }

    setIsSyncingAssetLibrary(true);
    let successCount = 0;
    for (const item of pendingItems) {
      const ok = await persistAssetLibraryItem(item, true);
      if (ok) {
        successCount += 1;
      }
    }
    setIsSyncingAssetLibrary(false);

    if (successCount !== pendingItems.length) {
      alert(`已同步 ${successCount}/${pendingItems.length} 个资产，部分文件写入失败。`);
    }
  };

  return {
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
  };
}
