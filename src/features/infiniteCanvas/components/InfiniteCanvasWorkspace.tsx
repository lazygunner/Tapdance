import { getSeedanceApiModelKeyForModelSourceId, SEEDANCE_API_MODEL_SOURCE_IDS, getSeedanceApiModelLabelForSourceId } from '../../seedance/modelVersions.ts';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, AudioLines, CheckCircle2, Clock3, Copy, FileImage, FileText, FolderOpen, Image as ImageIcon,
  ArchiveRestore, ChevronLeft, ChevronRight, Group, Ungroup, Trash2, MousePointer2, Play, Plus, RotateCcw, Search, Settings2, Upload, Video, Volume2, WandSparkles, X, ZoomIn, ZoomOut,
} from 'lucide-react';
import './infinite-canvas.css';
import type { ApiSettings, Asset, AspectRatio, ModelSourceId, Project, Shot, VisualAspectRatio } from '../../../types.ts';
import { StudioSelect } from '../../../components/studio/StudioPrimitives.tsx';
import type { AssetLibraryStatusItem } from '../../assetLibrary/utils/assetLibraryItems.ts';
import { getDefaultModelSource, getFlowOverrideOptions, resolveModelSource } from '../../../services/apiConfig.ts';
import { checkVideoStatus, fetchVideoBlobUrl, generateStoryboardImage, generateTextWithModel, startVideoGeneration } from '../../../services/modelService.ts';
import { createSeedanceTask, getSeedanceTask } from '../../seedance/services/seedanceApiService.ts';
import type { SeedanceApiModelKey, SeedanceDraft } from '../../seedance/types.ts';
import { getSeedanceCapabilities, isSeedance25, getSeedanceTemplateOptionConstraints, normalizeSeedanceDraftOptions } from '../../seedance/capabilities.ts';
import { validateSeedanceDraft } from '../../seedance/services/seedanceDraft.ts';
import { FAST_FLOW_TEMPLATE_IDS, getSeedanceTemplateDescription, SEEDANCE_TEMPLATE_REGISTRY } from '../../seedance/config/seedanceTemplateRegistry.ts';
import { fetchHappyHorseTask, submitHappyHorseTask } from '../../fastVideoFlow/services/aliyunHappyHorseService.ts';
import { getSeedanceCostEstimate } from '../../fastVideoFlow/utils/seedanceCostEstimate.ts';
import type { FastVideoInput } from '../../fastVideoFlow/types/fastTypes.ts';
import { createEmptyCanvasFlow, type CanvasEdge, type CanvasFlow, type CanvasNode, type CanvasNodeType, type CanvasViewport, type CanvasVideoGenerationConfig } from '../types.ts';
import { getCanvasEdgeRoute, getDirectIncomingCanvasNodes, getUpstreamCanvasNodes } from '../utils/canvasConnections.ts';

import { CanvasModal as StudioModal } from './CanvasModal.tsx';
import { CanvasCreationComposer, type CanvasImageCreationConfig } from './CanvasCreationComposer.tsx';
import { resolveCanvasPromptMentions, removeCanvasPromptMention } from '../utils/canvasPrompt.ts';
import { CanvasTools } from './CanvasTools.tsx';
import { CanvasShortcutPanel } from './CanvasShortcutPanel.tsx';
import { CanvasAddMenu } from './CanvasAddMenu.tsx';
import { CanvasNodeCard } from './CanvasNodeCard.tsx';
import { useEditHistory } from '../editor/useEditHistory.ts';
import { editorOwnsEvent, shortcutAction } from '../editor/shortcuts.ts';
import { arrangeCanvasNodes } from '../utils/canvas.layout.ts';
import { cloneCanvasSelection } from '../utils/canvas.clipboard.ts';
import { canvasGroups, canGroupNodes, splitCanvasGroup, groupedReferences, canReferenceImageGroup, removeGroupReferenceEdge } from '../utils/canvas.groups.ts';
import { moveCanvasNodesToRecycleBin, restoreCanvasRecycleBinEntry, permanentlyDeleteCanvasRecycleBinEntry } from '../utils/canvas.recycle-bin.ts';
import { canvasGroupBounds, canvasMarqueeNodeIds, expandCanvasSelection, snapCanvasSelection, fitCanvasViewport, focusCanvasNodeViewport, getViewportNodePosition, findNonOverlappingPosition, updateViewportForWheel, canConnect, type CanvasGuide, type CanvasRect } from '../utils/canvas.utils.ts';
import { normalizeCanvasFlow } from '../types.ts';

type Props = {
  key?: string;
  project: Project;
  setProject: React.Dispatch<React.SetStateAction<Project>>;
  apiSettings: ApiSettings;
  assetLibraryItems: AssetLibraryStatusItem[];
  themeMode: 'light' | 'dark';
  useMockMode?: boolean;
  onBack: () => void;
  onOpenSettings: () => void;
  onThemeChange: () => void;
  persistMedia: (url: string, options: { kind: 'image' | 'video'; assetId: string; title: string; fileNameHint?: string }) => Promise<{ url: string; savedToLibrary: boolean }>;
};

const NODE_META: Record<CanvasNodeType, { label: string; icon: typeof FileText; color: string; width: number; height: number }> = {
  text: { label: '文字', icon: FileText, color: 'sky', width: 280, height: 210 },
  image: { label: '图片', icon: ImageIcon, color: 'emerald', width: 360, height: 348 },
  audio: { label: '音频', icon: AudioLines, color: 'amber', width: 280, height: 240 },
  video: { label: '视频', icon: Video, color: 'violet', width: 360, height: 238 },
};

function makeNode(type: CanvasNodeType, x: number, y: number): CanvasNode {
  const meta = NODE_META[type];
  return {
    id: crypto.randomUUID(), type, x, y, width: meta.width, height: meta.height,
    title: `${meta.label}节点`, content: '', mediaUrl: '', mimeType: '', status: 'idle', error: '',
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

function getIncomingContext(node: CanvasNode, flow: CanvasFlow) {
  const direct = [...new Map([...getDirectIncomingCanvasNodes(node.id, flow), ...groupedReferences(node, flow.nodes)].map((source) => [source.id, source])).values()];
  const incoming = getUpstreamCanvasNodes(node.id, flow);
  const text = incoming
    .map((item) => item.content.trim() ? `[${item.title}] ${item.content.trim()}` : '')
    .filter(Boolean)
    .join('\n');
  const images = incoming.filter((item) => item.type === 'image' && item.mediaUrl);
  const audios = incoming.filter((item) => item.type === 'audio' && item.mediaUrl);
  const videos = incoming.filter((item) => item.type === 'video' && item.mediaUrl);
  return { direct, incoming, text, images, audios, videos, image: images[0]?.mediaUrl || '' };
}

function buildCanvasShot(
  prompt: string,
  imageUrl: string,
  aspectRatio: AspectRatio,
  duration = 4,
  resolution: '480p' | '720p' | '1080p' = '720p',
  generationOptions?: Pick<SeedanceDraft['options'], 'generateAudio' | 'returnLastFrame' | 'useWebSearch' | 'watermark'>,
): Shot {
  return {
    id: crypto.randomUUID(), shotNumber: 1, duration, shotSize: '中景', cameraAngle: '平视',
    cameraMovement: '静止', subject: '画布生成节点', action: prompt, mood: '', transition: '硬切',
    imageUrl, videoPrompt: { textToVideo: prompt, textToVideoZh: prompt, imageToVideo: prompt, imageToVideoZh: prompt },
    videoConfig: {
      resolution, frameRate: 24, aspectRatio, useFirstFrame: Boolean(imageUrl), useLastFrame: false, useReferenceAssets: Boolean(imageUrl),
      generateAudio: generationOptions?.generateAudio,
      returnLastFrame: generationOptions?.returnLastFrame,
      useWebSearch: generationOptions?.useWebSearch,
      watermark: generationOptions?.watermark,
    },
  };
}

function buildCanvasReferenceAssets(
  context: ReturnType<typeof getIncomingContext>,
  baseTemplateId: SeedanceDraft['baseTemplateId'],
  selectedIds?: Set<string>,
): SeedanceDraft['assets'] {
  const isSelected = (node: CanvasNode) => !selectedIds || selectedIds.has(node.id);
  const selectedImages = context.images.filter(isSelected);
  return [
    ...selectedImages.map((node, index) => ({
      id: node.id,
      kind: 'image' as const,
      source: node.mediaUrl.startsWith('http') ? 'url' as const : 'upload' as const,
      urlOrData: node.mediaUrl,
      role: baseTemplateId === 'first_frame' && index === 0
        ? 'first_frame' as const
        : baseTemplateId === 'first_last_frame' && index === 0
          ? 'first_frame' as const
          : baseTemplateId === 'first_last_frame' && index === 1
            ? 'last_frame' as const
            : 'reference_image' as const,
      label: `前序参考图片 ${index + 1}：${node.title}${node.content.trim() ? `，${node.content.trim()}` : ''}`,
    })),
    ...context.videos.filter(isSelected).map((node, index) => ({
      id: node.id,
      kind: 'video' as const,
      source: node.mediaUrl.startsWith('http') ? 'url' as const : 'upload' as const,
      urlOrData: node.mediaUrl,
      role: 'reference_video' as const,
      label: `前序参考视频 ${index + 1}：${node.title}${node.content.trim() ? `，${node.content.trim()}` : ''}`,
    })),
    ...context.audios.filter(isSelected).map((node, index) => ({
      id: node.id,
      kind: 'audio' as const,
      source: node.mediaUrl.startsWith('http') ? 'url' as const : 'upload' as const,
      urlOrData: node.mediaUrl,
      role: 'reference_audio' as const,
      label: `前序参考音频 ${index + 1}：${node.title}${node.content.trim() ? `，${node.content.trim()}` : ''}`,
    })),
  ];
}

function buildCanvasSeedanceDraft(prompt: string, context: ReturnType<typeof getIncomingContext>): SeedanceDraft {
  const hasVisualReference = context.images.length > 0 || context.videos.length > 0;
  const baseTemplateId = context.audios.length > 0 && hasVisualReference
    ? 'audio_guided'
    : context.videos.length > 0
      ? 'motion_reference'
      : context.images.length > 1
        ? 'multi_image_reference'
        : context.images.length === 1
          ? 'first_frame'
          : 'free_text';
  const assets = buildCanvasReferenceAssets(context, baseTemplateId);
  return {
    baseTemplateId,
    overlayTemplateIds: baseTemplateId === 'audio_guided' ? [] : ['auto_audio'],
    assets,
    prompt: { rawPrompt: prompt, diagnostics: [] },
    options: { ratio: '16:9', duration: 4, resolution: '720p', generateAudio: true, returnLastFrame: false, useWebSearch: false, watermark: false },
  };
}

function getSeedanceModelKey(sourceId: string): SeedanceApiModelKey {
  return getSeedanceApiModelKeyForModelSourceId(sourceId) || 'standard';
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type CanvasVideoConfigModalProps = {
  node: CanvasNode;
  context: ReturnType<typeof getIncomingContext>;
  initialSourceId: string;
  initialDraft: SeedanceDraft;
  themeMode: 'light' | 'dark';
  onClose: () => void;
  onConfirm: (config: CanvasVideoGenerationConfig) => void;
};

type CanvasImagePromptConfig = {
  prompt: string;
  ratio: VisualAspectRatio;
  sourceId: ModelSourceId;
  count?: number;
};

type CanvasImagePromptPopoverProps = {
  node: CanvasNode;
  context: ReturnType<typeof getIncomingContext>;
  apiSettings: ApiSettings;
  onClose: () => void;
  onConfirm: (config: CanvasImagePromptConfig) => void;
};

function CanvasImagePromptPopover({ node, context, apiSettings, onClose, onConfirm }: CanvasImagePromptPopoverProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [prompt, setPrompt] = useState([context.text, node.content].filter(Boolean).join('\n\n').trim());
  const [ratio, setRatio] = useState<VisualAspectRatio>(node.imageGenerationConfig?.ratio || '16:9');
  const [sourceId, setSourceId] = useState<ModelSourceId>(node.imageGenerationConfig?.sourceId || getDefaultModelSource(apiSettings, 'image'));
  const references = [...context.images, ...(node.mediaUrl ? [node] : [])].filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index);
  const modeLabel = references.length > 0 ? '图生图' : '文生图';
  const modelOptions = getFlowOverrideOptions(apiSettings, 'image').filter((option) => option.id !== 'default');

  useEffect(() => {
    rootRef.current?.querySelector('textarea')?.focus();
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node) && !(event.target as Element)?.closest('.studio-select-panel')) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.querySelector('.studio-select-panel')) onClose(); };
    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('pointerdown', handlePointerDown, true); window.removeEventListener('keydown', handleKeyDown); };
  }, [onClose]);

  return (
    <div ref={rootRef} role="dialog" aria-label="图片生成" data-canvas-prompt-popover="image" className="absolute bottom-5 left-1/2 z-[70] w-[min(900px,calc(100%-2rem))] -translate-x-1/2 overflow-hidden rounded-[28px] border border-[var(--studio-border)] bg-[var(--studio-surface)] shadow-[0_28px_90px_rgba(0,0,0,.42)]" onPointerDown={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--studio-border)] px-5 py-3">
        <div className="flex items-center gap-3"><span className="rounded-full bg-cyan-400/10 px-2.5 py-1 text-xs font-semibold text-cyan-300">{modeLabel}</span><span className="text-sm font-semibold text-[var(--studio-text)]">{node.title}</span><span className="text-xs text-[var(--studio-dim)]">{references.length} 个参考</span></div>
        <button type="button" onClick={onClose} aria-label="关闭图片提示词窗口" className="rounded-full p-2 text-[var(--studio-dim)] hover:bg-[var(--studio-field)] hover:text-[var(--studio-text)]"><X className="h-4 w-4" /></button>
      </div>
      {references.length > 0 ? <div className="flex gap-2 overflow-x-auto px-5 pt-4">{references.map((reference, index) => <div key={reference.id} className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-cyan-400/30"><img src={reference.mediaUrl} alt={reference.title} className="h-full w-full object-cover" /><span className="absolute bottom-0 right-0 rounded-tl-md bg-black/60 px-1 text-[9px] text-white">{index + 1}</span></div>)}</div> : null}
      <textarea aria-label="图片提示词" autoFocus value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={modeLabel === '图生图' ? '描述希望如何基于参考图生成新的画面…' : '描述主体、场景、构图、光线和风格…'} className="h-44 w-full resize-none bg-transparent px-6 py-5 text-base leading-7 text-[var(--studio-text)] outline-none placeholder:text-[var(--studio-dim)]" />
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--studio-border)] px-4 py-3">
        <label className="flex items-center gap-2 rounded-xl bg-[var(--studio-field)] px-3 py-2 text-xs"><WandSparkles className="h-3.5 w-3.5 text-fuchsia-300" /><StudioSelect aria-label="图片模型" value={sourceId} onChange={(event) => setSourceId(event.target.value as ModelSourceId)} className="bg-transparent text-[var(--studio-text)] outline-none">{modelOptions.map((option) => <option key={option.id} value={option.id}>{option.providerLabel ? `${option.providerLabel} · ` : ''}{option.label}</option>)}</StudioSelect></label>
        <label className="flex items-center gap-2 rounded-xl bg-[var(--studio-field)] px-3 py-2 text-xs"><span className="h-3 w-4 rounded-sm border border-current" /><StudioSelect aria-label="图片比例" value={ratio} onChange={(event) => setRatio(event.target.value as VisualAspectRatio)} className="bg-transparent text-[var(--studio-text)] outline-none">{CANVAS_RATIO_OPTIONS.filter((option) => option.value !== 'adaptive').map((option) => <option key={option.value} value={option.value}>{option.value}</option>)}</StudioSelect></label>
        <span className="mr-auto text-xs text-[var(--studio-dim)]">提示词 {prompt.length} 字符</span>
        <button type="button" disabled={!prompt.trim()} onClick={() => onConfirm({ prompt: prompt.trim(), ratio, sourceId })} aria-label="生成图片" className="inline-flex h-11 items-center gap-2 rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-rose-400 px-6 text-sm font-semibold text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-40"><WandSparkles className="h-4 w-4" />生成图片</button>
      </div>
    </div>
  );
}

