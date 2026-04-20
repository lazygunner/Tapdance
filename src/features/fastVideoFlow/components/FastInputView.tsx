import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type ClipboardEvent, type ReactNode } from 'react';
import { AlertTriangle, Check, CheckCircle2, HelpCircle, History, Image as ImageIcon, Search, Settings2, Sparkles, Upload, Users, Video, Volume2, X } from 'lucide-react';

import type { FastReferenceAudio, FastReferenceImage, FastVideoInput } from '../types/fastTypes.ts';
import { ClickPopover } from '../../../components/studio/ClickPopover.tsx';
import { StudioPage, StudioPageHeader, StudioPanel, StudioSelect, StudioModal } from '../../../components/studio/StudioPrimitives.tsx';
import { PortraitLibraryView } from '../../portraitLibrary/components/PortraitLibraryView.tsx';
import { FAST_VIDEO_PROMPT_CONFIG } from '../../../config/fastVideoPrompts.ts';
import { VideoUrlPreview, VIDEO_REFERENCE_CONSTRAINTS } from './VideoUrlPreview.tsx';
import { uploadFileToTos, uploadVideoToTos, isLikelyTosCorsError, isTosConfigComplete } from '../../../services/tosUploadService.ts';
import type { ProjectGroupImageAsset, ProjectGroupMediaAsset } from '../../../services/projectGroups.ts';

const REFERENCE_TYPE_OPTIONS: Array<{ value: NonNullable<FastReferenceImage['referenceType']>; label: string }> = [
  { value: 'scene', label: '场景参考图' },
  { value: 'person', label: '人物参考图' },
  { value: 'product', label: '产品参考图' },
  { value: 'style', label: '风格参考图' },
  { value: 'other', label: '其他参考图' },
];

const SUPPORTED_AUDIO_FILE_EXTENSIONS = new Set(['mp3', 'wav']);
const SUPPORTED_AUDIO_FILE_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav']);
const AUDIO_UPLOAD_ACCEPT = '.mp3,.wav,audio/mpeg,audio/mp3,audio/wav,audio/wave,audio/x-wav';
const AUDIO_FORMAT_HINT = '仅支持 MP3 / WAV，M4A 需先转换后再上传。';

