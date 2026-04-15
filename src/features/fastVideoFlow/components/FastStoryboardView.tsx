import { useState, type ChangeEvent, type ReactNode } from 'react';
import { Image as ImageIcon, Lock, LockOpen, RefreshCw, Upload, X } from 'lucide-react';

import type { FastSceneDraft, FastVideoInput, FastVideoPromptDraft } from '../types/fastTypes.ts';
import { ClickPopover } from '../../../components/studio/ClickPopover.tsx';
import { StudioModal, StudioPage, StudioPageHeader, StudioPanel } from '../../../components/studio/StudioPrimitives.tsx';

type Props = {
  input: FastVideoInput;
  scenes: FastSceneDraft[];
  videoPrompt: FastVideoPromptDraft | null;
  generatingImages: Record<string, boolean>;
  onUpdateScene: (sceneId: string, patch: Partial<FastSceneDraft>) => void;
  onUpdatePrompt: (patch: Partial<FastVideoPromptDraft>) => void;
  onGenerateImage: (sceneId: string) => void;
  onGenerateImageWithPrevious: (sceneId: string) => void;
  onToggleLock: (sceneId: string) => void;
  onUploadSceneImage: (event: ChangeEvent<HTMLInputElement>, sceneId: string) => void;
  onPreviewImage: (url: string) => void;
  onNextVideo: () => void;
  onSkipStoryboard: () => void;
  renderImageModelPanel?: (sceneId: string) => ReactNode;
  themeMode?: 'light' | 'dark';
  hideHeader?: boolean;
};

