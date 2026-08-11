import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from 'react';
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Clock3,
  Download,
  FolderOpen,
  ImagePlus,
  Link2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Scissors,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from 'lucide-react';

import { StudioModal, StudioPage, StudioPanel, StudioSelect, cx } from '../../../components/studio/StudioPrimitives.tsx';
import { isAssetLibraryUrl } from '../../../services/assetLibrary.ts';
import { resolveSeedanceBridgeUrl } from '../../../services/seedanceBridgeUrl.ts';
import { isTosConfigComplete, uploadFileToTos, uploadVideoToTos } from '../../../services/tosUploadService.ts';
import type { Project, TosConfig } from '../../../types.ts';
import type { AssetLibraryStatusItem } from '../../assetLibrary/utils/assetLibraryItems.ts';
import { createSeedanceTask, deleteSeedanceTask, getSeedanceTask } from '../../seedance/services/seedanceApiService.ts';
import {
  buildVideoEditPrompt,
  buildVideoEditSeedanceDraft,
  createEmptyVideoEditTask,
  mapVideoEditRemoteStatus,
  mergeVideoEditApiTask,
  normalizeVideoEditSourceDuration,
  validateVideoEditProject,
} from '../services/videoEditProject.ts';
import type { VideoEditOperation, VideoEditProject, VideoEditTaskStatus } from '../types.ts';

type VideoEditWorkspaceProps = {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
  tosConfig?: TosConfig;
  pollIntervalSec: number;
  bridgeUrl: string;
  availableVideoAssets: AssetLibraryStatusItem[];
  onOpenApiConfig: () => void;
  onOpenAssetLibrary: () => void;
};

const OPERATIONS: Array<{
  id: VideoEditOperation;
  label: string;
  description: string;
}> = [
  { id: 'add', label: '新增', description: '向原视频加入对象、元素或效果' },
  { id: 'remove', label: '移除', description: '擦除目标并自然补全背景' },
  { id: 'replace', label: '替换', description: '替换人物、物体、服装或环境' },
];

const STATUS_META: Record<VideoEditTaskStatus, { label: string; className: string }> = {
  idle: { label: '尚未提交', className: 'border-white/10 bg-white/5 text-[var(--studio-muted)]' },
  uploading: { label: '上传中', className: 'border-sky-400/20 bg-sky-400/10 text-sky-200' },
  submitting: { label: '提交中', className: 'border-sky-400/20 bg-sky-400/10 text-sky-200' },
  queued: { label: '云端排队', className: 'border-amber-400/20 bg-amber-400/10 text-amber-200' },
  generating: { label: '编辑中', className: 'border-violet-400/20 bg-violet-400/10 text-violet-200' },
  completed: { label: '编辑完成', className: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200' },
  failed: { label: '编辑失败', className: 'border-red-400/20 bg-red-400/10 text-red-200' },
  cancelled: { label: '已取消', className: 'border-white/10 bg-white/5 text-[var(--studio-muted)]' },
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取图片失败。'));
    reader.readAsDataURL(file);
  });
}

function readVideoMetadata(file: File): Promise<{ durationSec?: number; width?: number; height?: number }> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);
    const finish = (result: { durationSec?: number; width?: number; height?: number }) => {
      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };
    video.preload = 'metadata';
    video.onloadedmetadata = () => finish({
      durationSec: Number.isFinite(video.duration) ? video.duration : undefined,
      width: video.videoWidth || undefined,
      height: video.videoHeight || undefined,
    });
    video.onerror = () => finish({});
    video.src = objectUrl;
  });
}