function getFileExtension(name: string) {
  const parts = name.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

function isSupportedAudioFile(file: File) {
  const extension = getFileExtension(file.name);
  const mimeType = String(file.type || '').trim().toLowerCase();
  return SUPPORTED_AUDIO_FILE_EXTENSIONS.has(extension) || SUPPORTED_AUDIO_FILE_TYPES.has(mimeType);
}

function getReferenceTypeLabel(referenceType?: FastReferenceImage['referenceType']) {
  return REFERENCE_TYPE_OPTIONS.find((option) => option.value === (referenceType || 'other'))?.label || '其他参考图';
}

function isRealPersonReference(referenceType?: FastReferenceImage['referenceType']) {
  return referenceType === 'person';
}

/** Popover listing Seedance API constraints for reference videos */
function VideoRequirementsPopover() {
  const c = VIDEO_REFERENCE_CONSTRAINTS;
  return (
    <ClickPopover
      ariaLabel="查看参考视频 API 要求"
      align="left"
      className="ml-1.5 align-middle"
      trigger={<HelpCircle className="w-3.5 h-3.5" />}
      buttonClassName="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[var(--studio-border-strong)] text-[var(--studio-dim)] transition-colors hover:text-[var(--studio-text)] focus:outline-none focus:ring-2 focus:ring-sky-500/60"
      panelClassName="w-72 rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface-contrast)] px-3.5 py-3 text-xs leading-5 text-[var(--studio-muted)] shadow-[0_18px_48px_rgba(2,8,23,0.18)] backdrop-blur-xl"
      content={(
        <>
          <div className="mb-2 font-semibold text-[var(--studio-text)]">参考视频 API 要求</div>
          <ul className="space-y-1">
            <li>📹 格式：<span className="text-[var(--studio-text)]">mp4、mov</span></li>
            <li>🎬 分辨率：<span className="text-[var(--studio-text)]">480p、720p 或 1080p</span></li>
            <li>⏱ 时长：<span className="text-[var(--studio-text)]">单个 [{c.minDurationSec}s, {c.maxDurationSec}s]，总时长 ≤ {c.maxTotalDurationSec}s</span></li>
            <li>📐 宽高比（宽/高）：<span className="text-[var(--studio-text)]">[{c.minAspectRatio}, {c.maxAspectRatio}]</span></li>
            <li>📏 宽/高像素：<span className="text-[var(--studio-text)]">[{c.minPixelSide}px, {c.maxPixelSide}px]</span></li>
            <li>🔢 总像素：<span className="text-[var(--studio-text)]">[{(c.minTotalPixels / 1000).toFixed(0)}K, {(c.maxTotalPixels / 1000).toFixed(0)}K] px²</span></li>
            <li>💾 大小：<span className="text-[var(--studio-text)]">单个 ≤ {c.maxFileSizeMb} MB</span></li>
            <li>🎞 帧率：<span className="text-[var(--studio-text)]">[{c.minFps}, {c.maxFps}] FPS</span></li>
          </ul>
          <div className="mt-2 text-[10px] leading-4 text-[var(--studio-dim)]">注：帧率和文件大小仅在本地上传时可校验，URL 外链无法获取。</div>
        </>
      )}
    />
  );
}

type Props = {
  input: FastVideoInput;
  isGenerating: boolean;
  hasPlan: boolean;
  projectId?: string;
  currentGroupId?: string;
  historyImageMaterials?: ProjectGroupImageAsset[];
  historyMediaMaterials?: ProjectGroupMediaAsset[];
  onChange: (patch: Partial<FastVideoInput>) => void;
  onGenerate: () => void;
  onSkipStoryboard: () => void;
  onAddReferenceImage: () => string | void;
  onAddReferenceImagesFromHistory?: (materials: ProjectGroupImageAsset[]) => string[] | void;
  onReplaceReferenceImageFromHistory?: (referenceId: string, material: ProjectGroupImageAsset) => void;
  onAddReferenceVideosFromHistory?: (materials: ProjectGroupMediaAsset[]) => string[] | void;
  onReplaceReferenceVideoFromHistory?: (referenceId: string, material: ProjectGroupMediaAsset) => void;
  onAddReferenceAudiosFromHistory?: (materials: ProjectGroupMediaAsset[]) => string[] | void;
  onReplaceReferenceAudioFromHistory?: (referenceId: string, material: ProjectGroupMediaAsset) => void;
  onUploadReferenceImage: (event: ChangeEvent<HTMLInputElement>, referenceId: string) => void;
  onPasteReferenceImage: (file: File, referenceId: string) => void;
  onUpdateReferenceImage: (referenceId: string, patch: Partial<FastReferenceImage>) => void;
  onRemoveReferenceImage: (referenceId: string) => void;
  onAddReferenceVideo: () => string | void;
  onUpdateReferenceVideo: (referenceId: string, patch: Partial<import('../types/fastTypes.ts').FastReferenceVideo>) => void;
  onRemoveReferenceVideo: (referenceId: string) => void;
  onToggleReferenceVideoSelection: (referenceId: string) => void;
  onAddReferenceAudio: () => string | void;
  onUpdateReferenceAudio: (referenceId: string, patch: Partial<FastReferenceAudio>) => void;
  onRemoveReferenceAudio: (referenceId: string) => void;
  onTosUploadConfig?: import('../../../types.ts').TosConfig;
  onOpenApiConfig?: () => void;
  operationPanel?: ReactNode;
  hideHeader?: boolean;
};

const ASPECT_RATIO_OPTIONS: Array<{ value: FastVideoInput['aspectRatio']; label: string }> = [
  { value: '16:9', label: '横屏 16:9' },
  { value: '9:16', label: '竖屏 9:16' },
  { value: '1:1', label: '正方形 1:1' },
  { value: '4:3', label: '经典 4:3' },
  { value: '3:4', label: '竖构图 3:4' },
  { value: '21:9', label: '电影宽幅 21:9' },
];

const SCENE_COUNT_OPTIONS: Array<{ value: FastVideoInput['preferredSceneCount']; label: string }> = [
  { value: 'auto', label: '自动判断' },
  { value: 1, label: '单张分镜' },
  { value: 2, label: '双张分镜' },
];

type HistoryReferencePickerTarget = {
  kind: ProjectGroupMediaAsset['kind'];
  mode: 'append';
} | {
  kind: ProjectGroupMediaAsset['kind'];
  mode: 'replace';
  referenceId: string;
} | null;

function normalizeMaterialSearchText(value: string) {
  return value.replace(/\s+/gu, '').toLowerCase();
}

function getHistoryMediaKindLabel(kind: ProjectGroupMediaAsset['kind']) {
  if (kind === 'video') {
    return '视频';
  }
  if (kind === 'audio') {
    return '音频';
  }
  return '图片';
}

function toImageMaterial(material: ProjectGroupMediaAsset): ProjectGroupImageAsset {
  return {
    id: material.id,
    groupId: material.groupId,
    projectId: material.projectId,
    projectName: material.projectName,
    sourceType: material.sourceType as ProjectGroupImageAsset['sourceType'],
    title: material.title,
    sourceLabel: material.sourceLabel,
    imageUrl: material.url,
  };
}

function FastHistoryReferenceMediaPickerModal({
  target,
  materials,
  currentGroupId,
  currentProjectId,
  existingImageUrls,
  existingVideoUrls,
  existingAudioUrls,
  onClose,
  onAppend,
  onReplace,
}: {
  target: HistoryReferencePickerTarget;
  materials: ProjectGroupMediaAsset[];
  currentGroupId?: string;
  currentProjectId?: string;
  existingImageUrls: Set<string>;
  existingVideoUrls: Set<string>;
  existingAudioUrls: Set<string>;
  onClose: () => void;
  onAppend: (materials: ProjectGroupMediaAsset[]) => void;
  onReplace: (material: ProjectGroupMediaAsset) => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<Set<string>>(() => new Set());
  const isOpen = Boolean(target);
  const isAppendMode = target?.mode === 'append';
  const targetKind = target?.kind || 'image';
  const targetKindLabel = getHistoryMediaKindLabel(targetKind);
  const existingUrls = targetKind === 'video'
    ? existingVideoUrls
    : targetKind === 'audio'
      ? existingAudioUrls
      : existingImageUrls;

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setQuery('');
    setSelectedMaterialIds(new Set());
  }, [isOpen, target?.mode, target && 'referenceId' in target ? target.referenceId : '']);

  const filteredMaterials = useMemo(() => {
    const normalizedQuery = normalizeMaterialSearchText(query);
    return materials.filter((material) => {
      if (material.kind !== targetKind || !material.url.trim()) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }

      const haystack = normalizeMaterialSearchText(`${material.projectName} ${material.title} ${material.sourceLabel}`);
      return haystack.includes(normalizedQuery);
    });
  }, [materials, query]);

  const sameGroupMaterials = currentGroupId
    ? filteredMaterials.filter((material) => material.groupId === currentGroupId)
    : [];
  const otherMaterials = currentGroupId
    ? filteredMaterials.filter((material) => material.groupId !== currentGroupId)
    : filteredMaterials;
  const selectedMaterials = materials.filter((material) => selectedMaterialIds.has(material.id));

  const toggleSelectedMaterial = (material: ProjectGroupMediaAsset) => {
    if (existingUrls.has(material.url.trim())) {
      return;
    }

    setSelectedMaterialIds((previous) => {
      const next = new Set(previous);
      if (next.has(material.id)) {
        next.delete(material.id);
      } else {
        next.add(material.id);
      }
      return next;
    });
  };

  const renderMaterialPreview = (material: ProjectGroupMediaAsset) => {
    if (material.kind === 'video') {
      return (
        <video src={material.url} muted playsInline preload="metadata" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
      );
    }

    if (material.kind === 'audio') {
      return (
        <div className="flex h-full w-full items-center justify-center bg-emerald-500/8 text-emerald-200">
          <Volume2 className="h-8 w-8" />
        </div>
      );
    }

    return <img src={material.url} alt={material.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />;
  };

  const renderMaterialSection = (title: string, sectionMaterials: ProjectGroupMediaAsset[]) => {
    if (sectionMaterials.length === 0) {
      return null;
    }

    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--studio-dim)]">{title}</div>
          <span className="studio-chip">{sectionMaterials.length} 项</span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {sectionMaterials.map((material) => {
            const isAlreadyAdded = existingUrls.has(material.url.trim());
            const isSelected = selectedMaterialIds.has(material.id);
            const sourceProjectLabel = material.projectId === currentProjectId ? '当前项目' : material.projectName;

            return (
              <button
                key={material.id}
                type="button"
                disabled={isAppendMode && isAlreadyAdded}
                onClick={() => {
                  if (isAppendMode) {
                    toggleSelectedMaterial(material);
                    return;
                  }
                  onReplace(material);
                }}
                className={`group overflow-hidden rounded-xl border bg-[var(--studio-surface-soft)] text-left transition-colors ${isSelected
                  ? 'border-sky-400/70 ring-2 ring-sky-400/20'
                  : 'border-[var(--studio-border)] hover:border-[var(--studio-border-strong)]'
                  } ${isAppendMode && isAlreadyAdded ? 'cursor-not-allowed opacity-55' : ''}`}
              >
                <div className="relative aspect-square overflow-hidden bg-black/20">
                  {renderMaterialPreview(material)}
                  <div className="fast-history-media-source-badge absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px]">{material.sourceLabel}</div>
                  {isSelected ? (
                    <div className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-sky-300/40 bg-sky-500/85 text-white">
                      <Check className="h-4 w-4" />
                    </div>
                  ) : null}
                  {isAppendMode && isAlreadyAdded ? (
                    <div className="absolute inset-x-2 bottom-2 rounded-lg bg-black/72 px-2 py-1 text-center text-[11px] font-medium text-white">
                      已添加
                    </div>
                  ) : null}
                </div>
                <div className="space-y-1 p-3">
                  <div className="truncate text-[11px] text-[var(--studio-dim)]">{sourceProjectLabel}</div>
                  <div className="line-clamp-2 text-sm font-medium leading-5 text-[var(--studio-text)]">{material.title}</div>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <StudioModal
      open={isOpen}
      onClose={onClose}
      className="max-h-[88vh] max-w-6xl overflow-hidden p-0"
    >
      <div className="flex max-h-[88vh] flex-col bg-[var(--studio-surface)]">
        <div className="border-b border-[var(--studio-border)] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--studio-dim)]">History Materials</div>
              <h3 className="mt-2 text-xl font-semibold text-[var(--studio-text)]">
                {isAppendMode ? `从素材库添加参考${targetKindLabel}` : `从素材库替换参考${targetKindLabel}`}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[var(--studio-muted)]">
                同分组素材会优先展示；追加模式可多选，替换模式点击一张素材后立即应用。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--studio-border)] text-[var(--studio-dim)] transition-colors hover:text-[var(--studio-text)]"
              aria-label="关闭历史素材选择"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <label className="mt-4 flex items-center gap-2 rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface-soft)] px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-[var(--studio-dim)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索项目名、素材标题或来源"
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--studio-text)] outline-none placeholder:text-[var(--studio-dim)]"
            />
          </label>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {filteredMaterials.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--studio-border)] bg-[var(--studio-surface-soft)] px-6 py-10 text-center text-sm text-[var(--studio-muted)]">
              没有找到可用的历史{targetKindLabel}素材。
            </div>
          ) : (
            <>
              {renderMaterialSection('同分组优先', sameGroupMaterials)}
              {renderMaterialSection(currentGroupId ? '其他历史素材' : '历史素材', otherMaterials)}
            </>
          )}
        </div>

        {isAppendMode ? (
          <div className="flex items-center justify-between gap-3 border-t border-[var(--studio-border)] px-5 py-4">
            <div className="text-sm text-[var(--studio-muted)]">
              已选择 <span className="font-semibold text-[var(--studio-text)]">{selectedMaterials.length}</span> 项
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="studio-button studio-button-secondary">
                取消
              </button>
              <button
                type="button"
                disabled={selectedMaterials.length === 0}
                onClick={() => onAppend(selectedMaterials)}
                className="studio-button studio-button-primary"
              >
                <CheckCircle2 className="h-4 w-4" />
                添加为参考{targetKindLabel}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </StudioModal>
  );
}

