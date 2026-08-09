import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, DollarSign, Image as ImageIcon, RefreshCw, Sparkles, Upload, Users, X } from 'lucide-react';

import { StudioModal, StudioPage, StudioPanel, StudioSelect, cx } from '../../../components/studio/StudioPrimitives.tsx';
import type { ProjectGroupImageAsset } from '../../../services/projectGroups.ts';
import type { ImageCreationDraft, ImageCreationGroupOption, ImageCreationRecord, ImageCreationReference } from '../types.ts';
import { PortraitLibraryView } from '../../portraitLibrary/components/PortraitLibraryView.tsx';
import {
  OPENAI_IMAGE_OUTPUT_FORMAT_OPTIONS,
  OPENAI_IMAGE_QUALITY_OPTIONS,
  OPENAI_IMAGE_SIZE_OPTIONS,
  estimateOpenAIImageCost,
} from '../utils/openaiImagePricing.ts';

type ImageCreationWorkspaceProps = {
  records: ImageCreationRecord[];
  groupOptions: ImageCreationGroupOption[];
  availableReferenceImages: ProjectGroupImageAsset[];
  usdToCnyRate: number;
  isGenerating: boolean;
  error: string;
  onGenerate: (draft: ImageCreationDraft) => void | Promise<unknown>;
  onPreviewImage: (url: string) => void;
};

type PendingPerson = {
  id: string;
  prompt: string;
  groupName: string;
  createdAt: string;
  status: 'generating' | 'failed';
  draft: ImageCreationDraft;
  error?: string;
};

type ImageCreationTaskListItem = {
  id: string;
  status: 'generating' | 'completed' | 'failed';
  prompt: string;
  groupName: string;
  createdAt: string;
  outputs: Array<{ id: string; title: string; url: string }>;
  references: ImageCreationReference[];
  request: {
    size: string;
    quality: ImageCreationDraft['quality'];
    outputFormat: ImageCreationDraft['outputFormat'];
    outputCompression?: number;
    moderation: ImageCreationDraft['moderation'];
    n: number;
  };
  model?: string;
  error?: string;
  draft: ImageCreationDraft;
};

function buildDefaultGroupName(groups: ImageCreationGroupOption[]) {
  const existing = new Set(groups.map((group) => group.name.trim()).filter(Boolean));
  let index = 1;
  while (existing.has(`新分组 ${index}`)) {
    index += 1;
  }
  return `新分组 ${index}`;
}

function createDefaultDraft(groupOptions: ImageCreationGroupOption[]): ImageCreationDraft {
  const firstGroup = groupOptions[0];
  return {
    title: '',
    groupMode: firstGroup ? 'existing' : 'new',
    existingGroupId: firstGroup?.id || '',
    newGroupName: buildDefaultGroupName(groupOptions),
    prompt: '',
    size: '1024x1024',
    quality: 'medium',
    outputFormat: 'png',
    outputCompression: 90,
    moderation: 'auto',
    n: 1,
    references: [],
  };
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('读取图片失败。'));
    reader.readAsDataURL(file);
  });
}

function formatRecordDate(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return '';
  }
  return new Date(timestamp).toLocaleString('zh-CN');
}

