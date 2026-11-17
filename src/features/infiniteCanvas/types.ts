import { SEEDANCE_API_MODEL_SOURCE_IDS, isSeedanceApiModelKey } from '../seedance/modelVersions.ts';
import type { ModelSourceId, VisualAspectRatio } from '../../types.ts';
import type { SeedanceApiModelKey, SeedanceDraft } from '../seedance/types.ts';

export type CanvasNodeType = 'text' | 'image' | 'audio' | 'video';

export type CanvasNodeStatus = 'idle' | 'generating' | 'completed' | 'error';

export type CanvasVideoGenerationConfig = {
  sourceId: string;
  seedanceModelKey: SeedanceApiModelKey;
  seedanceDraft: SeedanceDraft;
};

const CANVAS_SEEDANCE_TEMPLATES = new Set<SeedanceDraft['baseTemplateId']>([
  'free_text', 'first_frame', 'first_last_frame', 'multi_image_reference',
  'motion_reference', 'camera_reference', 'effect_reference', 'video_edit',
  'video_extend', 'video_stitch', 'audio_guided',
]);

const CANVAS_VIDEO_SOURCE_IDS = new Set([
  ...SEEDANCE_API_MODEL_SOURCE_IDS,
  'aliyun.fastVideoModel', 'volcengine.videoModel', 'minimax.videoModel',
  'gemini.fastVideoModel', 'gemini.proVideoModel',
]);

function normalizeCanvasVideoGenerationConfig(value: unknown): CanvasVideoGenerationConfig | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<CanvasVideoGenerationConfig>;
  const rawDraft = raw.seedanceDraft && typeof raw.seedanceDraft === 'object' ? raw.seedanceDraft as Partial<SeedanceDraft> : {};
  const rawPrompt = rawDraft.prompt && typeof rawDraft.prompt === 'object' ? rawDraft.prompt as Partial<SeedanceDraft['prompt']> : {};
  const rawOptions = rawDraft.options && typeof rawDraft.options === 'object' ? rawDraft.options as Partial<SeedanceDraft['options']> : {};
  const validRatios: SeedanceDraft['options']['ratio'][] = ['adaptive', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9'];
  const validResolutions: SeedanceDraft['options']['resolution'][] = ['480p', '720p', '1080p'];
  const validFormats: NonNullable<SeedanceDraft['options']['outputFormat']>[] = ['mp4', 'mov'];
  const assets = Array.isArray(rawDraft.assets) ? rawDraft.assets.filter((asset): asset is SeedanceDraft['assets'][number] => {
    if (!asset || typeof asset !== 'object') return false;
    const candidate = asset as Partial<SeedanceDraft['assets'][number]>;
    return typeof candidate.id === 'string' && typeof candidate.urlOrData === 'string'
      && (candidate.kind === 'image' || candidate.kind === 'video' || candidate.kind === 'audio')
      && (candidate.role === 'first_frame' || candidate.role === 'last_frame' || candidate.role === 'reference_image' || candidate.role === 'reference_video' || candidate.role === 'reference_audio');
  }).map((asset) => ({ ...asset, label: typeof asset.label === 'string' ? asset.label : undefined })) : [];
  const baseTemplateId = CANVAS_SEEDANCE_TEMPLATES.has(rawDraft.baseTemplateId as SeedanceDraft['baseTemplateId'])
    ? rawDraft.baseTemplateId as SeedanceDraft['baseTemplateId']
    : 'free_text';
  const duration = rawOptions.duration === -1 || (typeof rawOptions.duration === 'number' && Number.isFinite(rawOptions.duration)) ? rawOptions.duration : 4;
  const seedanceModelKey = isSeedanceApiModelKey(raw.seedanceModelKey) ? raw.seedanceModelKey : 'standard';
  return {
    sourceId: typeof raw.sourceId === 'string' && CANVAS_VIDEO_SOURCE_IDS.has(raw.sourceId) ? raw.sourceId : 'seedance.seedance25ApiModel',
    seedanceModelKey,
    seedanceDraft: {
      baseTemplateId,
      overlayTemplateIds: Array.isArray(rawDraft.overlayTemplateIds) ? rawDraft.overlayTemplateIds.filter((item): item is SeedanceDraft['overlayTemplateIds'][number] => ['auto_audio', 'subtitle', 'bubble_dialogue', 'slogan', 'logo_reveal', 'return_last_frame', 'web_search'].includes(item)) : [],
      assets,
      prompt: { rawPrompt: typeof rawPrompt.rawPrompt === 'string' ? rawPrompt.rawPrompt : '', optimizedPrompt: typeof rawPrompt.optimizedPrompt === 'string' ? rawPrompt.optimizedPrompt : undefined, diagnostics: Array.isArray(rawPrompt.diagnostics) ? rawPrompt.diagnostics.filter((item): item is string => typeof item === 'string') : [] },
      options: {
        ratio: validRatios.includes(rawOptions.ratio as SeedanceDraft['options']['ratio']) ? rawOptions.ratio as SeedanceDraft['options']['ratio'] : '16:9',
        duration,
        resolution: validResolutions.includes(rawOptions.resolution as SeedanceDraft['options']['resolution']) ? rawOptions.resolution as SeedanceDraft['options']['resolution'] : '720p',
        outputFormat: validFormats.includes(rawOptions.outputFormat as NonNullable<SeedanceDraft['options']['outputFormat']>) ? rawOptions.outputFormat as NonNullable<SeedanceDraft['options']['outputFormat']> : 'mp4',
        generateAudio: rawOptions.generateAudio === true,
        returnLastFrame: rawOptions.returnLastFrame === true,
        useWebSearch: rawOptions.useWebSearch === true,
        watermark: rawOptions.watermark === true,
        safetyIdentifier: typeof rawOptions.safetyIdentifier === 'string' ? rawOptions.safetyIdentifier : undefined,
        moduleSettings: rawOptions.moduleSettings && typeof rawOptions.moduleSettings === 'object' ? rawOptions.moduleSettings : undefined,
      },
    },
  };
}