type CanvasSeedanceDraftPatch = Partial<Omit<SeedanceDraft, 'options' | 'prompt'>> & {
  options?: Partial<SeedanceDraft['options']>;
  prompt?: Partial<SeedanceDraft['prompt']>;
};

const CANVAS_RATIO_OPTIONS: Array<{ value: SeedanceDraft['options']['ratio']; label: string }> = [
  { value: 'adaptive', label: '自动 adaptive' },
  { value: '16:9', label: '横屏 16:9' },
  { value: '9:16', label: '竖屏 9:16' },
  { value: '1:1', label: '正方形 1:1' },
  { value: '4:3', label: '经典 4:3' },
  { value: '3:4', label: '竖构图 3:4' },
  { value: '21:9', label: '电影宽幅 21:9' },
];

type CanvasVideoExecutor = 'ark' | 'aliyun' | 'minimax' | 'volcengine' | 'gemini';

const CANVAS_OVERLAY_OPTIONS = [
  { id: 'auto_audio' as const, label: '生成音频', icon: Volume2 },
  { id: 'return_last_frame' as const, label: '返回尾帧', icon: ImageIcon },
  { id: 'web_search' as const, label: '联网搜索', icon: Search },
];

function getCanvasVideoExecutor(sourceId: string): CanvasVideoExecutor {
  if (sourceId === 'aliyun.fastVideoModel') return 'aliyun';
  if (sourceId === 'minimax.videoModel') return 'minimax';
  if (sourceId === 'volcengine.videoModel') return 'volcengine';
  if (sourceId.startsWith('gemini.')) return 'gemini';
  return 'ark';
}

function formatCanvasCurrency(amount: number) {
  return `¥${amount.toFixed(amount >= 1 ? 2 : 3).replace(/0+$/u, '').replace(/\.$/u, '')}`;
}

function formatCanvasTokens(tokens: number) {
  return tokens >= 1_000_000 ? `${(tokens / 1_000_000).toFixed(2)}M` : tokens >= 1_000 ? `${(tokens / 1_000).toFixed(1)}K` : `${Math.round(tokens)}`;
}

