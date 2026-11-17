import { getSeedanceApiModelKeyForModelSourceId } from '../../seedance/modelVersions.ts';
import { useRef, useState } from 'react';
import { AudioLines, FileText, Image as ImageIcon, LoaderCircle, Maximize2, Minimize2, Plus, Settings2, Sparkles, Video, X } from 'lucide-react';
import type { ApiSettings, ModelSourceId, VisualAspectRatio } from '../../../types.ts';
import type { CanvasNode, CanvasVideoGenerationConfig } from '../types.ts';
import { getDefaultModelSource, getFlowOverrideOptions } from '../../../services/apiConfig.ts';
import { getSeedanceCapabilities, getSeedanceTemplateOptionConstraints, normalizeSeedanceDraftOptions } from '../../seedance/capabilities.ts';
import { validateSeedanceDraft } from '../../seedance/services/seedanceDraft.ts';
import { SEEDANCE_TEMPLATE_REGISTRY } from '../../seedance/config/seedanceTemplateRegistry.ts';
import { PromptMentionEditor } from './creation/PromptMentionEditor.tsx';
import { CreationGenerationControls } from './creation/CreationGenerationControls.tsx';
import { CREATION_PROMPT_MAX_CHARACTERS, type CreationMaterial } from './creation/materials.ts';
import { CanvasModal } from './CanvasModal.tsx';
import type { SeedanceDraft } from '../../seedance/types.ts';

export type CanvasImageCreationConfig = { prompt: string; ratio: VisualAspectRatio; sourceId: ModelSourceId; count?: number };

type Props = {
  key?: string;
  node: CanvasNode;
  canvasNodes: CanvasNode[];
  references: CanvasNode[];
  apiSettings: ApiSettings;
  draft: SeedanceDraft;
  themeMode: 'light' | 'dark';
  onChange: (patch: Partial<CanvasNode>) => void;
  onMentionedMaterialIdsChange: (ids: string[]) => void;
  onReorder: (ids: string[]) => void;
  onRemoveReference: (id: string) => void;
  onAddReference: () => void;
  onPreview: (node: CanvasNode) => void;
  onAdvanced: () => void;
  onGenerate: (config: CanvasVideoGenerationConfig | CanvasImageCreationConfig) => void;
};

/** NiegeIP CanvasCreationComposer: selected-node lifecycle, prompt editor, reference strip and generation controls.
 * Cloud model/material/points APIs are replaced by Tapdance's existing configuration and generation services.
 */