export type CanvasViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type CanvasPendingTask = {
  provider: 'seedance' | 'aliyun' | 'gemini' | 'volcengine' | 'minimax';
  id: string;
  mock: boolean;
};

function normalizePendingTask(value: unknown): CanvasPendingTask | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<CanvasPendingTask>;
  if (!['seedance', 'aliyun', 'gemini', 'volcengine', 'minimax'].includes(raw.provider || '') || typeof raw.id !== 'string' || !raw.id.trim()) return undefined;
  return { provider: raw.provider as CanvasPendingTask['provider'], id: raw.id, mock: raw.mock === true };
}

export type CanvasNode = {
  id: string;
  groupId?: string;
  referenceGroupIds?: string[];
  referenceNodeIds?: string[];
  mentionNodeIds?: string[];
  mediaWidth?: number;
  mediaHeight?: number;
  taskId?: string;
  pendingTask?: CanvasPendingTask;
  type: CanvasNodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  content: string;
  mediaUrl: string;
  mimeType: string;
  status: CanvasNodeStatus;
  error: string;
  videoGenerationConfig?: CanvasVideoGenerationConfig;
  imageGenerationConfig?: { sourceId: ModelSourceId; ratio: VisualAspectRatio; count?: number };
};

export type CanvasEdge = {
  id: string;
  source: string;
  target: string;
};

export type CanvasRecycleBinEntry = {
  id: string;
  deletedAt: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
};

export type CanvasFlow = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: CanvasViewport;
  recycleBin?: CanvasRecycleBinEntry[];
};

export const DEFAULT_CANVAS_VIEWPORT: CanvasViewport = { x: 0, y: 0, zoom: 1 };

export function createEmptyCanvasFlow(): CanvasFlow {
  return {
    nodes: [],
    edges: [],
    viewport: { ...DEFAULT_CANVAS_VIEWPORT },
  };
}

function normalizeNodeType(value: unknown): CanvasNodeType {
  return value === 'image' || value === 'audio' || value === 'video' ? value : 'text';
}

