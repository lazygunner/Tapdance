import { Video } from 'lucide-react';

import { StudioSelect } from '../../../components/studio/StudioPrimitives.tsx';
import { DEFAULT_MODEL_ROLE_META } from '../../../services/apiConfig.ts';
import {
  formatSelectionModelDisplay,
  type CostEstimate,
  type ModelCategory,
  type OperationCostUnits,
  type ResolvedModelSelection,
} from '../utils/modelSelection.ts';

type ThemeMode = 'light' | 'dark';

type PanelOption = {
  value: string;
  label: string;
};

type OperationModelPanelProps = {
  themeMode: ThemeMode;
  operationKey: string;
  category: ModelCategory;
  options: PanelOption[];
  rawSelected: string;
  resolvedSelection: ResolvedModelSelection;
  costEstimate: CostEstimate;
  onChange: (value: string) => void;
  units?: OperationCostUnits;
};

export function OperationModelPanel({
  themeMode,
  category,
  options,
  rawSelected,
  resolvedSelection,
  costEstimate,
  onChange,
}: OperationModelPanelProps) {
  const selected = rawSelected === 'flow' ? 'flow' : resolvedSelection.selectionValue;
  const categoryMeta = DEFAULT_MODEL_ROLE_META[category];
  const selectClass = themeMode === 'light'
    ? 'w-full max-w-full min-h-[42px] rounded-xl border border-[rgba(110,124,145,0.16)] bg-white/88 px-3 py-2 text-[13px] text-stone-900 outline-none focus:border-sky-500'
    : 'w-full max-w-full min-h-[42px] rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-[13px] text-white outline-none focus:border-indigo-500';
  const metaClass = themeMode === 'light' ? 'text-[11px] leading-5 text-stone-600' : 'text-[11px] leading-5 text-zinc-300';
  const costClass = themeMode === 'light' ? 'text-[11px] font-medium text-emerald-700' : 'text-[11px] font-medium text-emerald-400';
  const tagClass = category === 'text'
    ? 'studio-accent-chip-cyan'
    : category === 'image'
      ? 'studio-accent-chip-amber'
      : 'studio-accent-chip-sky';
  const resolvedInfoLabel = rawSelected === 'flow' ? `当前流程：${resolvedSelection.displayLabel}` : resolvedSelection.displayLabel;

  return (
    <div className="mt-2 max-w-full min-w-0 space-y-2">
      <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-center">
        <span className={`inline-flex min-h-[42px] shrink-0 items-center justify-center rounded-full border px-3.5 py-2 text-[11px] font-semibold whitespace-nowrap ${tagClass}`}>
          {categoryMeta.title}
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <StudioSelect
            value={selected}
            onChange={(event) => onChange(event.target.value)}
            className={selectClass}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </StudioSelect>
        </div>
      </div>
      <div className="mt-2 flex min-w-0 items-start justify-between gap-3 overflow-hidden">
        <div className={`min-w-0 flex-1 truncate ${metaClass}`} title={resolvedInfoLabel}>
          {resolvedInfoLabel}
        </div>
        {costEstimate.summary ? <div className={`shrink-0 whitespace-nowrap ${costClass}`}>{costEstimate.summary}</div> : null}
      </div>
    </div>
  );
}

type CompactOperationModelPanelProps = {
  themeMode: ThemeMode;
  category: ModelCategory;
  options: PanelOption[];
  rawSelected: string;
  resolvedSelection: ResolvedModelSelection;
  costEstimate: CostEstimate;
  onChange: (value: string) => void;
  units?: OperationCostUnits;
  showCategoryTag?: boolean;
  layout?: 'stacked' | 'inline';
};