function truncateText(value: string, limit = 64) {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit)}...`;
}

function dedupeReferences(references: ImageCreationReference[]) {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = reference.sourceUrl.trim();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  }).slice(0, 8);
}

function getStatusTone(status: 'generating' | 'completed' | 'failed') {
  if (status === 'completed') {
    return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200';
  }
  if (status === 'failed') {
    return 'border-[var(--studio-accent-red-border)] bg-[var(--studio-accent-red-bg)] text-[var(--studio-accent-red-text)]';
  }
  return 'border-amber-500/20 bg-amber-500/10 text-amber-100';
}

function getStatusLabel(status: 'generating' | 'completed' | 'failed') {
  if (status === 'completed') return '已完成';
  if (status === 'failed') return '失败';
  return '生成中';
}

function isPortraitReferenceImage(image: ProjectGroupImageAsset) {
  return image.sourceType === 'portrait-public'
    || image.sourceType === 'portrait-real'
    || image.sourceType === 'portrait-virtual'
    || image.sourceType === 'portrait-seedream';
}

function getTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function buildDraftFromRecord(record: ImageCreationRecord, groupOptions: ImageCreationGroupOption[]): ImageCreationDraft {
  const matchingGroup = groupOptions.find((group) => group.id === record.groupId || group.name === record.groupName);
  return {
    title: '',
    groupMode: matchingGroup ? 'existing' : 'new',
    existingGroupId: matchingGroup?.id || '',
    newGroupName: matchingGroup ? buildDefaultGroupName(groupOptions) : record.groupName || buildDefaultGroupName(groupOptions),
    prompt: record.prompt,
    size: record.request.size,
    quality: record.request.quality,
    outputFormat: record.request.outputFormat,
    outputCompression: record.request.outputCompression ?? 90,
    moderation: record.request.moderation,
    n: record.request.n || 1,
    references: record.request.referenceImageUrls.map((sourceUrl, index) => ({
      id: crypto.randomUUID(),
      title: `参考图 ${index + 1}`,
      sourceUrl,
      fileName: `reference-${index + 1}.png`,
    })),
  };
}

export function ImageCreationWorkspace({
  records,
  groupOptions,
  availableReferenceImages,
  usdToCnyRate,
  isGenerating,
  error,
  onGenerate,
  onPreviewImage,
}: ImageCreationWorkspaceProps) {
  const [draft, setDraft] = useState<ImageCreationDraft>(() => createDefaultDraft(groupOptions));
  const [isReferencePickerOpen, setIsReferencePickerOpen] = useState(false);
  const [isPortraitPickerOpen, setIsPortraitPickerOpen] = useState(false);
  const [pendingPersons, setPendingPersons] = useState<PendingPerson[]>([]);
  const [hideFailedTasks, setHideFailedTasks] = useState(false);
  const [detailTask, setDetailTask] = useState<ImageCreationTaskListItem | null>(null);

  useEffect(() => {
    setDraft((current) => {
      if (current.groupMode === 'existing' && groupOptions.some((group) => group.id === current.existingGroupId)) {
        return current;
      }
      const firstGroup = groupOptions[0];
      return {
        ...current,
        groupMode: firstGroup ? 'existing' : current.groupMode,
        existingGroupId: firstGroup?.id || '',
        newGroupName: current.newGroupName || buildDefaultGroupName(groupOptions),
      };
    });
  }, [groupOptions]);

  const costEstimate = useMemo(() => estimateOpenAIImageCost({
    prompt: draft.prompt,
    size: draft.size,
    quality: draft.quality,
    n: draft.n,
    referenceCount: draft.references.length,
    usdToCnyRate,
    outputFormat: draft.outputFormat,
  }), [draft.n, draft.outputFormat, draft.prompt, draft.quality, draft.references.length, draft.size, usdToCnyRate]);

  const selectedGroup = draft.groupMode === 'existing'
    ? groupOptions.find((group) => group.id === draft.existingGroupId)
    : null;
  const selectedGroupName = draft.groupMode === 'existing'
    ? selectedGroup?.name || '未分组'
    : draft.newGroupName.trim() || '未分组';
  const selectedGroupId = draft.groupMode === 'existing' ? selectedGroup?.id || '' : '';
  const canGenerate = Boolean(draft.prompt.trim()) && !isGenerating;

  const currentGroupRecords = records.filter((record) => (
    selectedGroupId
      ? record.groupId === selectedGroupId || record.groupName === selectedGroupName
      : record.groupName === selectedGroupName
  ));
  const currentPendingPersons = pendingPersons.filter((person) => person.groupName === selectedGroupName);
  const taskItems = useMemo<ImageCreationTaskListItem[]>(() => {
    const pendingItems = currentPendingPersons.map((person) => ({
      id: person.id,
      status: person.status,
      prompt: person.prompt,
      groupName: person.groupName,
      createdAt: person.createdAt,
      outputs: [],
      references: person.draft.references,
      request: {
        size: person.draft.size,
        quality: person.draft.quality,
        outputFormat: person.draft.outputFormat,
        outputCompression: person.draft.outputFormat === 'jpeg' || person.draft.outputFormat === 'webp'
          ? person.draft.outputCompression
          : undefined,
        moderation: person.draft.moderation,
        n: person.draft.n,
      },
      error: person.error,
      draft: person.draft,
    }));

    const completedItems = currentGroupRecords.map((record) => {
      const retryDraft = buildDraftFromRecord(record, groupOptions);
      return {
        id: record.id,
        status: 'completed' as const,
        prompt: record.prompt,
        groupName: record.groupName,
        createdAt: record.createdAt,
        outputs: record.outputs.map((output) => ({
          id: output.id,
          title: output.title,
          url: output.url,
        })),
        references: retryDraft.references,
        request: {
          size: record.request.size,
          quality: record.request.quality,
          outputFormat: record.request.outputFormat,
          outputCompression: record.request.outputCompression,
          moderation: record.request.moderation,
          n: record.request.n,
        },
        model: record.model,
        draft: retryDraft,
      };
    });

    return [...pendingItems, ...completedItems]
      .filter((item) => !hideFailedTasks || item.status !== 'failed')
      .sort((left, right) => getTimestamp(right.createdAt) - getTimestamp(left.createdAt));
  }, [currentGroupRecords, currentPendingPersons, groupOptions, hideFailedTasks]);
  const taskCount = currentGroupRecords.length + currentPendingPersons.length;

  const addReferences = (references: ImageCreationReference[]) => {
    setDraft((current) => ({
      ...current,
      references: dedupeReferences([...current.references, ...references]),
    }));
  };

  const handleUploadReferences = async (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.currentTarget.files;
    const files: File[] = [];
    if (fileList) {
      for (let index = 0; index < fileList.length; index += 1) {
        const file = fileList.item(index);
        if (file && file.type.startsWith('image/')) {
          files.push(file);
        }
      }
    }
    if (files.length === 0) {
      event.target.value = '';
      return;
    }

    const references = await Promise.all(files.map(async (file) => ({
      id: crypto.randomUUID(),
      title: file.name,
      sourceUrl: await readFileAsDataUrl(file),
      fileName: file.name,
    })));
    addReferences(references);
    event.target.value = '';
  };

  const handleGenerate = async () => {
    if (!canGenerate) {
      return;
    }

    const snapshot: ImageCreationDraft = {
      ...draft,
      references: [...draft.references],
    };
    const pendingId = crypto.randomUUID();
    setPendingPersons((current) => [{
      id: pendingId,
      prompt: snapshot.prompt,
      groupName: selectedGroupName,
      createdAt: new Date().toISOString(),
      status: 'generating',
      draft: snapshot,
    }, ...current]);
    setDraft((current) => ({
      ...current,
      title: '',
      prompt: '',
      references: [],
    }));

    try {
      await onGenerate(snapshot);
      setPendingPersons((current) => current.filter((person) => person.id !== pendingId));
    } catch (generationError) {
      setPendingPersons((current) => current.map((person) => person.id === pendingId
        ? {
          ...person,
          status: 'failed',
          error: generationError instanceof Error ? generationError.message : String(generationError),
        }
        : person));
    }
  };

  const handleRegenerateFromTask = (task: ImageCreationTaskListItem) => {
    setDraft({
      ...task.draft,
      title: '',
      references: dedupeReferences(task.draft.references.map((reference) => ({
        ...reference,
        id: crypto.randomUUID(),
      }))),
    });
    setDetailTask(null);
  };

  const projectReferenceImages = availableReferenceImages.filter((image) => !isPortraitReferenceImage(image));
  const referenceImageOptions = projectReferenceImages.slice(0, 36);

  return (
    <StudioPage className="studio-page-wide">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.46fr)]">
        <StudioPanel className="min-w-0 space-y-5 p-5">
          <div className="grid grid-cols-[auto_minmax(7.5rem,9.5rem)_minmax(0,1fr)] items-end gap-3">
            <div className="pb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--studio-dim)]">分组</div>
            <div className="studio-segmented w-full">
              <button
                type="button"
                disabled={groupOptions.length === 0}
                onClick={() => setDraft((current) => ({
                  ...current,
                  groupMode: 'existing',
                  existingGroupId: current.existingGroupId || groupOptions[0]?.id || '',
                }))}
                className={cx('studio-segmented-button flex-1 px-2', draft.groupMode === 'existing' && 'active')}
              >
                已有
              </button>
              <button
                type="button"
                onClick={() => setDraft((current) => ({ ...current, groupMode: 'new' }))}
                className={cx('studio-segmented-button flex-1 px-2', draft.groupMode === 'new' && 'active')}
              >
                新建
              </button>
            </div>
            {draft.groupMode === 'existing' ? (
              <StudioSelect
                value={draft.existingGroupId}
                onChange={(event) => setDraft((current) => ({ ...current, existingGroupId: event.target.value }))}
                className="studio-select h-12"
              >
                {groupOptions.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </StudioSelect>
            ) : (
              <input
                value={draft.newGroupName}
                onChange={(event) => setDraft((current) => ({ ...current, newGroupName: event.target.value }))}
                placeholder="新分组 1"
                className="studio-input h-12"
              />
            )}
          </div>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--studio-dim)]">提示词</span>
            <textarea
              value={draft.prompt}
              onChange={(event) => setDraft((current) => ({ ...current, prompt: event.target.value }))}
              rows={8}
              placeholder="描述人物外观、服装、姿态、场景、光线和画面风格。"
              className="studio-input mt-2 min-h-[14rem] resize-y"
            />
          </label>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(7rem,0.9fr)_minmax(6rem,0.72fr)_minmax(5.5rem,0.65fr)_minmax(6rem,0.72fr)]">
            <label className="min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-dim)]">尺寸</span>
              <StudioSelect
                value={draft.size}
                onChange={(event) => setDraft((current) => ({ ...current, size: event.target.value }))}
                className="studio-select mt-2 h-11"
              >
                {OPENAI_IMAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}{option.experimental ? ' / 实验' : ''}
                  </option>
                ))}
              </StudioSelect>
            </label>

            <label className="min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-dim)]">质量</span>
              <StudioSelect
                value={draft.quality}
                onChange={(event) => setDraft((current) => ({ ...current, quality: event.target.value as ImageCreationDraft['quality'] }))}
                className="studio-select mt-2 h-11"
              >
                {OPENAI_IMAGE_QUALITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </StudioSelect>
            </label>

            <label className="min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-dim)]">格式</span>
              <StudioSelect
                value={draft.outputFormat}
                onChange={(event) => setDraft((current) => ({ ...current, outputFormat: event.target.value as ImageCreationDraft['outputFormat'] }))}
                className="studio-select mt-2 h-11"
              >
                {OPENAI_IMAGE_OUTPUT_FORMAT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </StudioSelect>
            </label>

            <label className="min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-dim)]">过滤</span>
              <StudioSelect
                value={draft.moderation}
                onChange={(event) => setDraft((current) => ({ ...current, moderation: event.target.value as ImageCreationDraft['moderation'] }))}
                className="studio-select mt-2 h-11"
              >
                <option value="auto">Auto</option>
                <option value="low">Low</option>
              </StudioSelect>
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--studio-dim)]">参考图</div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" onClick={() => setIsReferencePickerOpen(true)} className="studio-button studio-button-secondary px-3 py-2">
                  <ImageIcon className="h-4 w-4" />
                  选择
                </button>
                <button type="button" onClick={() => setIsPortraitPickerOpen(true)} className="studio-button studio-button-secondary px-3 py-2">
                  <Users className="h-4 w-4" />
                  选择人像
                </button>
                <label className="studio-button studio-button-secondary cursor-pointer px-3 py-2">
                  <Upload className="h-4 w-4" />
                  上传
                  <input type="file" accept="image/*" multiple onChange={(event) => void handleUploadReferences(event)} className="hidden" />
                </label>
              </div>
            </div>

            {draft.references.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {draft.references.map((reference) => (
                  <div key={reference.id} className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface-soft)]">
                    <button type="button" onClick={() => onPreviewImage(reference.sourceUrl)} className="block h-full w-full">
                      <img src={reference.sourceUrl} alt={reference.title} className="h-full w-full object-cover" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraft((current) => ({ ...current, references: current.references.filter((item) => item.id !== reference.id) }))}
                      className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-lg bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label={`移除参考图 ${reference.title}`}
                      title="移除"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--studio-border)] bg-[var(--studio-surface-soft)] px-4 py-4 text-sm text-[var(--studio-muted)]">
                可选。
              </div>
            )}
          </div>

          <StudioPanel className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between" tone="soft">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-200">
                <DollarSign className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-base font-semibold text-[var(--studio-text)]">{costEstimate.summary}</div>
                <div className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--studio-muted)]">{costEstimate.detail}</div>
              </div>
            </div>
            <button
              type="button"
              disabled={!canGenerate}
              onClick={() => void handleGenerate()}
              className="studio-button studio-button-primary shrink-0"
            >
              {isGenerating ? <img src="./assets/loading.gif" alt="" className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              {isGenerating ? '生成中' : '生成图片'}
            </button>
          </StudioPanel>

          {error ? (
            <div className="whitespace-pre-wrap break-words rounded-[1.2rem] border border-[var(--studio-accent-red-border)] bg-[var(--studio-accent-red-bg)] px-4 py-3 text-sm text-[var(--studio-accent-red-text)]">
              {error}
            </div>
          ) : null}
        </StudioPanel>

        <StudioPanel className="h-fit min-w-0 space-y-4 p-5" tone="soft">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="studio-eyebrow">任务列表</div>
              <div className="mt-2 truncate text-xl font-semibold text-[var(--studio-text)]">{selectedGroupName}</div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <span className="studio-chip">{taskItems.length}/{taskCount} 任务</span>
              <label className="inline-flex items-center gap-2 text-xs text-[var(--studio-muted)]">
                <input
                  type="checkbox"
                  checked={hideFailedTasks}
                  onChange={(event) => setHideFailedTasks(event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-[var(--studio-border)]"
                />
                隐藏失败
              </label>
            </div>
          </div>

          {taskItems.length === 0 ? (
            <div className="rounded-[1.2rem] border border-dashed border-[var(--studio-border)] bg-[var(--studio-field)] px-5 py-10 text-center text-sm text-[var(--studio-muted)]">
              {taskCount === 0 ? '暂无任务。' : '失败任务已隐藏。'}
            </div>
          ) : (
            <div className="max-h-[calc(100vh-14rem)] space-y-3 overflow-y-auto pr-1">
              {taskItems.map((item) => {
                const firstOutput = item.outputs[0];
                return (
                <div key={item.id} className="rounded-[1.2rem] border border-[var(--studio-border)] bg-[var(--studio-field)] p-3">
                  <div className="flex gap-3">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface-soft)] text-[var(--studio-muted)]">
                      {item.status === 'generating'
                        ? <img src="./assets/loading.gif" alt="" className="h-7 w-7" />
                        : firstOutput?.url ? (
                          <button type="button" onClick={() => onPreviewImage(firstOutput.url)} className="h-full w-full">
                            <img src={firstOutput.url} alt={firstOutput.title} className="h-full w-full object-cover" />
                          </button>
                        ) : item.status === 'failed' ? (
                          <AlertTriangle className="h-6 w-6" />
                        ) : (
                          <ImageIcon className="h-6 w-6" />
                        )}
                    </div>
                      <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-sm font-medium leading-5 text-[var(--studio-text)]">{truncateText(item.prompt, 72)}</div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                        <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px]', getStatusTone(item.status))}>
                          {item.status === 'completed' ? <CheckCircle2 className="h-3 w-3" /> : item.status === 'generating' ? <Clock3 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                          {getStatusLabel(item.status)}
                          </span>
                        <span className="shrink-0 text-[10px] text-[var(--studio-dim)]">{item.status === 'completed' ? `${item.outputs.length} 张` : formatRecordDate(item.createdAt)}</span>
                        </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="min-w-0 truncate text-[10px] text-[var(--studio-dim)]">{formatRecordDate(item.createdAt)}{item.model ? ` · ${item.model}` : ''}</div>
                        <button
                          type="button"
                          onClick={() => setDetailTask(item)}
                          className="shrink-0 text-[11px] font-medium text-cyan-200 hover:text-cyan-100"
                        >
                          查看详情
                        </button>
                      </div>
                      {item.error ? <div className="mt-2 line-clamp-2 text-[11px] leading-5 text-[var(--studio-accent-red-text)]">{item.error}</div> : null}
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </StudioPanel>
      </div>

      <StudioModal
        open={Boolean(detailTask)}
        onClose={() => setDetailTask(null)}
        className="max-w-5xl p-0"
      >
        {detailTask ? (
          <div className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="studio-eyebrow">人物详情</div>
                <h3 className="mt-2 line-clamp-2 text-2xl font-semibold text-[var(--studio-text)]">{truncateText(detailTask.prompt, 80)}</h3>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs', getStatusTone(detailTask.status))}>
                    {detailTask.status === 'completed' ? <CheckCircle2 className="h-3.5 w-3.5" /> : detailTask.status === 'generating' ? <Clock3 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                    {getStatusLabel(detailTask.status)}
                  </span>
                  <span className="text-xs text-[var(--studio-muted)]">{formatRecordDate(detailTask.createdAt)}</span>
                  {detailTask.model ? <span className="text-xs text-[var(--studio-muted)]">{detailTask.model}</span> : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailTask(null)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--studio-border)] bg-[var(--studio-field)] text-[var(--studio-muted)] hover:text-[var(--studio-text)]"
                aria-label="关闭人物详情"
                title="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.62fr)]">
              <div className="space-y-5">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--studio-dim)]">生成图片</div>
                  {detailTask.outputs.length > 0 ? (
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {detailTask.outputs.map((output) => (
                        <button
                          key={output.id}
                          type="button"
                          onClick={() => onPreviewImage(output.url)}
                          className="overflow-hidden rounded-[1rem] border border-[var(--studio-border)] bg-[var(--studio-surface-soft)] text-left"
                        >
                          <img src={output.url} alt={output.title} className="aspect-square w-full object-cover" />
                          <div className="line-clamp-1 p-3 text-xs text-[var(--studio-muted)]">{output.title}</div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 flex min-h-[14rem] items-center justify-center rounded-[1rem] border border-dashed border-[var(--studio-border)] bg-[var(--studio-surface-soft)] text-sm text-[var(--studio-muted)]">
                      {detailTask.status === 'generating' ? '图片生成中' : '未生成图片'}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--studio-dim)]">提示词</div>
                  <p className="mt-3 whitespace-pre-wrap rounded-[1rem] border border-[var(--studio-border)] bg-[var(--studio-field)] p-4 text-sm leading-6 text-[var(--studio-text)]">
                    {detailTask.prompt}
                  </p>
                </div>

                {detailTask.error ? (
                  <div className="rounded-[1rem] border border-[var(--studio-accent-red-border)] bg-[var(--studio-accent-red-bg)] p-4 text-sm leading-6 text-[var(--studio-accent-red-text)]">
                    {detailTask.error}
                  </div>
                ) : null}
              </div>

              <div className="space-y-5">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--studio-dim)]">参考图</div>
                  {detailTask.references.length > 0 ? (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {detailTask.references.map((reference) => (
                        <button
                          key={reference.id}
                          type="button"
                          onClick={() => onPreviewImage(reference.sourceUrl)}
                          className="overflow-hidden rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface-soft)]"
                          title={reference.title}
                        >
                          <img src={reference.sourceUrl} alt={reference.title} className="aspect-square w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-[1rem] border border-dashed border-[var(--studio-border)] bg-[var(--studio-surface-soft)] px-4 py-8 text-center text-sm text-[var(--studio-muted)]">
                      无参考图
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--studio-dim)]">参数</div>
                  <div className="mt-3 divide-y divide-[var(--studio-border)] overflow-hidden rounded-[1rem] border border-[var(--studio-border)] bg-[var(--studio-field)] text-sm">
                    {[
                      ['尺寸', detailTask.request.size],
                      ['质量', detailTask.request.quality],
                      ['格式', detailTask.request.outputFormat],
                      ['过滤', detailTask.request.moderation],
                      ['张数', String(detailTask.request.n)],
                      ['压缩', detailTask.request.outputCompression === undefined ? '-' : `${detailTask.request.outputCompression}%`],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between gap-4 px-4 py-3">
                        <span className="text-[var(--studio-muted)]">{label}</span>
                        <span className="font-medium text-[var(--studio-text)]">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleRegenerateFromTask(detailTask)}
                  className="studio-button studio-button-primary w-full justify-center"
                >
                  <RefreshCw className="h-4 w-4" />
                  重新生成
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </StudioModal>

      <StudioModal
        open={isReferencePickerOpen}
        onClose={() => setIsReferencePickerOpen(false)}
        className="max-w-5xl p-0"
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="studio-eyebrow">Reference Assets</div>
              <h3 className="mt-2 text-2xl font-semibold text-[var(--studio-text)]">选择参考图</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--studio-muted)]">
                从已有项目、图片制作和资产库图片中选择，最多保留 8 张参考图。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsReferencePickerOpen(false)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--studio-border)] bg-[var(--studio-field)] text-[var(--studio-muted)] hover:text-[var(--studio-text)]"
              aria-label="关闭参考图选择"
              title="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {referenceImageOptions.length > 0 ? (
            <div className="mt-6 grid max-h-[62vh] grid-cols-2 gap-3 overflow-y-auto pr-1 md:grid-cols-3 xl:grid-cols-4">
              {referenceImageOptions.map((image) => (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => {
                    addReferences([{
                      id: crypto.randomUUID(),
                      title: image.title,
                      sourceUrl: image.imageUrl,
                      fileName: `${image.title || 'reference'}.png`,
                    }]);
                    setIsReferencePickerOpen(false);
                  }}
                  className="overflow-hidden rounded-[1rem] border border-[var(--studio-border)] bg-[var(--studio-surface-soft)] text-left transition-transform duration-200 hover:-translate-y-0.5"
                >
                  <img src={image.imageUrl} alt={image.title} className="aspect-square w-full object-cover" />
                  <div className="space-y-1 p-3">
                    <div className="line-clamp-1 text-sm font-medium text-[var(--studio-text)]">{image.title}</div>
                    <div className="line-clamp-1 text-[11px] text-[var(--studio-dim)]">{image.projectName}</div>
                    <div className="line-clamp-1 text-[11px] text-[var(--studio-muted)]">{image.sourceLabel}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-[1.2rem] border border-dashed border-[var(--studio-border)] bg-[var(--studio-surface-soft)] px-6 py-12 text-center text-sm text-[var(--studio-muted)]">
              当前还没有可选参考图。
            </div>
          )}
        </div>
      </StudioModal>

      <StudioModal
        open={isPortraitPickerOpen}
        onClose={() => setIsPortraitPickerOpen(false)}
        className="max-h-[85vh] flex max-w-6xl flex-col overflow-hidden"
      >
        <div className="flex-1 overflow-y-auto bg-[var(--studio-surface)] p-2 md:p-6">
          <PortraitLibraryView
            isModal
            selectionMode="image"
            onSelect={(imgUrl, assetId, meta) => {
              const title = meta?.description || assetId || '人像参考图';
              addReferences([{
                id: crypto.randomUUID(),
                title,
                sourceUrl: imgUrl,
                fileName: `${title || 'portrait-reference'}.png`,
              }]);
              setIsPortraitPickerOpen(false);
            }}
            onSelectMany={(assets) => {
              addReferences(assets.map((asset) => {
                const title = asset.description || asset.assetId || '人像参考图';
                return {
                  id: crypto.randomUUID(),
                  title,
                  sourceUrl: asset.imageUrl,
                  fileName: `${title || 'portrait-reference'}.png`,
                };
              }));
              setIsPortraitPickerOpen(false);
            }}
          />
        </div>
      </StudioModal>
    </StudioPage>
  );
}