function CanvasVideoConfigModal({ node, context, initialSourceId, initialDraft, themeMode, onClose, onConfirm }: CanvasVideoConfigModalProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [sourceId, setSourceId] = useState(initialSourceId);
  const [draft, setDraft] = useState<SeedanceDraft>(initialDraft);
  const executor = getCanvasVideoExecutor(sourceId);
  const isSeedance = sourceId.startsWith('seedance.');
  const modelKey = getSeedanceModelKey(sourceId);
  const capabilities = getSeedanceCapabilities(modelKey);
  const constraints = getSeedanceTemplateOptionConstraints(draft.baseTemplateId, modelKey);
  const availableTemplates = isSeedance
    ? isSeedance25(modelKey)
      ? Object.keys(SEEDANCE_TEMPLATE_REGISTRY) as SeedanceDraft['baseTemplateId'][]
      : [...FAST_FLOW_TEMPLATE_IDS]
    : [];
  const resolutionOptions: Array<'480p' | '720p' | '1080p'> = sourceId === 'minimax.videoModel'
    ? ['720p', '1080p']
    : sourceId === 'gemini.fastVideoModel' || sourceId === 'gemini.proVideoModel'
      ? ['720p', '1080p']
      : isSeedance ? [...capabilities.resolutions] : ['480p', '720p', '1080p'];
  const outputFormatOptions: Array<'mp4' | 'mov'> = isSeedance ? [...capabilities.outputFormats] : ['mp4'];
  const selectedAssetIds = new Set<string>(draft.assets.map((asset) => asset.id));
  const effectiveDraft: SeedanceDraft = {
    ...draft,
    assets: buildCanvasReferenceAssets(context, draft.baseTemplateId, selectedAssetIds),
    options: {
      ...draft.options,
      resolution: resolutionOptions.includes(draft.options.resolution) ? draft.options.resolution : resolutionOptions[0],
      outputFormat: outputFormatOptions.includes(draft.options.outputFormat || 'mp4') ? draft.options.outputFormat || 'mp4' : outputFormatOptions[0],
    },
  };
  const validation = isSeedance ? validateSeedanceDraft(effectiveDraft, modelKey) : { errors: effectiveDraft.prompt.rawPrompt.trim() ? [] : ['视频提示词不能为空。'], warnings: [] };
  const validationError = validation.errors[0];
  const activeTemplate = SEEDANCE_TEMPLATE_REGISTRY[effectiveDraft.baseTemplateId];
  const selectedImageCount = effectiveDraft.assets.filter((asset) => asset.kind === 'image').length;
  const selectedVideoCount = effectiveDraft.assets.filter((asset) => asset.kind === 'video').length;
  const selectedAudioCount = effectiveDraft.assets.filter((asset) => asset.kind === 'audio').length;
  const totalReferenceCount = context.images.length + context.videos.length + context.audios.length;
  const fallbackRatio = effectiveDraft.options.ratio === 'adaptive' ? '16:9' : effectiveDraft.options.ratio;
  const costInput: FastVideoInput = {
    prompt: effectiveDraft.prompt.rawPrompt,
    referenceImages: context.images.map((item) => ({ id: item.id, imageUrl: item.mediaUrl, description: item.content, selectedForVideo: selectedAssetIds.has(item.id) })),
    referenceVideos: context.videos.map((item) => ({ id: item.id, videoUrl: item.mediaUrl, description: item.content, selectedForVideo: selectedAssetIds.has(item.id) })),
    referenceAudios: context.audios.map((item) => ({ id: item.id, audioUrl: item.mediaUrl, description: item.content, selectedForVideo: selectedAssetIds.has(item.id) })),
    aspectRatio: fallbackRatio,
    durationSec: effectiveDraft.options.duration && effectiveDraft.options.duration > 0 ? effectiveDraft.options.duration : 10,
    preferredSceneCount: 'auto',
  };
  const costEstimate = executor === 'ark' || executor === 'aliyun' || executor === 'minimax'
    ? getSeedanceCostEstimate(costInput, effectiveDraft, { executor, apiModelKey: modelKey, cliModelVersion: 'seedance2.0' })
    : null;
  useEffect(() => {
    rootRef.current?.querySelector('textarea')?.focus();
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node) && !(event.target as Element)?.closest('.studio-select-panel')) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.querySelector('.studio-select-panel')) onClose(); };
    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('pointerdown', handlePointerDown, true); window.removeEventListener('keydown', handleKeyDown); };
  }, [onClose]);
  const updateDraft = (patch: CanvasSeedanceDraftPatch) => {
    setDraft((current) => {
      const next = { ...current, ...patch, options: { ...current.options, ...(patch.options || {}) } };
      return isSeedance ? normalizeSeedanceDraftOptions(next, modelKey) : next;
    });
  };
  const changeSource = (nextSourceId: string) => {
    setSourceId(nextSourceId);
    setDraft((current) => {
      const nextDraft = nextSourceId === 'minimax.videoModel'
        ? { ...current, options: { ...current.options, resolution: current.options.resolution === '1080p' ? '1080p' : '720p', outputFormat: 'mp4' as const } }
        : current;
      return nextSourceId.startsWith('seedance.') ? normalizeSeedanceDraftOptions(nextDraft, getSeedanceModelKey(nextSourceId)) : nextDraft;
    });
  };
  const changeExecutor = (nextExecutor: CanvasVideoExecutor) => {
    const nextSourceId = nextExecutor === 'ark' ? 'seedance.seedance25ApiModel'
      : nextExecutor === 'aliyun' ? 'aliyun.fastVideoModel'
        : nextExecutor === 'minimax' ? 'minimax.videoModel'
          : nextExecutor === 'volcengine' ? 'volcengine.videoModel'
            : 'gemini.fastVideoModel';
    changeSource(nextSourceId);
  };
  const changeTemplate = (baseTemplateId: SeedanceDraft['baseTemplateId']) => {
    const supportedOverlays = SEEDANCE_TEMPLATE_REGISTRY[baseTemplateId].supportedOverlays;
    setDraft((current) => normalizeSeedanceDraftOptions({
      ...current,
      baseTemplateId,
      overlayTemplateIds: current.overlayTemplateIds.filter((id) => supportedOverlays.includes(id)),
      assets: buildCanvasReferenceAssets(context, baseTemplateId, new Set<string>(current.assets.map((asset) => asset.id))),
      options: {
        ...current.options,
        generateAudio: supportedOverlays.includes('auto_audio') && current.options.generateAudio,
        returnLastFrame: supportedOverlays.includes('return_last_frame') && current.options.returnLastFrame,
        useWebSearch: supportedOverlays.includes('web_search') && current.options.useWebSearch,
      },
    }, modelKey));
  };
  const toggleReference = (nodeId: string, checked: boolean) => {
    const nextIds = new Set<string>(draft.assets.map((asset) => asset.id));
    if (checked) nextIds.add(nodeId); else nextIds.delete(nodeId);
    updateDraft({ assets: buildCanvasReferenceAssets(context, draft.baseTemplateId, nextIds) });
  };
  const toggleOverlay = (id: 'auto_audio' | 'return_last_frame' | 'web_search', checked: boolean) => {
    const overlayTemplateIds = checked
      ? Array.from(new Set([...draft.overlayTemplateIds, id]))
      : draft.overlayTemplateIds.filter((item) => item !== id);
    updateDraft({
      overlayTemplateIds,
      options: id === 'auto_audio' ? { generateAudio: checked }
        : id === 'return_last_frame' ? { returnLastFrame: checked }
          : { useWebSearch: checked },
    });
  };
  const renderReference = (item: CanvasNode, index: number) => {
    const checked = selectedAssetIds.has(item.id);
    const token = item.type === 'image' ? `图片${index + 1}` : item.type === 'video' ? `视频${index + 1}` : `音频${index + 1}`;
    return (
      <div key={item.id} data-canvas-video-reference={item.type} className={`w-36 shrink-0 overflow-hidden rounded-xl border p-2 transition-colors ${checked ? 'border-sky-400/50 bg-sky-400/10' : 'border-[var(--studio-border)] bg-[var(--studio-field)] opacity-60'}`}>
        <label className="flex cursor-pointer items-center justify-between gap-2 text-[11px] text-[var(--studio-muted)]">
          <span className="truncate">{item.title}</span>
          <input type="checkbox" checked={checked} onChange={(event) => toggleReference(item.id, event.target.checked)} className="rounded border-zinc-700 bg-zinc-950" />
        </label>
        {item.type === 'image' ? <img src={item.mediaUrl} alt={item.title} className="mt-2 h-20 w-full rounded-lg object-cover" /> : null}
        {item.type === 'video' ? <video controls preload="metadata" src={item.mediaUrl} className="mt-2 h-20 w-full rounded-lg object-contain" /> : null}
        {item.type === 'audio' ? <div className="mt-2 rounded-lg bg-black/20 p-2"><AudioLines className="mx-auto h-7 w-7 text-emerald-300" /><audio controls preload="metadata" src={item.mediaUrl} className="mt-1 h-7 w-full" /></div> : null}
        <div className="mt-2 flex items-center justify-between gap-2"><span className="truncate text-[10px] text-[var(--studio-dim)]">{NODE_META[item.type].label}</span><span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] text-sky-300">{token}</span></div>
      </div>
    );
  };

  return (
    <div ref={rootRef} role="dialog" aria-label="视频生成配置" data-canvas-prompt-popover="video" data-theme={themeMode} className="absolute bottom-5 left-1/2 z-[70] h-[min(76vh,760px)] w-[min(1120px,calc(100%-2rem))] -translate-x-1/2 overflow-hidden rounded-[28px] border border-[var(--studio-border)] bg-[var(--studio-surface)] shadow-[0_28px_100px_rgba(0,0,0,.48)]" onPointerDown={(event) => event.stopPropagation()}>
      <div className="flex h-full min-h-0 flex-col bg-[var(--studio-surface)]">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--studio-border)] px-6 py-4">
          <div>
            <div className="flex items-center gap-2"><span className="rounded-full bg-violet-400/10 px-2.5 py-1 text-xs font-semibold text-violet-300">视频生成</span><span className="text-sm font-semibold text-[var(--studio-text)]">{node.title}</span></div>
            <p className="mt-1 text-xs text-[var(--studio-muted)]">使用前序素材、提示词和执行参数生成视频。</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={Boolean(validationError)} onClick={() => onConfirm({ sourceId, seedanceModelKey: modelKey, seedanceDraft: effectiveDraft })} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium ${validationError ? 'cursor-not-allowed bg-[var(--studio-field)] text-[var(--studio-dim)]' : 'bg-sky-500 text-slate-950 hover:bg-sky-400'}`}><Play className="h-4 w-4" />生成视频</button>
            <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--studio-border)] text-[var(--studio-dim)] hover:text-[var(--studio-text)]" aria-label="关闭视频配置"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(340px,.92fr)] xl:items-start">
          <div className="min-w-0 space-y-4">
            <section className="rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-surface-contrast)] p-4">
              <div className="flex items-center justify-between gap-3"><div className="font-semibold text-[var(--studio-text)]">素材确认</div><div className="text-xs text-[var(--studio-dim)]">图 {selectedImageCount}/{context.images.length} · 视频 {selectedVideoCount}/{context.videos.length} · 音频 {selectedAudioCount}/{context.audios.length}</div></div>
              <p className="mt-2 text-xs text-[var(--studio-dim)]">只有勾选的前序素材会传给生成接口；提示词中可使用图片1、视频1、音频1引用。</p>
              {totalReferenceCount > 0 ? <div className="mt-3 flex max-w-full gap-2 overflow-x-auto pb-2">{context.images.map(renderReference)}{context.videos.map(renderReference)}{context.audios.map(renderReference)}</div> : <div className="mt-3 rounded-xl border border-dashed border-[var(--studio-border)] px-4 py-8 text-center text-sm text-[var(--studio-dim)]">尚无前序媒体素材，可使用文生视频模板。</div>}
              {context.incoming.filter((item) => item.content.trim()).length > 0 ? <div className="mt-2 rounded-xl bg-[var(--studio-field)] px-3 py-2 text-xs text-[var(--studio-muted)]">已合并 {context.incoming.filter((item) => item.content.trim()).length} 条前序文字描述到视频提示词。</div> : null}
            </section>
            <section className="rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-surface-contrast)] p-4">
              <div className="mb-3 flex items-center justify-between"><div className="font-semibold text-[var(--studio-text)]">视频提示词</div><div className="text-xs text-[var(--studio-dim)]">{effectiveDraft.prompt.rawPrompt.length} 字符</div></div>
              <textarea aria-label="视频提示词" value={draft.prompt.rawPrompt} onChange={(event) => updateDraft({ prompt: { ...draft.prompt, rawPrompt: event.target.value } })} className="h-72 w-full resize-none rounded-xl border border-[var(--studio-border)] bg-[var(--studio-field)] p-4 text-sm leading-6 outline-none focus:border-sky-400/60" placeholder="描述主体、动作、镜头、场景、声音和节奏…" />
            </section>
          </div>

          <div className="min-w-0 space-y-4">
            <section className="rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-surface-contrast)] p-4">
              <div className="flex items-center justify-between"><div className="font-semibold text-[var(--studio-text)]">费用预估</div><div className="text-xs text-[var(--studio-dim)]">按 24fps 估算</div></div>
              {costEstimate ? <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3"><div className="text-[10px] text-amber-300">当前模型</div><div className="mt-1 font-medium text-[var(--studio-text)]">{costEstimate.modelLabel}</div></div>
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3"><div className="text-[10px] text-amber-300">预估费用</div><div className="mt-1 font-medium text-[var(--studio-text)]">{costEstimate.pricingAvailable ? formatCanvasCurrency(costEstimate.estimatedCost) : '暂不估算'}</div></div>
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3"><div className="text-[10px] text-amber-300">计费单价</div><div className="mt-1 font-medium text-[var(--studio-text)]">{costEstimate.pricingAvailable ? `${formatCanvasCurrency(costEstimate.unitPrice)} / ${costEstimate.pricingUnit === 'second' ? '秒' : '百万tokens'}` : '未配置单价'}</div></div>
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3"><div className="text-[10px] text-amber-300">估算 Tokens</div><div className="mt-1 font-medium text-[var(--studio-text)]">{formatCanvasTokens(costEstimate.totalTokens)}</div></div>
                <div className="col-span-2 text-xs leading-5 text-[var(--studio-dim)]">{costEstimate.dimensionPresetLabel} · {costEstimate.billingLabel}</div>
              </div> : <div className="mt-3 rounded-xl bg-[var(--studio-field)] p-4 text-sm text-[var(--studio-muted)]">当前执行器暂不提供费用预估，提交前请以服务商计费为准。</div>}
            </section>
            <section className="rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-surface-contrast)] p-4">
              <div className="mb-4 flex items-center gap-2 font-semibold text-[var(--studio-text)]"><Settings2 className="h-4 w-4 text-sky-300" />执行参数</div>
              <div className="grid grid-cols-2 gap-3">
                <label><span className="mb-1.5 block text-xs text-[var(--studio-muted)]">执行器</span><StudioSelect value={executor} onChange={(event) => changeExecutor(event.target.value as CanvasVideoExecutor)} className="studio-select w-full"><option value="ark">Ark API</option><option value="aliyun">HappyHorse API</option><option value="minimax">MiniMax H3 API</option><option value="volcengine">Volcengine API</option><option value="gemini">Gemini API</option></StudioSelect></label>
                <label><span className="mb-1.5 block text-xs text-[var(--studio-muted)]">模型</span>{executor === 'ark' ? <StudioSelect value={sourceId} onChange={(event) => changeSource(event.target.value)} className="studio-select w-full">{SEEDANCE_API_MODEL_SOURCE_IDS.map((id) => <option key={id} value={id}>{getSeedanceApiModelLabelForSourceId(id)}</option>)}</StudioSelect> : executor === 'gemini' ? <StudioSelect value={sourceId} onChange={(event) => changeSource(event.target.value)} className="studio-select w-full"><option value="gemini.fastVideoModel">Gemini Fast</option><option value="gemini.proVideoModel">Gemini Pro</option></StudioSelect> : <div className="flex h-10 items-center rounded-xl border border-[var(--studio-border)] bg-[var(--studio-field)] px-3 text-sm text-[var(--studio-text)]">{executor === 'aliyun' ? 'HappyHorse 1.0' : executor === 'minimax' ? 'MiniMax H3' : 'Volcengine Video'}</div>}</label>
                {isSeedance ? <label className="col-span-2"><span className="mb-1.5 block text-xs text-[var(--studio-muted)]">功能模板</span><StudioSelect value={draft.baseTemplateId} onChange={(event) => changeTemplate(event.target.value as SeedanceDraft['baseTemplateId'])} className="studio-select w-full">{availableTemplates.map((templateId) => <option key={templateId} value={templateId}>{SEEDANCE_TEMPLATE_REGISTRY[templateId].title}</option>)}</StudioSelect></label> : null}
                <label><span className="mb-1.5 block text-xs text-[var(--studio-muted)]">画幅</span><StudioSelect value={draft.options.ratio} disabled={isSeedance && Boolean(constraints.ratio)} onChange={(event) => updateDraft({ options: { ratio: event.target.value as SeedanceDraft['options']['ratio'] } })} className="studio-select w-full">{CANVAS_RATIO_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</StudioSelect></label>
                <label><span className="mb-1.5 block text-xs text-[var(--studio-muted)]">时长</span><StudioSelect value={String(draft.options.duration ?? 4)} disabled={isSeedance && typeof constraints.duration === 'number'} onChange={(event) => updateDraft({ options: { duration: Number(event.target.value) } })} className="studio-select w-full"><option value="-1">自动（-1）</option>{Array.from({ length: Math.max(1, capabilities.maxDurationSec - 3) }, (_, index) => index + 4).map((duration) => <option key={duration} value={duration}>{duration} 秒</option>)}</StudioSelect></label>
                <label><span className="mb-1.5 block text-xs text-[var(--studio-muted)]">分辨率</span><StudioSelect value={effectiveDraft.options.resolution} onChange={(event) => updateDraft({ options: { resolution: event.target.value as SeedanceDraft['options']['resolution'] } })} className="studio-select w-full">{resolutionOptions.map((resolution) => <option key={resolution} value={resolution}>{sourceId === 'minimax.videoModel' ? resolution === '1080p' ? '2K' : '768P' : resolution}</option>)}</StudioSelect></label>
                <label><span className="mb-1.5 block text-xs text-[var(--studio-muted)]">输出格式</span><StudioSelect value={effectiveDraft.options.outputFormat || 'mp4'} disabled={outputFormatOptions.length === 1} onChange={(event) => updateDraft({ options: { outputFormat: event.target.value as SeedanceDraft['options']['outputFormat'] } })} className="studio-select w-full">{outputFormatOptions.map((format) => <option key={format} value={format}>{format.toUpperCase()}</option>)}</StudioSelect></label>
              </div>
              {isSeedance ? <div className="mt-3 rounded-xl bg-[var(--studio-field)] p-3"><div className="font-medium text-[var(--studio-text)]">{activeTemplate.title}</div><div className="mt-1 text-xs leading-5 text-[var(--studio-muted)]">{getSeedanceTemplateDescription(activeTemplate.id, modelKey)}</div><div className="mt-2 text-[10px] text-[var(--studio-dim)]">模型能力：图片 {capabilities.maxImages} · 视频 {capabilities.maxVideos} · 音频 {capabilities.maxAudios} · 最长 {capabilities.maxDurationSec}s</div></div> : null}
              <div className="mt-4"><div className="mb-2 text-xs font-medium text-[var(--studio-muted)]">叠加能力</div><div className="grid grid-cols-2 gap-2">{CANVAS_OVERLAY_OPTIONS.map((option) => { const supported = isSeedance && activeTemplate.supportedOverlays.includes(option.id); const checked = option.id === 'auto_audio' ? effectiveDraft.options.generateAudio : option.id === 'return_last_frame' ? effectiveDraft.options.returnLastFrame : effectiveDraft.options.useWebSearch; const Icon = option.icon; return <label key={option.id} className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${!supported ? 'cursor-not-allowed border-[var(--studio-border)] text-[var(--studio-dim)] opacity-45' : checked ? 'border-rose-400/30 bg-rose-400/10 text-rose-200' : 'border-[var(--studio-border)] text-[var(--studio-muted)]'}`}><span className="flex items-center gap-2"><Icon className="h-3.5 w-3.5" />{option.label}</span><input type="checkbox" checked={checked} disabled={!supported} onChange={(event) => toggleOverlay(option.id, event.target.checked)} /></label>; })}<label className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${effectiveDraft.options.watermark ? 'border-rose-400/30 bg-rose-400/10 text-rose-200' : 'border-[var(--studio-border)] text-[var(--studio-muted)]'}`}><span className="flex items-center gap-2"><Video className="h-3.5 w-3.5" />保留水印</span><input type="checkbox" checked={effectiveDraft.options.watermark} onChange={(event) => updateDraft({ options: { watermark: event.target.checked } })} /></label></div></div>
            </section>
          </div>

          <div className="min-w-0 space-y-4">
            <section className="rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-surface-contrast)] p-4">
              <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-sky-300" /><div className="font-semibold text-[var(--studio-text)]">任务状态</div></div>
              <div className="mt-4 rounded-xl border border-[var(--studio-border)] bg-[var(--studio-field)] p-4 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-300" /><div className="mt-2 font-medium text-[var(--studio-text)]">配置就绪</div><div className="mt-1 text-xs text-[var(--studio-dim)]">确认后将立即提交生成任务</div></div>
              <div className="mt-4 space-y-2 text-sm"><div className="flex justify-between gap-3"><span className="text-[var(--studio-muted)]">执行器</span><span className="text-right text-[var(--studio-text)]">{executor === 'ark' ? 'Ark API' : executor === 'aliyun' ? 'HappyHorse API' : executor === 'minimax' ? 'MiniMax H3 API' : executor === 'volcengine' ? 'Volcengine API' : 'Gemini API'}</span></div><div className="flex justify-between gap-3"><span className="text-[var(--studio-muted)]">输出</span><span className="text-right text-[var(--studio-text)]">{effectiveDraft.options.ratio} · {effectiveDraft.options.duration === -1 ? '自动时长' : `${effectiveDraft.options.duration}s`} · {effectiveDraft.options.resolution}/{(effectiveDraft.options.outputFormat || 'mp4').toUpperCase()}</span></div><div className="flex justify-between gap-3"><span className="text-[var(--studio-muted)]">参考素材</span><span className="text-right text-[var(--studio-text)]">{effectiveDraft.assets.length} / {totalReferenceCount} 已选</span></div></div>
              {validation.errors.length > 0 ? <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-200">{validation.errors.map((issue) => <div key={issue} className="flex gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{issue}</div>)}</div> : null}
              {validation.warnings.length > 0 ? <div className="mt-3 rounded-xl border border-sky-400/20 bg-sky-400/[0.06] p-3 text-xs leading-5 text-sky-200">{validation.warnings.map((issue) => <div key={issue}>{issue}</div>)}</div> : null}
              <button type="button" disabled={Boolean(validationError)} onClick={() => onConfirm({ sourceId, seedanceModelKey: modelKey, seedanceDraft: effectiveDraft })} className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${validationError ? 'cursor-not-allowed bg-[var(--studio-field)] text-[var(--studio-dim)]' : 'bg-sky-500 text-slate-950 hover:bg-sky-400'}`}><Play className="h-4 w-4" />生成视频</button>
            </section>
            <section className="rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-surface-contrast)] p-4"><div className="font-semibold text-[var(--studio-text)]">请求摘要</div><div className="mt-3 space-y-2 text-xs text-[var(--studio-muted)]"><div>模板：{isSeedance ? activeTemplate.title : '服务商默认模板'}</div><div>提示词：{effectiveDraft.prompt.rawPrompt.length} 字符</div><div>生成音频：{effectiveDraft.options.generateAudio ? '开启' : '关闭'}</div><div>返回尾帧：{effectiveDraft.options.returnLastFrame ? '开启' : '关闭'}</div><div>联网搜索：{effectiveDraft.options.useWebSearch ? '开启' : '关闭'}</div><div>水印：{effectiveDraft.options.watermark ? '保留' : '关闭'}</div></div></section>
          </div>
        </div>
      </div>
    </div>
  );
}

