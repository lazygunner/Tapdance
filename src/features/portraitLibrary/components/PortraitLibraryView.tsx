import { useEffect, useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Users } from 'lucide-react';
import { StudioPage, StudioPageHeader, StudioSelect } from '../../../components/studio/StudioPrimitives.tsx';
import type { WorkspaceThemeMode } from '../../../components/studio/WorkspaceViews.tsx';

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

const ITEMS_PER_PAGE = 30;

export function PortraitLibraryView({ themeMode, isModal = false, onSelect }: PortraitLibraryViewProps) {
  const resolvedThemeMode: WorkspaceThemeMode = themeMode
    ?? (typeof document !== 'undefined' && (document.body.classList.contains('theme-light') || document.documentElement.classList.contains('theme-light'))
      ? 'light'
      : 'dark');
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

  // Load JSON
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch('/portrait_lib_raw.json');
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
      } catch (err: any) {
        if (isMounted) {
          console.error('Failed to load portrait library:', err);
          setError(err.message || '加载人物库失败');
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

  // Compute unique filter options
  const filterOptions = useMemo(() => {
    const genders = new Set<string>();
    const countries = new Set<string>();
    const occupations = new Set<string>();

    data.forEach(item => {
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

  // Apply filters
  const filteredData = useMemo(() => {
    return data.filter(item => {
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
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1); // Reset pagination on filter
  };

  const skeletonClass = resolvedThemeMode === 'light' ? 'bg-stone-200 animate-pulse border-stone-300' : 'bg-zinc-800 animate-pulse border-zinc-700';

  const ContentWrapper = isModal ? 'div' : StudioPage;

  return (
    <ContentWrapper className="h-full flex flex-col">
      {!isModal && (
        <StudioPageHeader
          eyebrow="Asset Library"
          title="虚拟人像库"
          actions={
            <div className="flex items-center gap-3">
              <div className="flex h-11 items-center justify-center rounded-2xl border border-[var(--studio-border)] bg-white/5 px-4 font-medium text-[var(--studio-muted)]">
                {loading ? '加载中...' : `共 ${filteredData.length} 个人像`}
              </div>
            </div>
          }
        />
      )}

      {/* Filter Bar */}
      <div className={`${isModal ? 'mb-4' : 'mt-8'} flex flex-wrap gap-4 items-center`}>
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--studio-muted)] whitespace-nowrap">性别</span>
          <StudioSelect value={filters.gender} onChange={e => handleFilterChange('gender', e.target.value)} className="min-w-[120px] studio-select">
            <option value="all">不限</option>
            <option value="女">女</option>
            <option value="男">男</option>
          </StudioSelect>
        </label>
        
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--studio-muted)] whitespace-nowrap">年龄</span>
          <StudioSelect value={filters.age} onChange={e => handleFilterChange('age', e.target.value)} className="min-w-[120px] studio-select">
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
          <StudioSelect value={filters.country} onChange={e => handleFilterChange('country', e.target.value)} className="min-w-[140px] studio-select">
            <option value="all">不限</option>
            {filterOptions.countries.map(c => <option key={c} value={c}>{c}</option>)}
          </StudioSelect>
        </label>

        <label className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--studio-muted)] whitespace-nowrap">职业</span>
          <StudioSelect value={filters.occupation} onChange={e => handleFilterChange('occupation', e.target.value)} className="min-w-[160px] studio-select">
            <option value="all">不限</option>
            {filterOptions.occupations.map(o => <option key={o} value={o}>{o}</option>)}
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

      {/* Main Grid */}
      <div className="mt-8 flex-1 pb-16">
        {error ? (
          <div className="flex flex-col items-center justify-center p-12 text-[var(--studio-muted)] bg-[var(--studio-surface-soft)] rounded-2xl border border-red-500/20">
            <Users className="w-10 h-10 mb-4 opacity-50" />
            <p className="text-lg font-semibold">{error}</p>
            <p className="mt-2 text-sm">请检查 /public 目录中是否存在 portrait_lib_raw.json</p>
          </div>
        ) : loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
             {Array.from({ length: 15 }).map((_, i) => (
                <div key={i} className={`aspect-[3/4] rounded-2xl border ${skeletonClass} overflow-hidden flex items-center justify-center relative`}>
                   <img src="/assets/loading.gif" alt="" className="studio-loading-gif !w-1/2 !h-1/2 opacity-30" />
                </div>
             ))}
          </div>
        ) : filteredData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-[var(--studio-surface-soft)] rounded-2xl border border-[var(--studio-border)]">
             <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 mb-4">
                <Users className="w-6 h-6 text-[var(--studio-muted)]" />
             </span>
             <p className="text-lg font-medium text-[var(--studio-text)]">没有找到匹配的人像</p>
             <p className="mt-2 text-sm text-[var(--studio-muted)]">尝试放宽你的筛选条件</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 md:gap-4">
              {visibleData.map((item) => {
                const imgUrl = item.AssetGroup?.Content?.Image?.[0]?.URL;
                const assetId = item.AssetGroup?.Content?.Image?.[0]?.AssetID || item.AssetGroup.SID;
                
                return (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={item.AssetGroup.SID} 
                    className={`group relative aspect-[3/4] overflow-hidden rounded-xl md:rounded-2xl bg-[var(--studio-surface-soft)] border ${onSelect ? 'border-transparent hover:border-sky-500 cursor-pointer shadow-lg' : 'border-[var(--studio-border)]'}`}
                    onClick={onSelect && imgUrl ? () => onSelect(imgUrl, assetId) : undefined}
                  >
                    {imgUrl ? (
                      <img 
                        src={imgUrl} 
                        alt={item.AssetGroup.Title}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center bg-black/10">无图片</div>
                    )}
                    
                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-90" />
                    
                     {/* Content */}
                    <div className="absolute inset-0 p-3 flex flex-col justify-end">
                       <h4 className="text-sm md:text-base font-bold mb-1 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] line-clamp-1 group-hover:line-clamp-none transition-all duration-300" style={{ color: '#ffffff' }}>
                          {item.AssetGroup.Title}
                       </h4>
                       <p className="text-[10px] md:text-xs drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] line-clamp-1 group-hover:line-clamp-3 transition-all duration-300" style={{ color: 'rgba(255, 255, 255, 0.85)' }}>
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
                  onClick={() => setPage(p => p + 1)}
                  className="studio-button studio-button-primary px-8"
                >
                  加载更多
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </ContentWrapper>
  );
}
