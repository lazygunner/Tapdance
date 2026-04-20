import { useState, type ChangeEvent, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Image as ImageIcon, Plus, RefreshCw, Trash2, Upload, X } from 'lucide-react';

import type { FastSceneDraft, FastVideoInput, FastVideoPromptDraft } from '../types/fastTypes.ts';
import { ClickPopover } from '../../../components/studio/ClickPopover.tsx';
import { StudioModal, StudioPage, StudioPageHeader, StudioPanel } from '../../../components/studio/StudioPrimitives.tsx';
import { PromptTokenEditor, type PromptReferenceItem } from './FastVideoView.tsx';

type Props = {
  input: FastVideoInput;
  scenes: FastSceneDraft[];
  videoPrompt: FastVideoPromptDraft | null;
  generatingImages: Record<string, boolean>;
  onUpdateScene: (sceneId: string, patch: Partial<FastSceneDraft>) => void;
  onAddScene: () => string | void;
  onDeleteScene: (sceneId: string) => void;
  onUpdatePrompt: (patch: Partial<FastVideoPromptDraft>) => void;
  onGenerateImage: (sceneId: string) => void;
  onGenerateImageWithPrevious: (sceneId: string) => void;
  onToggleSelection: (sceneId: string) => void;
  onUploadSceneImage: (event: ChangeEvent<HTMLInputElement>, sceneId: string) => void;
  onPreviewImage: (url: string) => void;
  onNextVideo: () => void;
  onSkipStoryboard: () => void;
  renderImageModelPanel?: (sceneId: string) => ReactNode;
  themeMode?: 'light' | 'dark';
  hideHeader?: boolean;
};

const FAST_STORYBOARD_REFERENCE_TYPE_LABELS: Record<NonNullable<FastVideoInput['referenceImages'][number]['referenceType']>, string> = {
  person: '人物参考图',
  scene: '场景参考图',
  product: '产品参考图',
  style: '风格参考图',
  other: '其他参考图',
};

function getStoryboardReferenceTypeLabel(referenceType?: FastVideoInput['referenceImages'][number]['referenceType']) {
  return FAST_STORYBOARD_REFERENCE_TYPE_LABELS[referenceType || 'other'] || FAST_STORYBOARD_REFERENCE_TYPE_LABELS.other;
}

function getStoryboardPromptReferenceToken(index: number) {
  return `图片${index + 1}`;
}

function isSceneSelected(scene: FastSceneDraft) {
  return scene.selectedForVideo !== false;
}