export function CompactOperationModelPanel({
  themeMode,
  category,
  options,
  rawSelected,
  resolvedSelection,
  costEstimate,
  onChange,
  showCategoryTag = true,
  layout = 'stacked',
}: CompactOperationModelPanelProps) {
  const categoryMeta = DEFAULT_MODEL_ROLE_META[category];
  const compactDisplayLabel = resolvedSelection.modelName.trim()
    ? formatSelectionModelDisplay(resolvedSelection.sourceId, category, resolvedSelection.modelName)
    : '未配置';
  const tagClass = category === 'text'
    ? 'studio-accent-chip-cyan'
    : category === 'image'
      ? 'studio-accent-chip-amber'
      : 'studio-accent-chip-sky';
  const selectClass = themeMode === 'light'
    ? 'w-full max-w-full h-12 rounded-xl border border-[rgba(110,124,145,0.16)] bg-white/90 px-3 text-[12px] text-stone-900 outline-none focus:border-sky-500'
    : 'w-full max-w-full h-12 rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 text-[12px] text-white outline-none focus:border-violet-500';
  const priceClass = themeMode === 'light'
    ? 'text-[11px] font-medium text-emerald-700'
    : 'text-[11px] font-medium text-emerald-400';
  const showHeader = showCategoryTag || Boolean(costEstimate.summary);

  if (layout === 'inline') {
    return (
      <div className="max-w-full min-w-0 overflow-hidden">
        <div className="flex min-w-0 items-center gap-3">
          {showCategoryTag ? (
            <span className={`inline-flex min-h-[28px] shrink-0 items-center justify-center rounded-full border px-3 py-1 text-[10px] font-semibold whitespace-nowrap ${tagClass}`}>
              {categoryMeta.title}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <StudioSelect
              value={rawSelected}
              displayValue={compactDisplayLabel}
              onChange={(event) => onChange(event.target.value)}
              className={selectClass}
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </StudioSelect>
          </div>
          {costEstimate.summary ? <div className={`shrink-0 whitespace-nowrap ${priceClass}`}>{costEstimate.summary}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-full min-w-0 space-y-2 overflow-hidden">
      {showHeader ? (
        <div className="flex min-h-11 items-center justify-between gap-3">
          {showCategoryTag ? (
            <span className={`inline-flex min-h-[28px] shrink-0 items-center justify-center rounded-full border px-3 py-1 text-[10px] font-semibold whitespace-nowrap ${tagClass}`}>
              {categoryMeta.title}
            </span>
          ) : null}
          {costEstimate.summary ? <div className={`shrink-0 whitespace-nowrap ${priceClass}`}>{costEstimate.summary}</div> : null}
        </div>
      ) : null}
      <StudioSelect
        value={rawSelected}
        displayValue={compactDisplayLabel}
        onChange={(event) => onChange(event.target.value)}
        className={selectClass}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </StudioSelect>
    </div>
  );
}

type TimelineStripItem =
  | {
    kind: 'shot';
    key: string;
    shot: {
      id: string;
      shotNumber: number;
      imageUrl?: string;
      videoUrl?: string;
    };
    startSeconds: number;
    durationSeconds: number;
  }
  | {
    kind: 'transition';
    key: string;
    fromShot: {
      id: string;
    };
    toShot: {
      id: string;
      shotNumber: number;
    };
    index: number;
    startSeconds: number;
    durationSeconds: number;
    transitionVideoUrl?: string;
  };

type TimelineStripProps = {
  themeMode: ThemeMode;
  items: TimelineStripItem[];
  interactive?: boolean;
  onShotClick?: (shotId: string) => void;
  onTransitionClick?: (fromShotId: string) => void;
};

function formatTimelineSeconds(value: number) {
  return `${Math.max(0, Math.round(value || 0))}s`;
}

export function TimelineStrip({
  themeMode,
  items,
  interactive = false,
  onShotClick,
  onTransitionClick,
}: TimelineStripProps) {
  const stripShellClass = themeMode === 'light'
    ? 'bg-stone-100 border-stone-300'
    : 'bg-zinc-900 border-zinc-800';
  const shotCardClass = themeMode === 'light'
    ? 'bg-stone-50 border-stone-300'
    : 'bg-zinc-950 border-zinc-800';
  const transitionCardClass = themeMode === 'light'
    ? 'bg-stone-100/90 border-stone-300'
    : 'bg-zinc-950/80 border-zinc-700';
  const shotPlaceholderClass = themeMode === 'light' ? 'bg-stone-200' : 'bg-zinc-900';
  const shotBadgeClass = themeMode === 'light'
    ? 'bg-white/90 text-zinc-700 border border-stone-300'
    : 'bg-black/80 text-white';
  const videoBadgeClass = themeMode === 'light'
    ? 'bg-white/90 text-emerald-600 border border-stone-300'
    : 'bg-black/80 text-emerald-300';
  const transitionIconShellClass = themeMode === 'light'
    ? 'bg-white border-stone-300 text-zinc-500'
    : 'bg-zinc-900 border-zinc-700 text-zinc-400';
  const timelineBadgeClass = themeMode === 'light'
    ? 'bg-white/90 text-zinc-700 border border-stone-300'
    : 'bg-black/80 text-white';

  return (
    <div className={`border rounded-xl p-2 overflow-x-auto ${stripShellClass}`}>
      <div className="flex items-center gap-2 min-w-max">
        {items.map((item) => {
          if (item.kind === 'shot') {
            const shot = item.shot;
            return (
              <button
                key={item.key}
                type="button"
                onClick={interactive ? () => onShotClick?.(shot.id) : undefined}
                className={`w-44 h-24 shrink-0 rounded-lg border overflow-hidden relative ${shotCardClass} ${interactive ? 'hover:border-indigo-500/60 transition-colors cursor-pointer' : 'cursor-default'}`}
              >
                <div className="w-full h-full relative">
                  {shot.videoUrl ? (
                    <video src={shot.videoUrl} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                  ) : shot.imageUrl ? (
                    <img src={shot.imageUrl} alt={`Shot ${shot.shotNumber}`} className="w-full h-full object-cover" />
                  ) : (
                    <div className={`absolute inset-0 flex items-center justify-center ${shotPlaceholderClass}`}>
                      <span className="text-zinc-500 font-bold text-2xl opacity-70">{shot.shotNumber}</span>
                    </div>
                  )}
                  <div className={`absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm font-mono ${shotBadgeClass}`}>
                    S{String(shot.shotNumber).padStart(2, '0')}
                  </div>
                  <div className={`absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm font-medium flex items-center gap-1 ${videoBadgeClass}`}>
                    <Video className="w-2.5 h-2.5" />
                  </div>
                  <div className={`absolute bottom-1.5 left-1.5 text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm font-mono ${timelineBadgeClass}`}>
                    {formatTimelineSeconds(item.startSeconds)}
                  </div>
                  <div className={`absolute bottom-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm font-mono ${timelineBadgeClass}`}>
                    {formatTimelineSeconds(item.durationSeconds)}
                  </div>
                </div>
              </button>
            );
          }

          const hasTransitionVideo = Boolean(item.transitionVideoUrl);
          return (
            <button
              key={item.key}
              type="button"
              onClick={interactive ? () => onTransitionClick?.(item.fromShot.id) : undefined}
              className={`${hasTransitionVideo ? 'w-32 overflow-hidden border-solid' : 'w-16 border-dashed'} h-24 shrink-0 rounded-lg border relative flex flex-col items-center justify-center ${transitionCardClass} ${interactive ? 'hover:border-indigo-500/60 transition-colors cursor-pointer' : 'cursor-default'}`}
            >
              {item.transitionVideoUrl ? (
                <>
                  <video src={item.transitionVideoUrl} muted playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover" />
                  <div className={`absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm font-mono ${shotBadgeClass}`}>
                    T{String(item.index + 1).padStart(2, '0')}
                  </div>
                  <div className={`absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm font-medium flex items-center gap-1 ${videoBadgeClass}`}>
                    <Video className="w-2.5 h-2.5" />
                  </div>
                </>
              ) : (
                <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${transitionIconShellClass}`}>
                  <Video className="w-2.5 h-2.5" />
                </div>
              )}
              <div className={`absolute bottom-1.5 left-1.5 text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm font-mono ${timelineBadgeClass}`}>
                {formatTimelineSeconds(item.startSeconds)}
              </div>
              <div className={`absolute bottom-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm font-mono ${timelineBadgeClass}`}>
                {formatTimelineSeconds(item.durationSeconds)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
