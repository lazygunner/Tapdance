import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, BookOpenText, ExternalLink, FolderOpen, FolderPlus, Pencil, Plus, RefreshCw, Sparkles, Trash2, Upload, Users, X } from 'lucide-react';
import {
  cx,
  StudioModal,
  StudioPage,
  StudioPageHeader,
  StudioPanel,
  StudioSelect,
} from '../../../components/studio/StudioPrimitives.tsx';
import type { WorkspaceThemeMode } from '../../../components/studio/WorkspaceViews.tsx';
import { saveMediaToAssetLibrary } from '../../../services/assetLibrary.ts';
import {
  buildSeedreamGeneratedPortraitPrompt,
  buildPortraitLibraryFileUrl,
  fetchRealPortraitLibraryAssets,
  fetchPortraitLibraryConfig,
  fetchSeedreamGeneratedPortraitAssets,
  fetchVirtualPortraitLibraryAssets,
  getPortraitLibraryRelativePath,
  parseRealPortraitValidationCallback,
  saveSeedreamGeneratedPortraitAssets,
  saveRealPortraitLibraryAssets,
  saveVirtualPortraitLibraryAssets,
  SEEDREAM_GENERATED_PORTRAIT_MODEL,
  updatePortraitLibraryConfig,
  type PortraitLibraryConfig,
  type RealPortraitLibraryAsset,
  type SeedreamGeneratedPortraitAsset,
  type VirtualPortraitLibraryAsset,
} from '../../../services/portraitLibrary.ts';
import {
  ARK_REAL_PORTRAIT_GROUP_TYPE,
  DEFAULT_VIRTUAL_PORTRAIT_ASSET_GROUP_NAME,
  DEFAULT_VIRTUAL_PORTRAIT_PROJECT_NAME,
  createArkAssetGroup,
  createRealPortraitValidationSession,
  deleteArkAsset,
  deleteArkAssetGroup,
  getRealPortraitValidationResult,
  isArkAssetActiveStatus,
  isArkAssetFailedStatus,
  listArkAssetGroups,
  listArkAssets,
  normalizeArkAssetStatus,
  updateArkAssetGroup,
  uploadRealPortraitAsset,
  uploadVirtualPortraitAsset,
  type ArkAsset,
  type ArkAssetGroup,
} from '../../../services/volcengineAssetService.ts';
import { generateStoryboardImage } from '../../../services/volcengineService.ts';

type PortraitLibraryViewProps = {
  themeMode?: WorkspaceThemeMode;
  isModal?: boolean;
  selectionMode?: 'seedance' | 'image';
  onSelect?: (
    imgUrl: string,
    assetId: string,
    meta?: { description?: string; submitMode?: 'auto' | 'reference_image' },
  ) => void;
};

export type PortraitItem = {
  AssetGroup: {
    SID: string;
    Title: string;
    Description: string;
    Metadata: {
      Gender?: string;
      Age?: number;
      Country?: string;
      Occupation?: string;
    };
    Content: {
      Image: Array<{
        AssetID?: string;
        URL: string;
      }>;
    };
    Score?: number;
  };
};

type FilterState = {
  gender: string;
  age: string;
  country: string;
  occupation: string;
};

type BrowserPortraitFolderState = {
  folderName: string;
  fileUrls: Record<string, string>;
  fileCount: number;
};

type PortraitLibraryTab = 'public' | 'real' | 'virtualUpload' | 'seedream';

type RealPortraitDraftState = {
  description: string;
  assetId: string;
  projectName: string;
  bytedToken: string;
  h5Link: string;
  groupId: string;
  imageDataUrl: string;
  fileNameHint: string;
  file: File | null;
};

type SeedreamPortraitDraftState = {
  model: string;
  prompt: string;
};

type VirtualPortraitDraftState = {
  description: string;
  imageDataUrl: string;
  fileNameHint: string;
  file: File | null;
};

type VirtualPortraitGroupDraftState = {
  name: string;
  description: string;
  projectName: string;
};

type VirtualPortraitAssetGroupView = {
  group: ArkAssetGroup;
  assets: ArkAsset[];
  assetCount: number;
  coverImageUrl: string;
};

type RealPortraitAssetGroupView = {
  group: ArkAssetGroup;
  assets: ArkAsset[];
  assetCount: number;
  coverImageUrl: string;
};

type AssetGroupEditTarget = 'real' | 'virtual';

type AssetGroupEditDraft = {
  target: AssetGroupEditTarget;
  groupId: string;
  name: string;
  description: string;
  projectName: string;
};

const ITEMS_PER_PAGE = 30;
const PORTRAIT_DOWNLOAD_URL = 'https://pan.quark.cn/s/48caf9810a81';
const BROWSER_DIRECTORY_INPUT_PROPS = {
  directory: '',
  webkitdirectory: '',
} as const;
const REAL_PORTRAIT_LIBRARY_GROUP_NAME = '人像素材库';
const REAL_PORTRAIT_LIBRARY_PROJECT_NAME = '真人人像';
const VIRTUAL_PORTRAIT_LIBRARY_PROJECT_NAME = '虚拟人像上传';
const SEEDREAM_PORTRAIT_LIBRARY_PROJECT_NAME = 'Seedream 生成';
const EMPTY_REAL_PORTRAIT_DRAFT: RealPortraitDraftState = {
  description: '',
  assetId: '',
  projectName: DEFAULT_VIRTUAL_PORTRAIT_PROJECT_NAME,
  bytedToken: '',
  h5Link: '',
  groupId: '',
  imageDataUrl: '',
  fileNameHint: '',
  file: null,
};
const EMPTY_SEEDREAM_PORTRAIT_DRAFT: SeedreamPortraitDraftState = {
  model: SEEDREAM_GENERATED_PORTRAIT_MODEL,
  prompt: '',
};
const REAL_PORTRAIT_VALIDATION_CALLBACK_URL = 'https://tapdance.local/real-portrait-validation-callback';
const EMPTY_VIRTUAL_PORTRAIT_DRAFT: VirtualPortraitDraftState = {
  description: '',
  imageDataUrl: '',
  fileNameHint: '',
  file: null,
};
const EMPTY_VIRTUAL_GROUP_DRAFT: VirtualPortraitGroupDraftState = {
  name: DEFAULT_VIRTUAL_PORTRAIT_ASSET_GROUP_NAME,
  description: '',
  projectName: DEFAULT_VIRTUAL_PORTRAIT_PROJECT_NAME,
};

function buildSeedreamPortraitTitle(prompt: string) {
  const normalizedPrompt = prompt.replace(/\s+/gu, ' ').trim();
  if (!normalizedPrompt) {
    return 'Seedream 生成虚拟人像';
  }
  return normalizedPrompt.length > 36 ? `${normalizedPrompt.slice(0, 36)}...` : normalizedPrompt;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('读取图片失败。'));
    reader.readAsDataURL(file);
  });
}

function buildArkAssetFromVirtualPortraitLibraryAsset(asset: VirtualPortraitLibraryAsset): ArkAsset {
  return {
    id: asset.assetId,
    groupId: asset.groupId,
    name: asset.description,
    assetType: 'Image',
    projectName: asset.projectName || DEFAULT_VIRTUAL_PORTRAIT_PROJECT_NAME,
    url: asset.sourceUrl || asset.imageUrl,
    status: normalizeArkAssetStatus(asset.status),
    createTime: asset.createdAt,
    updateTime: asset.updatedAt,
  };
}

function buildArkAssetFromRealPortraitLibraryAsset(asset: RealPortraitLibraryAsset): ArkAsset {
  return {
    id: asset.assetId,
    groupId: asset.groupId || '',
    name: asset.description,
    assetType: 'Image',
    projectName: asset.projectName || DEFAULT_VIRTUAL_PORTRAIT_PROJECT_NAME,
    url: asset.sourceUrl || asset.imageUrl,
    status: normalizeArkAssetStatus(asset.status),
    createTime: asset.createdAt,
    updateTime: asset.updatedAt || asset.createdAt,
  };
}

function buildRealPortraitPlaceholderGroup(asset: RealPortraitLibraryAsset): ArkAssetGroup {
  const groupId = asset.groupId || `local-real-group:${asset.assetId}`;
  return {
    id: groupId,
    name: groupId,
    title: groupId,
    description: '',
    groupType: ARK_REAL_PORTRAIT_GROUP_TYPE,
    projectName: asset.projectName || DEFAULT_VIRTUAL_PORTRAIT_PROJECT_NAME,
    createTime: asset.createdAt,
    updateTime: asset.updatedAt || asset.createdAt,
  };
}

function buildVirtualPortraitPlaceholderGroup(asset: VirtualPortraitLibraryAsset): ArkAssetGroup {
  const groupName = asset.groupName || '素材资产组合';
  return {
    id: asset.groupId || `local-group:${asset.assetId}`,
    name: groupName,
    title: groupName,
    description: '',
    groupType: 'AIGC',
    projectName: asset.projectName || DEFAULT_VIRTUAL_PORTRAIT_PROJECT_NAME,
    createTime: asset.createdAt,
    updateTime: asset.updatedAt,
  };
}

function compareArkAssetsByNewest(left: ArkAsset, right: ArkAsset) {
  const leftTime = left.createTime || left.updateTime || '';
  const rightTime = right.createTime || right.updateTime || '';
  return rightTime.localeCompare(leftTime);
}

function mergeVirtualPortraitGroupsWithLocalAssets(
  groups: VirtualPortraitAssetGroupView[],
  localAssets: VirtualPortraitLibraryAsset[],
) {
  const localAssetByAssetId = new Map<string, VirtualPortraitLibraryAsset>();
  localAssets.forEach((item) => {
    if (item.assetId) {
      localAssetByAssetId.set(item.assetId, item);
    }
  });

  const groupMap = new Map<string, VirtualPortraitAssetGroupView>();
  const ensureGroupView = (group: ArkAssetGroup) => {
    const groupId = String(group.id || '').trim();
    const existing = groupMap.get(groupId);
    if (existing) {
      return existing;
    }

    const nextGroupView: VirtualPortraitAssetGroupView = {
      group: { ...group },
      assets: [],
      assetCount: 0,
      coverImageUrl: '',
    };
    groupMap.set(groupId, nextGroupView);
    return nextGroupView;
  };

  groups.forEach((groupView) => {
    const nextGroupView = ensureGroupView(groupView.group);
    nextGroupView.group = { ...nextGroupView.group, ...groupView.group };
    nextGroupView.coverImageUrl = groupView.coverImageUrl || nextGroupView.coverImageUrl;

    const assetMap = new Map(nextGroupView.assets.map((asset) => [asset.id, asset]));
    groupView.assets.forEach((asset) => {
      const localAsset = localAssetByAssetId.get(asset.id);
      assetMap.set(asset.id, {
        ...asset,
        name: asset.name || localAsset?.description || asset.id,
        groupId: asset.groupId || localAsset?.groupId || '',
        projectName: asset.projectName || localAsset?.projectName || DEFAULT_VIRTUAL_PORTRAIT_PROJECT_NAME,
        url: asset.url || localAsset?.sourceUrl || localAsset?.imageUrl || '',
        status: normalizeArkAssetStatus(asset.status || localAsset?.status),
        createTime: asset.createTime || localAsset?.createdAt || '',
        updateTime: asset.updateTime || localAsset?.updatedAt || '',
      });
    });
    nextGroupView.assets = Array.from(assetMap.values());
  });

  localAssets.forEach((localAsset) => {
    const placeholderGroup = buildVirtualPortraitPlaceholderGroup(localAsset);
    const nextGroupView = ensureGroupView(placeholderGroup);
    nextGroupView.group = {
      ...placeholderGroup,
      ...nextGroupView.group,
      name: nextGroupView.group.name || placeholderGroup.name,
      title: nextGroupView.group.title || nextGroupView.group.name || placeholderGroup.title,
      projectName: nextGroupView.group.projectName || placeholderGroup.projectName,
    };

    const assetMap = new Map(nextGroupView.assets.map((asset) => [asset.id, asset]));
    const existingAsset = assetMap.get(localAsset.assetId);
    const localOnlyAsset = buildArkAssetFromVirtualPortraitLibraryAsset(localAsset);
    assetMap.set(localAsset.assetId, existingAsset
      ? {
          ...localOnlyAsset,
          ...existingAsset,
          name: existingAsset.name || localOnlyAsset.name,
          groupId: existingAsset.groupId || localOnlyAsset.groupId,
          projectName: existingAsset.projectName || localOnlyAsset.projectName,
          url: existingAsset.url || localOnlyAsset.url,
          status: normalizeArkAssetStatus(existingAsset.status || localOnlyAsset.status),
          createTime: existingAsset.createTime || localOnlyAsset.createTime,
          updateTime: existingAsset.updateTime || localOnlyAsset.updateTime,
        }
      : localOnlyAsset);
    nextGroupView.assets = Array.from(assetMap.values());
  });

  return Array.from(groupMap.values())
    .map((groupView) => {
      const assets = Array.from(new Map(groupView.assets.map((asset) => [asset.id, asset])).values())
        .sort(compareArkAssetsByNewest);
      const coverAsset = assets[0] || null;
      const localCoverAsset = coverAsset ? localAssetByAssetId.get(coverAsset.id) : null;

      return {
        ...groupView,
        assets,
        assetCount: assets.length,
        coverImageUrl: localCoverAsset?.imageUrl || groupView.coverImageUrl || coverAsset?.url || '',
      };
    })
    .sort((left, right) => {
      const leftTime = left.group.updateTime || left.group.createTime || '';
      const rightTime = right.group.updateTime || right.group.createTime || '';
      return rightTime.localeCompare(leftTime);
    });
}

function mergeRealPortraitGroupsWithLocalAssets(
  groups: RealPortraitAssetGroupView[],
  localAssets: RealPortraitLibraryAsset[],
) {
  const localAssetByAssetId = new Map<string, RealPortraitLibraryAsset>();
  localAssets.forEach((item) => {
    if (item.assetId) {
      localAssetByAssetId.set(item.assetId, item);
    }
  });

  const groupMap = new Map<string, RealPortraitAssetGroupView>();
  const ensureGroupView = (group: ArkAssetGroup) => {
    const groupId = String(group.id || '').trim();
    const existing = groupMap.get(groupId);
    if (existing) {
      return existing;
    }

    const nextGroupView: RealPortraitAssetGroupView = {
      group: { ...group },
      assets: [],
      assetCount: 0,
      coverImageUrl: '',
    };
    groupMap.set(groupId, nextGroupView);
    return nextGroupView;
  };

  groups.forEach((groupView) => {
    const nextGroupView = ensureGroupView(groupView.group);
    nextGroupView.group = { ...nextGroupView.group, ...groupView.group };
    nextGroupView.coverImageUrl = groupView.coverImageUrl || nextGroupView.coverImageUrl;

    const assetMap = new Map(nextGroupView.assets.map((asset) => [asset.id, asset]));
    groupView.assets.forEach((asset) => {
      const localAsset = localAssetByAssetId.get(asset.id);
      assetMap.set(asset.id, {
        ...asset,
        name: asset.name || localAsset?.description || asset.id,
        groupId: asset.groupId || localAsset?.groupId || '',
        projectName: asset.projectName || localAsset?.projectName || DEFAULT_VIRTUAL_PORTRAIT_PROJECT_NAME,
        url: asset.url || localAsset?.sourceUrl || localAsset?.imageUrl || '',
        status: normalizeArkAssetStatus(asset.status || localAsset?.status),
        createTime: asset.createTime || localAsset?.createdAt || '',
        updateTime: asset.updateTime || localAsset?.updatedAt || localAsset?.createdAt || '',
      });
    });
    nextGroupView.assets = Array.from(assetMap.values());
  });

  localAssets.forEach((localAsset) => {
    const placeholderGroup = buildRealPortraitPlaceholderGroup(localAsset);
    const nextGroupView = ensureGroupView(placeholderGroup);
    nextGroupView.group = {
      ...placeholderGroup,
      ...nextGroupView.group,
      name: nextGroupView.group.name || placeholderGroup.name,
      title: nextGroupView.group.title || nextGroupView.group.name || placeholderGroup.title,
      projectName: nextGroupView.group.projectName || placeholderGroup.projectName,
    };

    const assetMap = new Map(nextGroupView.assets.map((asset) => [asset.id, asset]));
    const existingAsset = assetMap.get(localAsset.assetId);
    const localOnlyAsset = buildArkAssetFromRealPortraitLibraryAsset(localAsset);
    assetMap.set(localAsset.assetId, existingAsset
      ? {
          ...localOnlyAsset,
          ...existingAsset,
          name: existingAsset.name || localOnlyAsset.name,
          groupId: existingAsset.groupId || localOnlyAsset.groupId,
          projectName: existingAsset.projectName || localOnlyAsset.projectName,
          url: existingAsset.url || localOnlyAsset.url,
          status: normalizeArkAssetStatus(existingAsset.status || localOnlyAsset.status),
          createTime: existingAsset.createTime || localOnlyAsset.createTime,
          updateTime: existingAsset.updateTime || localOnlyAsset.updateTime,
        }
      : localOnlyAsset);
    nextGroupView.assets = Array.from(assetMap.values());
  });

  return Array.from(groupMap.values())
    .map((groupView) => {
      const assets = Array.from(new Map(groupView.assets.map((asset) => [asset.id, asset])).values())
        .sort(compareArkAssetsByNewest);
      const coverAsset = assets[0] || null;
      const localCoverAsset = coverAsset ? localAssetByAssetId.get(coverAsset.id) : null;

      return {
        ...groupView,
        assets,
        assetCount: assets.length,
        coverImageUrl: localCoverAsset?.imageUrl || groupView.coverImageUrl || coverAsset?.url || '',
      };
    })
    .sort((left, right) => {
      const leftTime = left.group.updateTime || left.group.createTime || '';
      const rightTime = right.group.updateTime || right.group.createTime || '';
      return rightTime.localeCompare(leftTime);
    });
}

function removeVirtualPortraitAssetFromGroupViews(groups: VirtualPortraitAssetGroupView[], assetId: string) {
  return groups.map((groupView) => {
    const assets = groupView.assets.filter((item) => item.id !== assetId);
    return {
      ...groupView,
      assets,
      assetCount: assets.length,
      coverImageUrl: assets[0]?.url || '',
    };
  });
}