export function CanvasCreationComposer({ node, canvasNodes, references, apiSettings, draft, themeMode, onChange, onMentionedMaterialIdsChange, onReorder, onRemoveReference, onAddReference, onPreview, onAdvanced, onGenerate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const mode = node.type === 'video' ? 'video' : 'image';
  const sourceId = (mode === 'image' ? node.imageGenerationConfig?.sourceId : node.videoGenerationConfig?.sourceId) || getDefaultModelSource(apiSettings, mode);
  const models = getFlowOverrideOptions(apiSettings, mode).filter((option) => option.id !== 'default');
  const modelKey = getSeedanceApiModelKeyForModelSourceId(sourceId) || 'standard';
  const isSeedance = sourceId.startsWith('seedance.');
  const profile = getSeedanceCapabilities(modelKey);
  const normalizedDraft = isSeedance ? normalizeSeedanceDraftOptions(draft, modelKey) : draft;
  const providerResolutions = sourceId === 'minimax.videoModel' || sourceId.startsWith('gemini.') ? ['720p', '1080p'] : ['480p', '720p', '1080p'];
  const providerDurations = sourceId === 'minimax.videoModel' ? [6, 10] : sourceId.startsWith('gemini.') ? [4, 6, 8] : Array.from({ length: profile.maxDurationSec - 3 }, (_, index) => index + 4);
  const videoDraft: SeedanceDraft = isSeedance ? normalizedDraft : { ...normalizedDraft, options: { ...normalizedDraft.options,
    resolution: providerResolutions.includes(normalizedDraft.options.resolution) ? normalizedDraft.options.resolution : providerResolutions[0] as SeedanceDraft['options']['resolution'],
    duration: providerDurations.includes(normalizedDraft.options.duration) ? normalizedDraft.options.duration : providerDurations[0],
    outputFormat: 'mp4', ratio: normalizedDraft.options.ratio === 'adaptive' ? '16:9' : normalizedDraft.options.ratio,
  } };
  const constraints = isSeedance ? getSeedanceTemplateOptionConstraints(videoDraft.baseTemplateId, modelKey) : {};
  const ratio = mode === 'image' ? node.imageGenerationConfig?.ratio || '16:9' : videoDraft.options.ratio;
  const pending = node.status === 'generating';
  const mediaReferences = references.filter((item) => item.type !== 'text');
  const contextNodes = references.filter((item) => item.type === 'text' && item.content.trim());
  const materials: CreationMaterial[] = canvasNodes.filter((item) => item.id !== node.id && item.type !== 'text' && (mode === 'video' || item.type === 'image') && Boolean(item.mediaUrl)).map((item) => ({ id: item.id, kind: item.type as CreationMaterial['kind'], name: item.title, url: item.mediaUrl }));
  const updateVideo = (options: Partial<SeedanceDraft['options']>, nextSource = sourceId) => {
    const nextModelKey = getSeedanceApiModelKeyForModelSourceId(nextSource) || 'standard';
    const nextDraft = { ...videoDraft, prompt: { ...videoDraft.prompt, rawPrompt: node.content }, options: { ...videoDraft.options, ...options } };
    const normalized = nextSource.startsWith('seedance.') ? normalizeSeedanceDraftOptions(nextDraft, nextModelKey) : nextDraft;
    onChange({ videoGenerationConfig: { sourceId: nextSource, seedanceModelKey: nextModelKey, seedanceDraft: normalized } });
  };
  const updateImage = (patch: Partial<NonNullable<CanvasNode['imageGenerationConfig']>>) => onChange({ imageGenerationConfig: { sourceId: sourceId as ModelSourceId, ratio: ratio as VisualAspectRatio, ...node.imageGenerationConfig, ...patch } });
  const changePrompt = (content: string) => onChange({ content, ...(mode === 'video' && node.videoGenerationConfig ? { videoGenerationConfig: { ...node.videoGenerationConfig, seedanceDraft: { ...node.videoGenerationConfig.seedanceDraft, prompt: { ...node.videoGenerationConfig.seedanceDraft.prompt, rawPrompt: content } } } } : {}) });
  const inputError = mediaReferences.some((item) => !item.mediaUrl) ? '参考素材尚未就绪，请先上传或生成素材。' : mediaReferences.some((item) => item.type !== 'image') && (mode === 'image' || !isSeedance) ? '当前模型尚未接入视频或音频参考，请移除对应引用或切换支持多素材的 Seedance 模型。' : undefined;
  const canPrompt = Boolean(node.content.trim() || contextNodes.length);
  const validation = mode === 'video' && isSeedance && canPrompt ? validateSeedanceDraft(videoDraft, modelKey).errors[0] : undefined;
  const error = inputError || validation;
  const ratios = (['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'] as const).map((value) => ({ value, label: value }));
  const videoRatios = constraints.ratio ? [{ value: constraints.ratio, label: '自动比例' }] : [{ value: 'adaptive', label: '自动比例' }, ...ratios];
  const resolutions = isSeedance ? profile.resolutions : providerResolutions;
  const durationValues = typeof constraints.duration === 'number' ? [constraints.duration] : providerDurations;
  const closeExpanded = () => { setExpanded(false); requestAnimationFrame(() => expandButtonRef.current?.focus()); };
  const panel = <section aria-label={`${node.title}创作参数`} data-testid="canvas-creation-composer" className={`infinite-canvas-composer${expanded ? ' infinite-canvas-composer--expanded' : ''}`} onPointerDown={(event) => event.stopPropagation()}>
    <header className="infinite-canvas-composer__header"><div><span className="infinite-canvas-composer__mode">{mode === 'video' ? <Video size={14} /> : <ImageIcon size={14} />}{mode === 'video' ? '视频创作' : '图片创作'}</span><strong>{node.title}</strong></div><div><button type="button" aria-label="高级创作配置" title="高级创作配置" disabled={pending} onClick={onAdvanced}><Settings2 size={16} /></button><button ref={expandButtonRef} type="button" aria-label={expanded ? '缩小创作面板' : '放大创作面板'} onClick={() => expanded ? closeExpanded() : setExpanded(true)}>{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button></div></header>
    {(mediaReferences.length > 0 || contextNodes.length > 0) && <div className="infinite-canvas-composer__references"><div className="infinite-canvas-composer__reference-list">{mediaReferences.map((item, index) => <figure key={item.id} data-testid="canvas-composer-reference"><button type="button" className="infinite-canvas-composer__reference-preview" aria-label={`预览参考素材 ${item.title}`} title={item.title} onClick={() => onPreview(item)}><span className="infinite-canvas-composer__reference-index">{index + 1}</span>{item.type === 'image' && item.mediaUrl ? <img src={item.mediaUrl} alt={item.title} /> : item.type === 'video' && item.mediaUrl ? <video muted preload="metadata" src={item.mediaUrl} /> : <AudioLines size={22} />}</button><button type="button" className="infinite-canvas-composer__reference-delete" aria-label={`移除创作参考 ${item.title}`} disabled={pending} onClick={() => onRemoveReference(item.id)}><X size={12} /></button><button type="button" className="infinite-canvas-composer__reference-move" aria-label={`前移创作参考 ${item.title}`} disabled={index === 0 || pending} onClick={() => { const ids = references.map((reference) => reference.id); const at = ids.indexOf(item.id); [ids[at], ids[at - 1]] = [ids[at - 1], ids[at]]; onReorder(ids); }}>←</button></figure>)}{contextNodes.map((item) => <figure key={item.id} title={item.title} className="infinite-canvas-composer__text-reference"><FileText size={24} /><span>{item.title}</span></figure>)}</div></div>}
    {node.error && <p role="status" className="infinite-canvas-composer__reference-error">{node.error}</p>}
    {error && <p role="status" className="infinite-canvas-composer__reference-error">{error}</p>}
    <div className="infinite-canvas-composer__prompt"><PromptMentionEditor key={node.id} ariaLabel={mode === 'image' ? '图片创作提示词' : '视频创作提示词'} value={node.content} materials={materials} numberedMaterialIds={mediaReferences.map((item) => item.id)} connectedMaterialIds={mediaReferences.map((item) => item.id)} portalSuggestions placeholder="描述想创作的内容，输入 @ 引用画布素材…" onChange={changePrompt} onMentionedMaterialIdsChange={onMentionedMaterialIdsChange} /><span>{Array.from(node.content).length}/{CREATION_PROMPT_MAX_CHARACTERS}</span></div>
    <footer className="infinite-canvas-composer__footer"><button type="button" aria-label="添加创作参考素材" title="添加参考素材" disabled={pending} onClick={onAddReference}><Plus size={17} /></button>
      <fieldset disabled={pending} className="infinite-canvas-composer__control-fields"><CreationGenerationControls mode={mode} className="infinite-canvas-composer__controls" modelOptions={models.map((item) => ({ value: item.id, label: item.label }))} modelValue={sourceId} onModelChange={(value) => mode === 'image' ? updateImage({ sourceId: value as ModelSourceId }) : updateVideo({}, value)}
        ratioOptions={mode === 'image' ? ratios : videoRatios} ratioValue={ratio} onRatioChange={(value) => mode === 'image' ? updateImage({ ratio: value as VisualAspectRatio }) : updateVideo({ ratio: value as SeedanceDraft['options']['ratio'] })}
        resolutionOptions={mode === 'image' ? [] : resolutions.map((value) => ({ value, label: value }))} resolutionValue={videoDraft.options.resolution} onResolutionChange={(value) => updateVideo({ resolution: value as SeedanceDraft['options']['resolution'] })}
        countOptions={[1, 2, 4].map((value) => ({ value: String(value), label: `${value} 张` }))} countValue={String(node.imageGenerationConfig?.count || 1)} onCountChange={(value) => updateImage({ count: Number(value) })}
        durationOptions={durationValues.map((value) => ({ value: String(value), label: value === -1 ? '自动时长' : `${value} 秒` }))} durationValue={String(videoDraft.options.duration)} onDurationChange={(value) => updateVideo({ duration: Number(value) })}
        outputFormatOptions={(isSeedance ? profile.outputFormats : ['mp4']).map((value) => ({ value, label: value.toUpperCase() }))} outputFormatValue={videoDraft.options.outputFormat || 'mp4'} onOutputFormatChange={(value) => updateVideo({ outputFormat: value as 'mp4' | 'mov' })}
        generateAudio={videoDraft.options.generateAudio} supportsGenerateAudio={isSeedance && SEEDANCE_TEMPLATE_REGISTRY[videoDraft.baseTemplateId].supportedOverlays.includes('auto_audio')} onGenerateAudioChange={(value) => updateVideo({ generateAudio: value })}
        onOptimizePrompt={() => changePrompt(node.content.trim() ? `${node.content.replace(/[。\s]+$/, '')}，电影感构图，主体清晰，自然光影。` : '电影感构图，主体清晰，自然光影，细节丰富。')}
      /></fieldset>
      <button type="button" className="infinite-canvas-composer__generate" disabled={pending || !models.length || (!node.pendingTask && (!canPrompt || Boolean(error)))} onClick={() => onGenerate(mode === 'image' ? { prompt: node.content, ratio: ratio as VisualAspectRatio, sourceId: sourceId as ModelSourceId, count: node.imageGenerationConfig?.count || 1 } : { sourceId, seedanceModelKey: modelKey, seedanceDraft: videoDraft })}>{pending ? <LoaderCircle size={17} className="animate-spin" /> : <Sparkles size={17} />}<span>{pending ? '生成中…' : node.pendingTask ? '继续查询' : mode === 'video' ? '生成视频' : '生成图片'}</span></button>
    </footer>
  </section>;
  return expanded ? <CanvasModal open onClose={closeExpanded} themeMode={themeMode} className="canvas-composer-modal">{panel}</CanvasModal> : panel;
}
