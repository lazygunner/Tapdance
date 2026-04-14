import { useState, type ChangeEvent, type ClipboardEvent, type ReactNode } from 'react';
import { AlertTriangle, Clapperboard, HelpCircle, Image as ImageIcon, Settings2, Sparkles, Upload, Users, Video, X } from 'lucide-react';

import type { FastReferenceImage, FastVideoInput } from '../types/fastTypes.ts';
import { ClickPopover } from '../../../components/studio/ClickPopover.tsx';
import { StudioPage, StudioPageHeader, StudioPanel, StudioSelect, StudioModal } from '../../../components/studio/StudioPrimitives.tsx';
import { PortraitLibraryView } from '../../portraitLibrary/components/PortraitLibraryView.tsx';
import { FAST_VIDEO_PROMPT_CONFIG } from '../../../config/fastVideoPrompts.ts';
import { VideoUrlPreview, VIDEO_REFERENCE_CONSTRAINTS } from './VideoUrlPreview.tsx';
import { uploadVideoToTos, isLikelyTosCorsError, isTosConfigComplete } from '../../../services/tosUploadService.ts';

const REFERENCE_TYPE_OPTIONS: Array<{ value: NonNullable<FastReferenceImage['referenceType']>; label: string }> = [
  { value: 'scene', label: '场景参考图' },
  { value: 'person', label: '人物参考图' },
  { value: 'product', label: '产品参考图' },
  { value: 'style', label: '风格参考图' },
  { value: 'other', label: '其他参考图' },
];