function formatDuration(durationSec?: number) {
  if (!durationSec) return '时长由云端识别';
  const seconds = Math.round(durationSec);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function isActiveStatus(status: VideoEditTaskStatus) {
  return status === 'submitting' || status === 'queued' || status === 'generating';
}

export function VideoEditWorkspace({
  project,
  setProject,
  tosConfig,
  pollIntervalSec,
  bridgeUrl,
  availableVideoAssets,
  onOpenApiConfig,
  onOpenAssetLibrary,
}: VideoEditWorkspaceProps) {
  const flow = project.videoEditFlow;
  const [error, setError] = useState('');
  const [isUploadingSource, setIsUploadingSource] = useState(false);
  const [isUploadingReferences, setIsUploadingReferences] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
  const [selectingAssetId, setSelectingAssetId] = useState('');
  const refreshPendingRef = useRef(false);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const selectableVideoAssets = useMemo(() => availableVideoAssets
    .filter((item) => item.kind === 'video' && item.url.trim())
    .filter((item, index, items) => items.findIndex((candidate) => candidate.url.trim() === item.url.trim()) === index), [availableVideoAssets]);

  const updateFlow = useCallback((updater: (current: VideoEditProject) => VideoEditProject) => {
    setProject((current) => current.id === project.id
      ? { ...current, videoEditFlow: updater(current.videoEditFlow) }
      : current);
  }, [project.id, setProject]);

  const resetTaskForEdit = useCallback((current: VideoEditProject): VideoEditProject => ({
    ...current,
    compiledPrompt: '',
    task: createEmptyVideoEditTask(),
  }), []);

  const handleSourceUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!/\.(mp4|mov)$/iu.test(file.name) && !['video/mp4', 'video/quicktime'].includes(file.type)) {
      setError('仅支持 MP4 或 MOV 视频。');
      return;
    }
    if (!isTosConfigComplete(tosConfig)) {
      setError('本地视频需要先配置 TOS 才能提交给 Seedance；也可以直接填写公网视频 URL。');
      return;
    }

    setError('');
    setIsUploadingSource(true);
    setUploadProgress(0);
    try {
      const metadata = await readVideoMetadata(file);
      const normalizedDurationSec = normalizeVideoEditSourceDuration(metadata.durationSec);
      if (normalizedDurationSec && (normalizedDurationSec < 4 || normalizedDurationSec > 30)) {
        throw new Error('待编辑视频时长需在 4–30 秒之间。');
      }
      const uploaded = await uploadVideoToTos(file, tosConfig!, setUploadProgress);
      updateFlow((current) => resetTaskForEdit({
        ...current,
        sourceVideo: {
          url: uploaded.url,
          fileName: file.name,
          storageKey: uploaded.key,
          origin: 'upload',
          durationSec: normalizedDurationSec,
          width: metadata.width,
          height: metadata.height,
          sizeBytes: file.size,
        },
      }));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
    } finally {
      setIsUploadingSource(false);
    }
  };

  const handleReferenceUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files: File[] = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = '';
    if (files.length === 0) return;
    if (flow.referenceImages.length + files.length > 8) {
      setError('参考图片最多 8 张。');
      return;
    }

    setError('');
    setIsUploadingReferences(true);
    try {
      const references = [];
      for (const file of files) {
        const uploaded = isTosConfigComplete(tosConfig)
          ? await uploadFileToTos(file, tosConfig!, { mediaLabel: '参考图片', defaultPrefix: 'video-edit-images' })
          : { url: await readFileAsDataUrl(file), key: '' };
        references.push({
          id: crypto.randomUUID(),
          url: uploaded.url,
          fileName: file.name,
          storageKey: uploaded.key,
        });
      }
      updateFlow((current) => resetTaskForEdit({
        ...current,
        referenceImages: [...current.referenceImages, ...references].slice(0, 8),
      }));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
    } finally {
      setIsUploadingReferences(false);
    }
  };

  const handleSelectAssetVideo = async (asset: AssetLibraryStatusItem) => {
    if (selectingAssetId) return;
    setSelectingAssetId(asset.id);
    setError('');
    try {
      let sourceUrl = asset.url.trim();
      let storageKey = '';
      let durationSec: number | undefined;
      let width: number | undefined;
      let height: number | undefined;
      let sizeBytes: number | undefined;

      if (isAssetLibraryUrl(sourceUrl) || sourceUrl.startsWith('blob:') || sourceUrl.startsWith('data:')) {
        if (!isTosConfigComplete(tosConfig)) {
          throw new Error('该素材保存在本地资产库，需要先配置 TOS 才能提交给 Seedance。');
        }
        const response = await fetch(resolveSeedanceBridgeUrl(sourceUrl, bridgeUrl));
        if (!response.ok) throw new Error(`读取资产库视频失败 (${response.status})`);
        const blob = await response.blob();
        const mimeType = blob.type || (/\.mov$/iu.test(asset.title) ? 'video/quicktime' : 'video/mp4');
        const extension = mimeType === 'video/quicktime' ? 'mov' : 'mp4';
        const fileName = /\.(mp4|mov)$/iu.test(asset.title) ? asset.title : `${asset.title}.${extension}`;
        const file = new File([blob], fileName, { type: mimeType });
        const metadata = await readVideoMetadata(file);
        const normalizedDurationSec = normalizeVideoEditSourceDuration(metadata.durationSec);
        if (normalizedDurationSec && (normalizedDurationSec < 4 || normalizedDurationSec > 30)) {
          throw new Error('待编辑视频时长需在 4–30 秒之间。');
        }
        const uploaded = await uploadVideoToTos(file, tosConfig!);
        sourceUrl = uploaded.url;
        storageKey = uploaded.key;
        durationSec = normalizedDurationSec;
        width = metadata.width;
        height = metadata.height;
        sizeBytes = file.size;
      }

      updateFlow((current) => resetTaskForEdit({
        ...current,
        sourceVideo: {
          url: sourceUrl,
          fileName: asset.title,
          storageKey,
          origin: storageKey ? 'upload' : 'url',
          durationSec,
          width,
          height,
          sizeBytes,
        },
      }));
      setIsAssetPickerOpen(false);
    } catch (assetError) {
      setError(assetError instanceof Error ? assetError.message : String(assetError));
    } finally {
      setSelectingAssetId('');
    }
  };

  const refreshTask = useCallback(async (silent = false) => {
    const taskId = project.videoEditFlow.task.taskId.trim();
    if (!taskId || refreshPendingRef.current) return;
    refreshPendingRef.current = true;
    if (!silent) setIsRefreshing(true);
    try {
      const result = await getSeedanceTask(taskId);
      updateFlow((current) => ({
        ...current,
        task: mergeVideoEditApiTask(current.task, result),
      }));
      if (mapVideoEditRemoteStatus(result.status) === 'failed') {
        setError(result.error?.message || '视频编辑任务失败。');
      }
    } catch (refreshError) {
      if (!silent) setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    } finally {
      refreshPendingRef.current = false;
      if (!silent) setIsRefreshing(false);
    }
  }, [project.videoEditFlow.task.taskId, updateFlow]);

  useEffect(() => {
    if (!flow.task.taskId || !isActiveStatus(flow.task.status)) return;
    const interval = window.setInterval(
      () => void refreshTask(true),
      Math.max(5, pollIntervalSec || 15) * 1000,
    );
    return () => window.clearInterval(interval);
  }, [flow.task.status, flow.task.taskId, pollIntervalSec, refreshTask]);

  const handleSubmit = async () => {
    const issues = validateVideoEditProject(flow);
    if (issues.length > 0) {
      setError(issues[0]);
      return;
    }

    setError('');
    setIsSubmitting(true);
    const compiledPrompt = buildVideoEditPrompt(flow);
    updateFlow((current) => ({
      ...current,
      compiledPrompt,
      task: {
        ...createEmptyVideoEditTask(),
        status: 'submitting',
        startedAt: new Date().toISOString(),
      },
    }));
    try {
      const task = await createSeedanceTask(buildVideoEditSeedanceDraft(flow), 'seedance25');
      updateFlow((current) => ({
        ...current,
        compiledPrompt,
        task: mergeVideoEditApiTask(current.task, task),
      }));
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : String(submitError);
      setError(message);
      updateFlow((current) => ({
        ...current,
        task: {
          ...current.task,
          status: 'failed',
          error: message,
          finishedAt: new Date().toISOString(),
        },
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!flow.task.taskId || isCancelling) return;
    setIsCancelling(true);
    setError('');
    try {
      await deleteSeedanceTask(flow.task.taskId);
      updateFlow((current) => ({
        ...current,
        task: {
          ...current.task,
          status: 'cancelled',
          remoteStatus: 'cancelled',
          finishedAt: new Date().toISOString(),
        },
      }));
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : String(cancelError));
    } finally {
      setIsCancelling(false);
    }
  };

  const statusMeta = STATUS_META[flow.task.status];
  const promptPreview = buildVideoEditPrompt(flow);
  const active = isActiveStatus(flow.task.status) || isSubmitting;

  return (
    <StudioPage className="studio-page-wide pb-12">
      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.75fr)]">
        <div className="space-y-5">
          <StudioPanel className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="studio-eyebrow">Edit Operation</div>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--studio-text)]">选择编辑方式</h2>
                <p className="mt-2 text-sm text-[var(--studio-muted)]">只改变指定内容，其余画面尽量保持原样。</p>
              </div>
              <span className={cx('inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium', statusMeta.className)}>
                {active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : flow.task.status === 'completed' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                {statusMeta.label}
              </span>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {OPERATIONS.map((operation) => (
                <button
                  key={operation.id}
                  type="button"
                  onClick={() => updateFlow((current) => resetTaskForEdit({ ...current, operation: operation.id }))}
                  className={cx(
                    'rounded-2xl border p-4 text-left transition-all duration-200',
                    flow.operation === operation.id
                      ? 'border-violet-400/35 bg-violet-400/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                      : 'border-[var(--studio-border)] bg-white/[0.025] hover:border-[var(--studio-border-strong)] hover:bg-white/[0.045]',
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-[var(--studio-text)]">
                    <Scissors className="h-4 w-4" />
                    {operation.label}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[var(--studio-muted)]">{operation.description}</p>
                </button>
              ))}
            </div>
          </StudioPanel>

          <StudioPanel className="p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="studio-eyebrow">Source Video</div>
                <h2 className="mt-2 text-xl font-semibold text-[var(--studio-text)]">待编辑视频</h2>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setIsAssetPickerOpen(true);
                  }}
                  className="studio-button studio-button-secondary px-3 py-2 text-xs"
                >
                  <Archive className="h-3.5 w-3.5" /> 从资产库选择
                </button>
                {flow.sourceVideo ? (
                  <button
                    type="button"
                    onClick={() => updateFlow((current) => resetTaskForEdit({ ...current, sourceVideo: null }))}
                    className="studio-button studio-button-secondary px-3 py-2 text-xs"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> 清除
                  </button>
                ) : null}
              </div>
            </div>

            {flow.sourceVideo ? (
              <div className="mt-5 overflow-hidden rounded-2xl border border-[var(--studio-border)] bg-black/30">
                <video src={flow.sourceVideo.url} controls playsInline className="aspect-video w-full bg-black object-contain" />
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 px-4 py-3 text-xs text-[var(--studio-muted)]">
                  <span className="max-w-[70%] truncate">{flow.sourceVideo.fileName || flow.sourceVideo.url}</span>
                  <span>{formatDuration(flow.sourceVideo.durationSec)}{flow.sourceVideo.width ? ` · ${flow.sourceVideo.width}×${flow.sourceVideo.height}` : ''}</span>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => sourceInputRef.current?.click()}
                className="mt-5 flex min-h-48 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--studio-border-strong)] bg-white/[0.025] px-6 text-center transition-colors hover:bg-white/[0.045]"
              >
                {isUploadingSource ? <Loader2 className="h-7 w-7 animate-spin text-sky-300" /> : <Upload className="h-7 w-7 text-sky-300" />}
                <span className="mt-4 text-sm font-medium text-[var(--studio-text)]">{isUploadingSource ? `正在上传 ${uploadProgress}%` : '上传 MP4 / MOV'}</span>
                <span className="mt-2 text-xs text-[var(--studio-muted)]">建议 4–30 秒；保持原视频比例与时长</span>
              </button>
            )}
            <input ref={sourceInputRef} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" className="hidden" onChange={(event) => void handleSourceUpload(event)} />

            <div className="mt-4 flex items-center gap-3">
              <Link2 className="h-4 w-4 shrink-0 text-[var(--studio-dim)]" />
              <input
                value={flow.sourceVideo?.origin === 'url' ? flow.sourceVideo.url : ''}
                onChange={(event) => {
                  const url = event.target.value;
                  updateFlow((current) => resetTaskForEdit({
                    ...current,
                    sourceVideo: url.trim() ? { url, fileName: '', origin: 'url' } : null,
                  }));
                }}
                placeholder="或粘贴可公开访问的视频 URL"
                className="studio-input"
              />
            </div>
            {!isTosConfigComplete(tosConfig) ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.07] px-3 py-2 text-xs text-amber-100/80">
                <span>上传本地视频前需要配置 TOS。</span>
                <button type="button" onClick={onOpenApiConfig} className="font-medium text-amber-200 hover:text-amber-100">去配置</button>
              </div>
            ) : null}
          </StudioPanel>

          <StudioPanel className="p-6">
            <div className="studio-eyebrow">Edit Brief</div>
            <h2 className="mt-2 text-xl font-semibold text-[var(--studio-text)]">描述你要改什么</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-[var(--studio-muted)]">编辑对象 / 区域</span>
                <textarea
                  value={flow.targetDescription}
                  onChange={(event) => updateFlow((current) => resetTaskForEdit({ ...current, targetDescription: event.target.value }))}
                  placeholder="例如：画面右侧桌面上的红色杯子"
                  className="studio-input min-h-28 resize-y"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-[var(--studio-muted)]">{flow.operation === 'remove' ? '补全要求（可选）' : '期望结果'}</span>
                <textarea
                  value={flow.resultDescription}
                  onChange={(event) => updateFlow((current) => resetTaskForEdit({ ...current, resultDescription: event.target.value }))}
                  placeholder={flow.operation === 'remove' ? '例如：用连续的木纹桌面自然补全' : '例如：替换为透明玻璃杯，保持原有反光与透视'}
                  className="studio-input min-h-28 resize-y"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-[var(--studio-muted)]">出现时间（可选）</span>
                <input
                  value={flow.temporalHint}
                  onChange={(event) => updateFlow((current) => resetTaskForEdit({ ...current, temporalHint: event.target.value }))}
                  placeholder="例如：00:03–00:08，或全程"
                  className="studio-input"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-[var(--studio-muted)]">画面位置（可选）</span>
                <input
                  value={flow.spatialHint}
                  onChange={(event) => updateFlow((current) => resetTaskForEdit({ ...current, spatialHint: event.target.value }))}
                  placeholder="例如：右下角、人物手中"
                  className="studio-input"
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {([
                ['preserveSubject', '保持主体'],
                ['preserveBackground', '保持背景'],
                ['preserveCamera', '保持镜头'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => updateFlow((current) => resetTaskForEdit({ ...current, [key]: !current[key] }))}
                  className={cx(
                    'rounded-full border px-3 py-1.5 text-xs transition-colors',
                    flow[key]
                      ? 'border-[var(--studio-accent-indigo-border)] bg-[var(--studio-accent-indigo-bg)] text-[var(--studio-accent-indigo-text)]'
                      : 'border-[var(--studio-border)] text-[var(--studio-muted)] hover:text-[var(--studio-text)]',
                  )}
                >
                  {flow[key] ? '✓ ' : ''}{label}
                </button>
              ))}
            </div>
          </StudioPanel>

          <StudioPanel className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="studio-eyebrow">Visual Reference</div>
                <h2 className="mt-2 text-xl font-semibold text-[var(--studio-text)]">参考图片</h2>
                <p className="mt-2 text-xs text-[var(--studio-muted)]">可选，最多 8 张。替换对象时建议提供清晰多角度参考。</p>
              </div>
              <button
                type="button"
                onClick={() => referenceInputRef.current?.click()}
                disabled={isUploadingReferences || flow.referenceImages.length >= 8}
                className="studio-button studio-button-secondary px-3 py-2 text-xs disabled:opacity-50"
              >
                {isUploadingReferences ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                添加图片
              </button>
              <input ref={referenceInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => void handleReferenceUpload(event)} />
            </div>
            {flow.referenceImages.length > 0 ? (
              <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {flow.referenceImages.map((image, index) => (
                  <div key={image.id} className="group relative aspect-square overflow-hidden rounded-2xl border border-[var(--studio-border)] bg-black/20">
                    <img src={image.url} alt={`参考图 ${index + 1}`} className="h-full w-full object-cover" />
                    <span className="absolute bottom-2 left-2 rounded-full bg-black/65 px-2 py-0.5 text-[10px] text-white">图片{index + 1}</span>
                    <button
                      type="button"
                      onClick={() => updateFlow((current) => resetTaskForEdit({
                        ...current,
                        referenceImages: current.referenceImages.filter((item) => item.id !== image.id),
                      }))}
                      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label={`移除参考图 ${index + 1}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-[var(--studio-border)] px-5 py-8 text-center text-sm text-[var(--studio-dim)]">没有参考图片也可以直接编辑</div>
            )}
          </StudioPanel>
        </div>

        <div className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <StudioPanel className="p-6" tone="contrast">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="studio-eyebrow">Seedance 2.5</div>
                <h2 className="mt-2 text-xl font-semibold text-[var(--studio-text)]">输出设置</h2>
              </div>
              <WandSparkles className="h-5 w-5 text-violet-300" />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <label className="space-y-2">
                <span className="text-xs text-[var(--studio-muted)]">清晰度</span>
                <StudioSelect value={flow.resolution} onChange={(event) => updateFlow((current) => resetTaskForEdit({ ...current, resolution: event.target.value as '480p' | '720p' }))}>
                  <option value="720p">720p</option>
                  <option value="480p">480p</option>
                </StudioSelect>
              </label>
              <label className="space-y-2">
                <span className="text-xs text-[var(--studio-muted)]">格式</span>
                <StudioSelect value={flow.outputFormat} onChange={(event) => updateFlow((current) => resetTaskForEdit({ ...current, outputFormat: event.target.value as 'mp4' | 'mov' }))}>
                  <option value="mp4">MP4</option>
                  <option value="mov">MOV</option>
                </StudioSelect>
              </label>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => updateFlow((current) => resetTaskForEdit({ ...current, generateAudio: !current.generateAudio }))}
                className={cx('rounded-xl border px-3 py-2 text-xs', flow.generateAudio ? 'border-[var(--studio-accent-indigo-border)] bg-[var(--studio-accent-indigo-bg)] text-[var(--studio-accent-indigo-text)]' : 'border-[var(--studio-border)] text-[var(--studio-muted)]')}
              >
                {flow.generateAudio ? '✓ 保留 / 生成声音' : '无声输出'}
              </button>
              <button
                type="button"
                onClick={() => updateFlow((current) => resetTaskForEdit({ ...current, watermark: !current.watermark }))}
                className={cx('rounded-xl border px-3 py-2 text-xs', flow.watermark ? 'border-[var(--studio-accent-indigo-border)] bg-[var(--studio-accent-indigo-bg)] text-[var(--studio-accent-indigo-text)]' : 'border-[var(--studio-border)] text-[var(--studio-muted)]')}
              >
                {flow.watermark ? '✓ 添加水印' : '不添加水印'}
              </button>
            </div>
            <div className="mt-4 rounded-xl border border-white/8 bg-black/10 px-3 py-2 text-xs leading-5 text-[var(--studio-dim)]">
              画幅：跟随原视频 · 时长：跟随原视频 · 模型：Seedance 2.5
            </div>

            {error || flow.task.error ? (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-400/18 bg-red-400/[0.08] px-3 py-3 text-xs leading-5 text-red-100">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error || flow.task.error}</span>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={active || isUploadingSource || isUploadingReferences}
              className="studio-button studio-button-primary mt-5 w-full justify-center py-3 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {active ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
              {active ? statusMeta.label : flow.task.videoUrl ? '重新生成编辑结果' : '开始编辑视频'}
            </button>
            {isActiveStatus(flow.task.status) && flow.task.taskId ? (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => void refreshTask()} disabled={isRefreshing} className="studio-button studio-button-secondary justify-center px-3 py-2 text-xs">
                  <RefreshCw className={cx('h-3.5 w-3.5', isRefreshing && 'animate-spin')} /> 刷新状态
                </button>
                <button type="button" onClick={() => void handleCancel()} disabled={isCancelling} className="studio-button studio-button-secondary justify-center px-3 py-2 text-xs">
                  {isCancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} 取消任务
                </button>
              </div>
            ) : null}
          </StudioPanel>

          <StudioPanel className="p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="studio-eyebrow">Result Compare</div>
                <h2 className="mt-2 text-xl font-semibold text-[var(--studio-text)]">编辑结果</h2>
              </div>
              {flow.task.videoUrl ? (
                <a href={flow.task.videoUrl} download className="studio-button studio-button-secondary px-3 py-2 text-xs">
                  <Download className="h-3.5 w-3.5" /> 下载
                </a>
              ) : null}
            </div>

            {flow.task.videoUrl ? (
              <div className="mt-5 space-y-4">
                <div className="grid gap-3 min-[1800px]:grid-cols-2">
                  <div>
                    <div className="mb-2 text-xs text-[var(--studio-dim)]">原视频</div>
                    <video src={flow.sourceVideo?.url} controls playsInline className="aspect-video w-full rounded-xl border border-[var(--studio-border)] bg-black object-contain" />
                  </div>
                  <div>
                    <div className="mb-2 text-xs text-emerald-300">编辑后</div>
                    <video src={flow.task.videoUrl} controls playsInline className="aspect-video w-full rounded-xl border border-emerald-400/20 bg-black object-contain" />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updateFlow((current) => ({
                    ...current,
                    sourceVideo: {
                      url: current.task.videoUrl,
                      fileName: `edited-${current.task.taskId}.${current.outputFormat}`,
                      origin: 'result',
                    },
                    task: createEmptyVideoEditTask(),
                    compiledPrompt: '',
                  }))}
                  className="studio-button studio-button-secondary w-full justify-center px-3 py-2 text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> 将结果作为新源视频
                </button>
              </div>
            ) : (
              <div className="mt-5 flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--studio-border)] bg-white/[0.02] px-6 text-center">
                {active ? <Loader2 className="h-7 w-7 animate-spin text-violet-300" /> : <WandSparkles className="h-7 w-7 text-[var(--studio-dim)]" />}
                <p className="mt-4 text-sm font-medium text-[var(--studio-text)]">{active ? 'Seedance 正在处理编辑任务' : '生成后在这里对比原片和结果'}</p>
                <p className="mt-2 text-xs leading-5 text-[var(--studio-muted)]">编辑任务是异步执行的，离开页面后项目仍会保存任务 ID。</p>
              </div>
            )}
          </StudioPanel>

          <details className="rounded-2xl border border-[var(--studio-border)] bg-white/[0.025] p-4">
            <summary className="cursor-pointer text-xs font-medium text-[var(--studio-muted)]">查看提交给 Seedance 的结构化提示词</summary>
            <pre className="mt-4 whitespace-pre-wrap text-xs leading-5 text-[var(--studio-dim)]">{flow.compiledPrompt || promptPreview}</pre>
          </details>
        </div>
      </div>

      <StudioModal open={isAssetPickerOpen} onClose={() => !selectingAssetId && setIsAssetPickerOpen(false)} className="max-w-5xl">
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-5">
            <div>
              <div className="studio-eyebrow">Asset Library</div>
              <h2 className="mt-2 text-2xl font-semibold text-[var(--studio-text)]">选择待编辑视频</h2>
              <p className="mt-2 text-sm text-[var(--studio-muted)]">共 {selectableVideoAssets.length} 个视频素材，选择后将作为本次编辑的原视频。</p>
            </div>
            <button
              type="button"
              onClick={() => setIsAssetPickerOpen(false)}
              disabled={Boolean(selectingAssetId)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--studio-border)] text-[var(--studio-muted)] transition-colors hover:text-[var(--studio-text)] disabled:opacity-40"
              aria-label="关闭资产选择"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {error ? (
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-[var(--studio-accent-red-border)] bg-[var(--studio-accent-red-bg)] px-3 py-3 text-xs leading-5 text-[var(--studio-accent-red-text)]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {selectableVideoAssets.length > 0 ? (
            <div className="mt-6 grid max-h-[64vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
              {selectableVideoAssets.map((asset) => {
                const isSelecting = selectingAssetId === asset.id;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => void handleSelectAssetVideo(asset)}
                    disabled={Boolean(selectingAssetId)}
                    className="group overflow-hidden rounded-2xl border border-[var(--studio-border)] bg-white/[0.025] text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--studio-accent-indigo-border)] hover:bg-[var(--studio-accent-indigo-bg)] disabled:cursor-wait"
                  >
                    <div className="relative aspect-video overflow-hidden bg-black/70">
                      <video src={asset.url} preload="metadata" muted playsInline className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                      <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-1 text-[10px] text-white/90">
                        {asset.savedToLibrary ? '已保存到资产库' : '项目视频'}
                      </span>
                      {isSelecting ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white">
                          <Loader2 className="h-6 w-6 animate-spin" />
                        </span>
                      ) : null}
                    </div>
                    <div className="p-4">
                      <div className="truncate text-sm font-semibold text-[var(--studio-text)]">{asset.title}</div>
                      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-[var(--studio-muted)]">
                        <span className="truncate">{asset.projectName}</span>
                        <span className="shrink-0">{asset.groupName}</span>
                      </div>
                      <div className="mt-2 truncate text-[11px] text-[var(--studio-dim)]">{asset.sourceLabel}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-6 flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--studio-border)] bg-white/[0.02] px-6 text-center">
              <FolderOpen className="h-8 w-8 text-[var(--studio-dim)]" />
              <div className="mt-4 text-sm font-medium text-[var(--studio-text)]">资产库中还没有视频</div>
              <p className="mt-2 text-xs leading-5 text-[var(--studio-muted)]">先从已有项目保存视频素材，或直接上传本地视频。</p>
              <button
                type="button"
                onClick={() => {
                  setIsAssetPickerOpen(false);
                  onOpenAssetLibrary();
                }}
                className="studio-button studio-button-secondary mt-5 px-4 py-2 text-xs"
              >
                <Archive className="h-3.5 w-3.5" /> 打开资产库
              </button>
            </div>
          )}
        </div>
      </StudioModal>
    </StudioPage>
  );
}