function removeRealPortraitAssetFromGroupViews(groups: RealPortraitAssetGroupView[], assetId: string) {
  return groups.map((groupView) => {
    const assets = groupView.assets.filter((item) => item.id !== assetId);
    return {
      ...groupView,
      assets,
      assetCount: assets.length,
      coverImageUrl: assets[0]?.url || '',
    };
  });
}

export function PortraitLibraryView({ themeMode, isModal = false, selectionMode = 'seedance', onSelect }: PortraitLibraryViewProps) {
  const resolvedThemeMode: WorkspaceThemeMode = themeMode
    ?? (typeof document !== 'undefined' && (document.body.classList.contains('theme-light') || document.documentElement.classList.contains('theme-light'))
      ? 'light'
      : 'dark');
  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);

  const [activeTab, setActiveTab] = useState<PortraitLibraryTab>('public');
  const [data, setData] = useState<PortraitItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<FilterState>({
    gender: 'all',
    age: 'all',
    country: 'all',
    occupation: 'all',
  });
  const [page, setPage] = useState(1);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [portraitConfig, setPortraitConfig] = useState<PortraitLibraryConfig | null>(null);
  const [isRefreshingConfig, setIsRefreshingConfig] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configFeedback, setConfigFeedback] = useState('');
  const [browserFolderState, setBrowserFolderState] = useState<BrowserPortraitFolderState>({
    folderName: '',
    fileUrls: {},
    fileCount: 0,
  });
  const [realPortraitAssets, setRealPortraitAssets] = useState<RealPortraitLibraryAsset[]>([]);
  const [isLoadingRealPortraitAssets, setIsLoadingRealPortraitAssets] = useState(false);
  const [realPortraitError, setRealPortraitError] = useState('');
  const [realPortraitFeedback, setRealPortraitFeedback] = useState('');
  const [isAddRealPortraitModalOpen, setIsAddRealPortraitModalOpen] = useState(false);
  const [isRealGroupModalOpen, setIsRealGroupModalOpen] = useState(false);
  const [realPortraitGroups, setRealPortraitGroups] = useState<RealPortraitAssetGroupView[]>([]);
  const [selectedRealPortraitGroupId, setSelectedRealPortraitGroupId] = useState('');
  const [isLoadingRealPortraitGroups, setIsLoadingRealPortraitGroups] = useState(false);
  const [isSavingRealPortraitAsset, setIsSavingRealPortraitAsset] = useState(false);
  const [isCreatingRealPortraitSession, setIsCreatingRealPortraitSession] = useState(false);
  const [isOpeningRealPortraitValidation, setIsOpeningRealPortraitValidation] = useState(false);
  const [isQueryingRealPortraitGroup, setIsQueryingRealPortraitGroup] = useState(false);
  const [realPortraitUploadStep, setRealPortraitUploadStep] = useState('');
  const [realAssetDetail, setRealAssetDetail] = useState<{ asset: ArkAsset; localAsset?: RealPortraitLibraryAsset | null } | null>(null);
  const [isConfirmingRealAssetDelete, setIsConfirmingRealAssetDelete] = useState(false);
  const [deletingRealAssetId, setDeletingRealAssetId] = useState('');
  const [realPortraitDraft, setRealPortraitDraft] = useState<RealPortraitDraftState>(EMPTY_REAL_PORTRAIT_DRAFT);
  const [realPortraitDraftError, setRealPortraitDraftError] = useState('');
  const [virtualPortraitAssets, setVirtualPortraitAssets] = useState<VirtualPortraitLibraryAsset[]>([]);
  const [virtualPortraitGroups, setVirtualPortraitGroups] = useState<VirtualPortraitAssetGroupView[]>([]);
  const [selectedVirtualPortraitGroupId, setSelectedVirtualPortraitGroupId] = useState('');
  const [isLoadingVirtualPortraitAssets, setIsLoadingVirtualPortraitAssets] = useState(false);
  const [isLoadingVirtualPortraitGroups, setIsLoadingVirtualPortraitGroups] = useState(false);
  const [virtualPortraitError, setVirtualPortraitError] = useState('');
  const [virtualPortraitFeedback, setVirtualPortraitFeedback] = useState('');
  const [isVirtualPortraitModalOpen, setIsVirtualPortraitModalOpen] = useState(false);
  const [isVirtualGroupModalOpen, setIsVirtualGroupModalOpen] = useState(false);
  const [isCreatingVirtualGroup, setIsCreatingVirtualGroup] = useState(false);
  const [isUploadingVirtualPortraitAsset, setIsUploadingVirtualPortraitAsset] = useState(false);
  const [virtualAssetDetail, setVirtualAssetDetail] = useState<{ asset: ArkAsset; localAsset?: VirtualPortraitLibraryAsset | null } | null>(null);
  const [isConfirmingVirtualAssetDelete, setIsConfirmingVirtualAssetDelete] = useState(false);
  const [deletingVirtualAssetId, setDeletingVirtualAssetId] = useState('');
  const [deletingVirtualGroupId, setDeletingVirtualGroupId] = useState('');
  const [deletingRealGroupId, setDeletingRealGroupId] = useState('');
  const [editingAssetGroup, setEditingAssetGroup] = useState<AssetGroupEditDraft | null>(null);
  const [assetGroupEditError, setAssetGroupEditError] = useState('');
  const [isUpdatingAssetGroup, setIsUpdatingAssetGroup] = useState(false);
  const [virtualPortraitUploadStep, setVirtualPortraitUploadStep] = useState('');
  const [virtualPortraitDraft, setVirtualPortraitDraft] = useState<VirtualPortraitDraftState>(EMPTY_VIRTUAL_PORTRAIT_DRAFT);
  const [virtualGroupDraft, setVirtualGroupDraft] = useState<VirtualPortraitGroupDraftState>(EMPTY_VIRTUAL_GROUP_DRAFT);
  const [virtualPortraitDraftError, setVirtualPortraitDraftError] = useState('');
  const [virtualGroupDraftError, setVirtualGroupDraftError] = useState('');
  const [seedreamPortraitAssets, setSeedreamPortraitAssets] = useState<SeedreamGeneratedPortraitAsset[]>([]);
  const [isLoadingSeedreamPortraitAssets, setIsLoadingSeedreamPortraitAssets] = useState(false);
  const [seedreamPortraitError, setSeedreamPortraitError] = useState('');
  const [seedreamPortraitFeedback, setSeedreamPortraitFeedback] = useState('');
  const [isSeedreamPortraitModalOpen, setIsSeedreamPortraitModalOpen] = useState(false);
  const [isGeneratingSeedreamPortrait, setIsGeneratingSeedreamPortrait] = useState(false);
  const [seedreamPortraitDraft, setSeedreamPortraitDraft] = useState<SeedreamPortraitDraftState>(EMPTY_SEEDREAM_PORTRAIT_DRAFT);
  const [seedreamPortraitDraftError, setSeedreamPortraitDraftError] = useState('');
  const browserDirectoryInputRef = useRef<HTMLInputElement | null>(null);
  const realPortraitUploadInputRef = useRef<HTMLInputElement | null>(null);
  const virtualPortraitUploadInputRef = useRef<HTMLInputElement | null>(null);
  const realPortraitValidationFlowRef = useRef(0);

  const refreshPortraitConfig = async () => {
    setIsRefreshingConfig(true);
    try {
      const nextConfig = await fetchPortraitLibraryConfig();
      setPortraitConfig(nextConfig);
    } catch (configError) {
      console.warn('Failed to load portrait library config:', configError);
    } finally {
      setIsRefreshingConfig(false);
    }
  };

  const refreshRealPortraitAssets = async () => {
    setIsLoadingRealPortraitAssets(true);
    setRealPortraitError('');
    try {
      const nextAssets = await fetchRealPortraitLibraryAssets();
      setRealPortraitAssets(nextAssets);
      setRealPortraitGroups((currentGroups) => mergeRealPortraitGroupsWithLocalAssets(currentGroups, nextAssets));
    } catch (loadError: any) {
      console.error('Failed to load real portrait library assets:', loadError);
      setRealPortraitError(loadError?.message || '加载真人人像资产失败');
    } finally {
      setIsLoadingRealPortraitAssets(false);
    }
  };

  const refreshRealPortraitGroups = async () => {
    setIsLoadingRealPortraitGroups(true);
    setRealPortraitError('');
    try {
      const groups = await listArkAssetGroups({ groupType: ARK_REAL_PORTRAIT_GROUP_TYPE });
      const nextGroups = await Promise.all(groups.map(async (group) => {
        const assets = await listArkAssets({
          groupId: group.id,
          groupType: ARK_REAL_PORTRAIT_GROUP_TYPE,
          projectName: group.projectName,
        });

        return {
          group,
          assets,
          assetCount: assets.length,
          coverImageUrl: assets[0]?.url || '',
        };
      }));
      const latestAssetByAssetId = new Map<string, ArkAsset>();
      nextGroups.forEach((groupView) => {
        groupView.assets.forEach((asset) => {
          latestAssetByAssetId.set(asset.id, asset);
        });
      });

      let didUpdateLocalAssets = false;
      const nextLocalAssetsDraft = realPortraitAssets.map((item) => {
        const latest = latestAssetByAssetId.get(item.assetId);
        if (!latest) {
          return item;
        }

        const nextStatus = normalizeArkAssetStatus(latest.status || item.status);
        const nextSourceUrl = latest.url || item.sourceUrl;
        const nextGroupId = latest.groupId || item.groupId;
        const nextProjectName = latest.projectName || item.projectName;
        const hasChanged = nextStatus !== item.status
          || nextSourceUrl !== item.sourceUrl
          || nextGroupId !== item.groupId
          || nextProjectName !== item.projectName;

        if (!hasChanged) {
          return item;
        }

        didUpdateLocalAssets = true;
        return {
          ...item,
          status: nextStatus,
          sourceUrl: nextSourceUrl,
          groupId: nextGroupId,
          projectName: nextProjectName,
          updatedAt: new Date().toISOString(),
        };
      });

      const nextLocalAssets = didUpdateLocalAssets
        ? await saveRealPortraitLibraryAssets(nextLocalAssetsDraft)
        : realPortraitAssets;

      if (didUpdateLocalAssets) {
        setRealPortraitAssets(nextLocalAssets);
      }

      const mergedGroups = mergeRealPortraitGroupsWithLocalAssets(nextGroups, nextLocalAssets);
      setRealPortraitGroups(mergedGroups);
      if (selectedRealPortraitGroupId && !mergedGroups.some((item) => item.group.id === selectedRealPortraitGroupId)) {
        setSelectedRealPortraitGroupId('');
      }
      setRealPortraitFeedback('已手动刷新真人人像分组和素材列表。');
    } catch (loadError: any) {
      console.error('Failed to load real portrait asset groups:', loadError);
      setRealPortraitError(loadError?.message || '加载真人人像分组失败');
    } finally {
      setIsLoadingRealPortraitGroups(false);
    }
  };

  const refreshVirtualPortraitAssets = async () => {
    setIsLoadingVirtualPortraitAssets(true);
    setVirtualPortraitError('');
    try {
      const nextAssets = await fetchVirtualPortraitLibraryAssets();
      setVirtualPortraitAssets(nextAssets);
      setVirtualPortraitGroups((currentGroups) => mergeVirtualPortraitGroupsWithLocalAssets(currentGroups, nextAssets));
    } catch (loadError: any) {
      console.error('Failed to load virtual portrait library assets:', loadError);
      setVirtualPortraitError(loadError?.message || '加载虚拟人像上传资产失败');
    } finally {
      setIsLoadingVirtualPortraitAssets(false);
    }
  };

  const refreshVirtualPortraitGroups = async () => {
    setIsLoadingVirtualPortraitGroups(true);
    setVirtualPortraitError('');
    try {
      const groups = await listArkAssetGroups();
      const nextGroups = await Promise.all(groups.map(async (group) => {
        const assets = await listArkAssets({
          groupId: group.id,
          projectName: group.projectName,
        });

        return {
          group,
          assets,
          assetCount: assets.length,
          coverImageUrl: assets[0]?.url || '',
        };
      }));
      const latestAssetByAssetId = new Map<string, ArkAsset>();
      nextGroups.forEach((groupView) => {
        groupView.assets.forEach((asset) => {
          latestAssetByAssetId.set(asset.id, asset);
        });
      });

      let didUpdateLocalAssets = false;
      const nextLocalAssetsDraft = virtualPortraitAssets.map((item) => {
        const latest = latestAssetByAssetId.get(item.assetId);
        if (!latest) {
          return item;
        }

        const nextStatus = normalizeArkAssetStatus(latest.status || item.status);
        const nextSourceUrl = latest.url || item.sourceUrl;
        const nextGroupId = latest.groupId || item.groupId;
        const nextProjectName = latest.projectName || item.projectName;
        const hasChanged = nextStatus !== item.status
          || nextSourceUrl !== item.sourceUrl
          || nextGroupId !== item.groupId
          || nextProjectName !== item.projectName;

        if (!hasChanged) {
          return item;
        }

        didUpdateLocalAssets = true;
        return {
          ...item,
          status: nextStatus,
          sourceUrl: nextSourceUrl,
          groupId: nextGroupId,
          projectName: nextProjectName,
          updatedAt: new Date().toISOString(),
        };
      });

      const nextLocalAssets = didUpdateLocalAssets
        ? await saveVirtualPortraitLibraryAssets(nextLocalAssetsDraft)
        : virtualPortraitAssets;

      if (didUpdateLocalAssets) {
        setVirtualPortraitAssets(nextLocalAssets);
      }

      const mergedGroups = mergeVirtualPortraitGroupsWithLocalAssets(nextGroups, nextLocalAssets);

      setVirtualPortraitGroups(mergedGroups);
      if (selectedVirtualPortraitGroupId && !mergedGroups.some((item) => item.group.id === selectedVirtualPortraitGroupId)) {
        setSelectedVirtualPortraitGroupId('');
      }
      setVirtualPortraitFeedback('已手动刷新虚拟人像列表。');
    } catch (loadError: any) {
      console.error('Failed to load virtual portrait asset groups:', loadError);
      setVirtualPortraitError(loadError?.message || '加载虚拟人像资产组合失败');
    } finally {
      setIsLoadingVirtualPortraitGroups(false);
    }
  };

  const refreshSeedreamPortraitAssets = async () => {
    setIsLoadingSeedreamPortraitAssets(true);
    setSeedreamPortraitError('');
    try {
      const nextAssets = await fetchSeedreamGeneratedPortraitAssets();
      setSeedreamPortraitAssets(nextAssets);
    } catch (loadError: any) {
      console.error('Failed to load Seedream portrait library assets:', loadError);
      setSeedreamPortraitError(loadError?.message || '加载 Seedream 生成人像失败');
    } finally {
      setIsLoadingSeedreamPortraitAssets(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch('./portrait_lib_raw.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const parsed = await res.json();
        if (isMounted) {
          const items = parsed.items || [];
          const uniqueItems: PortraitItem[] = [];
          const seen = new Set<string>();
          for (const item of items) {
            const sid = item.AssetGroup?.SID;
            if (sid && !seen.has(sid)) {
              seen.add(sid);
              uniqueItems.push(item);
            }
          }
          setData(uniqueItems);
        }
      } catch (loadError: any) {
        if (isMounted) {
          console.error('Failed to load portrait library:', loadError);
          setError(loadError.message || '加载人物库失败');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    void refreshPortraitConfig();
  }, []);

  useEffect(() => {
    void refreshRealPortraitAssets();
  }, []);

  useEffect(() => {
    void refreshVirtualPortraitAssets();
  }, []);

  useEffect(() => {
    void refreshSeedreamPortraitAssets();
  }, []);

  useEffect(() => () => {
    Object.values(browserFolderState.fileUrls).forEach((url: string) => {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
  }, [browserFolderState.fileUrls]);

  const filterOptions = useMemo(() => {
    const genders = new Set<string>();
    const countries = new Set<string>();
    const occupations = new Set<string>();

    data.forEach((item) => {
      const meta = item.AssetGroup?.Metadata;
      if (!meta) return;
      if (meta.Gender) genders.add(meta.Gender);
      if (meta.Country) countries.add(meta.Country);
      if (meta.Occupation) occupations.add(meta.Occupation);
    });

    return {
      genders: Array.from(genders).sort(),
      countries: Array.from(countries).sort(),
      occupations: Array.from(occupations).sort(),
    };
  }, [data]);

  const filteredData = useMemo(() => {
    return data.filter((item) => {
      const meta = item.AssetGroup?.Metadata || {};

      let passGender = true;
      if (filters.gender !== 'all') {
        const itemGender = meta.Gender || '';
        passGender = itemGender.includes(filters.gender.replace('性', '')) || (filters.gender.includes('性') && itemGender === filters.gender.replace('性', ''));
      }

      let passAge = true;
      if (filters.age !== 'all') {
        const age = meta.Age;
        if (age == null) {
          passAge = false;
        } else if (filters.age === '18-') {
          passAge = age <= 18;
        } else if (filters.age === '19-25') {
          passAge = age >= 19 && age <= 25;
        } else if (filters.age === '26-35') {
          passAge = age >= 26 && age <= 35;
        } else if (filters.age === '36-50') {
          passAge = age >= 36 && age <= 50;
        } else if (filters.age === '51+') {
          passAge = age >= 51;
        }
      }

      const passCountry = filters.country === 'all' || meta.Country === filters.country;
      const passOccupation = filters.occupation === 'all' || meta.Occupation === filters.occupation;

      return passGender && passAge && passCountry && passOccupation;
    });
  }, [data, filters]);

  const publicPortraitCount = filteredData.length;
  const realPortraitCount = realPortraitGroups.reduce((total, group) => total + group.assetCount, 0);
  const realPortraitGroupCount = realPortraitGroups.length;
  const isLoadingRealPortraitLibrary = isLoadingRealPortraitAssets || isLoadingRealPortraitGroups;
  const virtualPortraitCount = virtualPortraitGroups.reduce((total, group) => total + group.assetCount, 0);
  const virtualPortraitGroupCount = virtualPortraitGroups.length;
  const isLoadingVirtualPortraitLibrary = isLoadingVirtualPortraitAssets || isLoadingVirtualPortraitGroups;
  const seedreamPortraitCount = seedreamPortraitAssets.length;
  const visibleData = filteredData.slice(0, page * ITEMS_PER_PAGE);
  const hasMore = visibleData.length < filteredData.length;
  const virtualPortraitAssetByAssetId = useMemo(() => {
    const result = new Map<string, VirtualPortraitLibraryAsset>();
    virtualPortraitAssets.forEach((item) => {
      if (item.assetId) {
        result.set(item.assetId, item);
      }
    });
    return result;
  }, [virtualPortraitAssets]);
  const realPortraitAssetByAssetId = useMemo(() => {
    const result = new Map<string, RealPortraitLibraryAsset>();
    realPortraitAssets.forEach((item) => {
      if (item.assetId) {
        result.set(item.assetId, item);
      }
    });
    return result;
  }, [realPortraitAssets]);
  const selectedRealPortraitGroup = useMemo(() => (
    realPortraitGroups.find((item) => item.group.id === selectedRealPortraitGroupId) || null
  ), [selectedRealPortraitGroupId, realPortraitGroups]);
  const selectedVirtualPortraitGroup = useMemo(() => (
    virtualPortraitGroups.find((item) => item.group.id === selectedVirtualPortraitGroupId) || null
  ), [selectedVirtualPortraitGroupId, virtualPortraitGroups]);
  const seedreamExpandedPromptPreview = useMemo(() => (
    seedreamPortraitDraft.prompt.trim()
      ? buildSeedreamGeneratedPortraitPrompt(seedreamPortraitDraft.prompt)
      : ''
  ), [seedreamPortraitDraft.prompt]);

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const resetRealPortraitDraft = () => {
    realPortraitValidationFlowRef.current += 1;
    setIsOpeningRealPortraitValidation(false);
    setIsQueryingRealPortraitGroup(false);
    setRealPortraitDraft(EMPTY_REAL_PORTRAIT_DRAFT);
    setRealPortraitDraftError('');
    setRealPortraitUploadStep('');
  };

  const handleRealPortraitFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      throw new Error('仅支持图片文件。');
    }

    const imageDataUrl = await readFileAsDataUrl(file);
    setRealPortraitDraft((prev) => ({
      ...prev,
      imageDataUrl,
      fileNameHint: file.name || prev.fileNameHint,
      file,
    }));
    setRealPortraitDraftError('');
  };

  const handleRealPortraitUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      await handleRealPortraitFile(file);
    } catch (uploadError: any) {
      console.error('Failed to upload real portrait image:', uploadError);
      setRealPortraitDraftError(uploadError?.message || '上传图片失败，请重试。');
    } finally {
      event.target.value = '';
    }
  };

  const handleRealPortraitPaste = async (event: ClipboardEvent<HTMLDivElement>) => {
    const clipboardItems = Array.from(event.clipboardData.items as ArrayLike<DataTransferItem>);
    const file = clipboardItems
      .find((item) => item.type.startsWith('image/'))
      ?.getAsFile();

    if (!file) {
      return;
    }

    event.preventDefault();
    try {
      await handleRealPortraitFile(file);
    } catch (pasteError: any) {
      console.error('Failed to paste real portrait image:', pasteError);
      setRealPortraitDraftError(pasteError?.message || '粘贴图片失败，请重试。');
    }
  };

  const handleOpenAddRealPortraitModal = () => {
    if (!selectedRealPortraitGroup?.group.id) {
      setRealPortraitError('请先进入一个真人人像分组，再上传素材资产。');
      return;
    }
    const group = selectedRealPortraitGroup.group;
    setRealPortraitFeedback('');
    resetRealPortraitDraft();
    setRealPortraitDraft((prev) => ({
      ...prev,
      projectName: group.projectName || DEFAULT_VIRTUAL_PORTRAIT_PROJECT_NAME,
      groupId: group.id,
    }));
    setIsAddRealPortraitModalOpen(true);
  };

  const handleOpenRealGroupModal = () => {
    setRealPortraitFeedback('');
    resetRealPortraitDraft();
    setIsRealGroupModalOpen(true);
  };

  const handleStartRealPortraitValidation = async () => {
    const projectName = realPortraitDraft.projectName.trim() || DEFAULT_VIRTUAL_PORTRAIT_PROJECT_NAME;

    setIsCreatingRealPortraitSession(true);
    realPortraitValidationFlowRef.current += 1;
    const flowId = realPortraitValidationFlowRef.current;
    const isCurrentValidationFlow = () => realPortraitValidationFlowRef.current === flowId;
    setIsOpeningRealPortraitValidation(false);
    setIsQueryingRealPortraitGroup(false);
    setRealPortraitDraftError('');
    setRealPortraitUploadStep('正在生成 App 内真人认证链接...');

    try {
      const session = await createRealPortraitValidationSession({
        callbackURL: REAL_PORTRAIT_VALIDATION_CALLBACK_URL,
        projectName,
      });
      if (!isCurrentValidationFlow()) {
        return;
      }

      setRealPortraitDraft((prev) => ({
        ...prev,
        projectName,
        bytedToken: session.bytedToken,
        h5Link: session.h5Link,
        groupId: '',
      }));

      if (typeof window.electronAPI?.openRealPortraitValidation !== 'function') {
        throw new Error('当前环境缺少 Electron App 内认证能力。');
      }

      setIsCreatingRealPortraitSession(false);
      setIsOpeningRealPortraitValidation(true);
      setRealPortraitUploadStep('已打开 App 内真人认证窗口，请在 120 秒内完成认证。');

      const result = await window.electronAPI.openRealPortraitValidation({
        h5Link: session.h5Link,
        callbackURL: session.callbackURL || REAL_PORTRAIT_VALIDATION_CALLBACK_URL,
      });
      if (!isCurrentValidationFlow()) {
        return;
      }

      const returnedCallbackURL = String(result?.callbackURL || '').trim();
      if (!returnedCallbackURL) {
        setRealPortraitUploadStep('');
        return;
      }

      const parsed = parseRealPortraitValidationCallback(returnedCallbackURL);
      if (parsed.resultCode && parsed.resultCode !== '10000') {
        setRealPortraitDraft((prev) => ({
          ...prev,
          bytedToken: parsed.bytedToken || prev.bytedToken,
        }));
        setRealPortraitDraftError(`真人认证未通过，resultCode：${parsed.resultCode}`);
        setRealPortraitUploadStep('');
        return;
      }

      const bytedToken = parsed.bytedToken || session.bytedToken;
      if (!bytedToken) {
        setRealPortraitDraftError('认证回跳地址中缺少 BytedToken。');
        setRealPortraitUploadStep('');
        return;
      }

      setIsOpeningRealPortraitValidation(false);
      setIsQueryingRealPortraitGroup(true);
      setRealPortraitUploadStep('真人认证已通过，正在查询 GroupId...');
      const validationResult = await getRealPortraitValidationResult({
        bytedToken,
        projectName,
      });
      if (!isCurrentValidationFlow()) {
        return;
      }

      setRealPortraitDraft((prev) => ({
        ...prev,
        projectName: validationResult.projectName,
        bytedToken,
        groupId: validationResult.groupId,
      }));
      setRealPortraitUploadStep(`已获取素材组 GroupId：${validationResult.groupId}`);
    } catch (validationError: any) {
      if (!isCurrentValidationFlow()) {
        return;
      }
      console.error('Failed to complete real portrait validation:', validationError);
      setRealPortraitDraftError(validationError?.message || '真人认证失败。');
      setRealPortraitUploadStep('');
    } finally {
      if (isCurrentValidationFlow()) {
        setIsCreatingRealPortraitSession(false);
        setIsOpeningRealPortraitValidation(false);
        setIsQueryingRealPortraitGroup(false);
      }
    }
  };

  const handleSaveRealPortraitGroup = async () => {
    const groupId = realPortraitDraft.groupId.trim();
    const projectName = realPortraitDraft.projectName.trim() || DEFAULT_VIRTUAL_PORTRAIT_PROJECT_NAME;

    if (!groupId) {
      setRealPortraitDraftError('请先完成真人认证并查询 GroupId。');
      return;
    }

    const now = new Date().toISOString();
    const group: ArkAssetGroup = {
      id: groupId,
      name: groupId,
      title: groupId,
      description: '',
      groupType: ARK_REAL_PORTRAIT_GROUP_TYPE,
      projectName,
      createTime: now,
      updateTime: now,
    };

    setRealPortraitGroups((currentGroups) => mergeRealPortraitGroupsWithLocalAssets([
      {
        group,
        assets: [],
        assetCount: 0,
        coverImageUrl: '',
      },
      ...currentGroups.filter((item) => item.group.id !== group.id),
    ], realPortraitAssets));
    setSelectedRealPortraitGroupId(group.id);
    setRealPortraitFeedback(`已创建真人人像分组：${group.id}`);
    setIsRealGroupModalOpen(false);
    resetRealPortraitDraft();
  };

  const resetVirtualPortraitDraft = () => {
    setVirtualPortraitDraft(EMPTY_VIRTUAL_PORTRAIT_DRAFT);
    setVirtualPortraitDraftError('');
    setVirtualPortraitUploadStep('');
  };

  const resetVirtualGroupDraft = () => {
    setVirtualGroupDraft(EMPTY_VIRTUAL_GROUP_DRAFT);
    setVirtualGroupDraftError('');
  };

  const handleVirtualPortraitFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      throw new Error('仅支持图片文件。');
    }
    if (file.size > 30 * 1024 * 1024) {
      throw new Error('单张图片需小于 30 MB。');
    }

    const imageDataUrl = await readFileAsDataUrl(file);
    setVirtualPortraitDraft((prev) => ({
      ...prev,
      imageDataUrl,
      fileNameHint: file.name || prev.fileNameHint,
      file,
    }));
    setVirtualPortraitDraftError('');
  };

  const handleVirtualPortraitUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      await handleVirtualPortraitFile(file);
    } catch (uploadError: any) {
      console.error('Failed to upload virtual portrait image:', uploadError);
      setVirtualPortraitDraftError(uploadError?.message || '上传图片失败，请重试。');
    } finally {
      event.target.value = '';
    }
  };

  const handleVirtualPortraitPaste = async (event: ClipboardEvent<HTMLDivElement>) => {
    const clipboardItems = Array.from(event.clipboardData.items as ArrayLike<DataTransferItem>);
    const file = clipboardItems
      .find((item) => item.type.startsWith('image/'))
      ?.getAsFile();

    if (!file) {
      return;
    }

    event.preventDefault();
    try {
      await handleVirtualPortraitFile(file);
    } catch (pasteError: any) {
      console.error('Failed to paste virtual portrait image:', pasteError);
      setVirtualPortraitDraftError(pasteError?.message || '粘贴图片失败，请重试。');
    }
  };

  const handleOpenVirtualPortraitModal = () => {
    if (!selectedVirtualPortraitGroup) {
      setVirtualPortraitError('请先进入一个素材资产组合，再创建素材资产。');
      return;
    }
    setVirtualPortraitFeedback('');
    resetVirtualPortraitDraft();
    setIsVirtualPortraitModalOpen(true);
  };

  const handleOpenVirtualGroupModal = () => {
    setVirtualPortraitFeedback('');
    resetVirtualGroupDraft();
    setIsVirtualGroupModalOpen(true);
  };

  const handleCreateVirtualGroup = async () => {
    const name = virtualGroupDraft.name.trim();
    const description = virtualGroupDraft.description.trim();
    const projectName = virtualGroupDraft.projectName.trim();

    if (!name) {
      setVirtualGroupDraftError('请填写素材资产组合名称。');
      return;
    }
    if (!projectName) {
      setVirtualGroupDraftError('请填写 ProjectName。');
      return;
    }

    setIsCreatingVirtualGroup(true);
    setVirtualGroupDraftError('');

    try {
      const group = await createArkAssetGroup({
        name,
        description: description || name,
        projectName,
      });
      setVirtualPortraitFeedback(`已创建素材资产组合「${group.name || group.title || name}」`);
      setIsVirtualGroupModalOpen(false);
      resetVirtualGroupDraft();
      setVirtualPortraitGroups((currentGroups) => [
        {
          group,
          assets: [],
          assetCount: 0,
          coverImageUrl: '',
        },
        ...currentGroups.filter((item) => item.group.id !== group.id),
      ]);
      setSelectedVirtualPortraitGroupId(group.id);
    } catch (createError: any) {
      console.error('Failed to create virtual portrait asset group:', createError);
      setVirtualGroupDraftError(createError?.message || '创建素材资产组合失败。');
    } finally {
      setIsCreatingVirtualGroup(false);
    }
  };

  const handleUploadVirtualPortraitAsset = async () => {
    const description = virtualPortraitDraft.description.trim();
    const activeGroup = selectedVirtualPortraitGroup?.group;
    const groupName = activeGroup?.name || activeGroup?.title || '';
    const projectName = activeGroup?.projectName || DEFAULT_VIRTUAL_PORTRAIT_PROJECT_NAME;
    const imageDataUrl = virtualPortraitDraft.imageDataUrl.trim();
    const file = virtualPortraitDraft.file;

    if (!activeGroup?.id) {
      setVirtualPortraitDraftError('请先进入一个素材资产组合。');
      return;
    }
    if (!description) {
      setVirtualPortraitDraftError('请填写描述。');
      return;
    }
    if (!file || !imageDataUrl) {
      setVirtualPortraitDraftError('请先粘贴或上传图片。');
      return;
    }

    setIsUploadingVirtualPortraitAsset(true);
    setVirtualPortraitDraftError('');

    try {
      setVirtualPortraitUploadStep('上传图片并写入 Ark 素材库...');
      const uploadResult = await uploadVirtualPortraitAsset({
        file,
        description,
        groupId: activeGroup.id,
        groupName,
        projectName,
        initialStatusWaitMs: 0,
      });
      setVirtualPortraitUploadStep('保存本地预览...');

      const recordId = crypto.randomUUID?.() || `virtual-portrait-${Date.now()}`;
      const savedFile = await saveMediaToAssetLibrary({
        sourceUrl: imageDataUrl,
        kind: 'image',
        assetId: `portrait-library:virtual:${recordId}`,
        title: description,
        groupName: REAL_PORTRAIT_LIBRARY_GROUP_NAME,
        projectName: VIRTUAL_PORTRAIT_LIBRARY_PROJECT_NAME,
        fileNameHint: virtualPortraitDraft.fileNameHint || file.name || '',
      });
      const nextAsset: VirtualPortraitLibraryAsset = {
        id: recordId,
        description,
        assetId: uploadResult.asset.id,
        imageUrl: savedFile.url,
        groupId: uploadResult.group.id,
        groupName: uploadResult.group.name || groupName,
        projectName: uploadResult.asset.projectName || projectName,
        status: normalizeArkAssetStatus(uploadResult.asset.status),
        sourceUrl: uploadResult.uploadedUrl,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const nextAssets = await saveVirtualPortraitLibraryAssets([nextAsset, ...virtualPortraitAssets]);

      setVirtualPortraitAssets(nextAssets);
      setVirtualPortraitGroups((currentGroups) => mergeVirtualPortraitGroupsWithLocalAssets(currentGroups, nextAssets));
      setVirtualPortraitError('');
      setVirtualPortraitFeedback(
        isArkAssetActiveStatus(nextAsset.status)
          ? `已上传虚拟人像资产「${description}」，assetId：${nextAsset.assetId}`
          : `已上传虚拟人像资产「${description}」，assetId：${nextAsset.assetId}。后续状态请手动刷新。`,
      );
      setActiveTab('virtualUpload');
      setIsVirtualPortraitModalOpen(false);
      setSelectedVirtualPortraitGroupId(activeGroup.id);
      resetVirtualPortraitDraft();
    } catch (uploadError: any) {
      console.error('Failed to upload virtual portrait asset:', uploadError);
      setVirtualPortraitDraftError(uploadError?.message || '上传虚拟人像资产失败。');
    } finally {
      setIsUploadingVirtualPortraitAsset(false);
      setVirtualPortraitUploadStep('');
    }
  };

  const handleDeleteRealPortraitAsset = async (asset: ArkAsset) => {
    const assetId = asset.id.trim();
    if (!assetId) {
      return;
    }
    if (!isConfirmingRealAssetDelete) {
      setIsConfirmingRealAssetDelete(true);
      return;
    }

    setDeletingRealAssetId(assetId);
    setRealPortraitError('');

    try {
      await deleteArkAsset({
        assetId,
        projectName: asset.projectName || selectedRealPortraitGroup?.group.projectName,
      });
      const nextLocalAssets = await saveRealPortraitLibraryAssets(
        realPortraitAssets.filter((item) => item.assetId !== assetId),
      );
      setRealPortraitAssets(nextLocalAssets);
      setRealPortraitGroups((currentGroups) => mergeRealPortraitGroupsWithLocalAssets(
        removeRealPortraitAssetFromGroupViews(currentGroups, assetId),
        nextLocalAssets,
      ));
      setRealPortraitFeedback('已删除真人人像素材资产。');
      setRealAssetDetail(null);
      setIsConfirmingRealAssetDelete(false);
    } catch (deleteError: any) {
      console.error('Failed to delete real portrait asset:', deleteError);
      setRealPortraitError(deleteError?.message || '删除真人人像素材资产失败。');
    } finally {
      setDeletingRealAssetId('');
    }
  };

  const handleDeleteVirtualPortraitAsset = async (asset: ArkAsset) => {
    const assetId = asset.id.trim();
    if (!assetId) {
      return;
    }
    if (!isConfirmingVirtualAssetDelete) {
      setIsConfirmingVirtualAssetDelete(true);
      return;
    }

    setDeletingVirtualAssetId(assetId);
    setVirtualPortraitError('');

    try {
      await deleteArkAsset({
        assetId,
        projectName: asset.projectName || selectedVirtualPortraitGroup?.group.projectName,
      });
      const nextLocalAssets = await saveVirtualPortraitLibraryAssets(
        virtualPortraitAssets.filter((item) => item.assetId !== assetId),
      );
      setVirtualPortraitAssets(nextLocalAssets);
      setVirtualPortraitGroups((currentGroups) => mergeVirtualPortraitGroupsWithLocalAssets(
        removeVirtualPortraitAssetFromGroupViews(currentGroups, assetId),
        nextLocalAssets,
      ));
      setVirtualPortraitFeedback('已删除素材资产。');
      setVirtualAssetDetail(null);
      setIsConfirmingVirtualAssetDelete(false);
    } catch (deleteError: any) {
      console.error('Failed to delete virtual portrait asset:', deleteError);
      setVirtualPortraitError(deleteError?.message || '删除素材资产失败。');
    } finally {
      setDeletingVirtualAssetId('');
    }
  };

  const handleOpenAssetGroupEditor = (target: AssetGroupEditTarget, group: ArkAssetGroup) => {
    setAssetGroupEditError('');
    setEditingAssetGroup({
      target,
      groupId: group.id,
      name: group.name || group.title || '',
      description: group.description || '',
      projectName: group.projectName || DEFAULT_VIRTUAL_PORTRAIT_PROJECT_NAME,
    });
  };

  const handleSaveAssetGroupInfo = async () => {
    if (!editingAssetGroup) {
      return;
    }

    const name = editingAssetGroup.name.replace(/\s+/gu, ' ').trim();
    const description = editingAssetGroup.description.trim();
    const projectName = editingAssetGroup.projectName.trim() || DEFAULT_VIRTUAL_PORTRAIT_PROJECT_NAME;

    if (!name) {
      setAssetGroupEditError('请填写 Asset Group 名称。');
      return;
    }
    if (name.length > 64) {
      setAssetGroupEditError('Asset Group 名称不能超过 64 个字符。');
      return;
    }
    if (description.length > 300) {
      setAssetGroupEditError('Asset Group 描述不能超过 300 个字符。');
      return;
    }

    setIsUpdatingAssetGroup(true);
    setAssetGroupEditError('');
    if (editingAssetGroup.target === 'real') {
      setRealPortraitError('');
    } else {
      setVirtualPortraitError('');
    }

    try {
      await updateArkAssetGroup({
        groupId: editingAssetGroup.groupId,
        name,
        description,
        projectName,
      });

      const updateGroup = (group: ArkAssetGroup): ArkAssetGroup => ({
        ...group,
        name,
        title: name,
        description,
        projectName,
        updateTime: new Date().toISOString(),
      });

      if (editingAssetGroup.target === 'real') {
        setRealPortraitGroups((currentGroups) => currentGroups.map((groupView) => (
          groupView.group.id === editingAssetGroup.groupId
            ? { ...groupView, group: updateGroup(groupView.group) }
            : groupView
        )));
        setRealPortraitFeedback(`已更新真人人像分组「${name}」。`);
      } else {
        setVirtualPortraitGroups((currentGroups) => currentGroups.map((groupView) => (
          groupView.group.id === editingAssetGroup.groupId
            ? { ...groupView, group: updateGroup(groupView.group) }
            : groupView
        )));
        setVirtualPortraitFeedback(`已更新素材资产组合「${name}」。`);
      }

      setEditingAssetGroup(null);
    } catch (updateError: any) {
      console.error('Failed to update portrait asset group:', updateError);
      setAssetGroupEditError(updateError?.message || '更新 Asset Group 信息失败。');
    } finally {
      setIsUpdatingAssetGroup(false);
    }
  };

  const handleDeleteVirtualPortraitGroup = async (groupView: VirtualPortraitAssetGroupView) => {
    const group = groupView.group;
    if (groupView.assetCount > 0) {
      setVirtualPortraitError('请先删除该组合下的全部素材资产，再删除素材资产组合。');
      return;
    }

    const groupName = group.name || group.title || group.id;
    const confirmed = window.confirm(`确定删除素材资产组合「${groupName}」吗？`);
    if (!confirmed) {
      return;
    }

    setDeletingVirtualGroupId(group.id);
    setVirtualPortraitError('');

    try {
      await deleteArkAssetGroup({
        groupId: group.id,
        projectName: group.projectName,
      });
      setVirtualPortraitFeedback(`已删除素材资产组合「${groupName}」`);
      if (selectedVirtualPortraitGroupId === group.id) {
        setSelectedVirtualPortraitGroupId('');
      }
      setVirtualPortraitGroups((currentGroups) => currentGroups.filter((item) => item.group.id !== group.id));
    } catch (deleteError: any) {
      console.error('Failed to delete virtual portrait asset group:', deleteError);
      setVirtualPortraitError(deleteError?.message || '删除素材资产组合失败。');
    } finally {
      setDeletingVirtualGroupId('');
    }
  };

  const handleDeleteRealPortraitGroup = async (groupView: RealPortraitAssetGroupView) => {
    const group = groupView.group;
    if (groupView.assetCount > 0) {
      setRealPortraitError('请先删除该分组下的全部素材资产，再删除真人人像分组。');
      return;
    }

    const groupName = group.name || group.title || group.id;
    const confirmed = window.confirm(`确定删除真人人像分组「${groupName}」吗？`);
    if (!confirmed) {
      return;
    }

    setDeletingRealGroupId(group.id);
    setRealPortraitError('');

    try {
      await deleteArkAssetGroup({
        groupId: group.id,
        projectName: group.projectName,
      });
      setRealPortraitFeedback(`已删除真人人像分组「${groupName}」`);
      if (selectedRealPortraitGroupId === group.id) {
        setSelectedRealPortraitGroupId('');
      }
      setRealPortraitGroups((currentGroups) => currentGroups.filter((item) => item.group.id !== group.id));
    } catch (deleteError: any) {
      console.error('Failed to delete real portrait asset group:', deleteError);
      setRealPortraitError(deleteError?.message || '删除真人人像分组失败。');
    } finally {
      setDeletingRealGroupId('');
    }
  };

  const resetSeedreamPortraitDraft = () => {
    setSeedreamPortraitDraft(EMPTY_SEEDREAM_PORTRAIT_DRAFT);
    setSeedreamPortraitDraftError('');
  };

  const handleOpenSeedreamPortraitModal = () => {
    setSeedreamPortraitFeedback('');
    resetSeedreamPortraitDraft();
    setIsSeedreamPortraitModalOpen(true);
  };

  const handleSaveRealPortraitAsset = async () => {
    const description = realPortraitDraft.description.trim();
    let assetId = realPortraitDraft.assetId.trim();
    const projectName = realPortraitDraft.projectName.trim() || DEFAULT_VIRTUAL_PORTRAIT_PROJECT_NAME;
    const groupId = realPortraitDraft.groupId.trim();
    const imageDataUrl = realPortraitDraft.imageDataUrl.trim();
    const file = realPortraitDraft.file;

    if (!description) {
      setRealPortraitDraftError('请填写描述。');
      return;
    }
    if (!imageDataUrl) {
      setRealPortraitDraftError('请先粘贴或上传图片。');
      return;
    }
    if (!assetId && !groupId) {
      setRealPortraitDraftError('请先完成真人认证并查询 GroupId，或手动填写已有 assetId。');
      return;
    }
    if (!assetId && !file) {
      setRealPortraitDraftError('自动创建 Ark 素材资产需要上传原始图片文件，请重新选择或粘贴图片。');
      return;
    }

    setIsSavingRealPortraitAsset(true);
    setRealPortraitDraftError('');

    try {
      let uploadedRealPortrait: Awaited<ReturnType<typeof uploadRealPortraitAsset>> | null = null;
      if (!assetId) {
        setRealPortraitUploadStep('上传图片到 TOS 并调用 Ark CreateAsset...');
        uploadedRealPortrait = await uploadRealPortraitAsset({
          file: file!,
          description,
          groupId,
          projectName,
          initialStatusWaitMs: 0,
        });
        assetId = uploadedRealPortrait.asset.id;
      }

      setRealPortraitUploadStep('保存本地预览...');
      const recordId = crypto.randomUUID?.() || `real-portrait-${Date.now()}`;
      const savedFile = await saveMediaToAssetLibrary({
        sourceUrl: imageDataUrl,
        kind: 'image',
        assetId: `portrait-library:real:${recordId}`,
        title: description,
        groupName: REAL_PORTRAIT_LIBRARY_GROUP_NAME,
        projectName: REAL_PORTRAIT_LIBRARY_PROJECT_NAME,
        fileNameHint: realPortraitDraft.fileNameHint || '',
      });
      const nextAsset: RealPortraitLibraryAsset = {
        id: recordId,
        description,
        assetId,
        imageUrl: savedFile.url,
        groupId: uploadedRealPortrait?.groupId || groupId,
        projectName,
        status: uploadedRealPortrait ? normalizeArkAssetStatus(uploadedRealPortrait.asset.status) : '',
        sourceUrl: uploadedRealPortrait?.uploadedUrl || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const nextAssets = await saveRealPortraitLibraryAssets([nextAsset, ...realPortraitAssets]);

      setRealPortraitAssets(nextAssets);
      setRealPortraitGroups((currentGroups) => mergeRealPortraitGroupsWithLocalAssets(currentGroups, nextAssets));
      setRealPortraitError('');
      setRealPortraitFeedback(
        uploadedRealPortrait
          ? `已创建并新增真人人像资产「${description}」，assetId：${assetId}`
          : `已新增真人人像资产「${description}」`,
      );
      setActiveTab('real');
      setIsAddRealPortraitModalOpen(false);
      if (groupId) {
        setSelectedRealPortraitGroupId(groupId);
      }
      resetRealPortraitDraft();
    } catch (saveError: any) {
      console.error('Failed to save real portrait asset:', saveError);
      setRealPortraitDraftError(saveError?.message || '保存真人人像资产失败。');
    } finally {
      setIsSavingRealPortraitAsset(false);
      setRealPortraitUploadStep('');
    }
  };

  const handleGenerateSeedreamPortraitAsset = async () => {
    const prompt = seedreamPortraitDraft.prompt.trim();
    const model = seedreamPortraitDraft.model.trim() || SEEDREAM_GENERATED_PORTRAIT_MODEL;

    if (!prompt) {
      setSeedreamPortraitDraftError('请填写提示词。');
      return;
    }

    setIsGeneratingSeedreamPortrait(true);
    setSeedreamPortraitDraftError('');

    try {
      const recordId = crypto.randomUUID?.() || `seedream-portrait-${Date.now()}`;
      const expandedPrompt = buildSeedreamGeneratedPortraitPrompt(prompt);
      const generatedImageUrl = await generateStoryboardImage(expandedPrompt, '16:9', model);
      const description = buildSeedreamPortraitTitle(prompt);
      const savedFile = await saveMediaToAssetLibrary({
        sourceUrl: generatedImageUrl,
        kind: 'image',
        assetId: `portrait-library:seedream:${recordId}`,
        title: description,
        groupName: REAL_PORTRAIT_LIBRARY_GROUP_NAME,
        projectName: SEEDREAM_PORTRAIT_LIBRARY_PROJECT_NAME,
        fileNameHint: `seedream-portrait-${recordId}.png`,
      });
      const nextAsset: SeedreamGeneratedPortraitAsset = {
        id: recordId,
        description,
        model,
        prompt,
        expandedPrompt,
        imageUrl: savedFile.url,
        createdAt: new Date().toISOString(),
      };
      const nextAssets = await saveSeedreamGeneratedPortraitAssets([nextAsset, ...seedreamPortraitAssets]);

      setSeedreamPortraitAssets(nextAssets);
      setSeedreamPortraitError('');
      setSeedreamPortraitFeedback(`已生成虚拟人像「${description}」`);
      setActiveTab('seedream');
      setIsSeedreamPortraitModalOpen(false);
      resetSeedreamPortraitDraft();
    } catch (generateError: any) {
      console.error('Failed to generate Seedream portrait asset:', generateError);
      setSeedreamPortraitDraftError(generateError?.message || 'Seedream 生成虚拟人像失败。');
    } finally {
      setIsGeneratingSeedreamPortrait(false);
    }
  };

  const openDownloadLink = async () => {
    if (isElectron) {
      await window.electronAPI.openExternal(PORTRAIT_DOWNLOAD_URL);
      return;
    }
    window.open(PORTRAIT_DOWNLOAD_URL, '_blank', 'noopener,noreferrer');
  };

  const handleElectronFolderSelection = async () => {
    const selectedDirectory = await window.electronAPI.selectDirectory({
      title: '选择图片素材文件夹',
      defaultPath: portraitConfig?.rootPath || undefined,
    });
    if (!selectedDirectory) {
      return;
    }
    const nextConfig = await updatePortraitLibraryConfig({ rootPath: selectedDirectory });
    setPortraitConfig(nextConfig);
    setConfigFeedback(`已切换到 ${selectedDirectory}`);
  };

  const handleBrowserFolderSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files || []) as File[];
    if (nextFiles.length === 0) {
      return;
    }

    const imageFiles = nextFiles.filter((file) => file.type.startsWith('image/'));
    const nextFileUrls = imageFiles.reduce<Record<string, string>>((result, file) => {
      result[file.name] = URL.createObjectURL(file);
      return result;
    }, {});
    const folderName = nextFiles[0]?.webkitRelativePath?.split('/')[0] || '当前会话目录';

    setBrowserFolderState({
      folderName,
      fileUrls: nextFileUrls,
      fileCount: imageFiles.length,
    });
    setConfigFeedback(`当前会话已载入 ${imageFiles.length} 张本地图片`);
    event.target.value = '';
  };

  const handleSelectPortraitFolder = async () => {
    setConfigFeedback('');
    setIsSavingConfig(true);
    try {
      if (isElectron) {
        await handleElectronFolderSelection();
        return;
      }
      browserDirectoryInputRef.current?.click();
    } catch (saveError: any) {
      console.error('Failed to select portrait folder:', saveError);
      alert(saveError?.message || '选择图片素材文件夹失败。');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleClearPortraitFolder = async () => {
    setConfigFeedback('');
    if (isElectron) {
      setIsSavingConfig(true);
      try {
        const nextConfig = await updatePortraitLibraryConfig({ rootPath: '' });
        setPortraitConfig(nextConfig);
        setConfigFeedback('已清除图片素材文件夹配置');
      } catch (clearError: any) {
        console.error('Failed to clear portrait folder config:', clearError);
        alert(clearError?.message || '清除图片素材配置失败。');
      } finally {
        setIsSavingConfig(false);
      }
    }

    setBrowserFolderState({
      folderName: '',
      fileUrls: {},
      fileCount: 0,
    });
  };

  const resolvePortraitImageUrl = (sourceUrl?: string) => {
    const relativePath = getPortraitLibraryRelativePath(sourceUrl);
    if (!relativePath) {
      return sourceUrl || '';
    }

    const fileName = relativePath.split('/').pop() || relativePath;
    const browserFileUrl = browserFolderState.fileUrls[fileName];
    if (browserFileUrl) {
      return browserFileUrl;
    }

    if (portraitConfig?.configured) {
      return buildPortraitLibraryFileUrl(relativePath);
    }

    return sourceUrl || '';
  };

  const handleSelectPortrait = (
    imageUrl: string,
    assetId: string,
    meta?: { description?: string; submitMode?: 'auto' | 'reference_image' },
  ) => {
    if (!onSelect || !imageUrl) {
      return;
    }

    if (selectionMode === 'image') {
      onSelect(imageUrl, '', { ...meta, submitMode: 'reference_image' });
      return;
    }

    onSelect(imageUrl, assetId, meta);
  };

  const skeletonClass = resolvedThemeMode === 'light' ? 'bg-stone-200 animate-pulse border-stone-300' : 'bg-zinc-800 animate-pulse border-zinc-700';
  const softPanelClass = resolvedThemeMode === 'light'
    ? 'border-stone-200/80 bg-white/95 text-stone-700'
    : 'border-white/10 bg-white/[0.04] text-zinc-300';
  const secondaryButtonClass = resolvedThemeMode === 'light'
    ? 'border-stone-300 bg-white text-stone-700 hover:border-stone-400 hover:bg-stone-50'
    : 'border-white/10 bg-white/[0.04] text-zinc-100 hover:border-white/20 hover:bg-white/[0.07]';
  const dimTextClass = resolvedThemeMode === 'light' ? 'text-stone-500' : 'text-zinc-400';
  const tabButtonBaseClass = resolvedThemeMode === 'light'
    ? 'border-stone-300/90 bg-white text-stone-500 hover:border-stone-400 hover:text-stone-900'
    : 'border-white/10 bg-white/[0.04] text-zinc-400 hover:border-white/20 hover:text-zinc-100';
  const activeTabButtonClass = resolvedThemeMode === 'light'
    ? 'border-cyan-300/80 bg-cyan-50 text-cyan-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]'
    : 'border-cyan-400/30 bg-cyan-400/10 text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]';
  const ContentWrapper = isModal ? 'div' : StudioPage;

  return (
    <ContentWrapper className="h-full flex flex-col">
      {!isModal && (
        <StudioPageHeader
          eyebrow="Asset Library"
          title="人像素材库"
          actions={(
            <div className="flex items-center gap-3">
              {activeTab === 'public' ? (
                <button
                  type="button"
                  onClick={() => {
                    setConfigFeedback('');
                    setIsConfigModalOpen(true);
                  }}
                  className={`inline-flex h-11 items-center gap-2 rounded-2xl border px-4 text-sm font-medium transition-colors ${secondaryButtonClass}`}
                >
                  <FolderOpen className="h-4 w-4" />
                  图片素材配置
                </button>
              ) : null}
              <div className="flex h-11 items-center justify-center rounded-2xl border border-[var(--studio-border)] bg-white/5 px-4 font-medium text-[var(--studio-muted)]">
                {activeTab === 'public'
                  ? loading ? '加载中...' : `平台公开 ${publicPortraitCount} 人`
                  : activeTab === 'real'
                    ? isLoadingRealPortraitLibrary ? '加载中...' : `真人分组 ${realPortraitGroupCount} 组 / ${realPortraitCount} 张`
                    : activeTab === 'virtualUpload'
                      ? isLoadingVirtualPortraitLibrary ? '加载中...' : `虚拟组合 ${virtualPortraitGroupCount} 组 / ${virtualPortraitCount} 张`
                      : isLoadingSeedreamPortraitAssets ? '加载中...' : `Seedream ${seedreamPortraitCount} 张`}
              </div>
            </div>
          )}
        />
      )}

      <div className={`${isModal ? 'mb-4' : 'mt-6'} space-y-3`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className={`inline-flex gap-1.5 rounded-[1.35rem] border p-1 ${secondaryButtonClass}`}>
            {([
              { key: 'real', label: '真人人像', count: realPortraitGroupCount },
              { key: 'virtualUpload', label: '虚拟人像上传', count: virtualPortraitGroupCount },
              { key: 'seedream', label: 'Seedream 生成', count: seedreamPortraitCount },
              { key: 'public', label: '平台公开', count: publicPortraitCount },
            ] as Array<{ key: PortraitLibraryTab; label: string; count: number }>).map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={cx(
                    'inline-flex items-center gap-2 rounded-[1rem] border px-3.5 py-2 text-sm font-medium transition-colors',
                    isActive ? activeTabButtonClass : tabButtonBaseClass,
                  )}
                >
                  <span>{tab.label}</span>
                  <span className="rounded-full bg-black/10 px-2 py-0.5 text-[11px] leading-4">{tab.count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {activeTab === 'public' ? (
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2">
              <span className="text-sm font-medium text-[var(--studio-muted)] whitespace-nowrap">性别</span>
              <StudioSelect value={filters.gender} onChange={(event) => handleFilterChange('gender', event.target.value)} className="min-w-[120px] studio-select">
                <option value="all">不限</option>
                <option value="女">女</option>
                <option value="男">男</option>
              </StudioSelect>
            </label>

            <label className="flex items-center gap-2">
              <span className="text-sm font-medium text-[var(--studio-muted)] whitespace-nowrap">年龄</span>
              <StudioSelect value={filters.age} onChange={(event) => handleFilterChange('age', event.target.value)} className="min-w-[120px] studio-select">
                <option value="all">不限</option>
                <option value="18-">18岁及以下</option>
                <option value="19-25">19 - 25岁</option>
                <option value="26-35">26 - 35岁</option>
                <option value="36-50">36 - 50岁</option>
                <option value="51+">51岁及以上</option>
              </StudioSelect>
            </label>

            <label className="flex items-center gap-2">
              <span className="text-sm font-medium text-[var(--studio-muted)] whitespace-nowrap">国籍</span>
              <StudioSelect value={filters.country} onChange={(event) => handleFilterChange('country', event.target.value)} className="min-w-[140px] studio-select">
                <option value="all">不限</option>
                {filterOptions.countries.map((country) => <option key={country} value={country}>{country}</option>)}
              </StudioSelect>
            </label>

            <label className="flex items-center gap-2">
              <span className="text-sm font-medium text-[var(--studio-muted)] whitespace-nowrap">职业</span>
              <StudioSelect value={filters.occupation} onChange={(event) => handleFilterChange('occupation', event.target.value)} className="min-w-[160px] studio-select">
                <option value="all">不限</option>
                {filterOptions.occupations.map((occupation) => <option key={occupation} value={occupation}>{occupation}</option>)}
              </StudioSelect>
            </label>

            {(filters.gender !== 'all' || filters.age !== 'all' || filters.country !== 'all' || filters.occupation !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setFilters({ gender: 'all', age: 'all', country: 'all', occupation: 'all' });
                  setPage(1);
                }}
                className="text-sm text-cyan-500 hover:text-cyan-400 font-medium ml-2 transition-colors"
              >
                重置条件
              </button>
            )}
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex-1 pb-16">
        {activeTab === 'public' ? (
          error ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-red-500/20 bg-[var(--studio-surface-soft)] p-12 text-[var(--studio-muted)]">
              <Users className="mb-4 h-10 w-10 opacity-50" />
              <p className="text-lg font-semibold">{error}</p>
              <p className="mt-2 text-sm">请检查 /public 目录中是否存在 portrait_lib_raw.json</p>
            </div>
          ) : loading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 15 }).map((_, index) => (
                <div key={index} className={`relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-2xl border ${skeletonClass}`}>
                  <img src="./assets/loading.gif" alt="" className="studio-loading-gif !h-1/2 !w-1/2 opacity-30" />
                </div>
              ))}
            </div>
          ) : filteredData.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-surface-soft)] py-20">
              <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
                <Users className="h-6 w-6 text-[var(--studio-muted)]" />
              </span>
              <p className="text-lg font-medium text-[var(--studio-text)]">没有找到匹配的人像</p>
              <p className="mt-2 text-sm text-[var(--studio-muted)]">尝试放宽你的筛选条件</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
                {visibleData.map((item) => {
                  const sourceUrl = item.AssetGroup?.Content?.Image?.[0]?.URL;
                  const imageUrl = resolvePortraitImageUrl(sourceUrl);
                  const assetId = item.AssetGroup?.Content?.Image?.[0]?.AssetID || item.AssetGroup.SID;

                  return (
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={item.AssetGroup.SID}
                      className={`group relative aspect-[3/4] overflow-hidden rounded-xl border bg-[var(--studio-surface-soft)] md:rounded-2xl ${onSelect ? 'cursor-pointer border-transparent shadow-lg hover:border-sky-500' : 'border-[var(--studio-border)]'}`}
                      onClick={onSelect && imageUrl ? () => handleSelectPortrait(imageUrl, assetId, {
                        description: item.AssetGroup.Title || item.AssetGroup.Description,
                        submitMode: 'auto',
                      }) : undefined}
                    >
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={item.AssetGroup.Title}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-black/10">无图片</div>
                      )}

                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-90" />

                      <div className="absolute inset-0 flex flex-col justify-end p-3">
                        <h4 className="mb-1 line-clamp-1 text-sm font-bold text-[rgba(255,255,255,0.96)] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] transition-all duration-300 group-hover:line-clamp-none md:text-base">
                          {item.AssetGroup.Title}
                        </h4>
                        <p className="line-clamp-1 text-[10px] text-[rgba(255,255,255,0.85)] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] transition-all duration-300 group-hover:line-clamp-3 md:text-xs">
                          {item.AssetGroup.Description}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {hasMore && (
                <div className="mt-10 flex justify-center pb-10">
                  <button
                    type="button"
                    onClick={() => setPage((currentPage) => currentPage + 1)}
                    className="studio-button studio-button-primary px-8"
                  >
                    加载更多
                  </button>
                </div>
              )}
            </>
          )
        ) : activeTab === 'real' ? (
          <div className="space-y-5">
            <StudioPanel className="flex flex-wrap items-start justify-between gap-4 p-5" tone="soft">
              <div>
                <div className="studio-eyebrow">{selectedRealPortraitGroup ? 'Real Portrait Group' : 'Real Portrait Groups'}</div>
                <h2 className="mt-2 text-xl font-semibold text-[var(--studio-text)]">
                  {selectedRealPortraitGroup
                    ? (selectedRealPortraitGroup.group.name || selectedRealPortraitGroup.group.title || selectedRealPortraitGroup.group.id)
                    : '真人人像素材分组'}
                </h2>
                <p className={`mt-2 text-sm leading-6 ${dimTextClass}`}>
                  真人分组由 H5 真人认证创建；进入分组后可向该真人继续上传同人资产。
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {selectedRealPortraitGroup ? (
                  <button
                    type="button"
                    onClick={() => setSelectedRealPortraitGroupId('')}
                    className="studio-button studio-button-secondary px-4"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    返回分组列表
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void refreshRealPortraitGroups()}
                  disabled={isLoadingRealPortraitGroups}
                  className="studio-button studio-button-secondary px-4"
                >
                  <RefreshCw className={`h-4 w-4 ${isLoadingRealPortraitGroups ? 'animate-spin' : ''}`} />
                  手动刷新
                </button>
                {selectedRealPortraitGroup ? (
                  <button
                    type="button"
                    onClick={() => handleOpenAssetGroupEditor('real', selectedRealPortraitGroup.group)}
                    disabled={isUpdatingAssetGroup}
                    className="studio-button studio-button-secondary px-4"
                  >
                    <Pencil className="h-4 w-4" />
                    更新分组信息
                  </button>
                ) : null}
                {selectedRealPortraitGroup ? (
                  <button
                    type="button"
                    onClick={() => void handleDeleteRealPortraitGroup(selectedRealPortraitGroup)}
                    disabled={selectedRealPortraitGroup.assetCount > 0 || deletingRealGroupId === selectedRealPortraitGroup.group.id}
                    className="studio-button studio-button-secondary px-4"
                  >
                    <Trash2 className="h-4 w-4" />
                    删除分组
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={selectedRealPortraitGroup ? handleOpenAddRealPortraitModal : handleOpenRealGroupModal}
                  className="studio-button studio-button-primary px-4"
                >
                  {selectedRealPortraitGroup ? <Upload className="h-4 w-4" /> : <FolderPlus className="h-4 w-4" />}
                  {selectedRealPortraitGroup ? '上传素材资产' : '创建真人分组'}
                </button>
              </div>
            </StudioPanel>

            {realPortraitFeedback ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {realPortraitFeedback}
              </div>
            ) : null}

            {realPortraitError ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {realPortraitError}
              </div>
            ) : null}

            {selectedRealPortraitGroup ? (
              <StudioPanel className="grid gap-3 p-4 md:grid-cols-3" tone="soft">
                <div>
                  <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${dimTextClass}`}>Group ID</div>
                  <div className="mt-2 break-all font-mono text-xs text-[var(--studio-text)]">{selectedRealPortraitGroup.group.id}</div>
                </div>
                <div>
                  <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${dimTextClass}`}>ProjectName</div>
                  <div className="mt-2 text-sm text-[var(--studio-text)]">{selectedRealPortraitGroup.group.projectName || DEFAULT_VIRTUAL_PORTRAIT_PROJECT_NAME}</div>
                </div>
                <div>
                  <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${dimTextClass}`}>Assets</div>
                  <div className="mt-2 text-sm text-[var(--studio-text)]">{selectedRealPortraitGroup.assetCount} 个素材</div>
                </div>
              </StudioPanel>
            ) : null}

            {isLoadingRealPortraitLibrary ? (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {Array.from({ length: 10 }).map((_, index) => (
                  <div key={index} className={`relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-2xl border ${skeletonClass}`}>
                    <img src="./assets/loading.gif" alt="" className="studio-loading-gif !h-1/2 !w-1/2 opacity-30" />
                  </div>
                ))}
              </div>
            ) : !selectedRealPortraitGroup && realPortraitGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-surface-soft)] py-20">
                <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
                  <FolderOpen className="h-6 w-6 text-[var(--studio-muted)]" />
                </span>
                <p className="text-lg font-medium text-[var(--studio-text)]">还没有真人人像分组</p>
                <p className="mt-2 text-sm text-[var(--studio-muted)]">先完成真人认证创建分组，再进入分组上传该真人的素材。</p>
              </div>
            ) : selectedRealPortraitGroup ? (
              selectedRealPortraitGroup.assets.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-surface-soft)] py-20">
                  <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
                    <Upload className="h-6 w-6 text-[var(--studio-muted)]" />
                  </span>
                  <p className="text-lg font-medium text-[var(--studio-text)]">该真人分组还没有素材</p>
                  <p className="mt-2 text-sm text-[var(--studio-muted)]">上传通过人脸一致性校验的图片后，状态 Active 即可选择使用。</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
                  {selectedRealPortraitGroup.assets.map((asset) => {
                    const localAsset = realPortraitAssetByAssetId.get(asset.id);
                    const imageUrl = localAsset?.imageUrl || asset.url;
                    const description = localAsset?.description || asset.name || asset.id;
                    const status = normalizeArkAssetStatus(asset.status);
                    const isActive = isArkAssetActiveStatus(status);
                    const isFailed = isArkAssetFailedStatus(status);
                    const statusClass = isActive
                      ? 'border-emerald-500/25 bg-emerald-500/15 text-emerald-200'
                      : isFailed
                        ? 'border-red-500/25 bg-red-500/15 text-red-200'
                        : 'border-amber-500/25 bg-amber-500/15 text-amber-200';

                    return (
                      <motion.div
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={asset.id}
                        className={cx(
                          'group overflow-hidden rounded-xl border bg-[var(--studio-surface-soft)] md:rounded-2xl',
                          'cursor-pointer border-transparent shadow-lg hover:border-sky-500',
                        )}
                        onClick={() => {
                          setRealAssetDetail({ asset, localAsset });
                          setIsConfirmingRealAssetDelete(false);
                        }}
                      >
                        <div className="relative aspect-[3/4] overflow-hidden">
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={description}
                              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-black/10 text-sm text-[var(--studio-muted)]">无预览</div>
                          )}
                          <div className="absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-col gap-2">
                            <span className={`w-fit rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusClass}`}>
                              {status}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1.5 border-t border-[var(--studio-border)] px-3 py-3">
                          <h4 className="line-clamp-2 text-sm font-semibold text-[var(--studio-text)] md:text-base">
                            {description}
                          </h4>
                          <p className={`line-clamp-1 font-mono text-[10px] md:text-xs ${dimTextClass}`}>
                            {asset.id}
                          </p>
                          <p className={`text-[10px] md:text-xs ${dimTextClass}`}>
                            {asset.createTime ? new Date(asset.createTime).toLocaleString() : '创建时间未知'}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
                {realPortraitGroups.map((groupView) => {
                  const group = groupView.group;
                  const groupName = group.name || group.title || group.id;
                  return (
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={group.id}
                      className="group overflow-hidden rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface-soft)] shadow-lg transition-colors hover:border-sky-500 md:rounded-2xl"
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedRealPortraitGroupId(group.id)}
                        className="block w-full text-left"
                      >
                        <div className="relative aspect-[3/4] overflow-hidden">
                          {groupView.coverImageUrl ? (
                            <img
                              src={groupView.coverImageUrl}
                              alt={groupName}
                              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-black/10 text-sm text-[var(--studio-muted)]">暂无素材</div>
                          )}
                        </div>
                        <div className="space-y-1.5 border-t border-[var(--studio-border)] px-3 py-3">
                          <h4 className="line-clamp-2 text-sm font-semibold text-[var(--studio-text)] md:text-base">
                            {groupName}
                          </h4>
                          <p className={`line-clamp-1 text-[10px] md:text-xs ${dimTextClass}`}>
                            {groupView.assetCount} 个素材
                          </p>
                          <p className={`line-clamp-1 text-[10px] md:text-xs ${dimTextClass}`}>
                            {group.projectName || DEFAULT_VIRTUAL_PORTRAIT_PROJECT_NAME}
                          </p>
                          <p className={`line-clamp-1 font-mono text-[10px] md:text-xs ${dimTextClass}`}>
                            {group.id}
                          </p>
                        </div>
                      </button>
                      <div className="mt-2 space-y-2 border-t border-[var(--studio-border)] px-3 pb-3 pt-3">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleOpenAssetGroupEditor('real', group);
                          }}
                          disabled={isUpdatingAssetGroup}
                          className="studio-button studio-button-secondary w-full justify-center px-3 py-2 text-xs"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          更新分组信息
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleDeleteRealPortraitGroup(groupView);
                          }}
                          disabled={groupView.assetCount > 0 || deletingRealGroupId === group.id}
                          className={cx(
                            'inline-flex w-full items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-xs font-medium transition-colors',
                            groupView.assetCount > 0 || deletingRealGroupId === group.id
                              ? 'cursor-not-allowed border-[var(--studio-border)] text-[var(--studio-muted)] opacity-60'
                              : secondaryButtonClass,
                          )}
                        >
                          {deletingRealGroupId === group.id ? <img src="./assets/loading.gif" alt="" className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                          {groupView.assetCount > 0 ? '需先清空素材' : '删除分组'}
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        ) : activeTab === 'virtualUpload' ? (
          <div className="space-y-5">
            <StudioPanel className="flex flex-wrap items-start justify-between gap-4 p-5" tone="soft">
              <div>
                <div className="studio-eyebrow">{selectedVirtualPortraitGroup ? 'Virtual Portrait Group' : 'Virtual Portrait Groups'}</div>
                <h2 className="mt-2 text-xl font-semibold text-[var(--studio-text)]">
                  {selectedVirtualPortraitGroup
                    ? (selectedVirtualPortraitGroup.group.name || selectedVirtualPortraitGroup.group.title || '素材资产组合')
                    : '虚拟人像素材资产组合'}
                </h2>
                <p className={`mt-2 text-sm leading-6 ${dimTextClass}`}>
                  默认只读取本地缓存；只有点击“手动刷新”时才会向 Ark 拉取最新列表和状态。
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {selectedVirtualPortraitGroup ? (
                  <button
                    type="button"
                    onClick={() => setSelectedVirtualPortraitGroupId('')}
                    className="studio-button studio-button-secondary px-4"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    返回组合列表
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void refreshVirtualPortraitGroups()}
                  disabled={isLoadingVirtualPortraitGroups}
                  className="studio-button studio-button-secondary px-4"
                >
                  <RefreshCw className={`h-4 w-4 ${isLoadingVirtualPortraitGroups ? 'animate-spin' : ''}`} />
                  手动刷新
                </button>
                {selectedVirtualPortraitGroup ? (
                  <button
                    type="button"
                    onClick={() => handleOpenAssetGroupEditor('virtual', selectedVirtualPortraitGroup.group)}
                    disabled={isUpdatingAssetGroup}
                    className="studio-button studio-button-secondary px-4"
                  >
                    <Pencil className="h-4 w-4" />
                    更新组合信息
                  </button>
                ) : null}
                {selectedVirtualPortraitGroup ? (
                  <button
                    type="button"
                    onClick={() => void handleDeleteVirtualPortraitGroup(selectedVirtualPortraitGroup)}
                    disabled={selectedVirtualPortraitGroup.assetCount > 0 || deletingVirtualGroupId === selectedVirtualPortraitGroup.group.id}
                    className="studio-button studio-button-secondary px-4"
                  >
                    <Trash2 className="h-4 w-4" />
                    删除组合
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={selectedVirtualPortraitGroup ? handleOpenVirtualPortraitModal : handleOpenVirtualGroupModal}
                  className="studio-button studio-button-primary px-4"
                >
                  {selectedVirtualPortraitGroup ? <Upload className="h-4 w-4" /> : <FolderPlus className="h-4 w-4" />}
                  {selectedVirtualPortraitGroup ? '创建素材资产' : '新建素材组合'}
                </button>
              </div>
            </StudioPanel>

            {virtualPortraitFeedback ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {virtualPortraitFeedback}
              </div>
            ) : null}

            {virtualPortraitError ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {virtualPortraitError}
              </div>
            ) : null}

            {selectedVirtualPortraitGroup ? (
              <StudioPanel className="grid gap-3 p-4 md:grid-cols-3" tone="soft">
                <div>
                  <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${dimTextClass}`}>Group ID</div>
                  <div className="mt-2 break-all font-mono text-xs text-[var(--studio-text)]">{selectedVirtualPortraitGroup.group.id}</div>
                </div>
                <div>
                  <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${dimTextClass}`}>ProjectName</div>
                  <div className="mt-2 text-sm text-[var(--studio-text)]">{selectedVirtualPortraitGroup.group.projectName || DEFAULT_VIRTUAL_PORTRAIT_PROJECT_NAME}</div>
                </div>
                <div>
                  <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${dimTextClass}`}>Assets</div>
                  <div className="mt-2 text-sm text-[var(--studio-text)]">{selectedVirtualPortraitGroup.assetCount} 个素材</div>
                </div>
              </StudioPanel>
            ) : null}

            {isLoadingVirtualPortraitLibrary ? (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {Array.from({ length: 10 }).map((_, index) => (
                  <div key={index} className={`relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-2xl border ${skeletonClass}`}>
                    <img src="./assets/loading.gif" alt="" className="studio-loading-gif !h-1/2 !w-1/2 opacity-30" />
                  </div>
                ))}
              </div>
            ) : !selectedVirtualPortraitGroup && virtualPortraitGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-surface-soft)] py-20">
                <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
                  <FolderOpen className="h-6 w-6 text-[var(--studio-muted)]" />
                </span>
                <p className="text-lg font-medium text-[var(--studio-text)]">还没有素材资产组合</p>
                <p className="mt-2 text-sm text-[var(--studio-muted)]">先创建一个虚拟人物组合，再进入组合上传该人物的素材。</p>
              </div>
            ) : selectedVirtualPortraitGroup ? (
              selectedVirtualPortraitGroup.assets.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-surface-soft)] py-20">
                  <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
                    <Upload className="h-6 w-6 text-[var(--studio-muted)]" />
                  </span>
                  <p className="text-lg font-medium text-[var(--studio-text)]">该组合还没有素材</p>
                  <p className="mt-2 text-sm text-[var(--studio-muted)]">上传图片后会生成 Ark assetId，状态 Active 后即可选择使用。</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
                  {selectedVirtualPortraitGroup.assets.map((asset) => {
                    const localAsset = virtualPortraitAssetByAssetId.get(asset.id);
                    const imageUrl = localAsset?.imageUrl || asset.url;
                    const description = localAsset?.description || asset.name || asset.id;
                    const status = normalizeArkAssetStatus(asset.status);
                    const isActive = isArkAssetActiveStatus(status);
                    const isFailed = isArkAssetFailedStatus(status);
                    const statusClass = isActive
                      ? 'border-emerald-500/25 bg-emerald-500/15 text-emerald-200'
                      : isFailed
                        ? 'border-red-500/25 bg-red-500/15 text-red-200'
                        : 'border-amber-500/25 bg-amber-500/15 text-amber-200';
                    return (
                      <motion.div
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={asset.id}
                        className={cx(
                          'group overflow-hidden rounded-xl border bg-[var(--studio-surface-soft)] md:rounded-2xl',
                          'cursor-pointer border-transparent shadow-lg hover:border-sky-500',
                        )}
                        onClick={() => {
                          setVirtualAssetDetail({ asset, localAsset });
                          setIsConfirmingVirtualAssetDelete(false);
                        }}
                      >
                        <div className="relative aspect-[3/4] overflow-hidden">
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={description}
                              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-black/10 text-sm text-[var(--studio-muted)]">无预览</div>
                          )}

                          <div className="absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-col gap-2">
                            <span className={`w-fit rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusClass}`}>
                              {status}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1.5 border-t border-[var(--studio-border)] px-3 py-3">
                          <h4 className="line-clamp-2 text-sm font-semibold text-[var(--studio-text)] md:text-base">
                            {description}
                          </h4>
                          <p className={`line-clamp-1 font-mono text-[10px] md:text-xs ${dimTextClass}`}>
                            {asset.id}
                          </p>
                          <p className={`text-[10px] md:text-xs ${dimTextClass}`}>
                            {asset.createTime ? new Date(asset.createTime).toLocaleString() : '创建时间未知'}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
                {virtualPortraitGroups.map((groupView) => {
                  const group = groupView.group;
                  const groupName = group.name || group.title || group.id;
                  return (
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={group.id}
                      className="group overflow-hidden rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface-soft)] shadow-lg transition-colors hover:border-sky-500 md:rounded-2xl"
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedVirtualPortraitGroupId(group.id)}
                        className="block w-full text-left"
                      >
                        <div className="relative aspect-[3/4] overflow-hidden">
                          {groupView.coverImageUrl ? (
                            <img
                              src={groupView.coverImageUrl}
                              alt={groupName}
                              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-black/10 text-sm text-[var(--studio-muted)]">暂无素材</div>
                          )}
                        </div>
                        <div className="space-y-1.5 border-t border-[var(--studio-border)] px-3 py-3">
                          <h4 className="line-clamp-2 text-sm font-semibold text-[var(--studio-text)] md:text-base">
                            {groupName}
                          </h4>
                          <p className={`line-clamp-1 text-[10px] md:text-xs ${dimTextClass}`}>
                            {groupView.assetCount} 个素材
                          </p>
                          <p className={`line-clamp-1 text-[10px] md:text-xs ${dimTextClass}`}>
                            {group.projectName || DEFAULT_VIRTUAL_PORTRAIT_PROJECT_NAME}
                          </p>
                          <p className={`line-clamp-1 font-mono text-[10px] md:text-xs ${dimTextClass}`}>
                            {group.id}
                          </p>
                        </div>
                      </button>
                      <div className="mt-2 space-y-2 border-t border-[var(--studio-border)] px-3 pb-3 pt-3">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleOpenAssetGroupEditor('virtual', group);
                          }}
                          disabled={isUpdatingAssetGroup}
                          className="studio-button studio-button-secondary w-full justify-center px-3 py-2 text-xs"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          更新组合信息
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleDeleteVirtualPortraitGroup(groupView);
                          }}
                          disabled={groupView.assetCount > 0 || deletingVirtualGroupId === group.id}
                          className="studio-button studio-button-secondary w-full justify-center px-3 py-2 text-xs"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          删除组合
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <StudioPanel className="flex flex-wrap items-start justify-between gap-4 p-5" tone="soft">
              <div>
                <div className="studio-eyebrow">Seedream Portraits</div>
                <h2 className="mt-2 text-xl font-semibold text-[var(--studio-text)]">Seedream 生成虚拟人像</h2>
              </div>
              <button
                type="button"
                onClick={handleOpenSeedreamPortraitModal}
                className="studio-button studio-button-primary px-4"
              >
                <Sparkles className="h-4 w-4" />
                Seedream 生成虚拟人像
              </button>
            </StudioPanel>

            {seedreamPortraitFeedback ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {seedreamPortraitFeedback}
              </div>
            ) : null}

            {seedreamPortraitError ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {seedreamPortraitError}
              </div>
            ) : null}

            {isLoadingSeedreamPortraitAssets ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className={`relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl border ${skeletonClass}`}>
                    <img src="./assets/loading.gif" alt="" className="studio-loading-gif !h-1/2 !w-1/2 opacity-30" />
                  </div>
                ))}
              </div>
            ) : seedreamPortraitAssets.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-surface-soft)] py-20">
                <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
                  <Sparkles className="h-6 w-6 text-[var(--studio-muted)]" />
                </span>
                <p className="text-lg font-medium text-[var(--studio-text)]">还没有 Seedream 生成虚拟人像</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {seedreamPortraitAssets.map((item) => (
                  <motion.div
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={item.id}
                    className={cx(
                      'group overflow-hidden rounded-xl border bg-[var(--studio-surface-soft)] md:rounded-2xl',
                      onSelect
                        ? 'cursor-pointer border-transparent shadow-lg hover:border-sky-500'
                        : 'border-[var(--studio-border)]',
                    )}
                    onClick={onSelect ? () => handleSelectPortrait(item.imageUrl, '', { description: item.description, submitMode: 'reference_image' }) : undefined}
                  >
                    <div className="relative aspect-video overflow-hidden">
                      <img
                        src={item.imageUrl}
                        alt={item.description}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                        loading="lazy"
                      />
                    </div>

                    <div className="space-y-1.5 border-t border-[var(--studio-border)] px-3 py-3">
                      <h4 className="line-clamp-2 text-sm font-semibold text-[var(--studio-text)] md:text-base">
                        {item.description}
                      </h4>
                      <p className={`text-[10px] md:text-xs ${dimTextClass}`}>
                        {new Date(item.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <StudioModal
        open={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        themeMode={resolvedThemeMode}
        className="max-w-5xl overflow-hidden p-0"
      >
        <div className="relative">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.22),transparent_58%)]" />
          <div className="relative border-b border-[var(--studio-border)] px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="studio-eyebrow">Portrait Assets</div>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--studio-text)]">图片素材配置</h2>
                <p className={`mt-2 max-w-2xl text-sm leading-6 ${dimTextClass}`}>
                  为了让“平台公开”稳定显示本地预览图，先下载素材包，再选择包含图片文件的素材文件夹。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsConfigModalOpen(false)}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition-colors ${secondaryButtonClass}`}
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="relative max-h-[80vh] space-y-6 overflow-y-auto px-6 py-6">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.9fr)]">
              <StudioPanel className="space-y-5 p-5" tone="soft">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
                    <BookOpenText className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--studio-text)]">配置教程</h3>
                    <p className={`mt-2 text-sm leading-6 ${dimTextClass}`}>
                      素材包里大约有 3000 张图片，文件名和人像资产 ID 对应。配置完成后，页面会优先从你选择的本地目录读取 `/portraits/...` 图片。
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className={`rounded-2xl border p-4 ${softPanelClass}`}>
                    <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-400">Step 1</div>
                    <div className="mt-3 text-sm font-semibold text-[var(--studio-text)]">下载素材包</div>
                    <p className={`mt-2 text-sm leading-6 ${dimTextClass}`}>
                      通过夸克网盘下载 `portraits` 图片素材包，提取码 `67jh`。
                    </p>
                  </div>
                  <div className={`rounded-2xl border p-4 ${softPanelClass}`}>
                    <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-400">Step 2</div>
                    <div className="mt-3 text-sm font-semibold text-[var(--studio-text)]">解压目录</div>
                    <p className={`mt-2 text-sm leading-6 ${dimTextClass}`}>
                      解压后确认你选择的目录里直接就是图片文件，比如 `asset-xxxx.png`、`asset-xxxx.jpg`。
                    </p>
                  </div>
                  <div className={`rounded-2xl border p-4 ${softPanelClass}`}>
                    <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-400">Step 3</div>
                    <div className="mt-3 text-sm font-semibold text-[var(--studio-text)]">选择文件夹</div>
                    <p className={`mt-2 text-sm leading-6 ${dimTextClass}`}>
                      点击右侧按钮手动选择素材文件夹。配置成功后，当前页面会优先显示本地图片。
                    </p>
                  </div>
                </div>

                <div className={`rounded-2xl border p-4 ${softPanelClass}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-[var(--studio-text)]">下载信息</div>
                      <div className={`mt-1 text-xs ${dimTextClass}`}>下载链接和提取码来自 `docs/PORTRAIT_LIBRARY.md`</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void openDownloadLink()}
                      className="studio-button studio-button-primary px-4"
                    >
                      <ExternalLink className="h-4 w-4" />
                      打开素材下载链接
                    </button>
                  </div>
                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[var(--studio-text)]">
                    夸克网盘：{PORTRAIT_DOWNLOAD_URL}
                    <br />
                    提取码：67jh
                  </div>
                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-xs leading-6 text-zinc-200">
                    sh scripts/fetch_portrait_library.sh --merge
                  </div>
                  <p className={`mt-3 text-xs leading-6 ${dimTextClass}`}>
                    如果你更新了 `portrait_lib_raw.json`，可以运行上面的命令把索引中的远程链接重新替换成 `/portraits/...` 本地路径。
                  </p>
                </div>
              </StudioPanel>

              <StudioPanel className="space-y-5 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="studio-eyebrow">Status</div>
                    <h3 className="mt-2 text-lg font-semibold text-[var(--studio-text)]">当前配置</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => void refreshPortraitConfig()}
                    disabled={isRefreshingConfig}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition-colors ${secondaryButtonClass}`}
                    aria-label="刷新图片素材配置"
                  >
                    <RefreshCw className={`h-4 w-4 ${isRefreshingConfig ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <div className={`rounded-2xl border p-4 ${softPanelClass}`}>
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-400">Desktop</div>
                  <div className="mt-3 text-sm font-semibold text-[var(--studio-text)]">
                    {portraitConfig?.configured ? '已配置本地目录' : '尚未配置本地目录'}
                  </div>
                  <p className={`mt-2 break-all text-sm leading-6 ${dimTextClass}`}>
                    {portraitConfig?.rootPath || '未设置。配置后会通过本地 bridge 直接读取图片文件。'}
                  </p>
                </div>

                {!isElectron && (
                  <div className={`rounded-2xl border p-4 ${softPanelClass}`}>
                    <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-400">Browser</div>
                    <div className="mt-3 text-sm font-semibold text-[var(--studio-text)]">
                      {browserFolderState.folderName || '未选择当前会话目录'}
                    </div>
                    <p className={`mt-2 text-sm leading-6 ${dimTextClass}`}>
                      {browserFolderState.fileCount > 0
                        ? `当前会话已载入 ${browserFolderState.fileCount} 张图片，刷新页面后需要重新选择。`
                        : '浏览器模式下可以临时选择一个文件夹做本地预览映射，但不会持久保存。'}
                    </p>
                  </div>
                )}

                {configFeedback && (
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                    {configFeedback}
                  </div>
                )}

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => void handleSelectPortraitFolder()}
                    disabled={isSavingConfig}
                    className="studio-button studio-button-primary w-full justify-center px-4"
                  >
                    <FolderOpen className="h-4 w-4" />
                    {isElectron ? '选择图片素材文件夹' : '选择当前会话素材文件夹'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleClearPortraitFolder()}
                    disabled={isSavingConfig}
                    className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition-colors ${secondaryButtonClass}`}
                  >
                    清除配置
                  </button>
                </div>

                <div className={`rounded-2xl border p-4 ${softPanelClass}`}>
                  <div className="text-sm font-semibold text-[var(--studio-text)]">选择建议</div>
                  <ul className={`mt-3 space-y-2 text-sm leading-6 ${dimTextClass}`}>
                    <li>选择解压后的 `portraits` 文件夹本身，不要选它的上一级目录。</li>
                    <li>目录内应直接包含 `asset-xxxx.png/jpg/webp` 这类图片文件。</li>
                    <li>如果你的人像索引还是远程 URL，请先执行 `fetch_portrait_library.sh --merge`。</li>
                  </ul>
                </div>
              </StudioPanel>
            </div>
          </div>
        </div>
      </StudioModal>

      <StudioModal
        open={isVirtualGroupModalOpen}
        onClose={() => {
          if (!isCreatingVirtualGroup) {
            setIsVirtualGroupModalOpen(false);
            resetVirtualGroupDraft();
          }
        }}
        themeMode={resolvedThemeMode}
        className="max-w-2xl overflow-hidden p-0"
        closeOnOverlayClick={!isCreatingVirtualGroup}
      >
        <div className="relative">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.22),transparent_58%)]" />
          <div className="relative border-b border-[var(--studio-border)] px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="studio-eyebrow">Virtual Portrait Group</div>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--studio-text)]">新建素材资产组合</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isCreatingVirtualGroup) {
                    setIsVirtualGroupModalOpen(false);
                    resetVirtualGroupDraft();
                  }
                }}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition-colors ${secondaryButtonClass}`}
                aria-label="关闭"
                disabled={isCreatingVirtualGroup}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-5 px-6 py-6">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--studio-dim)]">组合名称</span>
              <input
                value={virtualGroupDraft.name}
                onChange={(event) => {
                  setVirtualGroupDraft((prev) => ({ ...prev, name: event.target.value }));
                  setVirtualGroupDraftError('');
                }}
                disabled={isCreatingVirtualGroup}
                placeholder={DEFAULT_VIRTUAL_PORTRAIT_ASSET_GROUP_NAME}
                className="studio-input mt-2"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--studio-dim)]">描述</span>
              <textarea
                value={virtualGroupDraft.description}
                onChange={(event) => {
                  setVirtualGroupDraft((prev) => ({ ...prev, description: event.target.value }));
                  setVirtualGroupDraftError('');
                }}
                disabled={isCreatingVirtualGroup}
                placeholder="例如：品牌虚拟代言人 A 的正脸、全身和服装参考素材"
                className="studio-textarea mt-2 min-h-28"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--studio-dim)]">ProjectName</span>
              <input
                value={virtualGroupDraft.projectName}
                onChange={(event) => {
                  setVirtualGroupDraft((prev) => ({ ...prev, projectName: event.target.value }));
                  setVirtualGroupDraftError('');
                }}
                disabled={isCreatingVirtualGroup}
                placeholder={DEFAULT_VIRTUAL_PORTRAIT_PROJECT_NAME}
                className="studio-input mt-2"
              />
            </label>

            {virtualGroupDraftError ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {virtualGroupDraftError}
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-[var(--studio-border)] px-6 py-5">
            <button
              type="button"
              onClick={() => {
                if (!isCreatingVirtualGroup) {
                  setIsVirtualGroupModalOpen(false);
                  resetVirtualGroupDraft();
                }
              }}
              disabled={isCreatingVirtualGroup}
              className="studio-button studio-button-secondary px-4"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleCreateVirtualGroup()}
              disabled={isCreatingVirtualGroup}
              className="studio-button studio-button-primary px-4"
            >
              {isCreatingVirtualGroup ? <img src="./assets/loading.gif" alt="" className="h-4 w-4" /> : <FolderPlus className="h-4 w-4" />}
              创建组合
            </button>
          </div>
        </div>
      </StudioModal>

      <StudioModal
        open={isVirtualPortraitModalOpen}
        onClose={() => {
          if (!isUploadingVirtualPortraitAsset) {
            setIsVirtualPortraitModalOpen(false);
            resetVirtualPortraitDraft();
          }
        }}
        themeMode={resolvedThemeMode}
        className="max-w-4xl overflow-hidden p-0"
        closeOnOverlayClick={!isUploadingVirtualPortraitAsset}
      >
        <div className="relative">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.22),transparent_58%)]" />
          <div className="relative border-b border-[var(--studio-border)] px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="studio-eyebrow">Virtual Portrait Assets</div>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--studio-text)]">上传虚拟人像资产</h2>
                <p className={`mt-2 max-w-2xl text-sm leading-6 ${dimTextClass}`}>
                  图片会先上传到 TOS 获取公网 URL，再写入 Ark 私域虚拟人像素材资产库。
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isUploadingVirtualPortraitAsset) {
                    setIsVirtualPortraitModalOpen(false);
                    resetVirtualPortraitDraft();
                  }
                }}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition-colors ${secondaryButtonClass}`}
                aria-label="关闭"
                disabled={isUploadingVirtualPortraitAsset}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid max-h-[74vh] gap-6 overflow-y-auto px-6 py-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(20rem,1.05fr)]">
            <div className="space-y-5">
              <StudioPanel className="space-y-2 p-4" tone="soft">
                <div className="text-sm font-semibold text-[var(--studio-text)]">当前素材资产组合</div>
                <div className="text-sm text-[var(--studio-text)]">
                  {selectedVirtualPortraitGroup?.group.name || selectedVirtualPortraitGroup?.group.title || '未选择组合'}
                </div>
                <div className={`break-all font-mono text-xs ${dimTextClass}`}>
                  {selectedVirtualPortraitGroup?.group.id || ''}
                </div>
              </StudioPanel>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--studio-dim)]">描述</span>
                <textarea
                  value={virtualPortraitDraft.description}
                  onChange={(event) => {
                    setVirtualPortraitDraft((prev) => ({ ...prev, description: event.target.value }));
                    setVirtualPortraitDraftError('');
                  }}
                  disabled={isUploadingVirtualPortraitAsset}
                  placeholder="例如：品牌虚拟代言人正脸半身照"
                  className="studio-textarea mt-2 min-h-28"
                />
              </label>

              <StudioPanel className="space-y-3 p-4" tone="soft">
                <div className="text-sm font-semibold text-[var(--studio-text)]">入库流程</div>
                <ul className={`space-y-2 text-sm leading-6 ${dimTextClass}`}>
                  <li>使用 API 配置里的 TOS AccessKey 上传图片并生成公网 URL。</li>
                  <li>素材会写入当前组合，建议同一组合只维护同一个虚拟人物。</li>
                  <li>CreateAsset 返回 assetId 后只保存本地记录；后续状态需要手动刷新。</li>
                </ul>
              </StudioPanel>
            </div>

            <div className="space-y-4">
              <div
                tabIndex={0}
                onPaste={(event) => void handleVirtualPortraitPaste(event)}
                className={cx(
                  'flex min-h-[22rem] flex-col overflow-hidden rounded-3xl border border-dashed bg-[var(--studio-surface-soft)] outline-none transition-colors',
                  virtualPortraitDraft.imageDataUrl ? 'border-cyan-400/30' : 'border-[var(--studio-border)]',
                )}
              >
                {virtualPortraitDraft.imageDataUrl ? (
                  <img
                    src={virtualPortraitDraft.imageDataUrl}
                    alt="虚拟人像预览"
                    className="h-[22rem] w-full object-cover"
                  />
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                    <div className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/5 text-cyan-300">
                      <Upload className="h-6 w-6" />
                    </div>
                    <div className="mt-4 text-base font-semibold text-[var(--studio-text)]">粘贴或上传虚拟人像图片</div>
                    <p className={`mt-2 text-sm leading-6 ${dimTextClass}`}>
                      支持 jpeg、png、webp 等图片；单张小于 30 MB。
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => virtualPortraitUploadInputRef.current?.click()}
                  disabled={isUploadingVirtualPortraitAsset}
                  className="studio-button studio-button-secondary px-4"
                >
                  <Upload className="h-4 w-4" />
                  上传图片
                </button>
                {virtualPortraitDraft.imageDataUrl ? (
                  <button
                    type="button"
                    onClick={() => {
                      setVirtualPortraitDraft((prev) => ({ ...prev, imageDataUrl: '', fileNameHint: '', file: null }));
                      setVirtualPortraitDraftError('');
                    }}
                    disabled={isUploadingVirtualPortraitAsset}
                    className="studio-button studio-button-secondary px-4"
                  >
                    清除图片
                  </button>
                ) : null}
              </div>

              <div className={`rounded-2xl border p-4 ${softPanelClass}`}>
                <div className="text-sm font-semibold text-[var(--studio-text)]">当前图片</div>
                <div className={`mt-2 text-sm leading-6 ${dimTextClass}`}>
                  {virtualPortraitDraft.fileNameHint || (virtualPortraitDraft.imageDataUrl ? '已从剪贴板载入图片' : '尚未选择图片')}
                </div>
              </div>

              {virtualPortraitUploadStep ? (
                <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
                  {virtualPortraitUploadStep}
                </div>
              ) : null}
            </div>
          </div>

          {virtualPortraitDraftError ? (
            <div className="px-6 pb-2">
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {virtualPortraitDraftError}
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-3 border-t border-[var(--studio-border)] px-6 py-5">
            <button
              type="button"
              onClick={() => {
                if (!isUploadingVirtualPortraitAsset) {
                  setIsVirtualPortraitModalOpen(false);
                  resetVirtualPortraitDraft();
                }
              }}
              disabled={isUploadingVirtualPortraitAsset}
              className="studio-button studio-button-secondary px-4"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleUploadVirtualPortraitAsset()}
              disabled={isUploadingVirtualPortraitAsset}
              className="studio-button studio-button-primary px-4"
            >
              {isUploadingVirtualPortraitAsset ? <img src="./assets/loading.gif" alt="" className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
              上传并生成 assetId
            </button>
          </div>
        </div>
      </StudioModal>

      <StudioModal
        open={Boolean(editingAssetGroup)}
        onClose={() => {
          if (!isUpdatingAssetGroup) {
            setEditingAssetGroup(null);
            setAssetGroupEditError('');
          }
        }}
        themeMode={resolvedThemeMode}
        className="max-w-2xl overflow-hidden p-0"
        closeOnOverlayClick={!isUpdatingAssetGroup}
      >
        {editingAssetGroup ? (
          <div className="relative">
            <div className="border-b border-[var(--studio-border)] px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="studio-eyebrow">Update Asset Group</div>
                  <h2 className="mt-2 text-2xl font-semibold text-[var(--studio-text)]">
                    {editingAssetGroup.target === 'real' ? '更新真人人像分组信息' : '更新虚拟人像组合信息'}
                  </h2>
                  <p className={`mt-2 text-sm leading-6 ${dimTextClass}`}>
                    当前接口仅支持更新 Asset Group 的名称和描述。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!isUpdatingAssetGroup) {
                      setEditingAssetGroup(null);
                      setAssetGroupEditError('');
                    }
                  }}
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition-colors ${secondaryButtonClass}`}
                  aria-label="关闭"
                  disabled={isUpdatingAssetGroup}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-5 px-6 py-6">
              <div className={`break-all rounded-2xl border p-3 font-mono text-xs leading-5 ${softPanelClass}`}>
                GroupId: {editingAssetGroup.groupId}<br />
                ProjectName: {editingAssetGroup.projectName || DEFAULT_VIRTUAL_PORTRAIT_PROJECT_NAME}
              </div>

              <label className="block">
                <span className={`text-xs font-semibold uppercase tracking-[0.2em] ${dimTextClass}`}>Name</span>
                <input
                  value={editingAssetGroup.name}
                  maxLength={64}
                  onChange={(event) => {
                    setEditingAssetGroup((current) => current ? { ...current, name: event.target.value } : current);
                    setAssetGroupEditError('');
                  }}
                  placeholder="Asset Group 名称"
                  className="studio-input mt-2"
                />
                <span className={`mt-1 block text-right text-[10px] ${dimTextClass}`}>{editingAssetGroup.name.length}/64</span>
              </label>

              <label className="block">
                <span className={`text-xs font-semibold uppercase tracking-[0.2em] ${dimTextClass}`}>Description</span>
                <textarea
                  value={editingAssetGroup.description}
                  maxLength={300}
                  onChange={(event) => {
                    setEditingAssetGroup((current) => current ? { ...current, description: event.target.value } : current);
                    setAssetGroupEditError('');
                  }}
                  placeholder="Asset Group 描述"
                  className="studio-textarea mt-2 min-h-28"
                />
                <span className={`mt-1 block text-right text-[10px] ${dimTextClass}`}>{editingAssetGroup.description.length}/300</span>
              </label>

              {assetGroupEditError ? (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {assetGroupEditError}
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-[var(--studio-border)] px-6 py-5">
              <button
                type="button"
                onClick={() => {
                  if (!isUpdatingAssetGroup) {
                    setEditingAssetGroup(null);
                    setAssetGroupEditError('');
                  }
                }}
                disabled={isUpdatingAssetGroup}
                className="studio-button studio-button-secondary px-4"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleSaveAssetGroupInfo()}
                disabled={isUpdatingAssetGroup}
                className="studio-button studio-button-primary px-4"
              >
                {isUpdatingAssetGroup ? <img src="./assets/loading.gif" alt="" className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                保存更新
              </button>
            </div>
          </div>
        ) : null}
      </StudioModal>

      <StudioModal
        open={Boolean(realAssetDetail)}
        onClose={() => {
          if (!deletingRealAssetId) {
            setRealAssetDetail(null);
            setIsConfirmingRealAssetDelete(false);
          }
        }}
        themeMode={resolvedThemeMode}
        className="max-w-4xl overflow-hidden p-0"
        closeOnOverlayClick={!deletingRealAssetId}
      >
        {realAssetDetail ? (() => {
          const asset = realAssetDetail.asset;
          const localAsset = realAssetDetail.localAsset || realPortraitAssetByAssetId.get(asset.id);
          const imageUrl = localAsset?.imageUrl || asset.url;
          const description = localAsset?.description || asset.name || asset.id;
          const sourceUrl = asset.url || localAsset?.sourceUrl || '';
          const status = normalizeArkAssetStatus(asset.status);
          const isActive = isArkAssetActiveStatus(status);
          const statusClass = isActive
            ? 'border-emerald-500/25 bg-emerald-500/15 text-emerald-200'
            : isArkAssetFailedStatus(status)
              ? 'border-red-500/25 bg-red-500/15 text-red-200'
              : 'border-amber-500/25 bg-amber-500/15 text-amber-200';
          const detailRows = [
            ['assetId', asset.id],
            ['状态', status],
            ['素材名称', asset.name || '未命名'],
            ['素材类型', asset.assetType || 'Image'],
            ['GroupId', asset.groupId || selectedRealPortraitGroup?.group.id || ''],
            ['ProjectName', asset.projectName || selectedRealPortraitGroup?.group.projectName || DEFAULT_VIRTUAL_PORTRAIT_PROJECT_NAME],
            ['创建时间', asset.createTime ? new Date(asset.createTime).toLocaleString() : '未知'],
            ['更新时间', asset.updateTime ? new Date(asset.updateTime).toLocaleString() : '未知'],
          ];

          return (
            <div className="relative">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.22),transparent_58%)]" />
              <div className="relative border-b border-[var(--studio-border)] px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="studio-eyebrow">Real Asset Detail</div>
                    <h2 className="mt-2 text-2xl font-semibold text-[var(--studio-text)]">真人人像素材详情</h2>
                    <p className={`mt-2 max-w-2xl text-sm leading-6 ${dimTextClass}`}>
                      {description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!deletingRealAssetId) {
                        setRealAssetDetail(null);
                        setIsConfirmingRealAssetDelete(false);
                      }
                    }}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition-colors ${secondaryButtonClass}`}
                    aria-label="关闭"
                    disabled={Boolean(deletingRealAssetId)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="grid max-h-[74vh] gap-6 overflow-y-auto px-6 py-6 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)]">
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-3xl border border-[var(--studio-border)] bg-[var(--studio-surface-soft)]">
                    <div className="relative flex min-h-[18rem] items-center justify-center bg-black/5">
                      {imageUrl ? (
                        <img src={imageUrl} alt={description} className="max-h-[30rem] w-full object-contain" />
                      ) : (
                        <div className="flex min-h-[18rem] w-full items-center justify-center text-sm text-[var(--studio-muted)]">无预览</div>
                      )}
                      <span className={`absolute left-3 top-3 w-fit rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusClass}`}>
                        {status}
                      </span>
                    </div>
                  </div>

                  {onSelect && imageUrl && isActive ? (
                    <button
                      type="button"
                      onClick={() => {
                        handleSelectPortrait(imageUrl, asset.id, { description, submitMode: 'auto' });
                        setRealAssetDetail(null);
                      }}
                      className="studio-button studio-button-primary w-full justify-center px-4"
                    >
                      使用该素材
                    </button>
                  ) : null}
                </div>

                <div className="space-y-4">
                  <div className={`rounded-2xl border p-4 ${softPanelClass}`}>
                    <div className="text-sm font-semibold text-[var(--studio-text)]">资产信息</div>
                    <div className="mt-4 space-y-3">
                      {detailRows.map(([label, value]) => (
                        <div key={label} className="grid gap-2 border-b border-[var(--studio-border)] pb-3 last:border-b-0 last:pb-0 md:grid-cols-[8rem_minmax(0,1fr)]">
                          <div className={`text-xs font-semibold uppercase tracking-[0.18em] ${dimTextClass}`}>{label}</div>
                          <div className="break-all font-mono text-xs leading-5 text-[var(--studio-text)]">{value || '-'}</div>
                        </div>
                      ))}
                      <div className="grid gap-2 border-b border-[var(--studio-border)] pb-3 last:border-b-0 last:pb-0 md:grid-cols-[8rem_minmax(0,1fr)]">
                        <div className={`text-xs font-semibold uppercase tracking-[0.18em] ${dimTextClass}`}>源 URL</div>
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="min-w-0 flex-1 truncate font-mono text-xs leading-5 text-[var(--studio-text)]" title={sourceUrl || '-'}>
                            {sourceUrl || '-'}
                          </div>
                          {sourceUrl ? (
                            <button
                              type="button"
                              onClick={() => void navigator.clipboard?.writeText(sourceUrl)}
                              className="inline-flex h-8 shrink-0 items-center justify-center rounded-xl border border-[var(--studio-border)] px-3 text-xs font-medium text-[var(--studio-text)] transition-colors hover:border-cyan-400/40 hover:bg-cyan-400/10"
                            >
                              复制
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>

                  {isConfirmingRealAssetDelete ? (
                    <div className={cx(
                      'rounded-2xl border px-4 py-3 text-sm leading-6',
                      resolvedThemeMode === 'light'
                        ? 'border-red-200 bg-red-50 text-red-700'
                        : 'border-red-500/25 bg-red-500/10 text-red-100',
                    )}>
                      删除后该 assetId 将不可再用于新任务。再次点击“确认删除素材”执行删除。
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-[var(--studio-border)] px-6 py-5">
                <button
                  type="button"
                  onClick={() => {
                    setIsConfirmingRealAssetDelete(false);
                    setRealAssetDetail(null);
                  }}
                  disabled={Boolean(deletingRealAssetId)}
                  className="studio-button studio-button-secondary px-4"
                >
                  关闭
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteRealPortraitAsset(asset)}
                  disabled={Boolean(deletingRealAssetId)}
                  className={cx(
                    'inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition-colors',
                    isConfirmingRealAssetDelete
                      ? resolvedThemeMode === 'light'
                        ? 'border-red-300 bg-red-50 text-red-700 hover:border-red-400 hover:bg-red-100'
                        : 'border-red-500/40 bg-red-500/20 text-red-100 hover:bg-red-500/30'
                      : secondaryButtonClass,
                  )}
                >
                  {deletingRealAssetId ? <img src="./assets/loading.gif" alt="" className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                  {isConfirmingRealAssetDelete ? '确认删除素材' : '删除素材'}
                </button>
              </div>
            </div>
          );
        })() : null}
      </StudioModal>

      <StudioModal
        open={Boolean(virtualAssetDetail)}
        onClose={() => {
          if (!deletingVirtualAssetId) {
            setVirtualAssetDetail(null);
            setIsConfirmingVirtualAssetDelete(false);
          }
        }}
        themeMode={resolvedThemeMode}
        className="max-w-4xl overflow-hidden p-0"
        closeOnOverlayClick={!deletingVirtualAssetId}
      >
        {virtualAssetDetail ? (() => {
          const asset = virtualAssetDetail.asset;
          const localAsset = virtualAssetDetail.localAsset || virtualPortraitAssetByAssetId.get(asset.id);
          const imageUrl = localAsset?.imageUrl || asset.url;
          const description = localAsset?.description || asset.name || asset.id;
          const sourceUrl = asset.url || localAsset?.sourceUrl || '';
          const status = normalizeArkAssetStatus(asset.status);
          const isActive = isArkAssetActiveStatus(status);
          const statusClass = isActive
            ? 'border-emerald-500/25 bg-emerald-500/15 text-emerald-200'
            : isArkAssetFailedStatus(status)
              ? 'border-red-500/25 bg-red-500/15 text-red-200'
              : 'border-amber-500/25 bg-amber-500/15 text-amber-200';
          const detailRows = [
            ['assetId', asset.id],
            ['状态', status],
            ['素材名称', asset.name || '未命名'],
            ['素材类型', asset.assetType || 'Image'],
            ['GroupId', asset.groupId || selectedVirtualPortraitGroup?.group.id || ''],
            ['ProjectName', asset.projectName || selectedVirtualPortraitGroup?.group.projectName || DEFAULT_VIRTUAL_PORTRAIT_PROJECT_NAME],
            ['创建时间', asset.createTime ? new Date(asset.createTime).toLocaleString() : '未知'],
            ['更新时间', asset.updateTime ? new Date(asset.updateTime).toLocaleString() : '未知'],
          ];

          return (
            <div className="relative">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.22),transparent_58%)]" />
              <div className="relative border-b border-[var(--studio-border)] px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="studio-eyebrow">Asset Detail</div>
                    <h2 className="mt-2 text-2xl font-semibold text-[var(--studio-text)]">素材资产详情</h2>
                    <p className={`mt-2 max-w-2xl text-sm leading-6 ${dimTextClass}`}>
                      {description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!deletingVirtualAssetId) {
                        setVirtualAssetDetail(null);
                        setIsConfirmingVirtualAssetDelete(false);
                      }
                    }}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition-colors ${secondaryButtonClass}`}
                    aria-label="关闭"
                    disabled={Boolean(deletingVirtualAssetId)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="grid max-h-[74vh] gap-6 overflow-y-auto px-6 py-6 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)]">
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-3xl border border-[var(--studio-border)] bg-[var(--studio-surface-soft)]">
                    <div className="relative flex min-h-[18rem] items-center justify-center bg-black/5">
                      {imageUrl ? (
                        <img src={imageUrl} alt={description} className="max-h-[30rem] w-full object-contain" />
                      ) : (
                        <div className="flex min-h-[18rem] w-full items-center justify-center text-sm text-[var(--studio-muted)]">无预览</div>
                      )}
                      <span className={`absolute left-3 top-3 w-fit rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusClass}`}>
                        {status}
                      </span>
                    </div>
                  </div>

                  {onSelect && isActive ? (
                    <button
                      type="button"
                      onClick={() => {
                        handleSelectPortrait(imageUrl, asset.id, { description, submitMode: 'auto' });
                        setVirtualAssetDetail(null);
                      }}
                      className="studio-button studio-button-primary w-full justify-center px-4"
                    >
                      使用该素材
                    </button>
                  ) : null}
                </div>

                <div className="space-y-4">
                  <div className={`rounded-2xl border p-4 ${softPanelClass}`}>
                    <div className="text-sm font-semibold text-[var(--studio-text)]">资产信息</div>
                    <div className="mt-4 space-y-3">
                      {detailRows.map(([label, value]) => (
                        <div key={label} className="grid gap-2 border-b border-[var(--studio-border)] pb-3 last:border-b-0 last:pb-0 md:grid-cols-[8rem_minmax(0,1fr)]">
                          <div className={`text-xs font-semibold uppercase tracking-[0.18em] ${dimTextClass}`}>{label}</div>
                          <div className="break-all font-mono text-xs leading-5 text-[var(--studio-text)]">{value || '-'}</div>
                        </div>
                      ))}
                      <div className="grid gap-2 border-b border-[var(--studio-border)] pb-3 last:border-b-0 last:pb-0 md:grid-cols-[8rem_minmax(0,1fr)]">
                        <div className={`text-xs font-semibold uppercase tracking-[0.18em] ${dimTextClass}`}>源 URL</div>
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="min-w-0 flex-1 truncate font-mono text-xs leading-5 text-[var(--studio-text)]" title={sourceUrl || '-'}>
                            {sourceUrl || '-'}
                          </div>
                          {sourceUrl ? (
                            <button
                              type="button"
                              onClick={() => void navigator.clipboard?.writeText(sourceUrl)}
                              className="inline-flex h-8 shrink-0 items-center justify-center rounded-xl border border-[var(--studio-border)] px-3 text-xs font-medium text-[var(--studio-text)] transition-colors hover:border-cyan-400/40 hover:bg-cyan-400/10"
                            >
                              复制
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>

                  {isConfirmingVirtualAssetDelete ? (
                    <div className={cx(
                      'rounded-2xl border px-4 py-3 text-sm leading-6',
                      resolvedThemeMode === 'light'
                        ? 'border-red-200 bg-red-50 text-red-700'
                        : 'border-red-500/25 bg-red-500/10 text-red-100',
                    )}>
                      删除后该 assetId 将不可再用于新任务。再次点击“确认删除素材”执行删除。
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-[var(--studio-border)] px-6 py-5">
                <button
                  type="button"
                  onClick={() => {
                    setIsConfirmingVirtualAssetDelete(false);
                    setVirtualAssetDetail(null);
                  }}
                  disabled={Boolean(deletingVirtualAssetId)}
                  className="studio-button studio-button-secondary px-4"
                >
                  关闭
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteVirtualPortraitAsset(asset)}
                  disabled={Boolean(deletingVirtualAssetId)}
                  className={cx(
                    'inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition-colors',
                    isConfirmingVirtualAssetDelete
                      ? resolvedThemeMode === 'light'
                        ? 'border-red-300 bg-red-50 text-red-700 hover:border-red-400 hover:bg-red-100'
                        : 'border-red-500/40 bg-red-500/20 text-red-100 hover:bg-red-500/30'
                      : secondaryButtonClass,
                  )}
                >
                  {deletingVirtualAssetId ? <img src="./assets/loading.gif" alt="" className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                  {isConfirmingVirtualAssetDelete ? '确认删除素材' : '删除素材'}
                </button>
              </div>
            </div>
          );
        })() : null}
      </StudioModal>

      <StudioModal
        open={isSeedreamPortraitModalOpen}
        onClose={() => {
          if (!isGeneratingSeedreamPortrait) {
            setIsSeedreamPortraitModalOpen(false);
            resetSeedreamPortraitDraft();
          }
        }}
        themeMode={resolvedThemeMode}
        className="max-w-4xl overflow-hidden p-0"
        closeOnOverlayClick={!isGeneratingSeedreamPortrait}
      >
        <div className="relative">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.22),transparent_58%)]" />
          <div className="relative border-b border-[var(--studio-border)] px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="studio-eyebrow">Seedream Portraits</div>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--studio-text)]">Seedream 生成虚拟人像</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isGeneratingSeedreamPortrait) {
                    setIsSeedreamPortraitModalOpen(false);
                    resetSeedreamPortraitDraft();
                  }
                }}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition-colors ${secondaryButtonClass}`}
                aria-label="关闭"
                disabled={isGeneratingSeedreamPortrait}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid max-h-[74vh] gap-6 overflow-y-auto px-6 py-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(22rem,1.1fr)]">
            <div className="space-y-5">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--studio-dim)]">模型</span>
                <StudioSelect
                  value={seedreamPortraitDraft.model}
                  onChange={(event) => {
                    setSeedreamPortraitDraft((prev) => ({ ...prev, model: event.target.value }));
                    setSeedreamPortraitDraftError('');
                  }}
                  disabled={isGeneratingSeedreamPortrait}
                  className="studio-select mt-2"
                >
                  <option value={SEEDREAM_GENERATED_PORTRAIT_MODEL}>{SEEDREAM_GENERATED_PORTRAIT_MODEL}</option>
                </StudioSelect>
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--studio-dim)]">提示词</span>
                <textarea
                  value={seedreamPortraitDraft.prompt}
                  onChange={(event) => {
                    setSeedreamPortraitDraft((prev) => ({ ...prev, prompt: event.target.value }));
                    setSeedreamPortraitDraftError('');
                  }}
                  disabled={isGeneratingSeedreamPortrait}
                  placeholder="例如：28岁女性科技品牌主理人，短发，银灰色机能夹克，冷静自信，写实商业摄影风格。"
                  className="studio-textarea mt-2 min-h-56"
                />
              </label>
            </div>

            <div className="space-y-4">
              <div className={`rounded-2xl border p-4 ${softPanelClass}`}>
                <div className="text-sm font-semibold text-[var(--studio-text)]">扩展提示词</div>
                <pre className={`mt-3 max-h-[25rem] overflow-y-auto whitespace-pre-wrap break-words text-xs leading-6 ${dimTextClass}`}>
                  {seedreamExpandedPromptPreview || '填写提示词后自动生成。'}
                </pre>
              </div>

              {seedreamPortraitDraftError ? (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {seedreamPortraitDraftError}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-[var(--studio-border)] px-6 py-5">
            <button
              type="button"
              onClick={() => {
                if (!isGeneratingSeedreamPortrait) {
                  setIsSeedreamPortraitModalOpen(false);
                  resetSeedreamPortraitDraft();
                }
              }}
              disabled={isGeneratingSeedreamPortrait}
              className="studio-button studio-button-secondary px-4"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleGenerateSeedreamPortraitAsset()}
              disabled={isGeneratingSeedreamPortrait}
              className="studio-button studio-button-primary px-4"
            >
              {isGeneratingSeedreamPortrait ? <img src="./assets/loading.gif" alt="" className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              Seedream 生成虚拟人像
            </button>
          </div>
        </div>
      </StudioModal>

      <StudioModal
        open={isRealGroupModalOpen}
        onClose={() => {
          if (!isCreatingRealPortraitSession && !isOpeningRealPortraitValidation && !isQueryingRealPortraitGroup) {
            setIsRealGroupModalOpen(false);
            resetRealPortraitDraft();
          }
        }}
        themeMode={resolvedThemeMode}
        className="max-w-3xl overflow-hidden p-0"
        closeOnOverlayClick={!isCreatingRealPortraitSession && !isOpeningRealPortraitValidation && !isQueryingRealPortraitGroup}
      >
        <div className="relative">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.22),transparent_58%)]" />
          <div className="relative border-b border-[var(--studio-border)] px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="studio-eyebrow">Real Portrait Group</div>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--studio-text)]">创建真人人像分组</h2>
                <p className={`mt-2 max-w-2xl text-sm leading-6 ${dimTextClass}`}>
                  生成 H5 真人认证链接并完成认证，认证通过后会创建该真人对应的 Asset Group。
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isCreatingRealPortraitSession && !isOpeningRealPortraitValidation && !isQueryingRealPortraitGroup) {
                    setIsRealGroupModalOpen(false);
                    resetRealPortraitDraft();
                  }
                }}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition-colors ${secondaryButtonClass}`}
                aria-label="关闭"
                disabled={isCreatingRealPortraitSession || isOpeningRealPortraitValidation || isQueryingRealPortraitGroup}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-5 px-6 py-6">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--studio-dim)]">ProjectName</span>
              <input
                value={realPortraitDraft.projectName}
                onChange={(event) => {
                  setRealPortraitDraft((prev) => ({ ...prev, projectName: event.target.value }));
                  setRealPortraitDraftError('');
                }}
                placeholder="default"
                className="studio-input mt-2"
              />
            </label>

            <StudioPanel className="space-y-3 p-4" tone="soft">
              <div className="text-sm font-semibold text-[var(--studio-text)]">真人认证</div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void handleStartRealPortraitValidation()}
                  disabled={isCreatingRealPortraitSession || isOpeningRealPortraitValidation || isQueryingRealPortraitGroup}
                  className="studio-button studio-button-primary px-4"
                >
                  {isCreatingRealPortraitSession || isOpeningRealPortraitValidation || isQueryingRealPortraitGroup
                    ? <img src="./assets/loading.gif" alt="" className="h-4 w-4" />
                    : <ExternalLink className="h-4 w-4" />}
                  开始 App 内认证
                </button>
                {realPortraitDraft.groupId ? (
                  <span className="break-all font-mono text-xs text-cyan-300">GroupId: {realPortraitDraft.groupId}</span>
                ) : null}
              </div>
              <p className={`text-sm leading-6 ${dimTextClass}`}>
                系统会自动生成 H5 认证链接，在 App 内窗口完成认证，并自动查询素材组 GroupId。
              </p>
            </StudioPanel>

            {realPortraitDraftError ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {realPortraitDraftError}
              </div>
            ) : null}

            {realPortraitUploadStep ? (
              <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
                {realPortraitUploadStep}
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-[var(--studio-border)] px-6 py-5">
            <button
              type="button"
              onClick={() => {
                if (!isCreatingRealPortraitSession && !isOpeningRealPortraitValidation && !isQueryingRealPortraitGroup) {
                  setIsRealGroupModalOpen(false);
                  resetRealPortraitDraft();
                }
              }}
              disabled={isCreatingRealPortraitSession || isOpeningRealPortraitValidation || isQueryingRealPortraitGroup}
              className="studio-button studio-button-secondary px-4"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleSaveRealPortraitGroup()}
              disabled={!realPortraitDraft.groupId.trim() || isCreatingRealPortraitSession || isOpeningRealPortraitValidation || isQueryingRealPortraitGroup}
              className="studio-button studio-button-primary px-4"
            >
              <FolderPlus className="h-4 w-4" />
              保存真人分组
            </button>
          </div>
        </div>
      </StudioModal>

      <StudioModal
        open={isAddRealPortraitModalOpen}
        onClose={() => {
          if (!isSavingRealPortraitAsset) {
            setIsAddRealPortraitModalOpen(false);
            resetRealPortraitDraft();
          }
        }}
        themeMode={resolvedThemeMode}
        className="max-w-5xl overflow-hidden p-0"
        closeOnOverlayClick={!isSavingRealPortraitAsset}
      >
        <div className="relative">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.22),transparent_58%)]" />
          <div className="relative border-b border-[var(--studio-border)] px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="studio-eyebrow">Real Portraits</div>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--studio-text)]">上传真人人像资产</h2>
                <p className={`mt-2 max-w-2xl text-sm leading-6 ${dimTextClass}`}>
                  向当前真人分组上传同人素材。系统会调用 CreateAsset，并在入库时做人脸一致性校验。
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isSavingRealPortraitAsset) {
                    setIsAddRealPortraitModalOpen(false);
                    resetRealPortraitDraft();
                  }
                }}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition-colors ${secondaryButtonClass}`}
                aria-label="关闭"
                disabled={isSavingRealPortraitAsset}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(20rem,1.05fr)]">
            <div className="space-y-5">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--studio-dim)]">描述</span>
                <textarea
                  value={realPortraitDraft.description}
                  onChange={(event) => {
                    setRealPortraitDraft((prev) => ({ ...prev, description: event.target.value }));
                    setRealPortraitDraftError('');
                  }}
                  placeholder="例如：品牌代言人正脸半身照"
                  className="studio-textarea mt-2 min-h-32"
                />
              </label>

              <StudioPanel className="space-y-3 p-4" tone="soft">
                <div className="text-sm font-semibold text-[var(--studio-text)]">当前分组</div>
                <div className={`break-all font-mono text-xs leading-5 ${dimTextClass}`}>
                  GroupId: {realPortraitDraft.groupId || selectedRealPortraitGroup?.group.id || '-'}
                </div>
                <div className={`break-all font-mono text-xs leading-5 ${dimTextClass}`}>
                  ProjectName: {realPortraitDraft.projectName || selectedRealPortraitGroup?.group.projectName || DEFAULT_VIRTUAL_PORTRAIT_PROJECT_NAME}
                </div>
                <ul className={`space-y-2 text-sm leading-6 ${dimTextClass}`}>
                  <li>单张图片需小于 30 MB，且素材中只能包含同一真人。</li>
                  <li>创建后状态可能为 Processing，点击“手动刷新”可同步 Active/Failed 状态。</li>
                </ul>
              </StudioPanel>
            </div>

            <div className="space-y-4">
              <div
                tabIndex={0}
                onPaste={(event) => void handleRealPortraitPaste(event)}
                className={cx(
                  'flex min-h-[22rem] flex-col overflow-hidden rounded-3xl border border-dashed bg-[var(--studio-surface-soft)] outline-none transition-colors',
                  realPortraitDraft.imageDataUrl ? 'border-cyan-400/30' : 'border-[var(--studio-border)]',
                )}
              >
                {realPortraitDraft.imageDataUrl ? (
                  <img
                    src={realPortraitDraft.imageDataUrl}
                    alt="真人人像预览"
                    className="h-[22rem] w-full object-cover"
                  />
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                    <div className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/5 text-cyan-300">
                      <Upload className="h-6 w-6" />
                    </div>
                    <div className="mt-4 text-base font-semibold text-[var(--studio-text)]">粘贴或上传图片</div>
                    <p className={`mt-2 text-sm leading-6 ${dimTextClass}`}>
                      聚焦当前区域后直接粘贴截图，或使用下方上传按钮选择图片文件。
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => realPortraitUploadInputRef.current?.click()}
                  className="studio-button studio-button-secondary px-4"
                >
                  <Upload className="h-4 w-4" />
                  上传图片
                </button>
                {realPortraitDraft.imageDataUrl ? (
                  <button
                    type="button"
                    onClick={() => {
                      setRealPortraitDraft((prev) => ({ ...prev, imageDataUrl: '', fileNameHint: '', file: null }));
                      setRealPortraitDraftError('');
                    }}
                    className="studio-button studio-button-secondary px-4"
                  >
                    清除图片
                  </button>
                ) : null}
              </div>

              <div className={`rounded-2xl border p-4 ${softPanelClass}`}>
                <div className="text-sm font-semibold text-[var(--studio-text)]">当前图片</div>
                <div className={`mt-2 text-sm leading-6 ${dimTextClass}`}>
                  {realPortraitDraft.fileNameHint || (realPortraitDraft.imageDataUrl ? '已从剪贴板载入图片' : '尚未选择图片')}
                </div>
              </div>
            </div>
          </div>

          {realPortraitDraftError ? (
            <div className="px-6 pb-2">
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {realPortraitDraftError}
              </div>
            </div>
          ) : null}

          {realPortraitUploadStep ? (
            <div className="px-6 pb-2">
              <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
                {realPortraitUploadStep}
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-3 border-t border-[var(--studio-border)] px-6 py-5">
            <button
              type="button"
              onClick={() => {
                if (!isSavingRealPortraitAsset) {
                  setIsAddRealPortraitModalOpen(false);
                  resetRealPortraitDraft();
                }
              }}
              disabled={isSavingRealPortraitAsset}
              className="studio-button studio-button-secondary px-4"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleSaveRealPortraitAsset()}
              disabled={isSavingRealPortraitAsset}
              className="studio-button studio-button-primary px-4"
            >
              {isSavingRealPortraitAsset ? <img src="./assets/loading.gif" alt="" className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
              上传素材资产
            </button>
          </div>
        </div>
      </StudioModal>

      <input
        ref={browserDirectoryInputRef}
        type="file"
        accept="image/*"
        onChange={handleBrowserFolderSelection}
        className="hidden"
        multiple
        {...(BROWSER_DIRECTORY_INPUT_PROPS as any)}
      />
      <input
        ref={realPortraitUploadInputRef}
        type="file"
        accept="image/*"
        onChange={(event) => void handleRealPortraitUpload(event)}
        className="hidden"
      />
      <input
        ref={virtualPortraitUploadInputRef}
        type="file"
        accept="image/*"
        onChange={(event) => void handleVirtualPortraitUpload(event)}
        className="hidden"
      />
    </ContentWrapper>
  );
}