function getReferenceTypeLabel(referenceType?: FastReferenceImage['referenceType']) {
  return REFERENCE_TYPE_OPTIONS.find((option) => option.value === (referenceType || 'other'))?.label || '其他参考图';
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
            <li>🎬 分辨率：<span className="text-[var(--studio-text)]">480p 或 720p</span></li>
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
  onChange: (patch: Partial<FastVideoInput>) => void;
  onGenerate: () => void;
  onSkipStoryboard: () => void;
  onAddReferenceImage: () => void;
  onUploadReferenceImage: (event: ChangeEvent<HTMLInputElement>, referenceId: string) => void;
  onPasteReferenceImage: (file: File, referenceId: string) => void;
  onUpdateReferenceImage: (referenceId: string, patch: Partial<FastReferenceImage>) => void;
  onRemoveReferenceImage: (referenceId: string) => void;
  onAddReferenceVideo: () => void;
  onUpdateReferenceVideo: (referenceId: string, patch: Partial<import('../types/fastTypes.ts').FastReferenceVideo>) => void;
  onRemoveReferenceVideo: (referenceId: string) => void;
  onToggleReferenceVideoSelection: (referenceId: string) => void;
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

export function FastInputView({
  input,
  isGenerating,
  hasPlan,
  onChange,
  onGenerate,
  onSkipStoryboard,
  onAddReferenceImage,
  onUploadReferenceImage,
  onPasteReferenceImage,
  onUpdateReferenceImage,
  onRemoveReferenceImage,
  onAddReferenceVideo,
  onUpdateReferenceVideo,
  onRemoveReferenceVideo,
  onToggleReferenceVideoSelection,
  onTosUploadConfig,
  onOpenApiConfig,
  operationPanel,
  hideHeader = false,
}: Props) {
  const [portraitPickerTargetId, setPortraitPickerTargetId] = useState<string | null>(null);
  const [uploadingVideoIds, setUploadingVideoIds] = useState<Record<string, boolean>>({});
  const [tosCorsModalState, setTosCorsModalState] = useState<{ origin: string; message: string } | null>(null);
  const canGoDirectToVideo = Boolean(input.prompt.trim() || hasPlan);

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

  return (
    <StudioPage className={hideHeader ? 'studio-page-fluid' : 'studio-page-wide'}>
      {!hideHeader ? (
        <StudioPageHeader
          eyebrow="Fast Video Flow"
          title="极速视频输入"
          description={(
            <p>
              输入一句提示词和可选多张参考图，系统会自动拆成 1-2 张分镜图提示词，再生成最终的 Seedance 视频提示词草稿。
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
                {isGenerating ? <span className="inline-flex items-center gap-2"><img src="./assets/loading.gif" alt="" className="w-4 h-4" />生成中</span> : <span className="inline-flex items-center gap-2"><Sparkles className="w-4 h-4" />先生成分镜图</span>}
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

      <div className={`${hideHeader ? 'mt-4' : 'mt-8'} grid grid-cols-1 gap-6 xl:grid-cols-[0.62fr_0.38fr]`}>
        <StudioPanel className="space-y-5 p-6">
          <div>
            <div className="text-sm font-medium text-[var(--studio-text)]">核心提示词</div>
            <textarea
              value={input.prompt}
              onChange={(event) => onChange({ prompt: event.target.value })}
              rows={7}
              className="studio-textarea mt-2"
              placeholder="例如：一间临海日式客房从黄昏缓慢过渡到深夜，房间布局保持一致，最后出现静坐的少女，电影感、克制、写实。"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-[var(--studio-text)]">画幅比例</span>
              <StudioSelect
                value={input.aspectRatio}
                onChange={(event) => onChange({ aspectRatio: event.target.value as FastVideoInput['aspectRatio'] })}
                className="studio-select mt-2"
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
                value={input.durationSec}
                onChange={(event) => onChange({ durationSec: Math.max(4, Math.min(15, Number(event.target.value) || 10)) })}
                className="studio-input mt-2"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-[var(--studio-text)]">分镜数量偏好</span>
              <StudioSelect
                value={String(input.preferredSceneCount)}
                onChange={(event) => {
                  const rawValue = event.target.value;
                  onChange({
                    preferredSceneCount: rawValue === '1' ? 1 : rawValue === '2' ? 2 : 'auto',
                  });
                }}
                className="studio-select mt-2"
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
                className="studio-select mt-2"
              >
                <option value="yes">是</option>
                <option value="no">否</option>
              </StudioSelect>
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-[var(--studio-text)]">负面限制词</span>
            <textarea
              value={input.negativePrompt || ''}
              onChange={(event) => onChange({ negativePrompt: event.target.value })}
              rows={3}
              className="studio-textarea mt-2"
              placeholder="例如：no text, no watermark, no extra people"
            />
          </label>

          {operationPanel ? (
            <StudioPanel className="p-4" tone="soft">
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--studio-dim)]">文本模型</div>
              {operationPanel}
            </StudioPanel>
          ) : null}
        </StudioPanel>

        <aside className="space-y-6">
          <StudioPanel className="p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-[var(--studio-text)]">参考图</div>
                <div className="mt-1 text-xs leading-5 text-[var(--studio-dim)]">可选，支持多张。请尽量补充参考类型和描述；人物图如已在火山素材库入库，请在下方填写 `assetId`，视频生成时会优先使用 `asset://...`。</div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/10 p-4">
              {input.referenceImages.length > 0 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    {input.referenceImages.map((reference, index) => (
                      <StudioPanel key={reference.id} className="p-4" tone="soft">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm text-[var(--studio-text)]">参考图 {index + 1}</div>
                            <div className="mt-1 text-xs text-[var(--studio-dim)]">填写人物 `assetId` 后，Ark API 会优先传 `asset://{reference.assetId || '...'}`。</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onRemoveReferenceImage(reference.id)}
                            className="rounded-lg p-2 text-[var(--studio-dim)] transition-colors hover:bg-white/6 hover:text-[var(--studio-text)]"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <div
                          tabIndex={0}
                          onPaste={(event) => handleReferencePaste(event, reference.id)}
                          className="mt-3 rounded-xl border border-white/10 bg-black/10 outline-none focus:border-sky-500"
                        >
                          {reference.imageUrl ? (
                            <div className="aspect-video overflow-hidden rounded-xl">
                              <img src={reference.imageUrl} alt={`reference-${index + 1}`} className="w-full h-full object-contain" />
                            </div>
                          ) : (
                            <div className="aspect-video flex flex-col items-center justify-center gap-3 text-center px-4">
                              <div className="w-12 h-12 rounded-full bg-sky-500/10 text-sky-300 flex items-center justify-center">
                                <ImageIcon className="w-5 h-5" />
                              </div>
                              <div>
                                <div className="text-sm text-[var(--studio-text)]">粘贴图片或选择文件</div>
                                <div className="mt-1 text-xs text-[var(--studio-dim)]">先点击这个区域聚焦，再直接粘贴图片</div>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-3">
                          <label className="studio-button studio-button-secondary cursor-pointer">
                            <Upload className="w-4 h-4" />
                            {reference.imageUrl ? '替换图片' : '选择图片'}
                            <input type="file" accept="image/*" className="hidden" onChange={(event) => onUploadReferenceImage(event, reference.id)} />
                          </label>

                          <button
                            type="button"
                            onClick={() => setPortraitPickerTargetId(reference.id)}
                            className="studio-button studio-button-secondary cursor-pointer"
                          >
                            <Users className="w-4 h-4" />
                            选择虚拟人像
                          </button>
                        </div>

                        <label className="block mt-3">
                          <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--studio-dim)]">参考类型</span>
                          <StudioSelect
                            value={reference.referenceType || 'other'}
                            onChange={(event) => onUpdateReferenceImage(reference.id, { referenceType: event.target.value as FastReferenceImage['referenceType'] })}
                            className="studio-select mt-2"
                          >
                            {REFERENCE_TYPE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </StudioSelect>
                        </label>

                        <label className="block mt-3">
                          <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--studio-dim)]">参考图描述（可选）</span>
                          <textarea
                            value={reference.description || ''}
                            onChange={(event) => onUpdateReferenceImage(reference.id, { description: event.target.value })}
                            rows={3}
                            placeholder={`例如：这是一张${getReferenceTypeLabel(reference.referenceType)}，需要保留主体外观、服装、材质或场景结构。`}
                            className="studio-textarea mt-2"
                          />
                        </label>

                        <label className="block mt-3">
                          <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--studio-dim)]">Asset ID（可选）</span>
                          <input
                            value={reference.assetId || ''}
                            onChange={(event) => onUpdateReferenceImage(reference.id, { assetId: event.target.value })}
                            placeholder="例如 asset-20260224200602-qn7wr"
                            className="studio-input mt-2"
                          />
                        </label>
                      </StudioPanel>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={onAddReferenceImage}
                    className="studio-button studio-button-secondary"
                  >
                    <Upload className="w-4 h-4" />
                    继续添加参考图
                  </button>
                </div>
              ) : (
                <button type="button" onClick={onAddReferenceImage} className="flex w-full cursor-pointer flex-col items-center justify-center gap-3 py-10 text-center">
                  <div className="w-14 h-14 rounded-full bg-sky-500/10 text-sky-300 flex items-center justify-center">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-sm text-[var(--studio-text)]">新增参考图区域</div>
                    <div className="mt-1 text-xs text-[var(--studio-dim)]">新增后可在卡片里上传、替换或直接粘贴图片</div>
                  </div>
                  <div className="studio-button studio-button-secondary">
                    <Upload className="w-4 h-4" />
                    添加区域
                  </div>
                </button>
              )}
            </div>
          </StudioPanel>

          <StudioPanel className="p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-1 text-sm font-medium text-[var(--studio-text)]">
                  参考视频
                  <VideoRequirementsPopover />
                </div>
                <div className="mt-1 text-xs leading-5 text-[var(--studio-dim)]">可选，仅支持直接粘贴或输入有效的外链视频，参考视频效果与画幅比例需与最终生成尺寸强相关。</div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/10 p-4">
              {(input.referenceVideos || []).length > 0 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    {(input.referenceVideos || []).map((reference, index) => (
                      <StudioPanel key={reference.id} className="p-4" tone="soft">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm text-[var(--studio-text)]">参考视频 {index + 1}</div>
                            <div className="mt-1 text-xs text-[var(--studio-dim)]">仅支持有效外链。如果是本地视频，请先上传到对象存储或火山引擎素材库。</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onRemoveReferenceVideo(reference.id)}
                            className="rounded-lg p-2 text-[var(--studio-dim)] transition-colors hover:bg-white/6 hover:text-[var(--studio-text)]"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="mt-3">
                          <VideoUrlPreview
                            url={reference.videoUrl}
                            className="w-full aspect-video rounded-xl border border-white/10 bg-black/30"
                            onValidated={(_, meta) => {
                              onUpdateReferenceVideo(reference.id, {
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
                        </div>

                        <label className="block mt-3">
                          <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--studio-dim)]">视频外链地址</span>
                          <div className="flex items-center gap-2 mt-2">
                            <input
                              value={reference.videoUrl}
                              onChange={(event) => onUpdateReferenceVideo(reference.id, {
                                videoUrl: event.target.value,
                                videoMeta: null,
                              })}
                              placeholder="粘贴 http:// 或 https:// 开头的 mp4/mov 视频链接"
                              className="studio-input flex-1"
                            />
                            {!isTosConfigComplete(onTosUploadConfig) ? (
                              <button
                                type="button"
                                onClick={onOpenApiConfig}
                                className="studio-button studio-button-secondary shrink-0 text-amber-500 hover:text-amber-600"
                              >
                                <Settings2 className="w-4 h-4" />
                                去配置云端 KEY
                              </button>
                            ) : (
                              <label className={`studio-button studio-button-secondary shrink-0 ${uploadingVideoIds[reference.id] ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                                {uploadingVideoIds[reference.id] ? (
                                  <img src="./assets/loading.gif" alt="" className="w-4 h-4" />
                                ) : (
                                  <Upload className="w-4 h-4" />
                                )}
                                {uploadingVideoIds[reference.id] ? '正在上传...' : '上传到云端'}
                                {!uploadingVideoIds[reference.id] && (
                                  <input
                                    type="file"
                                    accept="video/mp4,video/quicktime,video/webm"
                                    className="hidden"
                                    disabled={uploadingVideoIds[reference.id]}
                                    onChange={async (event) => {
                                      const file = event.target.files?.[0];
                                      if (!file) return;
                                      try {
                                        setUploadingVideoIds(prev => ({ ...prev, [reference.id]: true }));
                                        // @ts-ignore - TOS Upload Service handles this
                                        const { url } = await uploadVideoToTos(file, onTosUploadConfig);
                                        onUpdateReferenceVideo(reference.id, { videoUrl: url, videoMeta: null });
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
                                        setUploadingVideoIds(prev => ({ ...prev, [reference.id]: false }));
                                        event.target.value = '';
                                      }
                                    }}
                                  />
                                )}
                              </label>
                            )}
                          </div>
                        </label>

                        <label className="block mt-3">
                          <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--studio-dim)]">参考视频说明（可选）</span>
                          <textarea
                            value={reference.description || ''}
                            onChange={(event) => onUpdateReferenceVideo(reference.id, { description: event.target.value })}
                            rows={2}
                            placeholder="描述视频中需要被模型参考的动作、运镜或特效特征..."
                            className="studio-textarea mt-2"
                          />
                        </label>
                      </StudioPanel>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={onAddReferenceVideo}
                    className="studio-button studio-button-secondary"
                    disabled={(input.referenceVideos || []).length >= 3}
                  >
                    <Upload className="w-4 h-4" />
                    {(input.referenceVideos || []).length >= 3 ? '最多支持添加 3 个视频参考' : '继续添加参考视频'}
                  </button>
                </div>
              ) : (
                <button type="button" onClick={onAddReferenceVideo} className="flex w-full cursor-pointer flex-col items-center justify-center gap-3 py-10 text-center">
                  <div className="w-14 h-14 rounded-full bg-sky-500/10 text-sky-300 flex items-center justify-center">
                    <Video className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-sm text-[var(--studio-text)]">新增参考视频区域</div>
                    <div className="mt-1 text-xs text-[var(--studio-dim)]">可选填视频 URL 作为生成参考，上限 15s 内。</div>
                  </div>
                  <div className="studio-button studio-button-secondary">
                    <Upload className="w-4 h-4" />
                    添加区域
                  </div>
                </button>
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
    </StudioPage>
  );
}
