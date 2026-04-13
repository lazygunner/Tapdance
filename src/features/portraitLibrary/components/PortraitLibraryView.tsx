import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { motion } from 'motion/react';
import { BookOpenText, ExternalLink, FolderOpen, RefreshCw, Users, X } from 'lucide-react';
import {
  StudioModal,
  StudioPage,
  StudioPageHeader,
  StudioPanel,
  StudioSelect,
} from '../../../components/studio/StudioPrimitives.tsx';
import type { WorkspaceThemeMode } from '../../../components/studio/WorkspaceViews.tsx';
import {
  buildPortraitLibraryFileUrl,
  fetchPortraitLibraryConfig,
  getPortraitLibraryRelativePath,
  updatePortraitLibraryConfig,
  type PortraitLibraryConfig,
} from '../../../services/portraitLibrary.ts';

type PortraitLibraryViewProps = {
  themeMode?: WorkspaceThemeMode;
  isModal?: boolean;
  onSelect?: (imgUrl: string, assetId: string) => void;
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

const ITEMS_PER_PAGE = 30;
const PORTRAIT_DOWNLOAD_URL = 'https://pan.quark.cn/s/48caf9810a81';
const BROWSER_DIRECTORY_INPUT_PROPS = {
  directory: '',
  webkitdirectory: '',
} as const;

export function PortraitLibraryView({ themeMode, isModal = false, onSelect }: PortraitLibraryViewProps) {
  const resolvedThemeMode: WorkspaceThemeMode = themeMode
    ?? (typeof document !== 'undefined' && (document.body.classList.contains('theme-light') || document.documentElement.classList.contains('theme-light'))
      ? 'light'
      : 'dark');
  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);

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
  const browserDirectoryInputRef = useRef<HTMLInputElement | null>(null);

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

  const visibleData = filteredData.slice(0, page * ITEMS_PER_PAGE);
  const hasMore = visibleData.length < filteredData.length;

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
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

  const skeletonClass = resolvedThemeMode === 'light' ? 'bg-stone-200 animate-pulse border-stone-300' : 'bg-zinc-800 animate-pulse border-zinc-700';
  const softPanelClass = resolvedThemeMode === 'light'
    ? 'border-stone-200/80 bg-white/95 text-stone-700'
    : 'border-white/10 bg-white/[0.04] text-zinc-300';
  const secondaryButtonClass = resolvedThemeMode === 'light'
    ? 'border-stone-300 bg-white text-stone-700 hover:border-stone-400 hover:bg-stone-50'
    : 'border-white/10 bg-white/[0.04] text-zinc-100 hover:border-white/20 hover:bg-white/[0.07]';
  const dimTextClass = resolvedThemeMode === 'light' ? 'text-stone-500' : 'text-zinc-400';
  const ContentWrapper = isModal ? 'div' : StudioPage;

  return (
    <ContentWrapper className="h-full flex flex-col">
      {!isModal && (
        <StudioPageHeader
          eyebrow="Asset Library"
          title="虚拟人像库"
          actions={(
            <div className="flex items-center gap-3">
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
              <div className="flex h-11 items-center justify-center rounded-2xl border border-[var(--studio-border)] bg-white/5 px-4 font-medium text-[var(--studio-muted)]">
                {loading ? '加载中...' : `共 ${filteredData.length} 个人像`}
              </div>
            </div>
          )}
        />
      )}

      <div className={`${isModal ? 'mb-4' : 'mt-8'} flex flex-wrap items-center gap-4`}>
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

      <div className="mt-8 flex-1 pb-16">
        {error ? (
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
                    onClick={onSelect && imageUrl ? () => onSelect(imageUrl, assetId) : undefined}
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
                  为了让“虚拟人像库”稳定显示本地预览图，先下载素材包，再选择包含图片文件的素材文件夹。
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

      <input
        ref={browserDirectoryInputRef}
        type="file"
        accept="image/*"
        onChange={handleBrowserFolderSelection}
        className="hidden"
        multiple
        {...(BROWSER_DIRECTORY_INPUT_PROPS as any)}
      />
    </ContentWrapper>
  );
}