function CanvasReferenceInspector({ node, flow, onChange, onRemove, onAdd }: {
  node: CanvasNode; flow: CanvasFlow; onChange: (ids: string[]) => void;
  onRemove: (id: string) => void; onAdd: (id: string) => void;
}) {
  const rank = node.referenceNodeIds || [];
  const references = [...new Map([...getDirectIncomingCanvasNodes(node.id, flow), ...groupedReferences(node, flow.nodes)].map((reference) => [reference.id, reference])).values()].sort((a, b) => (rank.indexOf(a.id) < 0 ? Infinity : rank.indexOf(a.id)) - (rank.indexOf(b.id) < 0 ? Infinity : rank.indexOf(b.id)));
  const available = flow.nodes.filter((candidate) => candidate.id !== node.id && !references.some((reference) => reference.id === candidate.id));
  const move = (index: number, delta: number) => {
    const ids = references.map((reference) => reference.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    onChange(ids);
  };
  return <aside className="canvas-reference-inspector" aria-label="参考素材顺序">
    <strong>参考素材 <span>{references.length}</span></strong>
    {!references.length && <p>连接上游节点，为生成提供文字与素材。</p>}
    <ol>{references.map((reference, index) => <li key={reference.id}><span className="canvas-reference-inspector__index">{index + 1}</span>{reference.type === 'image' && reference.mediaUrl ? <img src={reference.mediaUrl} alt="" /> : null}<span>{reference.title}</span><button type="button" aria-label={`上移${reference.title}`} disabled={index === 0} onClick={() => move(index, -1)}><ChevronLeft size={13} /></button><button type="button" aria-label={`下移${reference.title}`} disabled={index === references.length - 1} onClick={() => move(index, 1)}><ChevronRight size={13} /></button><button type="button" aria-label={`移除参考${reference.title}`} onClick={() => onRemove(reference.id)}><X size={13} /></button></li>)}</ol>
    {!!available.length && <StudioSelect value="" onChange={(event) => { if (event.target.value) onAdd(event.target.value); }} aria-label="添加参考节点"><option value="">添加参考节点…</option>{available.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}</StudioSelect>}
  </aside>;
}

export function InfiniteCanvasWorkspace({ project, setProject, apiSettings, assetLibraryItems, themeMode, persistMedia, onBack, onOpenSettings, onThemeChange, useMockMode = false }: Props) {
  const history = useEditHistory<CanvasFlow>(() => {
    const initial = project.canvasFlow || createEmptyCanvasFlow();
    return { ...initial, nodes: initial.nodes.map((node) => node.status === 'generating' && !node.pendingTask ? { ...node, status: 'error' as const, error: '上次生成的连接已中断，未记录到可恢复的任务。请先确认服务商任务状态，再重新生成。' } : node) };
  });
  const flow = history.value;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const setSelectedId = useCallback((value: string | null | ((current: string | null) => string | null)) => {
    setSelectedIds((current) => { const id = typeof value === 'function' ? value(current[0] || null) : value; return id ? [id] : []; });
  }, []);
  const [interactionMode, setInteractionMode] = useState<'select' | 'hand'>('select');
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [edgesHidden, setEdgesHidden] = useState(false);
  const [recycleOpen, setRecycleOpen] = useState(false);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [purgeId, setPurgeId] = useState<string>();
  const [previewNode, setPreviewNode] = useState<CanvasNode | null>(null);
  const [notice, setNotice] = useState('');
  const [guides, setGuides] = useState<CanvasGuide[]>([]);
  const [marquee, setMarquee] = useState<CanvasRect | null>(null);
  const [addMenu, setAddMenu] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ width: 1000, height: 700 });
  const rootRef = useRef<HTMLElement>(null);
  const revealNodeRef = useRef<string | null>(null);
  const clipboardRef = useRef<{ nodes: CanvasNode[]; edges: CanvasEdge[] } | null>(null);
  const aliveRef = useRef(true);
  const pollingRef = useRef(new Set<string>());
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);
  useLayoutEffect(() => {
    setProject((current) => current.id === project.id && current.canvasFlow !== flow ? { ...current, canvasFlow: flow } : current);
  }, [flow, project.id, setProject]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [connectionPointer, setConnectionPointer] = useState<{ x: number; y: number } | null>(null);
  const [dragState, setDragState] = useState<{ kind: 'pan' | 'node' | 'marquee'; startX: number; startY: number; originX: number; originY: number; nodes?: CanvasNode[]; ids?: string[]; additive?: string[] } | null>(null);
  const [importTarget, setImportTarget] = useState<CanvasNodeType | 'media'>('media');
  const [importTargetNodeId, setImportTargetNodeId] = useState<string | null>(null);
  const [referenceTargetNodeId, setReferenceTargetNodeId] = useState<string | null>(null);
  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
  const [assetPickerKind, setAssetPickerKind] = useState<'all' | 'image' | 'video'>('all');
  const [assetPickerQuery, setAssetPickerQuery] = useState('');
  const [imagePromptPopover, setImagePromptPopover] = useState<{ node: CanvasNode; context: ReturnType<typeof getIncomingContext> } | null>(null);
  const [videoConfigModal, setVideoConfigModal] = useState<{ node: CanvasNode; context: ReturnType<typeof getIncomingContext>; sourceId: string; draft: SeedanceDraft } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const selectedNode = flow.nodes.find((node) => node.id === selectedId) || null;
  const viewport = flow.viewport;
  const filteredAssetLibraryItems = useMemo(() => {
    const query = assetPickerQuery.trim().toLocaleLowerCase('zh-Hans-CN');
    const targetType = importTargetNodeId ? flow.nodes.find((node) => node.id === importTargetNodeId)?.type : referenceTargetNodeId && flow.nodes.find((node) => node.id === referenceTargetNodeId)?.type === 'image' ? 'image' : null;
    if (targetType === 'audio') return [];
    return assetLibraryItems.filter((item) => (
      (!targetType || item.kind === targetType)
      &&
      (assetPickerKind === 'all' || item.kind === assetPickerKind)
      && (!query || `${item.title} ${item.projectName} ${item.groupName} ${item.sourceLabel}`.toLocaleLowerCase('zh-Hans-CN').includes(query))
    ));
  }, [assetLibraryItems, assetPickerKind, assetPickerQuery, flow.nodes, importTargetNodeId, referenceTargetNodeId]);

  useLayoutEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setSize({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element);
    setSize({ width: element.clientWidth, height: element.clientHeight });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const ids = new Set(flow.nodes.map((node) => node.id));
    setSelectedIds((current) => current.every((id) => ids.has(id)) ? current : current.filter((id) => ids.has(id)));
  }, [flow.nodes]);
  const updateFlow = history.edit;
  const systemFlow = history.set;
  const updateSystemNode = useCallback((id: string, updater: (node: CanvasNode) => CanvasNode) => {
    if (!aliveRef.current) return;
    systemFlow((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === id ? updater(node) : node), recycleBin: current.recycleBin?.map((entry) => ({ ...entry, nodes: entry.nodes.map((node) => node.id === id ? updater(node) : node) })) }));
  }, [systemFlow]);

  const updateNode = useCallback((id: string, updater: (node: CanvasNode) => CanvasNode) => {
    updateFlow((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === id ? updater(node) : node) }));
  }, [updateFlow]);

  useLayoutEffect(() => {
    if (!selectedNode || revealNodeRef.current !== selectedNode.id) return;
    revealNodeRef.current = null;
    const top = (rootRef.current?.querySelector('.canvas-topbar')?.getBoundingClientRect().height || 56) + 50;
    systemFlow((current) => ({ ...current, viewport: focusCanvasNodeViewport(selectedNode, current.viewport, { width: Math.max(240, size.width - (size.width > 700 ? 280 : 0)), height: size.height }, size.height - (selectedNode.type === 'image' || selectedNode.type === 'video' ? 310 : size.width <= 700 ? 300 : 80), top) }));
  }, [selectedId, selectedNode?.height, size.width, size.height, systemFlow]);

  const openVideoConfig = (node: CanvasNode) => {
    const context = getIncomingContext(node, flow);
    const prompt = [context.text, node.content].filter(Boolean).join('\n\n').trim() || 'Create a concise cinematic creative direction.';
    const sourceId = node.videoGenerationConfig?.sourceId || getDefaultModelSource(apiSettings, 'video');
    const draft = node.videoGenerationConfig?.seedanceDraft
      ? { ...node.videoGenerationConfig.seedanceDraft, prompt: { ...node.videoGenerationConfig.seedanceDraft.prompt, rawPrompt: node.videoGenerationConfig.seedanceDraft.prompt.rawPrompt || prompt } }
      : buildCanvasSeedanceDraft(prompt, context);
    setVideoConfigModal({ node, context, sourceId, draft });
    setImagePromptPopover(null);
  };

  const openImagePrompt = (node: CanvasNode) => {
    setImagePromptPopover({ node, context: getIncomingContext(node, flow) });
    setVideoConfigModal(null);
  };

  const addNode = (type: CanvasNodeType) => {
    const position = addMenu ? { x: (addMenu.x - viewport.x) / viewport.zoom, y: (addMenu.y - viewport.y) / viewport.zoom } : getViewportNodePosition(viewport, size, NODE_META[type], flow.nodes);
    const node = makeNode(type, position.x, position.y);
    updateFlow((current) => ({ ...current, nodes: [...current.nodes, node] }));
    revealNodeRef.current = node.id;
    setSelectedId(node.id);
    setSelectedEdgeId(null);
    setAddMenu(null);
  };

  const addConnectedNode = (anchor: CanvasNode, type: CanvasNodeType, direction: 'upstream' | 'downstream') => {
    const node = makeNode(type, direction === 'downstream' ? anchor.x + anchor.width + 120 : anchor.x - NODE_META[type].width - 120, anchor.y);
    updateFlow((current) => {
      while (current.nodes.some((candidate) => (
        Math.abs(candidate.x - node.x) < Math.max(candidate.width, node.width) * 0.82
        && Math.abs(candidate.y - node.y) < Math.max(candidate.height, node.height) * 0.82
      ))) node.y += Math.max(node.height, 180) + 36;
      return {
        ...current,
        nodes: [...current.nodes, node],
        edges: [...current.edges, {
          id: crypto.randomUUID(),
          source: direction === 'downstream' ? anchor.id : node.id,
          target: direction === 'downstream' ? node.id : anchor.id,
        }],
      };
    });
    revealNodeRef.current = node.id;
    setSelectedId(node.id);
    setSelectedEdgeId(null);
  };

  const deleteNode = (id: string) => setDeleteIds(expandCanvasSelection(flow.nodes, [id]));
  const deleteEdge = (id: string) => {
    updateFlow((current) => removeGroupReferenceEdge(current, id));
    setSelectedEdgeId(null);
  };
  const duplicateSelection = (ids = selectedIds) => {
    rootRef.current?.focus({ preventScroll: true });
    const selected = expandCanvasSelection(flow.nodes, ids);
    const copies = cloneCanvasSelection(flow.nodes.filter((node) => selected.includes(node.id)), flow.edges, () => crypto.randomUUID(), 38, flow.nodes);
    updateFlow((current) => ({ ...current, nodes: [...current.nodes, ...copies.nodes], edges: [...current.edges, ...copies.edges] }));
    setSelectedIds(copies.nodes.map((node) => node.id));
  };
  const duplicateNode = (id: string) => duplicateSelection([id]);
  const groupSelection = () => {
    rootRef.current?.focus({ preventScroll: true });
    if (!canGroupNodes(flow, selectedIds)) return;
    const id = crypto.randomUUID();
    updateFlow((current) => ({ ...current, nodes: current.nodes.map((node) => selectedIds.includes(node.id) ? { ...node, groupId: id } : node) }));
  };
  const ungroupSelection = () => {
    rootRef.current?.focus({ preventScroll: true });
    const ids = new Set<string>(flow.nodes.filter((node) => selectedIds.includes(node.id)).map((node) => node.groupId).filter(Boolean));
    updateFlow((current) => [...ids].reduce((doc, id) => splitCanvasGroup(doc, id!), current));
  };
  const selectNode = (node: CanvasNode, additive = false) => {
    const ids = expandCanvasSelection(flow.nodes, [node.id]);
    setSelectedIds((current) => additive ? current.includes(node.id) ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])] : ids);
    setSelectedEdgeId(null);
  };
  const setViewport = (next: CanvasViewport) => systemFlow((current) => ({ ...current, viewport: next }));
  const pasteSelection = (fragment: { nodes: CanvasNode[]; edges: CanvasEdge[] }) => {
    if (!fragment.nodes.length) return;
    const copies = cloneCanvasSelection(fragment.nodes, fragment.edges, () => crypto.randomUUID(), 38, flow.nodes);
    updateFlow((current) => ({ ...current, nodes: [...current.nodes, ...copies.nodes], edges: [...current.edges, ...copies.edges] }));
    setSelectedIds(copies.nodes.map((node) => node.id));
    clipboardRef.current = copies;
  };
  const ownsEvent = (target: EventTarget | null) => !imagePromptPopover && !videoConfigModal && !recycleOpen && !deleteIds.length && editorOwnsEvent(target) && Boolean(rootRef.current?.contains(target as Node));
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!ownsEvent(event.target) || event.isComposing) return;
      if (event.code === 'Space') { event.preventDefault(); setSpacePressed(true); return; }
      if (selectedIds.length && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        updateFlow((current) => ({ ...current, nodes: current.nodes.map((node) => selectedIds.includes(node.id) ? { ...node, x: node.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), y: node.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0) } : node) }));
        return;
      }
      const action = shortcutAction(event);
      if (!action) return;
      event.preventDefault();
      if (action === 'undo') history.undo();
      if (action === 'redo') history.redo();
      if (action === 'selectAll') setSelectedIds(flow.nodes.map((node) => node.id));
      if (action === 'duplicate') duplicateSelection();
      if (action === 'group') groupSelection();
      if (action === 'ungroup') ungroupSelection();
      if (action === 'delete') { if (selectedEdgeId) deleteEdge(selectedEdgeId); else setDeleteIds(expandCanvasSelection(flow.nodes, selectedIds)); }
      if (action === 'escape') { setSelectedIds([]); setSelectedEdgeId(null); setConnectingFrom(null); setConnectionPointer(null); setAddMenu(null); }
    };
    const onKeyUp = (event: KeyboardEvent) => { if (event.code === 'Space') setSpacePressed(false); };
    const onBlur = () => { setSpacePressed(false); setDragState(null); setGuides([]); setMarquee(null); history.endGroup(); };
    const onCopy = (event: ClipboardEvent) => {
      if (!ownsEvent(event.target) || !selectedIds.length) return;
      const ids = expandCanvasSelection(flow.nodes, selectedIds);
      const fragment = { nodes: flow.nodes.filter((node) => ids.includes(node.id)), edges: flow.edges.filter((edge) => ids.includes(edge.source) && ids.includes(edge.target)) };
      clipboardRef.current = fragment;
      event.preventDefault();
      event.clipboardData?.setData('application/x-tapdance-canvas', JSON.stringify(fragment));
      event.clipboardData?.setData('text/plain', JSON.stringify({ tapdanceCanvas: fragment }));
    };
    const onPaste = (event: ClipboardEvent) => {
      if (!ownsEvent(event.target)) return;
      const files = Array.from(event.clipboardData?.files || []).filter((file) => /^(image|video|audio)\//u.test(file.type));
      if (files.length) { event.preventDefault(); void Promise.all(files.map((file) => importMediaFile(file))).catch((error) => setNotice(String(error))); return; }
      const serialized = event.clipboardData?.getData('application/x-tapdance-canvas');
      try {
        const plain = event.clipboardData?.getData('text/plain');
        const raw = serialized ? JSON.parse(serialized) : plain ? JSON.parse(plain).tapdanceCanvas : clipboardRef.current;
        if (raw && Array.isArray(raw.nodes)) { event.preventDefault(); pasteSelection(normalizeCanvasFlow(raw)); }
      } catch { /* Ordinary text paste belongs to editable controls. */ }
    };
    window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp); window.addEventListener('blur', onBlur);
    window.addEventListener('copy', onCopy); window.addEventListener('paste', onPaste);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', onBlur); window.removeEventListener('copy', onCopy); window.removeEventListener('paste', onPaste); };
  });

  const finishConnection = useCallback((targetId: string) => {
    if (!connectingFrom || connectingFrom === targetId) {
      setConnectingFrom(null);
      setConnectionPointer(null);
      return;
    }
    updateFlow((current) => !canConnect(connectingFrom, targetId, current.edges)
      ? current
      : { ...current, edges: [...current.edges, { id: crypto.randomUUID(), source: connectingFrom, target: targetId }], nodes: current.nodes.map((node) => {
        const groupId = current.nodes.find((source) => source.id === connectingFrom)?.groupId;
        return node.id === targetId && groupId && canReferenceImageGroup(current, groupId, targetId) ? { ...node, referenceGroupIds: [...new Set([...(node.referenceGroupIds || []), groupId])] } : node;
      }) });
    setConnectingFrom(null);
    setConnectionPointer(null);
  }, [connectingFrom, updateFlow]);

  useEffect(() => {
    if (!connectingFrom) return;

    const updatePointer = (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      setConnectionPointer({
        x: (clientX - rect.left - viewport.x) / viewport.zoom,
        y: (clientY - rect.top - viewport.y) / viewport.zoom,
      });
    };
    const handlePointerMove = (event: PointerEvent) => updatePointer(event.clientX, event.clientY);
    const handlePointerUp = (event: PointerEvent) => {
      const directHit = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-canvas-input-node-id]');
      const hit = directHit || Array.from(document.querySelectorAll<HTMLElement>('[data-canvas-input-node-id]'))
        .map((element) => {
          const bounds = element.getBoundingClientRect();
          const dx = event.clientX - (bounds.left + bounds.width / 2);
          const dy = event.clientY - (bounds.top + bounds.height / 2);
          return { element, distance: Math.hypot(dx, dy) };
        })
        .filter((candidate) => candidate.distance <= 28)
        .sort((left, right) => left.distance - right.distance)[0]?.element;
      const targetId = hit?.dataset.canvasInputNodeId;
      if (targetId) {
        finishConnection(targetId);
      } else {
        setConnectingFrom(null);
        setConnectionPointer(null);
      }
    };

    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('pointercancel', handlePointerUp, true);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('pointercancel', handlePointerUp, true);
    };
  }, [connectingFrom, finishConnection, viewport.x, viewport.y, viewport.zoom]);

  const worldPoint = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left - viewport.x) / viewport.zoom, y: (clientY - rect.top - viewport.y) / viewport.zoom };
  };
  const onCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    if ((event.target as HTMLElement).closest('[data-canvas-edge-route]')) return;
    if ((event.target as HTMLElement).closest('[data-canvas-node-id]') && !spacePressed && interactionMode !== 'hand' && event.button !== 1) return;
    event.preventDefault();
    rootRef.current?.focus({ preventScroll: true });
    setAddMenu(null);
    const pan = spacePressed || interactionMode === 'hand' || event.button === 1;
    if (pan) setDragState({ kind: 'pan', startX: event.clientX, startY: event.clientY, originX: viewport.x, originY: viewport.y });
    else {
      const point = worldPoint(event.clientX, event.clientY);
      if (!event.shiftKey) setSelectedIds([]);
      setSelectedEdgeId(null);
      setMarquee({ ...point, width: 0, height: 0 });
      setDragState({ kind: 'marquee', startX: event.clientX, startY: event.clientY, originX: point.x, originY: point.y, additive: event.shiftKey ? selectedIds : [] });
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onCanvasPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState) return;
    const dx = event.clientX - dragState.startX, dy = event.clientY - dragState.startY;
    if (dragState.kind === 'pan') setViewport({ ...viewport, x: dragState.originX + dx, y: dragState.originY + dy });
    else if (dragState.kind === 'marquee') {
      const point = worldPoint(event.clientX, event.clientY);
      const rect = { x: Math.min(point.x, dragState.originX), y: Math.min(point.y, dragState.originY), width: Math.abs(point.x - dragState.originX), height: Math.abs(point.y - dragState.originY) };
      setMarquee(rect);
      setSelectedIds([...new Set([...(dragState.additive || []), ...canvasMarqueeNodeIds(flow.nodes, rect)])]);
    } else if (dragState.nodes && dragState.ids) {
      const delta = { x: dx / viewport.zoom, y: dy / viewport.zoom };
      const snapped = event.altKey ? { ...delta, guides: [] } : snapCanvasSelection(dragState.nodes, dragState.ids, delta, viewport.zoom);
      setGuides(snapped.guides);
      updateFlow((current) => ({ ...current, nodes: current.nodes.map((node) => {
        const original = dragState.nodes!.find((item) => item.id === node.id);
        return original && dragState.ids!.includes(node.id) ? { ...node, x: original.x + snapped.x, y: original.y + snapped.y } : node;
      }) }));
    }
  };
  const onCanvasPointerUp = () => { setDragState(null); setMarquee(null); setGuides([]); history.endGroup(); };
  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('textarea,[role="dialog"]')) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    setViewport(updateViewportForWheel(viewport, { deltaX: event.deltaX, deltaY: event.deltaY, shiftKey: event.shiftKey, zoomKey: event.ctrlKey || event.metaKey, pointerX: event.clientX - rect.left, pointerY: event.clientY - rect.top }));
  };
  useEffect(() => {
    const element = canvasRef.current;
    const prevent = (event: WheelEvent) => { if (!(event.target as HTMLElement).closest('textarea,[role="dialog"]')) event.preventDefault(); };
    element?.addEventListener('wheel', prevent, { passive: false });
    return () => element?.removeEventListener('wheel', prevent);
  }, []);
  const onNodePointerDown = (event: React.PointerEvent, node: CanvasNode) => {
    if (spacePressed || interactionMode === 'hand' || event.button === 1) { onCanvasPointerDown(event as React.PointerEvent<HTMLDivElement>); return; }
    if (event.button !== 0 || (event.target as HTMLElement).closest('button,input,textarea,audio,video')) return;
    event.preventDefault(); event.stopPropagation(); rootRef.current?.focus({ preventScroll: true });
    const ids = event.shiftKey ? selectedIds.includes(node.id) ? selectedIds.filter((id) => !expandCanvasSelection(flow.nodes, [node.id]).includes(id)) : expandCanvasSelection(flow.nodes, [...selectedIds, node.id]) : selectedIds.includes(node.id) ? selectedIds : expandCanvasSelection(flow.nodes, [node.id]);
    setSelectedIds(ids); setSelectedEdgeId(null);
    if (!ids.includes(node.id)) return;
    history.beginGroup('move');
    setDragState({ kind: 'node', startX: event.clientX, startY: event.clientY, originX: node.x, originY: node.y, nodes: flow.nodes, ids });
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const beginConnection = (event: React.PointerEvent | React.MouseEvent, node: CanvasNode) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    setConnectingFrom(node.id);
    setConnectionPointer(rect ? {
      x: (event.clientX - rect.left - viewport.x) / viewport.zoom,
      y: (event.clientY - rect.top - viewport.y) / viewport.zoom,
    } : { x: node.x + node.width, y: node.y + node.height / 2 });
  };

  const importMediaFile = async (file: File, clientX?: number, clientY?: number) => {
    const type: CanvasNodeType | null = file.type.startsWith('image/')
      ? 'image'
      : file.type.startsWith('audio/')
        ? 'audio'
        : file.type.startsWith('video/')
          ? 'video'
          : null;
    if (!type) throw new Error('仅支持图片、音频或视频文件。');
    const mediaUrl = await readFileAsDataUrl(file);
    const rect = canvasRef.current?.getBoundingClientRect();
    const canvasX = clientX === undefined ? (rect?.width || 600) / 2 : clientX - (rect?.left || 0);
    const canvasY = clientY === undefined ? (rect?.height || 500) / 2 : clientY - (rect?.top || 0);
    const node = makeNode(type, (canvasX - viewport.x) / viewport.zoom, (canvasY - viewport.y) / viewport.zoom);
    node.mediaUrl = mediaUrl; node.mimeType = file.type; node.title = file.name;
    updateFlow((current) => ({ ...current, nodes: [...current.nodes, { ...node, ...findNonOverlappingPosition(node, node, current.nodes) }], edges: referenceTargetNodeId && current.nodes.some((candidate) => candidate.id === referenceTargetNodeId) ? [...current.edges, { id: crypto.randomUUID(), source: node.id, target: referenceTargetNodeId }] : current.edges })); revealNodeRef.current = node.id; setSelectedId(referenceTargetNodeId || node.id); setReferenceTargetNodeId(null);
  };

  const openNodeUpload = (node: CanvasNode) => {
    setReferenceTargetNodeId(null);
    if (node.type === 'text') return;
    setImportTarget(node.type);
    setImportTargetNodeId(node.id);
    fileInputRef.current?.click();
  };

  const openNodeAssetLibrary = (node: CanvasNode) => {
    setReferenceTargetNodeId(null);
    if (node.type === 'text') return;
    setImportTarget(node.type);
    setImportTargetNodeId(node.id);
    setAssetPickerKind(node.type === 'image' ? 'image' : node.type === 'video' ? 'video' : 'all');
    setIsAssetPickerOpen(true);
  };

  const importLibraryAsset = (item: AssetLibraryStatusItem) => {
    if (importTargetNodeId) {
      const target = flow.nodes.find((candidate) => candidate.id === importTargetNodeId);
      if (target && target.type !== item.kind) return;
      updateNode(importTargetNodeId, (node) => ({
        ...node,
        mediaUrl: item.url,
        mimeType: item.kind === 'image' ? 'image/*' : 'video/mp4',
        title: item.title,
        status: 'idle',
        error: '',
        pendingTask: undefined, taskId: undefined,
      }));
      setSelectedId(importTargetNodeId);
      setImportTargetNodeId(null);
      setIsAssetPickerOpen(false);
      return;
    }
    const rect = canvasRef.current?.getBoundingClientRect();
    const node = makeNode(
      item.kind,
      ((rect?.width || 600) / 2 - viewport.x) / viewport.zoom - 140,
      ((rect?.height || 500) / 2 - viewport.y) / viewport.zoom - 100,
    );
    node.mediaUrl = item.url;
    node.mimeType = item.kind === 'image' ? 'image/*' : 'video/mp4';
    node.title = item.title;
    updateFlow((current) => ({ ...current, nodes: [...current.nodes, { ...node, ...findNonOverlappingPosition(node, node, current.nodes) }], edges: referenceTargetNodeId && current.nodes.some((candidate) => candidate.id === referenceTargetNodeId) ? [...current.edges, { id: crypto.randomUUID(), source: node.id, target: referenceTargetNodeId }] : current.edges }));
    revealNodeRef.current = node.id;
    setSelectedId(referenceTargetNodeId || node.id); setReferenceTargetNodeId(null);
    setIsAssetPickerOpen(false);
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (importTargetNodeId) {
      const target = flow.nodes.find((node) => node.id === importTargetNodeId);
      if (!target || !file.type.startsWith(`${target.type}/`)) throw new Error(`请选择${target ? NODE_META[target.type].label : '对应类型'}文件。`);
      const mediaUrl = await readFileAsDataUrl(file);
      updateNode(importTargetNodeId, (node) => ({ ...node, mediaUrl, mediaWidth: undefined, mediaHeight: undefined, mimeType: file.type, title: file.name, status: 'idle', error: '', pendingTask: undefined, taskId: undefined }));
      setSelectedId(importTargetNodeId);
      setImportTargetNodeId(null);
      setIsAssetPickerOpen(false);
      return;
    }
    await importMediaFile(file);
    setIsAssetPickerOpen(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = (Array.from(event.dataTransfer.files as FileList) as File[])
      .filter((file) => /^(image|audio|video)\//u.test(file.type));
    files.forEach((file, index) => {
      void importMediaFile(file, event.clientX + index * 24, event.clientY + index * 24).catch((error) => setNotice(String(error)));
    });
  };

  const saveNodeMedia = async (node: CanvasNode, url = node.mediaUrl) => {
    if (node.type !== 'image' && node.type !== 'video') return;
    try {
      const saved = await persistMedia(url, { kind: node.type, assetId: `${project.id}:canvas:${node.id}`, title: node.title });
      updateSystemNode(node.id, (current) => current.mediaUrl === url ? { ...current, mediaUrl: saved.url } : current);
      return saved;
    } catch (error) { setNotice(error instanceof Error ? error.message : '保存到资产库失败，请重试。'); }
  };

  const generateNode = async (node: CanvasNode, generationConfig?: CanvasVideoGenerationConfig, imageGenerationConfig?: CanvasImagePromptConfig) => {
    const context = getIncomingContext(node, flow);
    const fallbackPrompt = [context.text, node.content].filter(Boolean).join('\n\n').trim() || 'Create a concise cinematic creative direction.';
    const textSource = getDefaultModelSource(apiSettings, 'text');
    const imageSource = imageGenerationConfig?.sourceId || getDefaultModelSource(apiSettings, 'image');
    const videoSource = generationConfig?.sourceId || getDefaultModelSource(apiSettings, 'video');
    const configuredDraft = generationConfig?.seedanceDraft;
    const prompt = resolveCanvasPromptMentions(imageGenerationConfig?.prompt || configuredDraft?.prompt.rawPrompt?.trim() || fallbackPrompt, context.incoming);
    updateSystemNode(node.id, (current) => ({ ...current, status: 'generating', error: '' }));
    try {
      if (node.type === 'text') {
        const result = await generateTextWithModel(prompt, resolveModelSource(apiSettings, textSource), useMockMode, textSource);
        updateSystemNode(node.id, (current) => ({ ...current, content: result, status: 'completed' }));
      } else if (node.type === 'image') {
        const imageReferences = [...context.images, ...(imageGenerationConfig && node.mediaUrl ? [node] : [])].filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index);
        const refs: Asset[] = imageReferences.map((item, index) => ({ id: item.id || `canvas-image-reference-${index + 1}`, type: 'scene', name: item.title || `画布参考图 ${index + 1}`, description: item.content, imageUrl: item.mediaUrl }));
        const count = [1, 2, 4].includes(imageGenerationConfig?.count || 1) ? imageGenerationConfig?.count || 1 : 1;
        const outputs = Array.from({ length: count }, (_, index) => index === 0 ? node : { ...makeNode('image', node.x + (node.width + 48) * index, node.y), content: node.content, imageGenerationConfig: node.imageGenerationConfig, referenceGroupIds: node.referenceGroupIds, referenceNodeIds: node.referenceNodeIds, mentionNodeIds: node.mentionNodeIds, title: `${node.title} ${index + 1}`, status: 'generating' as const });
        if (outputs.length > 1) systemFlow((current) => ({ ...current, nodes: [...current.nodes, ...outputs.slice(1)], edges: [...current.edges, ...outputs.slice(1).flatMap((output) => current.edges.filter((edge) => edge.target === node.id).map((edge) => ({ ...edge, id: crypto.randomUUID(), target: output.id })))] }));
        for (const output of outputs) {
          if (!aliveRef.current) return;
          try {
            const result = await generateStoryboardImage(prompt, imageGenerationConfig?.ratio || '16:9', resolveModelSource(apiSettings, imageSource), refs, useMockMode, imageReferences[0]?.mediaUrl || undefined, imageSource);
            updateSystemNode(output.id, (current) => ({ ...current, mediaUrl: result, mimeType: 'image/png', status: output.id === node.id && count > 1 ? 'generating' : 'completed' }));
            await saveNodeMedia(output, result);
          } catch (error) {
            updateSystemNode(output.id, (current) => ({ ...current, status: 'error', error: error instanceof Error ? error.message : String(error) }));
          }
        }
        updateSystemNode(node.id, (current) => current.status === 'generating' ? { ...current, status: 'completed' } : current);
      } else if (node.type === 'video') {
        if (!useMockMode && videoSource.startsWith('seedance.')) {
          const seedanceDraft = configuredDraft || buildCanvasSeedanceDraft(prompt, context);
          const task = await createSeedanceTask({ ...seedanceDraft, prompt: { ...seedanceDraft.prompt, rawPrompt: prompt } }, generationConfig?.seedanceModelKey || getSeedanceModelKey(videoSource));
          updateSystemNode(node.id, (current) => ({ ...current, taskId: task.id, pendingTask: { provider: 'seedance', id: task.id, mock: false } }));
        } else if (!useMockMode && videoSource === 'aliyun.fastVideoModel') {
          const options = configuredDraft?.options;
          const submitted = await submitHappyHorseTask({
            prompt, imageSources: context.images.map((item) => item.mediaUrl), model: resolveModelSource(apiSettings, videoSource as ModelSourceId),
            options: { ratio: options?.ratio === 'adaptive' ? '16:9' : (options?.ratio || '16:9') as AspectRatio, duration: options?.duration && options.duration > 0 ? options.duration : 4, videoResolution: options?.resolution || '720p' },
            apiKey: apiSettings.aliyun.apiKey, baseUrl: apiSettings.aliyun.baseUrl,
          });
          updateSystemNode(node.id, (current) => ({ ...current, taskId: submitted.submitId, pendingTask: { provider: 'aliyun', id: submitted.submitId, mock: false } }));
        } else {
          const options = configuredDraft?.options;
          const ratio = options?.ratio === 'adaptive' || !options?.ratio ? '16:9' : options.ratio as AspectRatio;
          const shot = buildCanvasShot(prompt, context.image, ratio, options?.duration && options.duration > 0 ? options.duration : 4, options?.resolution || '720p', options);
          const refs: Asset[] = context.images.map((item) => ({ id: item.id, type: 'scene', name: item.title, description: item.content, imageUrl: item.mediaUrl }));
          const operation = await startVideoGeneration(shot, ratio, refs, useMockMode, resolveModelSource(apiSettings, videoSource as ModelSourceId), videoSource as ModelSourceId);
          const provider = operation?.provider === 'volcengine' ? 'volcengine' : operation?.provider === 'minimax' ? 'minimax' : 'gemini';
          const id = String(operation?.taskId || operation?.name || '');
          if (!id) throw new Error('服务商未返回可查询的任务编号。');
          updateSystemNode(node.id, (current) => ({ ...current, taskId: id, pendingTask: { provider, id, mock: useMockMode } }));
        }
      } else {
        updateSystemNode(node.id, (current) => ({ ...current, status: 'completed' }));
      }
    } catch (error) {
      updateSystemNode(node.id, (current) => ({ ...current, status: 'error', error: error instanceof Error ? error.message : String(error) }));
    }
  };

  useEffect(() => {
    const candidates = [...flow.nodes, ...(flow.recycleBin || []).flatMap((entry) => entry.nodes)];
    for (const node of candidates) {
      const task = node.pendingTask;
      if (node.status !== 'generating' || !task || pollingRef.current.has(node.id)) continue;
      pollingRef.current.add(node.id);
      void (async () => {
        const terminal = (message: string) => {
          updateSystemNode(node.id, (current) => ({ ...current, pendingTask: undefined }));
          throw new Error(message);
        };
        try {
          let result = '';
          for (let attempt = 0; attempt < 80 && aliveRef.current; attempt++) {
            if (task.provider === 'seedance') {
              const status = await getSeedanceTask(task.id);
              if (/fail|error|cancel/u.test(status.status.toLowerCase())) terminal(status.error?.message || 'Seedance 视频生成失败。');
              result = status.videoUrl || '';
            } else if (task.provider === 'aliyun') {
              const status = await fetchHappyHorseTask(task.id, apiSettings.aliyun.apiKey, apiSettings.aliyun.baseUrl);
              if (status.genStatus === 'failed' || status.genStatus === 'cancelled') terminal(status.error?.message || '阿里云视频生成失败。');
              result = status.genStatus === 'completed' ? status.downloadedFiles[0]?.url || '' : '';
            } else {
              const operation = task.provider === 'gemini' ? { provider: task.provider, name: task.id } : { provider: task.provider, taskId: task.id };
              const status = await checkVideoStatus(operation, task.mock);
              if (status?.error) terminal(status.error.message || '视频生成失败。');
              const uri = status?.response?.generatedVideos?.[0]?.video?.uri || status?.result?.video_url || status?.video_url;
              if (uri) result = await fetchVideoBlobUrl(uri, task.mock, task.provider);
              else if (status?.done) terminal('视频任务已结束，但没有返回可用视频。');
            }
            if (result) break;
            await wait(Math.max(1500, apiSettings.seedance.pollIntervalSec * 1000));
          }
          if (!aliveRef.current) return;
          if (!result) throw new Error('查询暂未完成，可点击继续查询；不会重复提交生成任务。');
          updateSystemNode(node.id, (current) => ({ ...current, mediaUrl: result, mimeType: 'video/mp4', status: 'completed', pendingTask: undefined }));
          await saveNodeMedia(node, result);
        } catch (error) {
          updateSystemNode(node.id, (current) => ({ ...current, status: 'error', error: error instanceof Error ? error.message : String(error) }));
        } finally { pollingRef.current.delete(node.id); }
      })();
    }
  }, [flow.nodes, flow.recycleBin, apiSettings, updateSystemNode]);

  const getComposerDraft = (node: CanvasNode) => {
    const context = getIncomingContext(node, flow);
    const prompt = resolveCanvasPromptMentions([context.text, node.content].filter(Boolean).join('\n\n'), context.incoming);
    const base = node.videoGenerationConfig?.seedanceDraft || buildCanvasSeedanceDraft(prompt, context);
    return { ...base, prompt: { ...base.prompt, rawPrompt: prompt }, assets: buildCanvasReferenceAssets(context, base.baseTemplateId) };
  };
  const removeCreationReference = (targetId: string, referenceId: string) => updateFlow((current) => {
    const edge = current.edges.find((candidate) => candidate.source === referenceId && candidate.target === targetId);
    const next = edge ? removeGroupReferenceEdge(current, edge.id) : current;
    const reference = current.nodes.find((node) => node.id === referenceId);
    const retained = getUpstreamCanvasNodes(targetId, current).filter((item) => item.id !== referenceId).map((item) => item.id);
    return { ...next, nodes: next.nodes.map((node) => node.id === targetId ? { ...node, content: reference ? removeCanvasPromptMention(node.content, reference) : node.content, referenceGroupIds: [], referenceNodeIds: retained, mentionNodeIds: node.mentionNodeIds?.filter((id) => id !== referenceId) } : node) };
  });
  const generateFromComposer = (node: CanvasNode, config: CanvasVideoGenerationConfig | CanvasImageCreationConfig) => {
    if (node.pendingTask) { updateSystemNode(node.id, (current) => ({ ...current, status: 'generating', error: '' })); return; }
    const context = getIncomingContext(node, flow);
    const prompt = resolveCanvasPromptMentions([context.text, node.content].filter(Boolean).join('\n\n'), context.incoming);
    if ('seedanceDraft' in config) void generateNode(node, { ...config, seedanceDraft: { ...config.seedanceDraft, prompt: { ...config.seedanceDraft.prompt, rawPrompt: prompt }, assets: buildCanvasReferenceAssets(context, config.seedanceDraft.baseTemplateId) } });
    else void generateNode(node, undefined, { ...config, prompt });
  };

  const downloadNode = async (node: CanvasNode) => {
    try {
      const response = await fetch(node.mediaUrl);
      if (!response.ok) throw new Error(`下载失败（${response.status}）`);
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = node.title || `canvas-${node.type}`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setNotice(error instanceof Error ? error.message : '下载失败，请重试。'); }
  };
  const edgeColor = themeMode === 'light' ? 'rgba(2,132,199,.72)' : 'rgba(125,211,252,.75)';
  const edgeParticleColor = themeMode === 'light' ? '#0284c7' : '#67e8f9';
  const edgeLines = flow.edges.map((edge) => {
    const source = flow.nodes.find((node) => node.id === edge.source); const target = flow.nodes.find((node) => node.id === edge.target);
    if (!source || !target) return null;
    const route = getCanvasEdgeRoute(source, target);
    return (
      <g key={edge.id} data-canvas-edge-route={route.kind}>
        <path d={route.path} fill="none" stroke="transparent" strokeWidth="18" className="pointer-events-auto cursor-pointer" onClick={(event) => { event.stopPropagation(); setSelectedId(null); setSelectedEdgeId(edge.id); }} aria-label="选择连线" />
        <path d={route.path} fill="none" stroke={selectedEdgeId === edge.id ? edgeParticleColor : edgeColor} strokeWidth={selectedEdgeId === edge.id ? 3 : 2} strokeLinecap="round" strokeLinejoin="round" markerEnd="url(#canvas-arrow)" />
        {[0, 1, 2].map((particleIndex) => (
          <circle key={`${edge.id}-particle-${particleIndex}`} className="infinite-canvas-edge-particle" r={particleIndex === 1 ? 3 : 2.4} fill={edgeParticleColor} filter="url(#canvas-particle-glow)">
            <animateMotion dur="1.8s" begin={`${particleIndex * -0.6}s`} repeatCount="indefinite" path={route.path} />
            <animate attributeName="opacity" values="0;1;1;0" dur="1.8s" begin={`${particleIndex * -0.6}s`} repeatCount="indefinite" />
          </circle>
        ))}
        {selectedEdgeId === edge.id ? (
          <g className="pointer-events-auto cursor-pointer" onClick={(event) => { event.stopPropagation(); deleteEdge(edge.id); }} aria-label="删除连线">
            <circle cx={route.midpoint.x} cy={route.midpoint.y} r="11" fill={themeMode === 'light' ? '#fff' : '#172033'} stroke="#fb7185" strokeWidth="1.5" />
            <path d={`M ${route.midpoint.x - 3.5} ${route.midpoint.y - 3.5} L ${route.midpoint.x + 3.5} ${route.midpoint.y + 3.5} M ${route.midpoint.x + 3.5} ${route.midpoint.y - 3.5} L ${route.midpoint.x - 3.5} ${route.midpoint.y + 3.5}`} stroke="#fb7185" strokeWidth="1.7" strokeLinecap="round" />
          </g>
        ) : null}
      </g>
    );
  });
  const connectingSourceNode = connectingFrom ? flow.nodes.find((node) => node.id === connectingFrom) : null;


  const canvasBackground = themeMode === 'light' ? '#f6f1e8' : '#0b1320';
  const canvasGridColor = themeMode === 'light' ? 'rgba(71,85,105,.24)' : 'rgba(148,163,184,.27)';

  return (
    <section ref={rootRef} tabIndex={-1} aria-label="无限画布编辑器" className="tapdance-canvas" style={{ backgroundColor: canvasBackground }}>
      <div className="canvas-topbar">
        <div><button type="button" aria-label="返回项目列表" title="返回项目列表" onClick={onBack}><ChevronLeft size={16} /></button><strong>无限画布</strong><input aria-label="项目名称" className="canvas-project-name" value={project.name} onChange={(event) => setProject((current) => ({ ...current, name: event.target.value, nameCustomized: true }))} /><span>{flow.nodes.length} 个节点 · {flow.edges.length} 条连接</span></div>
        <div className="canvas-topbar__actions"><button type="button" aria-label="模型设置" title="模型设置" onClick={onOpenSettings}><Settings2 size={15} /></button><button type="button" aria-label="切换画布主题" title="切换画布主题" onClick={onThemeChange}>{themeMode === 'dark' ? '浅色' : '深色'}</button>
          {(['image', 'video', 'audio', 'text'] as CanvasNodeType[]).map((type) => { const Icon = NODE_META[type].icon; return <button key={type} type="button" onClick={() => addNode(type)}><Icon size={15} />{NODE_META[type].label}</button>; })}
          <button type="button" onClick={() => { setImportTargetNodeId(null); setAssetPickerKind('all'); setIsAssetPickerOpen(true); }}><FolderOpen size={15} />素材选择</button>
          <button type="button" onClick={() => setRecycleOpen(true)} aria-label="画布回收站"><Trash2 size={15} /><span>回收站{flow.recycleBin?.length ? ` (${flow.recycleBin.length})` : ''}</span></button>
        </div>
      </div>
      <input ref={fileInputRef} type="file" className="hidden" accept={importTarget === 'media' ? 'image/*,audio/*,video/*' : importTarget === 'image' ? 'image/*' : importTarget === 'audio' ? 'audio/*' : 'video/*'} onChange={(event) => void handleFile(event).catch((error) => setNotice(String(error)))} />
      <div ref={canvasRef} data-testid="infinite-canvas-surface" className={`canvas-surface ${spacePressed || interactionMode === 'hand' ? 'is-hand' : ''}`} onPointerDown={onCanvasPointerDown} onPointerMove={onCanvasPointerMove} onPointerUp={onCanvasPointerUp} onPointerCancel={onCanvasPointerUp} onWheel={onWheel} onContextMenu={(event) => { if ((event.target as HTMLElement).closest('[data-canvas-node-id]')) return; event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); setAddMenu({ x: Math.min(event.clientX - rect.left, size.width - 200), y: Math.min(event.clientY - rect.top, size.height - 320) }); }} onDoubleClick={(event) => { if ((event.target as HTMLElement).closest('[data-canvas-node-id]')) return; const rect = event.currentTarget.getBoundingClientRect(); setAddMenu({ x: Math.min(event.clientX - rect.left, size.width - 200), y: Math.min(event.clientY - rect.top, size.height - 320) }); }} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop} style={{ backgroundColor: canvasBackground, backgroundImage: `radial-gradient(circle, ${canvasGridColor} 1px, transparent 1px)`, backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px`, backgroundPosition: `${viewport.x}px ${viewport.y}px` }}>

        <div className="absolute inset-0" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`, transformOrigin: '0 0' }}>
          <svg className="pointer-events-none absolute left-0 top-0 h-[5000px] w-[5000px] overflow-visible" aria-hidden="true">
            <defs>
              <marker id="canvas-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L7,3 z" fill={edgeParticleColor} />
              </marker>
              <filter id="canvas-particle-glow" x="-250%" y="-250%" width="600%" height="600%">
                <feGaussianBlur stdDeviation="2.2" result="particle-blur" />
                <feMerge>
                  <feMergeNode in="particle-blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {!edgesHidden && edgeLines}
            {connectingSourceNode && connectionPointer ? <line x1={connectingSourceNode.x + connectingSourceNode.width} y1={connectingSourceNode.y + connectingSourceNode.height / 2} x2={connectionPointer.x} y2={connectionPointer.y} stroke="rgba(34,211,238,.95)" strokeWidth="2.5" strokeDasharray="7 5" markerEnd="url(#canvas-arrow)" /> : null}
          </svg>
          {[...canvasGroups(flow.nodes)].map(([id, members]) => { const bounds = canvasGroupBounds(members)!; return <div key={id} className="canvas-group-frame" style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }}><button type="button" onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault(); event.stopPropagation(); rootRef.current?.focus({ preventScroll: true });
              const ids = members.map((node) => node.id); setSelectedIds(ids); history.beginGroup('move-group');
              setDragState({ kind: 'node', startX: event.clientX, startY: event.clientY, originX: members[0].x, originY: members[0].y, nodes: flow.nodes, ids });
              event.currentTarget.setPointerCapture(event.pointerId);
            }} onClick={() => setSelectedIds(members.map((node) => node.id))}>组合 · {members.length} 个节点</button></div>; })}
          {flow.nodes.map((node) => <CanvasNodeCard key={node.id}
            node={node} selected={selectedIds.includes(node.id)} connecting={connectingFrom === node.id}
            onSelect={(additive) => selectNode(node, additive)} onDrag={(event) => onNodePointerDown(event, node)}
            onChange={(patch) => updateNode(node.id, (current) => ({ ...current, ...patch }))}
            onDimensions={(width, height) => { if (width > 0 && height > 0 && (node.mediaWidth !== width || node.mediaHeight !== height)) updateSystemNode(node.id, (current) => ({ ...current, mediaWidth: width, mediaHeight: height, height: Math.max(150, Math.round(36 + (current.width - 2) * height / width)) })); }}
            onKeyboardConnect={() => { setConnectingFrom(node.id); setConnectionPointer({ x: node.x + node.width, y: node.y + node.height / 2 }); }} onConnect={(event) => beginConnection(event, node)} onFinishConnection={() => finishConnection(node.id)}
            onAddConnected={(type, direction) => addConnectedNode(node, type, direction)} onDuplicate={() => duplicateNode(node.id)} onDelete={() => deleteNode(node.id)}
            onUpload={() => openNodeUpload(node)} onMaterials={() => openNodeAssetLibrary(node)}
            onGenerate={() => node.pendingTask ? updateSystemNode(node.id, (current) => ({ ...current, status: 'generating', error: '' })) : node.type === 'video' || node.type === 'image' ? rootRef.current?.querySelector<HTMLElement>('[data-testid=canvas-creation-composer] [contenteditable]')?.focus() : void generateNode(node)}
            onSave={() => { void saveNodeMedia(node).then((saved) => { if (saved?.savedToLibrary) setNotice('已保存到资产库'); }); }} onPreview={() => setPreviewNode(node)} onDownload={() => void downloadNode(node)}
          />)}
          {marquee && <div className="canvas-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }} />}
          {guides.map((guide, index) => <div key={index} className="canvas-guide" style={guide.orientation === 'vertical' ? { left: guide.position, top: guide.start, height: guide.end - guide.start, width: 1 / viewport.zoom } : { left: guide.start, top: guide.position, width: guide.end - guide.start, height: 1 / viewport.zoom }} />)}

        </div>
        {flow.nodes.length === 0 ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="max-w-sm text-center"><MousePointer2 className="mx-auto mb-3 h-8 w-8 text-cyan-300/80" /><p className="text-lg font-semibold">从一个节点开始你的创作流程</p><p className="mt-2 text-sm text-[var(--studio-muted)]">添加文字、图片、音频或视频，拖动输出手柄连接上下游节点。</p></div></div> : null}
      </div>

      <CanvasTools nodes={flow.nodes} viewport={viewport} size={size} ready assetsOpen={assetsOpen} edgesHidden={edgesHidden} interactionMode={interactionMode} onInteractionMode={setInteractionMode} selectedId={selectedId || undefined} onAssets={() => setAssetsOpen(!assetsOpen)} onEdges={() => setEdgesHidden(!edgesHidden)} onArrange={() => { updateFlow((current) => ({ ...current, nodes: arrangeCanvasNodes(current.nodes, current.edges) })); }} onSelect={(node) => { selectNode(node); setViewport(focusCanvasNodeViewport(node, viewport, { width: Math.max(240, size.width - (size.width > 700 ? 280 : 0)), height: size.height }, size.height - 100)); }} onViewport={setViewport} />
      <CanvasShortcutPanel canUndo={history.canUndo} canRedo={history.canRedo} onUndo={history.undo} onRedo={history.redo} />
      {selectedIds.length > 1 && <div className="canvas-selection-toolbar" aria-label="多选操作"><span>已选 {selectedIds.length} 个节点</span><button type="button" disabled={!canGroupNodes(flow, selectedIds)} onClick={groupSelection}><Group size={14} />成组</button><button type="button" disabled={!flow.nodes.some((node) => selectedIds.includes(node.id) && node.groupId)} onClick={ungroupSelection}><Ungroup size={14} />拆组</button><button type="button" onClick={() => duplicateSelection()}><Copy size={14} />复制</button><button type="button" onClick={() => setDeleteIds(expandCanvasSelection(flow.nodes, selectedIds))}><Trash2 size={14} />删除</button></div>}
      {selectedNode && <CanvasReferenceInspector node={selectedNode} flow={flow} onChange={(ids) => updateNode(selectedNode.id, (node) => ({ ...node, referenceNodeIds: ids }))}
        onAdd={(id) => updateFlow((current) => ({ ...current, edges: canConnect(id, selectedNode.id, current.edges) ? [...current.edges, { id: crypto.randomUUID(), source: id, target: selectedNode.id }] : current.edges }))}
        onRemove={(id) => updateFlow((current) => {
          const edge = current.edges.find((candidate) => candidate.source === id && candidate.target === selectedNode.id);
          const next = edge ? removeGroupReferenceEdge(current, edge.id) : current;
          const refs = getUpstreamCanvasNodes(selectedNode.id, current).filter((reference) => reference.id !== id).map((reference) => reference.id);
          return { ...next, nodes: next.nodes.map((node) => node.id === selectedNode.id ? { ...node, referenceGroupIds: [], referenceNodeIds: refs } : node) };
        })} />}
      {selectedNode && (selectedNode.type === 'image' || selectedNode.type === 'video') && !imagePromptPopover && !videoConfigModal && <CanvasCreationComposer
        key={selectedNode.id} node={selectedNode} canvasNodes={flow.nodes} references={getUpstreamCanvasNodes(selectedNode.id, flow)} apiSettings={apiSettings} draft={getComposerDraft(selectedNode)} themeMode={themeMode}
        onChange={(patch) => updateNode(selectedNode.id, (current) => ({ ...current, ...patch }))}
        onMentionedMaterialIdsChange={(ids) => updateNode(selectedNode.id, (current) => ({ ...current, mentionNodeIds: ids }))}
        onReorder={(ids) => updateNode(selectedNode.id, (current) => ({ ...current, referenceNodeIds: ids }))}
        onRemoveReference={(id) => removeCreationReference(selectedNode.id, id)}
        onAddReference={() => { setImportTarget(selectedNode.type === 'image' ? 'image' : 'media'); setReferenceTargetNodeId(selectedNode.id); setImportTargetNodeId(null); setAssetPickerKind(selectedNode.type === 'image' ? 'image' : 'all'); setIsAssetPickerOpen(true); }}
        onPreview={setPreviewNode} onAdvanced={() => selectedNode.type === 'video' ? openVideoConfig(selectedNode) : openImagePrompt(selectedNode)}
        onGenerate={(config) => generateFromComposer(selectedNode, config)}
      />}
      {addMenu && <div className="canvas-add-menu-layer"><CanvasAddMenu x={addMenu.x} y={addMenu.y} busy={false} onAdd={addNode} onUpload={() => { setAddMenu(null); setImportTarget('media'); setImportTargetNodeId(null); fileInputRef.current?.click(); }} onMaterials={() => { setAddMenu(null); setImportTargetNodeId(null); setIsAssetPickerOpen(true); }} onClose={() => setAddMenu(null)} /></div>}
      {notice && <div className="canvas-notice" role="status">{notice}<button type="button" aria-label="关闭提示" onClick={() => setNotice('')}><X size={14} /></button></div>}
      <StudioModal open={deleteIds.length > 0} onClose={() => setDeleteIds([])} themeMode={themeMode} className="max-w-md">
        <h2 className="text-lg font-semibold">删除 {deleteIds.length} 个节点？</h2><p className="mt-3 text-sm text-[var(--studio-muted)]">节点和关联连线将移入当前画布的回收站，可随时恢复。</p>
        <div className="mt-5 flex justify-end gap-2"><button type="button" className="studio-button studio-button-secondary" onClick={() => setDeleteIds([])}>取消</button><button type="button" className="studio-button studio-button-primary" onClick={() => { updateFlow((current) => moveCanvasNodesToRecycleBin(current, deleteIds, crypto.randomUUID(), new Date().toISOString())); setSelectedIds([]); setDeleteIds([]); }}>移入回收站</button></div>
      </StudioModal>
      <StudioModal open={recycleOpen} onClose={() => { setRecycleOpen(false); setPurgeId(undefined); }} themeMode={themeMode} className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">画布回收站</h2><button type="button" aria-label="关闭画布回收站" onClick={() => setRecycleOpen(false)}><X size={18} /></button></div>
        <p className="my-3 text-sm text-[var(--studio-muted)]">恢复节点及关联连线；素材库中的原文件不受影响。</p>
        {!flow.recycleBin?.length ? <p className="py-12 text-center text-[var(--studio-muted)]">回收站为空</p> : <ul className="canvas-recycle-list">{flow.recycleBin.map((entry) => <li key={entry.id}><strong>{entry.nodes.map((node) => node.title).join('、')}</strong><small>{entry.nodes.length} 个节点 · {entry.edges.length} 条连线</small><div className="canvas-recycle-previews">{entry.nodes.filter((node) => node.type === 'image' && node.mediaUrl).map((node) => <img key={node.id} src={node.mediaUrl} alt={node.title} />)}</div>{purgeId === entry.id ? <div><span>永久删除后无法恢复。</span><button type="button" onClick={() => setPurgeId(undefined)}>取消</button><button type="button" onClick={() => { systemFlow((current) => permanentlyDeleteCanvasRecycleBinEntry(current, entry.id)); history.reset(); setPurgeId(undefined); }}>确认永久删除</button></div> : <div><button type="button" onClick={() => { updateFlow((current) => restoreCanvasRecycleBinEntry(current, entry.id)); }}><ArchiveRestore size={14} />恢复</button><button type="button" onClick={() => setPurgeId(entry.id)}><Trash2 size={14} />永久删除</button></div>}</li>)}</ul>}
      </StudioModal>
      <StudioModal open={Boolean(previewNode)} onClose={() => setPreviewNode(null)} themeMode={themeMode} className="max-w-5xl">
        {previewNode && <><div className="mb-4 flex items-center justify-between"><h2>{previewNode.title}</h2><button type="button" aria-label="关闭素材预览" onClick={() => setPreviewNode(null)}><X size={18} /></button></div>{previewNode.type === 'image' ? <img className="max-h-[75vh] w-full object-contain" src={previewNode.mediaUrl} alt={previewNode.title} /> : previewNode.type === 'video' ? <video className="max-h-[75vh] w-full" controls src={previewNode.mediaUrl} /> : <audio controls src={previewNode.mediaUrl} />}</>}
      </StudioModal>

      {imagePromptPopover ? (
        <CanvasImagePromptPopover
          node={imagePromptPopover.node}
          context={imagePromptPopover.context}
          apiSettings={apiSettings}
          onClose={() => setImagePromptPopover(null)}
          onConfirm={(config) => {
            const targetNode = imagePromptPopover.node;
            updateNode(targetNode.id, (current) => ({ ...current, content: config.prompt, imageGenerationConfig: { sourceId: config.sourceId, ratio: config.ratio } }));
            setImagePromptPopover(null);
            void generateNode({ ...targetNode, content: config.prompt }, undefined, config);
          }}
        />
      ) : null}

      {videoConfigModal ? (
        <CanvasVideoConfigModal
          node={videoConfigModal.node}
          context={videoConfigModal.context}
          initialSourceId={videoConfigModal.sourceId}
          initialDraft={videoConfigModal.draft}
          themeMode={themeMode}
          onClose={() => setVideoConfigModal(null)}
          onConfirm={(config) => {
            const targetNodeId = videoConfigModal.node.id;
            updateNode(targetNodeId, (current) => ({ ...current, content: config.seedanceDraft.prompt.rawPrompt, videoGenerationConfig: config }));
            setVideoConfigModal(null);
            const targetNode = flow.nodes.find((candidate) => candidate.id === targetNodeId);
            if (targetNode) void generateNode({ ...targetNode, content: config.seedanceDraft.prompt.rawPrompt }, config);
          }}
        />
      ) : null}

      <StudioModal
        open={isAssetPickerOpen}
        onClose={() => { setIsAssetPickerOpen(false); setImportTargetNodeId(null); setReferenceTargetNodeId(null); }}
        className="max-h-[88vh] max-w-6xl overflow-hidden p-0"
        themeMode={themeMode}
      >
        <div className="flex max-h-[88vh] flex-col bg-[var(--studio-surface)]">
          <div className="border-b border-[var(--studio-border)] px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="studio-eyebrow">Asset Library</div>
                <h3 className="mt-2 text-xl font-semibold text-[var(--studio-text)]">导入素材到画布</h3>
                <p className="mt-2 text-sm text-[var(--studio-muted)]">从 Tapdance 素材库选择图片或视频，也可以从本地上传媒体文件。</p>
              </div>
              <button type="button" onClick={() => { setIsAssetPickerOpen(false); setImportTargetNodeId(null); setReferenceTargetNodeId(null); }} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--studio-border)] text-[var(--studio-dim)] hover:text-[var(--studio-text)]" aria-label="关闭素材选择">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="flex min-w-[16rem] flex-1 items-center gap-2 rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface-soft)] px-3 py-2">
                <Search className="h-4 w-4 text-[var(--studio-dim)]" />
                <input value={assetPickerQuery} onChange={(event) => setAssetPickerQuery(event.target.value)} placeholder="搜索素材、项目或分组" className="min-w-0 flex-1 bg-transparent text-sm text-[var(--studio-text)] outline-none placeholder:text-[var(--studio-dim)]" />
              </label>
              <div className="studio-segmented">
                {(['all', 'image', 'video'] as const).map((kind) => (
                  <button key={kind} type="button" onClick={() => setAssetPickerKind(kind)} className={`studio-segmented-button ${assetPickerKind === kind ? 'active' : ''}`}>
                    {kind === 'all' ? '全部' : kind === 'image' ? '图片' : '视频'}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="studio-button studio-button-secondary px-3 py-2 text-xs">
                <Upload className="h-3.5 w-3.5" />本地上传
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5">
            {filteredAssetLibraryItems.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredAssetLibraryItems.map((item) => (
                  <button key={item.id} type="button" onClick={() => importLibraryAsset(item)} className="group overflow-hidden rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-surface-soft)] text-left transition-all hover:-translate-y-0.5 hover:border-[var(--studio-accent-cyan-border)]">
                    <div className="relative aspect-video overflow-hidden bg-[var(--studio-bg-tertiary)]">
                      {item.kind === 'image'
                        ? <img src={item.url} alt={item.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
                        : <video src={item.url} muted preload="metadata" playsInline className="h-full w-full object-cover" />}
                      <span className="absolute left-2 top-2 rounded-full border border-white/15 bg-black/55 px-2 py-1 text-[10px] text-white">{item.kind === 'image' ? '图片' : '视频'}</span>
                    </div>
                    <div className="p-4">
                      <div className="truncate text-sm font-semibold text-[var(--studio-text)]">{item.title}</div>
                      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-[var(--studio-muted)]"><span className="truncate">{item.projectName}</span><span className="shrink-0">{item.groupName}</span></div>
                      <div className="mt-2 truncate text-[11px] text-[var(--studio-dim)]">{item.sourceLabel}</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--studio-border)] bg-[var(--studio-surface-soft)] px-6 text-center">
                <FolderOpen className="h-8 w-8 text-[var(--studio-dim)]" />
                <div className="mt-4 text-sm font-medium text-[var(--studio-text)]">素材库中没有匹配内容</div>
                <p className="mt-2 text-xs text-[var(--studio-muted)]">可以调整筛选条件，或从本地上传图片、音频和视频。</p>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="studio-button studio-button-secondary mt-5 px-4 py-2 text-xs"><Upload className="h-3.5 w-3.5" />本地上传</button>
              </div>
            )}
          </div>
        </div>
      </StudioModal>
    </section>
  );
}