export function FastInputView({
  input,
  isGenerating,
  hasPlan,
  projectId,
  currentGroupId,
  historyImageMaterials = [],
  historyMediaMaterials = [],
  onChange,
  onGenerate,
  onSkipStoryboard,
  onAddReferenceImage,
  onAddReferenceImagesFromHistory,
  onReplaceReferenceImageFromHistory,
  onAddReferenceVideosFromHistory,
  onReplaceReferenceVideoFromHistory,
  onAddReferenceAudiosFromHistory,
  onReplaceReferenceAudioFromHistory,
  onUploadReferenceImage,
  onPasteReferenceImage,
  onUpdateReferenceImage,
  onRemoveReferenceImage,
  onAddReferenceVideo,
  onUpdateReferenceVideo,
  onRemoveReferenceVideo,
  onToggleReferenceVideoSelection,
  onAddReferenceAudio,
  onUpdateReferenceAudio,
  onRemoveReferenceAudio,
  onTosUploadConfig,
  onOpenApiConfig,
  operationPanel,
  hideHeader = false,
}: Props) {
  const [portraitPickerTargetId, setPortraitPickerTargetId] = useState<string | null>(null);
  const [expandedReferenceImageId, setExpandedReferenceImageId] = useState<string | null>(null);
  const [editingReferenceVideoId, setEditingReferenceVideoId] = useState<string | null>(null);
  const [editingReferenceAudioId, setEditingReferenceAudioId] = useState<string | null>(null);
  const [historyReferencePickerTarget, setHistoryReferencePickerTarget] = useState<HistoryReferencePickerTarget>(null);
  const [uploadingVideoIds, setUploadingVideoIds] = useState<Record<string, boolean>>({});
  const [uploadingAudioIds, setUploadingAudioIds] = useState<Record<string, boolean>>({});
  const [audioValidationErrors, setAudioValidationErrors] = useState<Record<string, string>>({});
  const [durationDraft, setDurationDraft] = useState(() => String(input.durationSec));

  const MAX_AUDIO_DURATION_SEC = 15;

  const clearAudioValidationError = useCallback((referenceId: string) => {
    setAudioValidationErrors(prev => {
      if (!prev[referenceId]) {
        return prev;
      }
      const next = { ...prev };
      delete next[referenceId];
      return next;
    });
  }, []);

  const validateAudioFileFormat = useCallback((referenceId: string, file: File): boolean => {
    if (isSupportedAudioFile(file)) {
      clearAudioValidationError(referenceId);
      return true;
    }

    setAudioValidationErrors(prev => ({
      ...prev,
      [referenceId]: `上传音频格式不受支持：${file.name}。${AUDIO_FORMAT_HINT}`,
    }));
    return false;
  }, [clearAudioValidationError]);

  const validateAudioDuration = useCallback((referenceId: string, durationSec: number, audioUrl: string): boolean => {
    if (durationSec > MAX_AUDIO_DURATION_SEC) {
      setAudioValidationErrors(prev => ({
        ...prev,
        [referenceId]: `音频时长 ${durationSec.toFixed(1)}s 超过上限 ${MAX_AUDIO_DURATION_SEC}s，请裁剪后重新上传。`,
      }));
      onUpdateReferenceAudio(referenceId, { audioUrl: '', audioMeta: null });
      return false;
    }
    clearAudioValidationError(referenceId);
    return true;
  }, [clearAudioValidationError, onUpdateReferenceAudio]);

  const checkUploadedAudioDuration = useCallback((referenceId: string, url: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        const ok = validateAudioDuration(referenceId, audio.duration, url);
        audio.src = '';
        resolve(ok);
      };
      audio.onerror = () => {
        audio.src = '';
        resolve(true);
      };
      audio.src = url;
    });
  }, [validateAudioDuration]);
  const [tosCorsModalState, setTosCorsModalState] = useState<{ origin: string; message: string } | null>(null);
  const canGoDirectToVideo = Boolean(input.prompt.trim() || hasPlan);
  const historyMediaMaterialsWithImages = useMemo(() => {
    const mediaById = new Map<string, ProjectGroupMediaAsset>();
    for (const material of historyMediaMaterials) {
      mediaById.set(material.id, material);
    }
    for (const material of historyImageMaterials) {
      if (mediaById.has(material.id)) {
        continue;
      }
      mediaById.set(material.id, {
        ...material,
        kind: 'image',
        url: material.imageUrl,
      });
    }
    return Array.from(mediaById.values());
  }, [historyImageMaterials, historyMediaMaterials]);
  const existingReferenceImageUrls = useMemo(() => new Set(
    input.referenceImages.map((reference) => reference.imageUrl.trim()).filter(Boolean),
  ), [input.referenceImages]);
  const expandedReferenceImage = input.referenceImages.find((reference) => reference.id === expandedReferenceImageId) || null;
  const expandedReferenceImageIndex = expandedReferenceImage
    ? input.referenceImages.findIndex((reference) => reference.id === expandedReferenceImage.id)
    : -1;
  const referenceVideos = input.referenceVideos || [];
  const referenceAudios = input.referenceAudios || [];
  const editingReferenceVideo = referenceVideos.find((reference) => reference.id === editingReferenceVideoId) || null;
  const editingReferenceVideoIndex = editingReferenceVideo
    ? referenceVideos.findIndex((reference) => reference.id === editingReferenceVideo.id)
    : -1;
  const editingReferenceAudio = referenceAudios.find((reference) => reference.id === editingReferenceAudioId) || null;
  const editingReferenceAudioIndex = editingReferenceAudio
    ? referenceAudios.findIndex((reference) => reference.id === editingReferenceAudio.id)
    : -1;
  const totalReferenceMaterialCount = input.referenceImages.length + referenceVideos.length + referenceAudios.length;
  const existingReferenceVideoUrls = useMemo(() => new Set(
    referenceVideos.map((reference) => reference.videoUrl.trim()).filter(Boolean),
  ), [referenceVideos]);
  const existingReferenceAudioUrls = useMemo(() => new Set(
    referenceAudios.map((reference) => reference.audioUrl.trim()).filter(Boolean),
  ), [referenceAudios]);

  useEffect(() => {
    setDurationDraft(String(input.durationSec));
  }, [input.durationSec]);

  useEffect(() => {
    if (!expandedReferenceImageId) {
      return;
    }
    if (!input.referenceImages.some((reference) => reference.id === expandedReferenceImageId)) {
      setExpandedReferenceImageId(null);
    }
  }, [expandedReferenceImageId, input.referenceImages]);

  useEffect(() => {
    if (editingReferenceVideoId && !referenceVideos.some((reference) => reference.id === editingReferenceVideoId)) {
      setEditingReferenceVideoId(null);
    }
  }, [editingReferenceVideoId, referenceVideos]);

  useEffect(() => {
    if (editingReferenceAudioId && !referenceAudios.some((reference) => reference.id === editingReferenceAudioId)) {
      setEditingReferenceAudioId(null);
    }
  }, [editingReferenceAudioId, referenceAudios]);

  const openTosCorsSettings = async () => {
    const url = 'https://console.volcengine.com/tos/bucket/setting';
    if (typeof window === 'undefined') {
      return;
    }
    if (window.electronAPI?.isElectron) {
      await window.electronAPI.openExternal(url);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleReferencePaste = (event: ClipboardEvent<HTMLDivElement>, referenceId: string) => {
    const clipboardItems = Array.from(event.clipboardData.items as ArrayLike<DataTransferItem>);
    const file = clipboardItems
      .find((item) => item.type.startsWith('image/'))
      ?.getAsFile();
    if (!file) {
      return;
    }

    event.preventDefault();
    onPasteReferenceImage(file, referenceId);
  };

  const handleAddEmptyReferenceImage = () => {
    const nextReferenceId = onAddReferenceImage();
    if (typeof nextReferenceId === 'string') {
      setExpandedReferenceImageId(nextReferenceId);
    }
  };

  const handleAddEmptyReferenceVideo = () => {
    const nextReferenceId = onAddReferenceVideo();
    if (typeof nextReferenceId === 'string') {
      setEditingReferenceVideoId(nextReferenceId);
    }
  };

  const handleAddEmptyReferenceAudio = () => {
    const nextReferenceId = onAddReferenceAudio();
    if (typeof nextReferenceId === 'string') {
      setEditingReferenceAudioId(nextReferenceId);
    }
  };

  const handleAppendHistoryReferenceMaterials = (materials: ProjectGroupMediaAsset[]) => {
    if (!historyReferencePickerTarget) {
      return;
    }

    if (historyReferencePickerTarget.kind === 'video') {
      const addedReferenceIds = onAddReferenceVideosFromHistory?.(materials) || [];
      if (addedReferenceIds[0]) {
        setEditingReferenceVideoId(addedReferenceIds[0]);
      }
      setHistoryReferencePickerTarget(null);
      return;
    }

    if (historyReferencePickerTarget.kind === 'audio') {
      const addedReferenceIds = onAddReferenceAudiosFromHistory?.(materials) || [];
      if (addedReferenceIds[0]) {
        setEditingReferenceAudioId(addedReferenceIds[0]);
      }
      setHistoryReferencePickerTarget(null);
      return;
    }

    const addedReferenceIds = onAddReferenceImagesFromHistory?.(materials.map(toImageMaterial)) || [];
    if (addedReferenceIds[0]) {
      setExpandedReferenceImageId(addedReferenceIds[0]);
    }
    setHistoryReferencePickerTarget(null);
  };

  const handleReplaceHistoryReferenceMaterial = (material: ProjectGroupMediaAsset) => {
    if (!historyReferencePickerTarget || historyReferencePickerTarget.mode !== 'replace') {
      return;
    }

    if (historyReferencePickerTarget.kind === 'video') {
      onReplaceReferenceVideoFromHistory?.(historyReferencePickerTarget.referenceId, material);
      setEditingReferenceVideoId(historyReferencePickerTarget.referenceId);
      setHistoryReferencePickerTarget(null);
      return;
    }

    if (historyReferencePickerTarget.kind === 'audio') {
      onReplaceReferenceAudioFromHistory?.(historyReferencePickerTarget.referenceId, material);
      setEditingReferenceAudioId(historyReferencePickerTarget.referenceId);
      setHistoryReferencePickerTarget(null);
      return;
    }

    onReplaceReferenceImageFromHistory?.(historyReferencePickerTarget.referenceId, toImageMaterial(material));
    setExpandedReferenceImageId(historyReferencePickerTarget.referenceId);
    setHistoryReferencePickerTarget(null);
  };

  const closeReferenceImageEditor = () => {
    if (expandedReferenceImage && !expandedReferenceImage.imageUrl.trim() && !(expandedReferenceImage.assetId || '').trim()) {
      onRemoveReferenceImage(expandedReferenceImage.id);
    }
    setExpandedReferenceImageId(null);
  };

  const closeReferenceVideoEditor = () => {
    if (editingReferenceVideo && !editingReferenceVideo.videoUrl.trim()) {
      onRemoveReferenceVideo(editingReferenceVideo.id);
    }
    setEditingReferenceVideoId(null);
  };

  const closeReferenceAudioEditor = () => {
    if (editingReferenceAudio && !editingReferenceAudio.audioUrl.trim()) {
      onRemoveReferenceAudio(editingReferenceAudio.id);
    }
    setEditingReferenceAudioId(null);
  };

  const commitDurationDraft = () => {
    const parsedDuration = Number(durationDraft);
    const nextDuration = Number.isFinite(parsedDuration)
      ? Math.max(4, Math.min(15, Math.round(parsedDuration)))
      : input.durationSec;
    setDurationDraft(String(nextDuration));
    if (nextDuration !== input.durationSec) {
      onChange({ durationSec: nextDuration });
    }
  };

  return (
    <StudioPage className={hideHeader ? 'studio-page-fluid' : 'studio-page-wide'}>
      {!hideHeader ? (
        <StudioPageHeader
          eyebrow="Fast Video Flow"
          title="极速视频输入"
          description={(
            <p>
              输入一句提示词和可选参考图、参考视频、参考音频，系统会自动判断分镜数量并生成 Seedance 视频提示词草稿；快速剪辑模式会直接生成视频提示词。
            </p>
          )}
          actions={(
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onGenerate}
                disabled={isGenerating || !input.prompt.trim()}
                className="studio-button studio-button-fast-plan"
              >
                {isGenerating ? <span className="inline-flex items-center gap-2"><img src="./assets/loading.gif" alt="" className="w-4 h-4" />生成中</span> : <span className="inline-flex items-center gap-2"><Sparkles className="w-4 h-4" />{input.quickCutEnabled ? '生成快剪提示词' : '先生成分镜图'}</span>}
              </button>
              <button
                type="button"
                onClick={onSkipStoryboard}
                disabled={!canGoDirectToVideo}
                className="studio-button studio-button-direct-video"
              >
                不生成分镜直接生成视频
              </button>
            </div>
          )}
        />
      ) : null}

      <div className={`${hideHeader ? 'mt-2' : 'mt-8'} space-y-6`}>
        <StudioPanel className="min-w-0 space-y-5 p-6">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,4fr)_minmax(12rem,1fr)]">
            <div className="min-w-0">
              <div className="text-sm font-medium text-[var(--studio-text)]">核心提示词</div>
              <textarea
                value={input.prompt}
                onChange={(event) => onChange({ prompt: event.target.value })}
                rows={7}
                className="studio-textarea mt-2"
                placeholder="例如：一间临海日式客房从黄昏缓慢过渡到深夜，房间布局保持一致，最后出现静坐的少女，电影感、克制、写实。"
              />
            </div>

            <label className="block min-w-0">
              <span className="text-sm font-medium text-[var(--studio-text)]">负面限制词(可选)</span>
              <textarea
                value={input.negativePrompt || ''}
                onChange={(event) => onChange({ negativePrompt: event.target.value })}
                rows={7}
                className="studio-textarea mt-2"
                placeholder="no text, no watermark"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[minmax(8.5rem,1fr)_minmax(7rem,0.78fr)_minmax(9.5rem,1fr)_minmax(7rem,0.78fr)_minmax(16rem,1.55fr)]">
            <label className="block">
              <span className="text-sm font-medium text-[var(--studio-text)]">画幅比例</span>
              <StudioSelect
                value={input.aspectRatio}
                onChange={(event) => onChange({ aspectRatio: event.target.value as FastVideoInput['aspectRatio'] })}
                className="studio-select mt-2 h-12"
              >
                {ASPECT_RATIO_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </StudioSelect>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-[var(--studio-text)]">时长</span>
              <input
                type="number"
                min={4}
                max={15}
                value={durationDraft}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setDurationDraft(nextValue);
                  const parsedDuration = Number(nextValue);
                  if (Number.isFinite(parsedDuration) && parsedDuration >= 4 && parsedDuration <= 15) {
                    onChange({ durationSec: parsedDuration });
                  }
                }}
                onBlur={commitDurationDraft}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur();
                  }
                }}
                className="studio-input mt-2 h-12"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-[var(--studio-text)]">分镜数量偏好</span>
              <StudioSelect
                value={String(input.preferredSceneCount)}
                disabled={Boolean(input.quickCutEnabled)}
                onChange={(event) => {
                  const rawValue = event.target.value;
                  onChange({
                    preferredSceneCount: rawValue === '1' ? 1 : rawValue === '2' ? 2 : 'auto',
                  });
                }}
                className="studio-select mt-2 h-12"
              >
                {SCENE_COUNT_OPTIONS.map((option) => (
                  <option key={String(option.value)} value={String(option.value)}>{option.label}</option>
                ))}
              </StudioSelect>
            </label>

            <label className="block">
              <span className="flex items-center gap-2 text-sm font-medium text-[var(--studio-text)]">
                <span>快速剪辑</span>
                <ClickPopover
                  ariaLabel="查看快速剪辑说明"
                  align="left"
                  trigger="!"
                  buttonClassName="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[var(--studio-border)] text-[10px] font-semibold text-[var(--studio-dim)] transition-colors hover:border-[var(--studio-border-strong)] hover:text-[var(--studio-text)] focus:outline-none focus:ring-2 focus:ring-sky-500/60"
                  panelClassName="w-80 rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface-contrast)] px-3 py-2 text-[11px] leading-5 text-[var(--studio-muted)] shadow-[0_18px_48px_rgba(2,8,23,0.18)] backdrop-blur-xl whitespace-pre-wrap"
                  content={FAST_VIDEO_PROMPT_CONFIG.quickCut.tooltipDescription}
                />
              </span>
              <StudioSelect
                value={input.quickCutEnabled ? 'yes' : 'no'}
                onChange={(event) => onChange({ quickCutEnabled: event.target.value === 'yes' })}
                className="studio-select mt-2 h-12"
              >
                <option value="yes">是</option>
                <option value="no">否</option>
              </StudioSelect>
            </label>

            {operationPanel ? (
              <div className="min-w-0">
                <div className="text-sm font-medium text-[var(--studio-text)]">文本模型选择</div>
                <div className="mt-2">
                  {operationPanel}
                </div>
              </div>
            ) : null}
          </div>
        </StudioPanel>

        <aside className="min-w-0 space-y-6">
          <StudioPanel className="min-w-0 overflow-hidden p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-sm font-medium text-[var(--studio-text)]">
                  参考素材
                  <VideoRequirementsPopover />
                </div>
                <span className="inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--studio-border)] bg-white/6 px-2.5 text-[11px] font-semibold text-[var(--studio-muted)]">{totalReferenceMaterialCount} 项</span>
              </div>
              <div className="flex flex-wrap gap-1.5 sm:justify-end">
                <button
                  type="button"
                  onClick={handleAddEmptyReferenceImage}
                  className="fast-reference-add-button fast-reference-add-button-image"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  添加图片
                </button>
                <button
                  type="button"
                  onClick={handleAddEmptyReferenceVideo}
                  disabled={referenceVideos.length >= 3}
                  className="fast-reference-add-button fast-reference-add-button-video"
                >
                  <Video className="h-3.5 w-3.5" />
                  添加视频
                </button>
                <button
                  type="button"
                  onClick={handleAddEmptyReferenceAudio}
                  disabled={referenceAudios.length >= 3}
                  className="fast-reference-add-button fast-reference-add-button-audio"
                >
                  <Volume2 className="h-3.5 w-3.5" />
                  添加音频
                </button>
              </div>
            </div>

            <div className="mt-3 min-w-0 overflow-hidden rounded-2xl border border-dashed border-white/10 bg-black/10 p-4">
              {totalReferenceMaterialCount > 0 ? (
                <div className="min-w-0 space-y-3">
                  <div className="flex w-full min-w-0 max-w-full gap-3 overflow-x-auto pb-2 pr-1">
                    {input.referenceImages.map((reference, index) => {
                      const isEditing = reference.id === expandedReferenceImageId;
                      const hasImage = Boolean(reference.imageUrl.trim());

                      return (
                        <div
                          key={`image-${reference.id}`}
                          className={`w-40 shrink-0 overflow-hidden rounded-xl border bg-[var(--studio-surface-soft)] transition-colors sm:w-44 ${isEditing ? 'border-sky-400/60 ring-2 ring-sky-400/10' : 'border-[var(--studio-border)]'
                            }`}
                        >
                          <div className="relative aspect-video overflow-hidden bg-black/20">
                            <button
                              type="button"
                              onClick={() => setExpandedReferenceImageId(reference.id)}
                              className="block h-full w-full text-left"
                            >
                              {hasImage ? (
                                <img src={reference.imageUrl} alt={`reference-${index + 1}`} className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-[var(--studio-dim)]">
                                  <ImageIcon className="h-5 w-5" />
                                </div>
                              )}
                            </button>
                            <div className="absolute left-2 top-2 rounded-full bg-sky-500/85 px-2 py-0.5 text-[10px] font-medium text-white">图片</div>
                            <button
                              type="button"
                              onClick={() => onRemoveReferenceImage(reference.id)}
                              className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white transition-colors hover:bg-red-500/80"
                              aria-label={`删除参考图 ${index + 1}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="p-3">
                            <button
                              type="button"
                              onClick={() => setExpandedReferenceImageId(reference.id)}
                              className="block w-full min-w-0 text-left"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="shrink-0 text-sm font-medium text-[var(--studio-text)]">参考图 {index + 1}</span>
                                <span className="min-w-0 flex-1 truncate text-xs text-[var(--studio-dim)]">
                                  {reference.description || (hasImage ? '未填写描述' : '等待添加图片')}
                                </span>
                              </div>
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {referenceVideos.map((reference, index) => {
                      const isEditing = reference.id === editingReferenceVideoId;
                      const hasVideo = Boolean(reference.videoUrl.trim());

                      return (
                        <div
                          key={`video-${reference.id}`}
                          className={`w-40 shrink-0 overflow-hidden rounded-xl border bg-[var(--studio-surface-soft)] transition-colors sm:w-44 ${isEditing ? 'border-violet-400/60 ring-2 ring-violet-400/10' : 'border-[var(--studio-border)]'
                            }`}
                        >
                          <div className="relative aspect-video overflow-hidden bg-black/25">
                            <button
                              type="button"
                              onClick={() => setEditingReferenceVideoId(reference.id)}
                              className="block h-full w-full text-left"
                            >
                              {hasVideo ? (
                                <video src={reference.videoUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-[var(--studio-dim)]">
                                  <Video className="h-5 w-5" />
                                </div>
                              )}
                            </button>
                            <div className="absolute left-2 top-2 rounded-full bg-violet-500/85 px-2 py-0.5 text-[10px] font-medium text-white">视频</div>
                            <button
                              type="button"
                              onClick={() => onRemoveReferenceVideo(reference.id)}
                              className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white transition-colors hover:bg-red-500/80"
                              aria-label={`删除参考视频 ${index + 1}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="p-3">
                            <button
                              type="button"
                              onClick={() => setEditingReferenceVideoId(reference.id)}
                              className="block w-full min-w-0 text-left"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="shrink-0 text-sm font-medium text-[var(--studio-text)]">参考视频 {index + 1}</span>
                                <span className="min-w-0 flex-1 truncate text-xs text-[var(--studio-dim)]">
                                  {reference.description || (hasVideo ? '未填写说明' : '等待添加视频')}
                                </span>
                              </div>
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {referenceAudios.map((reference, index) => {
                      const isEditing = reference.id === editingReferenceAudioId;
                      const hasAudio = Boolean(reference.audioUrl.trim());

                      return (
                        <div
                          key={`audio-${reference.id}`}
                          className={`w-40 shrink-0 overflow-hidden rounded-xl border bg-[var(--studio-surface-soft)] transition-colors sm:w-44 ${isEditing ? 'border-emerald-400/60 ring-2 ring-emerald-400/10' : 'border-[var(--studio-border)]'
                            }`}
                        >
                          <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-black/25 text-emerald-200">
                            <button
                              type="button"
                              onClick={() => setEditingReferenceAudioId(reference.id)}
                              className="flex h-full w-full items-center justify-center text-left"
                            >
                              <Volume2 className="h-7 w-7" />
                            </button>
                            <div className="absolute left-2 top-2 rounded-full bg-emerald-500/85 px-2 py-0.5 text-[10px] font-medium text-white">音频</div>
                            <button
                              type="button"
                              onClick={() => onRemoveReferenceAudio(reference.id)}
                              className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white transition-colors hover:bg-red-500/80"
                              aria-label={`删除参考音频 ${index + 1}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="p-3">
                            <button
                              type="button"
                              onClick={() => setEditingReferenceAudioId(reference.id)}
                              className="block w-full min-w-0 text-left"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="shrink-0 text-sm font-medium text-[var(--studio-text)]">参考音频 {index + 1}</span>
                                <span className="min-w-0 flex-1 truncate text-xs text-[var(--studio-dim)]">
                                  {reference.description || (hasAudio ? '未填写说明' : '等待添加音频')}
                                </span>
                              </div>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--studio-dim)]">
                    <span>
                      图片 {input.referenceImages.length} · 视频 {referenceVideos.length}/3 · 音频 {referenceAudios.length}/3
                    </span>
                    <span>横向滑动查看全部素材。</span>
                  </div>
                </div>
              ) : (
                <div className="flex w-full flex-col items-center justify-center gap-3 py-7 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-500/10 text-sky-300">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="text-sm text-[var(--studio-text)]">暂无参考素材</div>
                  </div>
                </div>
              )}
            </div>
          </StudioPanel>
        </aside>
      </div>

      <StudioModal
        open={!!tosCorsModalState}
        onClose={() => setTosCorsModalState(null)}
        className="max-w-xl p-0"
      >
        {tosCorsModalState ? (
          <div className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-100">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200/80">TOS Bucket CORS</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">上传被浏览器跨域策略拦截</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">
                    当前页面无法直接 PUT 到 TOS。请到火山云 TOS 的 Bucket 跨域设置里，把当前应用域名加入允许来源。
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTosCorsModalState(null)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-800 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
                aria-label="关闭 TOS 跨域提示"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-surface-soft)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">当前需要放行的域名</p>
              <p className="mt-2 break-all font-mono text-sm text-emerald-300">
                {tosCorsModalState.origin || '当前应用域名'}
              </p>
            </div>

            <div className="mt-4 rounded-2xl border border-sky-500/20 bg-sky-500/6 px-4 py-4 text-xs leading-6 text-zinc-300">
              <p className="font-semibold text-sky-300">建议配置</p>
              <p className="mt-2">火山云控制台 → 对象存储 → 对应 Bucket → 权限管理 → 跨域设置</p>
              <div className="mt-3 space-y-1 font-mono text-[11px] text-zinc-300">
                <div><span className="text-zinc-500">AllowedOrigin:</span> <span className="text-emerald-300">{tosCorsModalState.origin || '当前应用域名'}</span></div>
                <div><span className="text-zinc-500">AllowedMethod:</span> <span className="text-emerald-300">PUT, GET, HEAD</span></div>
                <div><span className="text-zinc-500">AllowedHeader:</span> <span className="text-emerald-300">*</span></div>
                <div><span className="text-zinc-500">ExposeHeader:</span> <span className="text-emerald-300">ETag</span></div>
                <div><span className="text-zinc-500">MaxAgeSeconds:</span> <span className="text-emerald-300">3600</span></div>
              </div>
            </div>

            <p className="mt-4 text-xs leading-5 text-zinc-500">{tosCorsModalState.message}</p>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setTosCorsModalState(null)}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
              >
                关闭
              </button>
              <button
                type="button"
                onClick={() => {
                  setTosCorsModalState(null);
                  void openTosCorsSettings();
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/14 px-4 py-2 text-sm font-medium text-sky-100 transition-colors hover:bg-sky-500/20"
              >
                <Settings2 className="h-4 w-4" />
                去配置域名
              </button>
            </div>
          </div>
        ) : null}
      </StudioModal>

      <StudioModal
        open={!!expandedReferenceImage}
        onClose={closeReferenceImageEditor}
        className="max-h-[88vh] max-w-2xl overflow-hidden p-0"
      >
        {expandedReferenceImage ? (
          <div className="flex max-h-[88vh] flex-col bg-[var(--studio-surface)]">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--studio-border)] px-5 py-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--studio-dim)]">Reference Image</div>
                <h3 className="mt-2 text-xl font-semibold text-[var(--studio-text)]">
                  编辑参考图 {expandedReferenceImageIndex + 1}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeReferenceImageEditor}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--studio-border)] text-[var(--studio-dim)] transition-colors hover:text-[var(--studio-text)]"
                aria-label="关闭参考图编辑"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div
                tabIndex={0}
                onPaste={(event) => handleReferencePaste(event, expandedReferenceImage.id)}
                className="rounded-xl border border-white/10 bg-black/10 outline-none focus:border-sky-500"
              >
                {expandedReferenceImage.imageUrl ? (
                  <div className="h-44 overflow-hidden rounded-xl sm:h-52">
                    <img src={expandedReferenceImage.imageUrl} alt={`reference-${expandedReferenceImageIndex + 1}`} className="h-full w-full object-contain" />
                  </div>
                ) : (
                  <div className="flex h-44 flex-col items-center justify-center gap-3 px-4 text-center sm:h-52">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-500/10 text-sky-300">
                      <ImageIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm text-[var(--studio-text)]">粘贴图片或选择文件</div>
                      <div className="mt-1 text-xs text-[var(--studio-dim)]">先点击这个区域聚焦，再直接粘贴图片</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <label className="studio-button studio-button-secondary cursor-pointer px-3 py-2 text-xs">
                  <Upload className="h-3.5 w-3.5" />
                  {expandedReferenceImage.imageUrl ? '替换图片' : '选择图片'}
                  <input type="file" accept="image/*" className="hidden" onChange={(event) => onUploadReferenceImage(event, expandedReferenceImage.id)} />
                </label>
                <button
                  type="button"
                  onClick={() => setHistoryReferencePickerTarget({ kind: 'image', mode: 'replace', referenceId: expandedReferenceImage.id })}
                  className="studio-button studio-button-secondary px-3 py-2 text-xs"
                >
                  <History className="h-3.5 w-3.5" />
                  历史素材
                </button>
                <button
                  type="button"
                  onClick={() => setPortraitPickerTargetId(expandedReferenceImage.id)}
                  className="studio-button studio-button-secondary px-3 py-2 text-xs"
                >
                  <Users className="h-3.5 w-3.5" />
                  人像库
                </button>
              </div>

              <label className="mt-3 block">
                <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--studio-dim)]">参考类型</span>
                <StudioSelect
                  value={expandedReferenceImage.referenceType || 'other'}
                  onChange={(event) => onUpdateReferenceImage(expandedReferenceImage.id, { referenceType: event.target.value as FastReferenceImage['referenceType'] })}
                  className="studio-select mt-2"
                  displayValue={(
                    <span className="inline-flex items-center gap-2">
                      <span>{getReferenceTypeLabel(expandedReferenceImage.referenceType)}</span>
                      {isRealPersonReference(expandedReferenceImage.referenceType) ? (
                        <span className="rounded-full border border-sky-400/30 bg-sky-400/12 px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-sky-200">
                          真人
                        </span>
                      ) : null}
                    </span>
                  )}
                >
                  {REFERENCE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </StudioSelect>
              </label>

              <label className="mt-3 block">
                <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--studio-dim)]">参考图描述（可选）</span>
                <textarea
                  value={expandedReferenceImage.description || ''}
                  onChange={(event) => onUpdateReferenceImage(expandedReferenceImage.id, { description: event.target.value })}
                  rows={3}
                  placeholder={`例如：这是一张${getReferenceTypeLabel(expandedReferenceImage.referenceType)}，需要保留主体外观、服装、材质或场景结构。`}
                  className="studio-textarea mt-2"
                />
              </label>

              <label className="mt-3 block">
                <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--studio-dim)]">Asset ID（可选）</span>
                <input
                  value={expandedReferenceImage.assetId || ''}
                  onChange={(event) => onUpdateReferenceImage(expandedReferenceImage.id, { assetId: event.target.value })}
                  placeholder="例如 asset-20260224200602-qn7wr"
                  className="studio-input mt-2"
                />
              </label>
            </div>
          </div>
        ) : null}
      </StudioModal>

      <StudioModal
        open={!!editingReferenceVideo}
        onClose={closeReferenceVideoEditor}
        className="max-h-[88vh] max-w-2xl overflow-hidden p-0"
      >
        {editingReferenceVideo ? (
          <div className="flex max-h-[88vh] flex-col bg-[var(--studio-surface)]">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--studio-border)] px-5 py-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--studio-dim)]">Reference Video</div>
                <h3 className="mt-2 text-xl font-semibold text-[var(--studio-text)]">
                  编辑参考视频 {editingReferenceVideoIndex + 1}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[var(--studio-muted)]">
                  支持外链视频或上传到对象存储，参考视频效果与画幅比例需与最终生成尺寸强相关。
                </p>
              </div>
              <button
                type="button"
                onClick={closeReferenceVideoEditor}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--studio-border)] text-[var(--studio-dim)] transition-colors hover:text-[var(--studio-text)]"
                aria-label="关闭参考视频编辑"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <VideoUrlPreview
                url={editingReferenceVideo.videoUrl}
                className="w-full aspect-video rounded-xl border border-white/10 bg-black/30"
                onValidated={(_, meta) => {
                  onUpdateReferenceVideo(editingReferenceVideo.id, {
                    videoMeta: meta
                      ? {
                        durationSec: meta.durationSec,
                        width: meta.width,
                        height: meta.height,
                      }
                      : null,
                  });
                }}
              />

              <label className="mt-4 block">
                <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--studio-dim)]">视频外链地址</span>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    value={editingReferenceVideo.videoUrl}
                    onChange={(event) => onUpdateReferenceVideo(editingReferenceVideo.id, {
                      videoUrl: event.target.value,
                      videoMeta: null,
                    })}
                    placeholder="粘贴 http:// 或 https:// 开头的 mp4/mov 视频链接"
                    className="studio-input flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => setHistoryReferencePickerTarget({ kind: 'video', mode: 'replace', referenceId: editingReferenceVideo.id })}
                    className="studio-button studio-button-secondary shrink-0 px-3 py-2 text-xs"
                  >
                    <History className="h-3.5 w-3.5" />
                    历史素材
                  </button>
                  {!isTosConfigComplete(onTosUploadConfig) ? (
                    <button
                      type="button"
                      onClick={onOpenApiConfig}
                      className="studio-button studio-button-secondary shrink-0 text-amber-500 hover:text-amber-600"
                    >
                      <Settings2 className="h-4 w-4" />
                      配置 KEY
                    </button>
                  ) : (
                    <label className={`studio-button studio-button-secondary shrink-0 ${uploadingVideoIds[editingReferenceVideo.id] ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                      {uploadingVideoIds[editingReferenceVideo.id] ? (
                        <img src="./assets/loading.gif" alt="" className="h-4 w-4" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {uploadingVideoIds[editingReferenceVideo.id] ? '上传中' : '上传'}
                      {!uploadingVideoIds[editingReferenceVideo.id] && (
                        <input
                          type="file"
                          accept="video/mp4,video/quicktime,video/webm"
                          className="hidden"
                          disabled={uploadingVideoIds[editingReferenceVideo.id]}
                          onChange={async (event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            try {
                              setUploadingVideoIds(prev => ({ ...prev, [editingReferenceVideo.id]: true }));
                              // @ts-ignore - TOS Upload Service handles this
                              const { url } = await uploadVideoToTos(file, onTosUploadConfig);
                              onUpdateReferenceVideo(editingReferenceVideo.id, { videoUrl: url, videoMeta: null });
                            } catch (err) {
                              console.error(err);
                              if (isLikelyTosCorsError(err)) {
                                setTosCorsModalState({
                                  origin: typeof window !== 'undefined' ? window.location.origin : '',
                                  message: err.message,
                                });
                              } else {
                                alert('上传视频失败: ' + (err instanceof Error ? err.message : String(err)));
                              }
                            } finally {
                              setUploadingVideoIds(prev => ({ ...prev, [editingReferenceVideo.id]: false }));
                              event.target.value = '';
                            }
                          }}
                        />
                      )}
                    </label>
                  )}
                </div>
              </label>

              <label className="mt-4 block">
                <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--studio-dim)]">参考视频说明（可选）</span>
                <textarea
                  value={editingReferenceVideo.description || ''}
                  onChange={(event) => onUpdateReferenceVideo(editingReferenceVideo.id, { description: event.target.value })}
                  rows={3}
                  placeholder="描述视频中需要被模型参考的动作、运镜或特效特征..."
                  className="studio-textarea mt-2"
                />
              </label>
            </div>
          </div>
        ) : null}
      </StudioModal>

      <StudioModal
        open={!!editingReferenceAudio}
        onClose={closeReferenceAudioEditor}
        className="max-h-[88vh] max-w-2xl overflow-hidden p-0"
      >
        {editingReferenceAudio ? (
          <div className="flex max-h-[88vh] flex-col bg-[var(--studio-surface)]">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--studio-border)] px-5 py-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--studio-dim)]">Reference Audio</div>
                <h3 className="mt-2 text-xl font-semibold text-[var(--studio-text)]">
                  编辑参考音频 {editingReferenceAudioIndex + 1}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[var(--studio-muted)]">
                  支持外链音频或上传到云端，适合给节奏、对白、音乐或音效做参考驱动。
                </p>
              </div>
              <button
                type="button"
                onClick={closeReferenceAudioEditor}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--studio-border)] text-[var(--studio-dim)] transition-colors hover:text-[var(--studio-text)]"
                aria-label="关闭参考音频编辑"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                {editingReferenceAudio.audioUrl ? (
                  <audio
                    key={editingReferenceAudio.audioUrl}
                    src={editingReferenceAudio.audioUrl}
                    controls
                    preload="metadata"
                    className="w-full"
                    onLoadedMetadata={(event) => {
                      const duration = event.currentTarget.duration;
                      if (Number.isFinite(duration)) {
                        if (!validateAudioDuration(editingReferenceAudio.id, duration, editingReferenceAudio.audioUrl)) {
                          return;
                        }
                      }
                      onUpdateReferenceAudio(editingReferenceAudio.id, {
                        audioMeta: Number.isFinite(duration)
                          ? { durationSec: Math.max(0, duration) }
                          : null,
                      });
                    }}
                    onError={() => {
                      onUpdateReferenceAudio(editingReferenceAudio.id, {
                        audioMeta: null,
                      });
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-center gap-2 py-5 text-xs text-zinc-500">
                    <Volume2 className="h-4 w-4" />
                    暂无音频预览
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/6 px-3 py-2 text-xs leading-5 text-emerald-200">
                {AUDIO_FORMAT_HINT}
              </div>

              {audioValidationErrors[editingReferenceAudio.id] && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/8 px-3 py-2.5 text-xs leading-5 text-red-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                  {audioValidationErrors[editingReferenceAudio.id]}
                </div>
              )}

              <label className="mt-4 block">
                <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--studio-dim)]">音频外链地址</span>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    value={editingReferenceAudio.audioUrl}
                    onChange={(event) => {
                      clearAudioValidationError(editingReferenceAudio.id);
                      onUpdateReferenceAudio(editingReferenceAudio.id, {
                        audioUrl: event.target.value,
                        audioMeta: null,
                      });
                    }}
                    placeholder="粘贴 http:// 或 https:// 开头的 mp3/wav 音频链接"
                    className="studio-input flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => setHistoryReferencePickerTarget({ kind: 'audio', mode: 'replace', referenceId: editingReferenceAudio.id })}
                    className="studio-button studio-button-secondary shrink-0 px-3 py-2 text-xs"
                  >
                    <History className="h-3.5 w-3.5" />
                    历史素材
                  </button>
                  {!isTosConfigComplete(onTosUploadConfig) ? (
                    <button
                      type="button"
                      onClick={onOpenApiConfig}
                      className="studio-button studio-button-secondary shrink-0 text-amber-500 hover:text-amber-600"
                    >
                      <Settings2 className="h-4 w-4" />
                      配置 KEY
                    </button>
                  ) : (
                    <label className={`studio-button studio-button-secondary shrink-0 ${uploadingAudioIds[editingReferenceAudio.id] ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                      {uploadingAudioIds[editingReferenceAudio.id] ? (
                        <img src="./assets/loading.gif" alt="" className="h-4 w-4" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {uploadingAudioIds[editingReferenceAudio.id] ? '上传中' : '上传'}
                      {!uploadingAudioIds[editingReferenceAudio.id] && (
                        <input
                          type="file"
                          accept={AUDIO_UPLOAD_ACCEPT}
                          className="hidden"
                          disabled={uploadingAudioIds[editingReferenceAudio.id]}
                          onChange={async (event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            if (!validateAudioFileFormat(editingReferenceAudio.id, file)) {
                              event.target.value = '';
                              return;
                            }
                            try {
                              setUploadingAudioIds(prev => ({ ...prev, [editingReferenceAudio.id]: true }));
                              const { url } = await uploadFileToTos(file, onTosUploadConfig, {
                                mediaLabel: '音频',
                                defaultPrefix: 'reference-audios',
                              });
                              const isValid = await checkUploadedAudioDuration(editingReferenceAudio.id, url);
                              if (!isValid) return;
                              onUpdateReferenceAudio(editingReferenceAudio.id, { audioUrl: url, audioMeta: null });
                            } catch (err) {
                              console.error(err);
                              if (isLikelyTosCorsError(err)) {
                                setTosCorsModalState({
                                  origin: typeof window !== 'undefined' ? window.location.origin : '',
                                  message: err.message,
                                });
                              } else {
                                alert('上传音频失败: ' + (err instanceof Error ? err.message : String(err)));
                              }
                            } finally {
                              setUploadingAudioIds(prev => ({ ...prev, [editingReferenceAudio.id]: false }));
                              event.target.value = '';
                            }
                          }}
                        />
                      )}
                    </label>
                  )}
                </div>
              </label>

              <label className="mt-4 block">
                <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--studio-dim)]">参考音频说明（可选）</span>
                <textarea
                  value={editingReferenceAudio.description || ''}
                  onChange={(event) => onUpdateReferenceAudio(editingReferenceAudio.id, { description: event.target.value })}
                  rows={3}
                  placeholder="描述希望参考的节奏、对白、音乐氛围或音效特征..."
                  className="studio-textarea mt-2"
                />
              </label>
            </div>
          </div>
        ) : null}
      </StudioModal>

      <StudioModal
        open={!!portraitPickerTargetId}
        onClose={() => setPortraitPickerTargetId(null)}
        className="max-h-[85vh] flex flex-col overflow-hidden"
      >
        <div className="flex-1 overflow-y-auto p-2 md:p-6 bg-[var(--studio-surface)]">
          <PortraitLibraryView
            isModal={true}
            onSelect={(imgUrl, assetId) => {
              if (portraitPickerTargetId) {
                onUpdateReferenceImage(portraitPickerTargetId, {
                  imageUrl: imgUrl,
                  assetId: assetId,
                  referenceType: 'person'
                });
              }
              setPortraitPickerTargetId(null);
            }}
          />
        </div>
      </StudioModal>

      <FastHistoryReferenceMediaPickerModal
        target={historyReferencePickerTarget}
        materials={historyMediaMaterialsWithImages}
        currentGroupId={currentGroupId}
        currentProjectId={projectId}
        existingImageUrls={existingReferenceImageUrls}
        existingVideoUrls={existingReferenceVideoUrls}
        existingAudioUrls={existingReferenceAudioUrls}
        onClose={() => setHistoryReferencePickerTarget(null)}
        onAppend={handleAppendHistoryReferenceMaterials}
        onReplace={handleReplaceHistoryReferenceMaterial}
      />
    </StudioPage>
  );
}