export function FastStoryboardView({
  input,
  scenes,
  videoPrompt,
  generatingImages,
  onUpdateScene,
  onUpdatePrompt,
  onGenerateImage,
  onGenerateImageWithPrevious,
  onToggleLock,
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
  const [editingNegativePromptSceneId, setEditingNegativePromptSceneId] = useState<string | null>(null);
  const activeNegativePromptScene = editingNegativePromptSceneId
    ? scenes.find((scene) => scene.id === editingNegativePromptSceneId) || null
    : null;
  const modalTitleClass = themeMode === 'light' ? 'text-stone-950' : 'text-white';
  const modalBodyClass = themeMode === 'light' ? 'text-stone-600' : 'text-zinc-400';
  const modalInputClass = themeMode === 'light'
    ? 'w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-950 outline-none focus:border-sky-500 resize-none'
    : 'w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white outline-none focus:border-violet-500 resize-none';
  const modalGhostButtonClass = themeMode === 'light'
    ? 'border-stone-200 text-stone-700 hover:bg-stone-100'
    : 'border-zinc-700 text-zinc-200 hover:bg-zinc-800';
  const inlineTextareaClass = themeMode === 'light'
    ? 'w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-950 outline-none focus:border-sky-500 resize-none'
    : 'w-full rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-sm text-zinc-300 outline-none focus:border-violet-500 resize-none';
  const emptyImageShellClass = themeMode === 'light'
    ? 'border-b border-[rgba(110,124,145,0.14)] bg-[linear-gradient(135deg,rgba(244,114,182,0.07),rgba(99,102,241,0.08))]'
    : 'border-b border-zinc-800 bg-[linear-gradient(135deg,rgba(168,85,247,0.14),rgba(17,24,39,0.9))]';
  const emptyImageTextClass = themeMode === 'light' ? 'text-fuchsia-700' : 'text-violet-200/85';
  const generatingImageTextClass = themeMode === 'light' ? 'text-indigo-700' : 'text-violet-100/90';

  if (scenes.length === 0) {
    return (
      <StudioPage>
        <StudioPanel className="p-8 text-center">
          <h2 className="text-2xl font-bold text-white">分镜确认</h2>
          <p className="text-zinc-400 mt-3">请先在极速输入页点击“先生成分镜图”。</p>
        </StudioPanel>
      </StudioPage>
    );
  }

  const readyImageCount = scenes.filter((scene) => scene.imageUrl).length;
  const canProceedToVideo = (
    readyImageCount > 0
    || readyReferenceImages.length > 0
    || readyReferenceVideos.length > 0
    || readyReferenceAudios.length > 0
  ) && Boolean(videoPrompt?.prompt);
  const canSkipStoryboard = Boolean(videoPrompt?.prompt);

  return (
    <StudioPage className={hideHeader ? 'studio-page-fluid' : 'studio-page-wide'}>
      {!hideHeader ? (
        <StudioPageHeader
          eyebrow="Fast Storyboard"
          title="分镜确认"
          description={(
            <>
              <p>当前流程会生成 {scenes.length} 张分镜图。每一步都可以人工修改提示词、重新生成，或直接上传替换图片。</p>
              {readyImageCount === 0 && (readyReferenceImages.length > 0 || readyReferenceVideos.length > 0 || readyReferenceAudios.length > 0) ? (
                <p className="mt-3 text-sm text-[var(--studio-dim)]">当前还没有分镜图，但你已经上传了参考素材，可以直接跳过分镜图生成进入视频生成。</p>
              ) : null}
            </>
          )}
          actions={(
            <div className="flex flex-wrap items-center gap-3">
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

      <div className={`${hideHeader ? 'mt-4' : 'mt-8'} grid grid-cols-1 gap-6 xl:grid-cols-[0.32fr_0.68fr]`}>
        <aside className="space-y-6">
          <StudioPanel className="p-6">
            <div className="text-white font-semibold">输入摘要</div>
            <div className="mt-4 space-y-3 text-sm text-zinc-400">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <div>画幅：{input.aspectRatio}</div>
                <div>时长：{input.durationSec}s</div>
                <div>场景数：{scenes.length}</div>
              </div>
              <div className="leading-6">{input.prompt}</div>
            </div>
          </StudioPanel>

          {readyReferenceImages.length > 0 ? (
            <StudioPanel className="p-6">
              <div className="text-white font-semibold">上一步参考图</div>
              <div className="mt-2 text-sm text-zinc-500">
                这些参考图会保留给后续视频生成使用。当前分镜图默认纯文字生成；从第二张开始，你也可以手动参考上一张已生成分镜图继续生成。
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3">
                {readyReferenceImages.map((reference, index) => (
                  <button
                    key={reference.id}
                    type="button"
                    onClick={() => onPreviewImage(reference.imageUrl)}
                    className="block w-full rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950 text-left"
                  >
                    <img src={reference.imageUrl} alt={`reference-${index + 1}`} className="w-full aspect-video object-contain" />
                    <div className="px-3 py-2 text-xs text-zinc-400 border-t border-zinc-800">
                      参考图 {index + 1}{reference.assetId?.trim() ? ` · asset://${reference.assetId.trim()}` : ''}
                    </div>
                  </button>
                ))}
              </div>
            </StudioPanel>
          ) : null}

          <StudioPanel className="p-6" tone="soft">
            <div className="text-white font-semibold">视频提示词草稿</div>
            <div className="mt-2 text-sm text-zinc-500">这里可以直接修改最终执行用的中文视频提示词，修改会即时保存。</div>
            <textarea
              value={videoPrompt?.promptZh || videoPrompt?.prompt || ''}
              onChange={(event) => onUpdatePrompt({ prompt: event.target.value, promptZh: event.target.value })}
              rows={8}
              className={`mt-4 whitespace-pre-wrap ${inlineTextareaClass}`}
              placeholder="尚未生成视频提示词"
            />
          </StudioPanel>
        </aside>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {scenes.map((scene, index) => {
            const isGenerating = Boolean(generatingImages[scene.id]);

            return (
              <section key={scene.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                <div className="px-6 py-5 border-b border-zinc-800 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-white text-xl font-semibold">{scene.title || `分镜 ${index + 1}`}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleLock(scene.id)}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition-colors ${scene.locked ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-zinc-700 bg-zinc-950 text-zinc-400 hover:text-white'}`}
                  >
                    {scene.locked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
                    {scene.locked ? '已锁定' : '未锁定'}
                  </button>
                </div>

                {scene.imageUrl ? (
                  <div className="border-b border-zinc-800 bg-zinc-950/80 p-4">
                    <button type="button" className="block w-full rounded-xl overflow-hidden" onClick={() => onPreviewImage(scene.imageUrl!)}>
                      <img src={scene.imageUrl} alt={scene.title} className="w-full aspect-video object-contain" />
                    </button>
                  </div>
                ) : (
                  <div className={`${emptyImageShellClass} px-6 py-4 relative overflow-hidden`}>
                    {isGenerating ? (
                      <div className="studio-loading-overlay text-[var(--studio-text)]">
                        <img src="./assets/loading.gif" alt="" className="studio-loading-gif" />
                        <div className="studio-loading-content">
                          <span className="text-sm font-medium">正在生成分镜图</span>
                        </div>
                      </div>
                    ) : (
                      <div className={`inline-flex items-center gap-2 text-sm ${emptyImageTextClass} relative z-10`}>
                        <ImageIcon className="w-4 h-4" />
                        尚未生成图片
                      </div>
                    )}
                  </div>
                )}

                <div className="p-6 space-y-4">
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
                    <textarea
                      value={scene.imagePromptZh || ''}
                      onChange={(event) => onUpdateScene(scene.id, { imagePromptZh: event.target.value })}
                      rows={6}
                      className={inlineTextareaClass}
                      placeholder="尚未生成中文参考提示词"
                    />
                  </div>

                  <details className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                    <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">图像提示词 (英文)</summary>
                    <textarea
                      value={scene.imagePrompt}
                      onChange={(event) => onUpdateScene(scene.id, { imagePrompt: event.target.value })}
                      rows={7}
                      className="mt-3 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white outline-none focus:border-violet-500 resize-none"
                    />
                  </details>

                  {renderImageModelPanel ? (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_10.5rem] xl:items-start">
                      <div className="min-w-0">
                        {renderImageModelPanel(scene.id)}
                        {scene.error ? (
                          <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                            {scene.error}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <button
                          type="button"
                          onClick={() => onGenerateImage(scene.id)}
                          disabled={isGenerating || !scene.imagePrompt.trim()}
                          className={`h-11 w-full rounded-xl px-4 text-sm transition-colors ${isGenerating || !scene.imagePrompt.trim() ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-violet-500 hover:bg-violet-400 text-white'}`}
                        >
                          {isGenerating ? <span className="inline-flex items-center gap-2"><img src="./assets/loading.gif" alt="" className="w-4 h-4" />生成中</span> : <span className="inline-flex items-center gap-2"><RefreshCw className="w-4 h-4" />生成分镜图</span>}
                        </button>
                        <label className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm text-white hover:bg-zinc-800 transition-colors cursor-pointer">
                          <Upload className="w-4 h-4" />
                          上传
                          <input type="file" accept="image/*" className="hidden" onChange={(event) => onUploadSceneImage(event, scene.id)} />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <>
                      {scene.error ? (
                        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                          {scene.error}
                        </div>
                      ) : null}
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => onGenerateImage(scene.id)}
                          disabled={isGenerating || !scene.imagePrompt.trim()}
                          className={`h-11 rounded-xl px-4 text-sm transition-colors ${isGenerating || !scene.imagePrompt.trim() ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-violet-500 hover:bg-violet-400 text-white'}`}
                        >
                          {isGenerating ? <span className="inline-flex items-center gap-2"><img src="./assets/loading.gif" alt="" className="w-4 h-4" />生成中</span> : <span className="inline-flex items-center gap-2"><RefreshCw className="w-4 h-4" />生成分镜图</span>}
                        </button>
                        <label className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm text-white hover:bg-zinc-800 transition-colors cursor-pointer">
                          <Upload className="w-4 h-4" />
                          上传
                          <input type="file" accept="image/*" className="hidden" onChange={(event) => onUploadSceneImage(event, scene.id)} />
                        </label>
                      </div>
                    </>
                  )}
                </div>
              </section>
            );
          })}
        </div>
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
    </StudioPage>
  );
}