export function normalizeCanvasFlow(value: unknown): CanvasFlow {
  if (!value || typeof value !== 'object') {
    return createEmptyCanvasFlow();
  }
  const source = value as Partial<CanvasFlow>;
  const nodes = Array.isArray(source.nodes) ? source.nodes.map((node, index) => {
    const raw = (node || {}) as Partial<CanvasNode>;
    const type = normalizeNodeType(raw.type);
    return {
      id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : `canvas-node-${index + 1}`,
      type,
      groupId: typeof raw.groupId === 'string' && raw.groupId.trim() ? raw.groupId : undefined,
      referenceGroupIds: Array.isArray(raw.referenceGroupIds) ? [...new Set(raw.referenceGroupIds.filter((id): id is string => typeof id === 'string'))] : undefined,
      referenceNodeIds: Array.isArray(raw.referenceNodeIds) ? [...new Set(raw.referenceNodeIds.filter((id): id is string => typeof id === 'string'))] : undefined,
      mentionNodeIds: Array.isArray(raw.mentionNodeIds) ? [...new Set(raw.mentionNodeIds.filter((id): id is string => typeof id === 'string'))] : undefined,
      mediaWidth: typeof raw.mediaWidth === 'number' && Number.isFinite(raw.mediaWidth) && raw.mediaWidth > 0 ? raw.mediaWidth : undefined,
      mediaHeight: typeof raw.mediaHeight === 'number' && Number.isFinite(raw.mediaHeight) && raw.mediaHeight > 0 ? raw.mediaHeight : undefined,
      taskId: typeof raw.taskId === 'string' ? raw.taskId : undefined,
      pendingTask: normalizePendingTask(raw.pendingTask),
      x: Number.isFinite(raw.x) ? Number(raw.x) : index * 40,
      y: Number.isFinite(raw.y) ? Number(raw.y) : index * 40,
      width: Number.isFinite(raw.width) ? Math.max(180, Number(raw.width)) : 260,
      height: Number.isFinite(raw.height) ? Math.max(100, Number(raw.height)) : (type === 'text' ? 190 : 220),
      title: typeof raw.title === 'string' ? raw.title : type[0].toUpperCase() + type.slice(1),
      content: typeof raw.content === 'string' ? raw.content : '',
      mediaUrl: typeof raw.mediaUrl === 'string' ? raw.mediaUrl : '',
      mimeType: typeof raw.mimeType === 'string' ? raw.mimeType : '',
      status: raw.status === 'generating' || raw.status === 'completed' || raw.status === 'error' ? raw.status : 'idle',
      error: typeof raw.error === 'string' ? raw.error : '',
      videoGenerationConfig: normalizeCanvasVideoGenerationConfig(raw.videoGenerationConfig),
      imageGenerationConfig: raw.imageGenerationConfig && typeof raw.imageGenerationConfig.sourceId === 'string'
        && ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'].includes(raw.imageGenerationConfig.ratio)
        ? { sourceId: raw.imageGenerationConfig.sourceId, ratio: raw.imageGenerationConfig.ratio, ...([1, 2, 4].includes(raw.imageGenerationConfig.count) ? { count: raw.imageGenerationConfig.count } : {}) } : undefined,
    } satisfies CanvasNode;
  }) : [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = Array.isArray(source.edges) ? source.edges
    .filter((edge): edge is CanvasEdge => Boolean(edge && typeof edge === 'object'))
    .map((edge, index) => ({
      id: typeof edge.id === 'string' && edge.id.trim() ? edge.id : `canvas-edge-${index + 1}`,
      source: typeof edge.source === 'string' ? edge.source : '',
      target: typeof edge.target === 'string' ? edge.target : '',
    }))
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target) && edge.source !== edge.target) : [];
  const recycleBin = Array.isArray(source.recycleBin) ? source.recycleBin.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || !Array.isArray(entry.nodes)) return [];
    const fragment = normalizeCanvasFlow({ nodes: entry.nodes, edges: [] });
    if (!fragment.nodes.length) return [];
    const edges = Array.isArray(entry.edges) ? entry.edges.filter((edge) => edge && typeof edge.id === 'string' && typeof edge.source === 'string' && typeof edge.target === 'string' && edge.source !== edge.target) : [];
    return [{ id: entry.id, deletedAt: typeof entry.deletedAt === 'string' ? entry.deletedAt : '', nodes: fragment.nodes, edges }];
  }) : [];
  const viewport = source.viewport || DEFAULT_CANVAS_VIEWPORT;
  return {
    nodes,
    edges,
    recycleBin,
    viewport: {
      x: Number.isFinite(viewport.x) ? Number(viewport.x) : 0,
      y: Number.isFinite(viewport.y) ? Number(viewport.y) : 0,
      zoom: Number.isFinite(viewport.zoom) ? Math.min(2.5, Math.max(0.1, Number(viewport.zoom))) : 1,
    },
  };
}