export function FastStoryboardView({
  input,
  scenes,
  videoPrompt,
  generatingImages,
  onUpdateScene,
  onAddScene,
  onDeleteScene,
  onUpdatePrompt,
  onGenerateImage,
  onGenerateImageWithPrevious,
  onToggleSelection,
  onUploadSceneImage,
  onPreviewImage,
  onNextVideo,
  onSkipStoryboard,
  renderImageModelPanel,
  themeMode = 'dark',
  hideHeader = false,
}: Props) {
  const readyReferenceImages = input.referenceImages.filter((reference) => reference.imageUrl.trim());
  const readyReferenceVideos = input.referenceVideos.filter((reference) => reference.videoUrl.trim());
  const readyReferenceAudios = input.referenceAudios.filter((reference) => reference.audioUrl.trim());
  const promptReferenceItems: PromptReferenceItem[] = readyReferenceImages.map((reference, index) => ({
    token: getStoryboardPromptReferenceToken(index),
    imageUrl: reference.imageUrl,
    title: reference.description?.trim() || `参考图 ${index + 1}`,
    subtitle: getStoryboardReferenceTypeLabel(reference.referenceType),
  }));
  const [editingNegativePromptSceneId, setEditingNegativePromptSceneId] = useState<string | null>(null);
  const [deletingSceneId, setDeletingSceneId] = useState<string | null>(null);
  const activeNegativePromptScene = editingNegativePromptSceneId
    ? scenes.find((scene) => scene.id === editingNegativePromptSceneId) || null
    : null;
  const deletingScene = deletingSceneId
    ? scenes.find((scene) => scene.id === deletingSceneId) || null
    : null;

  const modalTitleClass = themeMode === 'light' ? 'text-stone-950' : 'text-white';
  const modalBodyClass = themeMode === 'light' ? 'text-stone-600' : 'text-zinc-400';
  const modalInputClass = themeMode === 'light'
    ? 'w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-950 outline-none focus:border-sky-500 resize-none'
    : 'w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white outline-none focus:border-violet-500 resize-none';
  const modalGhostButtonClass = themeMode === 'light'
    ? 'border-stone-200 text-stone-700 hover:bg-stone-100'
    : 'border-zinc-700 text-zinc-200 hover:bg-zinc-800';
  const pageMutedClass = themeMode === 'light' ? 'text-stone-600' : 'text-zinc-400';
  const cardClass = themeMode === 'light'
    ? 'border-stone-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]'
    : 'border-zinc-800 bg-zinc-900';
  const cardHeaderClass = themeMode === 'light' ? 'border-stone-200' : 'border-zinc-800';
  const cardTitleInputClass = themeMode === 'light'
    ? 'w-full rounded-lg border border-transparent bg-transparent px-0 py-1 text-xl font-semibold text-stone-950 outline-none focus:border-sky-500 focus:bg-white focus:px-3'
    : 'w-full rounded-lg border border-transparent bg-transparent px-0 py-1 text-xl font-semibold text-white outline-none focus:border-violet-500 focus:bg-zinc-950 focus:px-3';
  const inlineTextareaClass = themeMode === 'light'
    ? 'w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-950 outline-none focus:border-sky-500 resize-none'
    : 'w-full rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-sm text-zinc-300 outline-none focus:border-violet-500 resize-none';
  const emptyImageShellClass = themeMode === 'light'
    ? 'border-b border-[rgba(110,124,145,0.14)] bg-[linear-gradient(135deg,rgba(244,114,182,0.07),rgba(99,102,241,0.08))]'
    : 'border-b border-zinc-800 bg-[linear-gradient(135deg,rgba(168,85,247,0.14),rgba(17,24,39,0.9))]';
  const emptyImageTextClass = themeMode === 'light' ? 'text-fuchsia-700' : 'text-violet-200/85';
  const detailsClass = themeMode === 'light'
    ? 'rounded-xl border border-stone-200 bg-stone-50/70 p-4'
    : 'rounded-xl border border-zinc-800 bg-zinc-950/60 p-4';
  const detailsTextareaClass = themeMode === 'light'
    ? 'mt-3 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-950 outline-none focus:border-sky-500 resize-none'
    : 'mt-3 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white outline-none focus:border-violet-500 resize-none';
  const selectedSceneButtonClass = themeMode === 'light'
    ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
    : 'border-rose-400/35 bg-rose-500/20 text-rose-100';
  const unselectedSceneButtonClass = themeMode === 'light'
    ? 'border-stone-200 bg-white text-stone-500 hover:border-stone-300 hover:bg-stone-50 hover:text-stone-700'
    : 'border-zinc-700 bg-zinc-950/70 text-zinc-400 hover:text-zinc-200';

  const readyImageCount = scenes.filter((scene) => scene.imageUrl).length;
  const selectedReadyImageCount = scenes.filter((scene) => scene.imageUrl && isSceneSelected(scene)).length;
  const canProceedToVideo = (
    selectedReadyImageCount > 0
    || readyReferenceImages.length > 0
    || readyReferenceVideos.length > 0
    || readyReferenceAudios.length > 0
  ) && Boolean(videoPrompt?.prompt);
  const canSkipStoryboard = Boolean(videoPrompt?.prompt);

  const confirmDeleteScene = () => {
    if (!deletingScene) {
      return;
    }
    if (editingNegativePromptSceneId === deletingScene.id) {
      setEditingNegativePromptSceneId(null);
    }
    onDeleteScene(deletingScene.id);
    setDeletingSceneId(null);
  };

  return (
    <StudioPage className={hideHeader ? 'studio-page-fluid' : 'studio-page-wide'}>
      {!hideHeader ? (
        <StudioPageHeader
          eyebrow="Fast Storyboard"
          title="分镜确认"
          description={(
            <p>当前有 {scenes.length} 张分镜，已生成 {readyImageCount} 张图片，已选中 {selectedReadyImageCount} 张参与视频生成。</p>
          )}
          actions={(
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onAddScene}
                className="studio-button studio-button-secondary"
              >
                <Plus className="h-4 w-4" /> 添加分镜
              </button>
              <button
                type="button"
                onClick={onNextVideo}
                disabled={!canProceedToVideo}
                className="studio-button studio-button-primary"
              >
                进入视频生成
              </button>
              <button
                type="button"
                onClick={onSkipStoryboard}
                disabled={!canSkipStoryboard}
                className="studio-button studio-button-secondary"
              >
                跳过分镜图
              </button>
            </div>
          )}
        />
      ) : null}

      <div className={`${hideHeader ? 'mt-3' : 'mt-6'} space-y-4`}>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,25%)_minmax(0,25%)_minmax(0,1fr)]">
          <StudioPanel className="flex h-44 min-h-0 flex-col p-4">
            <div className="font-semibold text-[var(--studio-text)]">输入摘要</div>
            <div className={`mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 text-sm ${pageMutedClass}`}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <div>画幅：{input.aspectRatio}</div>
                <div>时长：{input.durationSec}s</div>
                <div>分镜：{scenes.length}</div>
              </div>
              <div className="leading-6">{input.prompt}</div>
            </div>
          </StudioPanel>

          <StudioPanel className="flex h-44 min-h-0 flex-col p-4" tone="soft">
            <div className="font-semibold text-[var(--studio-text)]">视频提示词草稿</div>
            <textarea
              value={videoPrompt?.promptZh || videoPrompt?.prompt || ''}
              onChange={(event) => onUpdatePrompt({ prompt: event.target.value, promptZh: event.target.value })}
              className={`mt-3 min-h-0 flex-1 whitespace-pre-wrap ${inlineTextareaClass}`}
              placeholder="尚未生成视频提示词"
            />
          </StudioPanel>

          <StudioPanel className="flex h-44 min-h-0 flex-col p-4">
            <div className="font-semibold text-[var(--studio-text)]">上一步参考图</div>
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              {readyReferenceImages.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                  {readyReferenceImages.map((reference, index) => (
                    <button
                      key={reference.id}
                      type="button"
                      onClick={() => onPreviewImage(reference.imageUrl)}
                      className="overflow-hidden rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface-contrast)] text-left"
                    >
                      <img src={reference.imageUrl} alt={`reference-${index + 1}`} className="aspect-video w-full object-contain" />
                      <div className="truncate border-t border-[var(--studio-border)] px-2 py-1.5 text-[11px] text-[var(--studio-muted)]">
                        参考图 {index + 1}{reference.assetId?.trim() ? ` · asset://${reference.assetId.trim()}` : ''}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex h-full items-center text-sm text-[var(--studio-dim)]">暂无参考图</div>
              )}
            </div>
          </StudioPanel>
        </div>

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-[var(--studio-text)]">分镜图</div>
              <div className="mt-1 text-xs text-[var(--studio-dim)]">已选中的分镜图会参与后续 Seedance 视频生成。</div>
            </div>
            <button
              type="button"
              onClick={onAddScene}
              className="studio-button studio-button-secondary px-3 py-2 text-sm"
            >
              <Plus className="h-4 w-4" /> 添加分镜
            </button>
          </div>

          <div className="overflow-x-auto pb-4">
            <div className="flex w-max snap-x snap-mandatory gap-5">
              {scenes.map((scene, index) => {
                const isGenerating = Boolean(generatingImages[scene.id]);
                const activeImagePrompt = (scene.imagePromptZh || scene.imagePrompt || '').trim();
                const previousSceneHasImage = index > 0 && Boolean(scenes[index - 1]?.imageUrl);
                const selected = isSceneSelected(scene);

                return (
                  <section key={scene.id} className={`w-[min(77vw,468px)] shrink-0 snap-start overflow-hidden rounded-2xl border ${cardClass}`}>
                    <div className={`border-b px-5 py-4 ${cardHeaderClass}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <input
                            value={scene.title || `分镜 ${index + 1}`}
                            onChange={(event) => onUpdateScene(scene.id, { title: event.target.value })}
                            className={cardTitleInputClass}
                          />
                          <div className="mt-1 text-xs text-[var(--studio-dim)]">分镜 {index + 1}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onToggleSelection(scene.id)}
                            className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors ${selected ? selectedSceneButtonClass : unselectedSceneButtonClass}`}
                            title={selected ? '已选中参与执行' : '未选中参与执行'}
                          >
                            {selected ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                            {selected ? '已选中' : '未选中'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingSceneId(scene.id)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-500/25 bg-red-500/10 text-red-200 transition-colors hover:bg-red-500/20"
                            title="删除分镜"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {scene.imageUrl ? (
                      <div className="border-b border-[var(--studio-border)] bg-zinc-950/80 p-4">
                        <button type="button" className="block w-full overflow-hidden rounded-xl" onClick={() => onPreviewImage(scene.imageUrl!)}>
                          <img src={scene.imageUrl} alt={scene.title} className="aspect-video w-full object-contain" />
                        </button>
                      </div>
                    ) : (
                      <div className={`${emptyImageShellClass} relative aspect-video overflow-hidden px-6 py-4`}>
                        {isGenerating ? (
                          <div className="studio-loading-overlay text-[var(--studio-text)]">
                            <img src="./assets/loading.gif" alt="" className="studio-loading-gif" />
                            <div className="studio-loading-content">
                              <span className="text-sm font-medium">正在生成分镜图</span>
                            </div>
                          </div>
                        ) : (
                          <div className={`relative z-10 flex h-full items-center justify-center gap-2 text-sm ${emptyImageTextClass}`}>
                            <ImageIcon className="h-4 w-4" />
                            尚未生成图片
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-4 p-5">
                      <div>
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">中文参考提示词</div>
                          <div className="inline-flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-zinc-400">
                            <button
                              type="button"
                              onClick={() => setEditingNegativePromptSceneId(scene.id)}
                              className="font-medium text-zinc-300 underline underline-offset-4 transition-colors hover:text-white"
                            >
                              负面提示词
                            </button>
                            <label className="inline-flex cursor-pointer items-center gap-2">
                              <input
                                type="checkbox"
                                checked={Boolean(scene.humanFaceMosaic)}
                                onChange={(event) => onUpdateScene(scene.id, { humanFaceMosaic: event.target.checked })}
                                className="rounded border-zinc-700 bg-zinc-900 text-violet-500 focus:ring-violet-500"
                              />
                              <span>人脸马赛克</span>
                            </label>
                            <ClickPopover
                              ariaLabel="查看人脸马赛克说明"
                              trigger="!"
                              buttonClassName="inline-flex h-4 w-4 items-center justify-center rounded-full border border-zinc-700 text-[10px] font-semibold text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/60"
                              panelClassName="w-52 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-[11px] leading-5 text-zinc-200 shadow-xl"
                              content="Seedance 无法使用真人人脸生成视频"
                            />
                          </div>
                        </div>
                        <PromptTokenEditor
                          value={scene.imagePromptZh || scene.imagePrompt || ''}
                          referenceItems={promptReferenceItems}
                          videoReferenceItems={[]}
                          audioReferenceItems={[]}
                          themeMode={themeMode}
                          placeholder="输入当前分镜的中文图像提示词；输入 @ 可直接插入参考图素材标签。"
                          onChange={(nextValue) => onUpdateScene(scene.id, { imagePromptZh: nextValue })}
                        />
                      </div>

                      <details className={detailsClass}>
                        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">图像提示词 (英文)</summary>
                        <textarea
                          value={scene.imagePrompt}
                          onChange={(event) => onUpdateScene(scene.id, { imagePrompt: event.target.value })}
                          rows={6}
                          className={detailsTextareaClass}
                        />
                      </details>

                      {renderImageModelPanel ? (
                        <div className="min-w-0 space-y-3">
                          {renderImageModelPanel(scene.id)}
                        </div>
                      ) : null}

                      {scene.error ? (
                        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                          {scene.error}
                        </div>
                      ) : null}

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <button
                          type="button"
                          onClick={() => onGenerateImage(scene.id)}
                          disabled={isGenerating || !activeImagePrompt}
                          className={`h-11 rounded-xl px-4 text-sm transition-colors ${isGenerating || !activeImagePrompt ? 'cursor-not-allowed bg-zinc-800 text-zinc-500' : 'bg-violet-500 text-white hover:bg-violet-400'}`}
                        >
                          {isGenerating ? <span className="inline-flex items-center gap-2"><img src="./assets/loading.gif" alt="" className="h-4 w-4" />生成中</span> : <span className="inline-flex items-center gap-2"><RefreshCw className="h-4 w-4" />生成分镜图</span>}
                        </button>
                        <button
                          type="button"
                          onClick={() => onGenerateImageWithPrevious(scene.id)}
                          disabled={isGenerating || !activeImagePrompt || !previousSceneHasImage}
                          className={`h-11 rounded-xl border px-4 text-sm transition-colors ${isGenerating || !activeImagePrompt || !previousSceneHasImage ? 'cursor-not-allowed border-zinc-800 bg-zinc-900 text-zinc-600' : 'border-zinc-700 text-white hover:bg-zinc-800'}`}
                        >
                          参考上一张
                        </button>
                        <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm text-white transition-colors hover:bg-zinc-800">
                          <Upload className="h-4 w-4" />
                          上传
                          <input type="file" accept="image/*" className="hidden" onChange={(event) => onUploadSceneImage(event, scene.id)} />
                        </label>
                      </div>
                    </div>
                  </section>
                );
              })}

              <button
                type="button"
                onClick={onAddScene}
                className={`flex w-[min(70vw,320px)] shrink-0 snap-start flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-sm transition-colors ${themeMode === 'light' ? 'border-stone-300 bg-stone-50 text-stone-600 hover:bg-white' : 'border-zinc-700 bg-zinc-950/50 text-zinc-400 hover:border-zinc-500 hover:text-white'}`}
              >
                <Plus className="mb-3 h-6 w-6" />
                添加分镜
              </button>
            </div>
          </div>
        </section>
      </div>

      <StudioModal
        open={Boolean(activeNegativePromptScene)}
        onClose={() => setEditingNegativePromptSceneId(null)}
        themeMode={themeMode}
        className="max-w-2xl"
      >
        {activeNegativePromptScene ? (
          <div className="p-6 md:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="studio-eyebrow">Negative Prompt</div>
                <h3 className={`mt-3 text-2xl font-semibold ${modalTitleClass}`}>{activeNegativePromptScene.title || '负面提示词'}</h3>
                <p className={`mt-2 text-sm leading-6 ${modalBodyClass}`}>这里直接查看和编辑当前分镜的负面提示词，修改会即时保存。</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingNegativePromptSceneId(null)}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition-colors ${modalGhostButtonClass}`}
                aria-label="关闭负面提示词弹窗"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6">
              <textarea
                value={activeNegativePromptScene.negativePrompt || ''}
                onChange={(event) => onUpdateScene(activeNegativePromptScene.id, { negativePrompt: event.target.value })}
                rows={8}
                className={modalInputClass}
                placeholder="输入当前分镜的负面提示词"
              />
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setEditingNegativePromptSceneId(null)}
                className={`rounded-xl border px-4 py-2 text-sm transition-colors ${modalGhostButtonClass}`}
              >
                完成
              </button>
            </div>
          </div>
        ) : null}
      </StudioModal>

      <StudioModal
        open={Boolean(deletingScene)}
        onClose={() => setDeletingSceneId(null)}
        themeMode={themeMode}
        className="max-w-lg"
      >
        {deletingScene ? (
          <div className="p-6 md:p-7">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-4">
                <div className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-red-500/25 bg-red-500/10 text-red-300">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <div className="studio-eyebrow">Delete Storyboard</div>
                  <h3 className={`mt-3 text-2xl font-semibold ${modalTitleClass}`}>删除分镜？</h3>
                  <p className={`mt-2 text-sm leading-6 ${modalBodyClass}`}>
                    将从当前分镜列表移除「{deletingScene.title || '未命名分镜'}」。如果这张分镜图已经生成，图片文件仍会保留在资产库中。
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeletingSceneId(null)}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition-colors ${modalGhostButtonClass}`}
                aria-label="关闭删除分镜弹窗"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingSceneId(null)}
                className={`rounded-xl border px-4 py-2 text-sm transition-colors ${modalGhostButtonClass}`}
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmDeleteScene}
                className="rounded-xl border border-red-500/30 bg-red-500/15 px-4 py-2 text-sm text-red-100 transition-colors hover:bg-red-500/25"
              >
                确认删除
              </button>
            </div>
          </div>
        ) : null}
      </StudioModal>
    </StudioPage>
  );
}
