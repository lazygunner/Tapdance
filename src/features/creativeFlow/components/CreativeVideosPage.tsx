import { useState, type Dispatch, type MutableRefObject, type ReactNode, type SetStateAction } from 'react';

import { Download, Image as ImageIcon, Play, RefreshCw, Video, X } from 'lucide-react';
import { motion } from 'motion/react';

import { StudioSelect } from '../../../components/studio/StudioPrimitives.tsx';
import { getAssetLibraryRelativePath } from '../../../services/assetLibrary.ts';
import type { AspectRatio, ModelSourceId, Project, PromptLanguage, Shot, VideoConfig } from '../../../types.ts';
import {
  ASPECT_RATIO_OPTIONS,
  getAspectRatioClass,
  getShotVideoOperationKey,
  getTransitionVideoOperationKey,
} from '../utils/creativeFlowHelpers.ts';

type ThemeMode = 'light' | 'dark';

type OperationCostUnits = {
  seconds?: number;
  resolution?: '480p' | '720p' | '1080p';
  frameRate?: number;
  aspectRatio?: AspectRatio;
};

const VIDEO_RESOLUTION_OPTIONS: ReadonlyArray<VideoConfig['resolution']> = ['480p', '720p', '1080p'];

function getAspectRatioStyle(aspectRatio: AspectRatio) {
  if (aspectRatio === '21:9') {
    return '21 / 9';
  }
  if (aspectRatio === '9:16') {
    return '9 / 16';
  }
  if (aspectRatio === '1:1') {
    return '1 / 1';
  }
  if (aspectRatio === '4:3') {
    return '4 / 3';
  }
  if (aspectRatio === '3:4') {
    return '3 / 4';
  }
  return '16 / 9';
}

type CreativeVideosPageProps = {
  project: Project;
  themeMode: ThemeMode;
  generatingPrompts: Record<string, boolean>;
  videoSectionRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  transitionSectionRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  setProject: Dispatch<SetStateAction<Project>>;
  setPreviewImage: Dispatch<SetStateAction<string | null>>;
  renderTimelineStrip: (options?: {
    interactive?: boolean;
    onShotClick?: (shotId: string) => void;
    onTransitionClick?: (fromShotId: string) => void;
  }) => ReactNode;
  renderOperationModelPanel: (operationKey: string, category: 'text' | 'image' | 'video', units?: OperationCostUnits) => ReactNode;
  getTransitionVideoConfig: (shot?: Shot) => { aspectRatio: AspectRatio; duration: number };
  getVideoCostUnits: (shot?: Shot) => OperationCostUnits;
  getOperationSourceId: (operationKey: string, category: 'text' | 'image' | 'video') => ModelSourceId;
  getPromptLanguageBySourceId: (sourceId: ModelSourceId) => PromptLanguage;
  isOperationCancelPending: (operationKey: string) => boolean;
  scrollToVideoSection: (shotId: string) => void;
  scrollToTransitionSection: (fromShotId: string) => void;
  updateShotVideoConfig: (shotId: string, updates: Partial<VideoConfig>) => void;
  updateTransitionVideoConfig: (shotId: string, updates: Partial<Pick<Shot, 'transitionVideoDuration' | 'transitionVideoAspectRatio' | 'transitionVideoConfig'>>) => void;
  handleGenerateVideo: (shotId: string) => void;
  handleCancelVideo: (shotId: string) => void;
  handleRegenerateVideoPrompts: (shotId: string) => void;
  handleGenerateTransitionPrompt: (shotId: string, nextShotId: string) => void;
  handleGenerateTransitionVideo: (shotId: string, nextShotId: string) => void;
  handleCancelTransitionVideo: (shotId: string) => void;
  onCopyVideosToDownloads: (relativePaths: string[]) => void | Promise<void>;
};

export function CreativeVideosPage({
  project,
  themeMode,
  generatingPrompts,
  videoSectionRefs,
  transitionSectionRefs,
  setProject,
  setPreviewImage,
  renderTimelineStrip,
  renderOperationModelPanel,
  getTransitionVideoConfig,
  getVideoCostUnits,
  getOperationSourceId,
  getPromptLanguageBySourceId,
  isOperationCancelPending,
  scrollToVideoSection,
  scrollToTransitionSection,
  updateShotVideoConfig,
  updateTransitionVideoConfig,
  handleGenerateVideo,
  handleCancelVideo,
  handleRegenerateVideoPrompts,
  handleGenerateTransitionPrompt,
  handleGenerateTransitionVideo,
  handleCancelTransitionVideo,
  onCopyVideosToDownloads,
}: CreativeVideosPageProps) {
  const [transitionVideoAspectRatios, setTransitionVideoAspectRatios] = useState<Record<string, string>>({});
  const generatedVideoRelativePaths = project.shots.flatMap((shot) => {
    const relativePaths: string[] = [];
    if (shot.videoUrl) {
      const relativePath = getAssetLibraryRelativePath(shot.videoUrl);
      if (relativePath) {
        relativePaths.push(relativePath);
      }
    }
    if (shot.transitionVideoUrl) {
      const relativePath = getAssetLibraryRelativePath(shot.transitionVideoUrl);
      if (relativePath) {
        relativePaths.push(relativePath);
      }
    }
    return relativePaths;
  });
  const canDownloadAllVideos = generatedVideoRelativePaths.length > 0;
  const handleDownloadAllVideos = () => {
    void onCopyVideosToDownloads(generatedVideoRelativePaths);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-6xl mx-auto py-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-white">视频生成</h2>
          <p className="text-zinc-400 text-sm mt-1">为每个镜头生成最终的视频片段。</p>
        </div>
        <button
          type="button"
          onClick={handleDownloadAllVideos}
          disabled={!canDownloadAllVideos}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm transition-colors ${canDownloadAllVideos ? 'border-zinc-700 text-white hover:bg-zinc-800' : 'border-zinc-800 text-zinc-600 cursor-not-allowed'}`}
        >
          <Download className="h-4 w-4" />
          下载所有视频
        </button>
      </div>

      <div
        className={
          themeMode === 'light'
            ? 'sticky top-0 z-30 -mx-2 px-2 pb-4 mb-6 bg-stone-100/95 backdrop-blur supports-[backdrop-filter]:bg-stone-100/85'
            : 'sticky top-0 z-30 -mx-2 px-2 pb-4 mb-6 bg-zinc-950/95 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/75'
        }
      >
        {renderTimelineStrip({
          interactive: true,
          onShotClick: (shotId) => scrollToVideoSection(shotId),
          onTransitionClick: (fromShotId) => scrollToTransitionSection(fromShotId),
        })}
      </div>

      <div className="space-y-6">
        {project.shots.map((shot, index) => {
          const ar = shot.videoConfig?.aspectRatio || project.brief?.aspectRatio || '16:9';
          const aspectClass = getAspectRatioClass(ar);
          const transitionConfig = getTransitionVideoConfig(shot);
          const mediaBackdropClass = themeMode === 'light'
            ? 'bg-white'
            : 'bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900';
          const videoOperationKey = getShotVideoOperationKey(shot.id);
          const transitionOperationKey = getTransitionVideoOperationKey(shot.id);
          const videoPromptRegenKey = `${shot.id}_video_prompt`;
          const videoSourceId = getOperationSourceId(videoOperationKey, 'video');
          const transitionVideoSourceId = getOperationSourceId(transitionOperationKey, 'video');
          const isSeedanceVideoSource = videoSourceId.startsWith('seedance.');
          const isSeedanceTransitionVideoSource = transitionVideoSourceId.startsWith('seedance.');
          const resolutionOptions = VIDEO_RESOLUTION_OPTIONS;
          const configuredResolution = shot.videoConfig?.resolution;
          const selectedResolution = configuredResolution && resolutionOptions.includes(configuredResolution)
            ? configuredResolution
            : '720p';
          const transitionVideoConfig: VideoConfig = {
            resolution: shot.transitionVideoConfig?.resolution || '720p',
            frameRate: shot.transitionVideoConfig?.frameRate || 24,
            aspectRatio: shot.transitionVideoConfig?.aspectRatio || transitionConfig.aspectRatio,
            useFirstFrame: shot.transitionVideoConfig?.useFirstFrame ?? true,
            useLastFrame: shot.transitionVideoConfig?.useLastFrame ?? !transitionVideoSourceId.startsWith('gemini.'),
            useReferenceAssets: shot.transitionVideoConfig?.useReferenceAssets ?? false,
            generateAudio: shot.transitionVideoConfig?.generateAudio ?? false,
            returnLastFrame: shot.transitionVideoConfig?.returnLastFrame ?? false,
            useWebSearch: shot.transitionVideoConfig?.useWebSearch ?? false,
            watermark: shot.transitionVideoConfig?.watermark ?? false,
          };
          const transitionAspectClass = getAspectRatioClass(transitionVideoConfig.aspectRatio);
          const fallbackTransitionAspectRatio = getAspectRatioStyle(transitionVideoConfig.aspectRatio);
          const transitionVideoPreviewAspectRatio = transitionVideoAspectRatios[shot.id] || fallbackTransitionAspectRatio;
          const transitionMissingRequiredFrame = Boolean(
            (transitionVideoConfig.useFirstFrame && !shot.lastFrameImageUrl)
            || (transitionVideoConfig.useLastFrame && !project.shots[index + 1]?.imageUrl),
          );
          const updateTransitionRuntimeConfig = (patch: Partial<VideoConfig>) => {
            const nextConfig = { ...transitionVideoConfig, ...patch };
            updateTransitionVideoConfig(shot.id, {
              transitionVideoConfig: nextConfig,
              ...(patch.aspectRatio ? { transitionVideoAspectRatio: patch.aspectRatio } : {}),
            });
          };
          const promptLanguage = getPromptLanguageBySourceId(videoSourceId);
          const activePromptIsZh = promptLanguage === 'zh';
          const videoCancelPending = isOperationCancelPending(videoOperationKey);
          const transitionCancelPending = isOperationCancelPending(transitionOperationKey);

          return (
            <div key={shot.id} className="min-w-0 space-y-4">
              <div
                ref={(element) => { videoSectionRefs.current[shot.id] = element; }}
                className="scroll-mt-44 min-w-0 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col md:flex-row"
              >
                <div className={`w-full md:w-1/3 relative ${aspectClass} border-b md:border-b-0 md:border-r border-zinc-800 flex-shrink-0 ${mediaBackdropClass}`}>
                  {shot.videoUrl ? (
                    <video src={shot.videoUrl} controls className="w-full h-full object-contain" />
                  ) : shot.imageUrl ? (
                    <img src={shot.imageUrl} alt={`Shot ${shot.shotNumber}`} className="w-full h-full object-contain" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                      <ImageIcon className="w-8 h-8 text-zinc-700" />
                    </div>
                  )}

                  <div className="absolute top-2 left-2 bg-black/80 text-white text-xs px-2 py-1 rounded backdrop-blur-sm font-mono">
                    S{String(shot.shotNumber).padStart(2, '0')}
                  </div>

                  {shot.videoStatus === 'generating' && (
                    <div className="studio-loading-overlay text-[var(--studio-text)] z-10">
                      <img src="./assets/loading.gif" alt="" className="studio-loading-gif" />
                      <div className="studio-loading-content">
                        <span className="text-xs font-medium bg-indigo-500/20 px-3 py-1 rounded-full border border-indigo-500/30">
                          生成中 (预计 1-2 分钟)...
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="min-w-0 overflow-hidden p-6 flex-1 flex flex-col">
                  <div className="flex min-w-0 items-start justify-between gap-4 mb-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-medium text-white mb-1">镜头 {shot.shotNumber}</h3>
                      <p className="text-sm text-zinc-400 break-words">{shot.action}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {shot.videoStatus === 'failed' && (
                        <span className="text-xs font-medium text-red-400 bg-red-400/10 px-2 py-1 rounded border border-red-400/20">
                          生成失败
                        </span>
                      )}
                      {shot.videoStatus === 'cancelled' && (
                        <span className="text-xs font-medium text-amber-300 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">
                          已取消
                        </span>
                      )}
                      {shot.videoStatus === 'completed' && (
                        <span className="text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded border border-emerald-400/20">
                          生成完成
                        </span>
                      )}
                      <button
                        onClick={() => handleGenerateVideo(shot.id)}
                        disabled={shot.videoStatus === 'generating'}
                        data-testid={`shot-generate-video-${shot.id}`}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 transition-colors"
                      >
                        {shot.videoStatus === 'generating' ? (
                          <><img src="./assets/loading.gif" alt="" className="w-4 h-4" /> 生成中</>
                        ) : shot.videoUrl ? (
                          <><RefreshCw className="w-4 h-4" /> 重新生成</>
                        ) : (
                          <><Play className="w-4 h-4" /> 生成视频</>
                        )}
                      </button>
                      {shot.videoStatus === 'generating' && (
                        <button
                          onClick={() => handleCancelVideo(shot.id)}
                          disabled={videoCancelPending}
                          className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-60 disabled:cursor-wait"
                        >
                          {videoCancelPending ? (
                            <>
                              <img src="./assets/loading.gif" alt="" className="w-4 h-4" />
                              取消中
                            </>
                          ) : (
                            <>
                              <X className="w-4 h-4" />
                              取消生成
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                  {renderOperationModelPanel(videoOperationKey, 'video', getVideoCostUnits(shot))}

                  <div className="mb-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                        <Video className="w-3 h-3" /> 视频提示词
                      </h4>
                      <button
                        onClick={() => handleRegenerateVideoPrompts(shot.id)}
                        disabled={generatingPrompts[videoPromptRegenKey]}
                        className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2 py-1 rounded flex items-center gap-1 transition-colors disabled:opacity-50"
                        title="重新生成视频提示词"
                      >
                        {generatingPrompts[videoPromptRegenKey] ? <img src="./assets/loading.gif" alt="" className="w-3 h-3" /> : <RefreshCw className="w-3 h-3" />}
                        重新生成
                      </button>
                    </div>
                    <div className="grid min-w-0 grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="min-w-0">
                        <span className={`text-[10px] mb-1 block ${activePromptIsZh ? 'text-emerald-300' : 'text-zinc-500'}`}>
                          中文 {activePromptIsZh ? '(当前用于生成)' : '(未选中)'}
                        </span>
                        <textarea
                          value={shot.videoPrompt?.textToVideoZh || ''}
                          onChange={(event) => setProject((prev) => ({
                            ...prev,
                            shots: prev.shots.map((item) => item.id === shot.id ? {
                              ...item,
                              videoPrompt: { ...item.videoPrompt!, textToVideoZh: event.target.value, imageToVideoZh: event.target.value },
                            } : item),
                          }))}
                          className="w-full h-24 text-xs font-sans bg-black/30 p-3 rounded-lg border outline-none resize-none text-zinc-200 border-emerald-500/70 ring-1 ring-emerald-500/30 focus:border-emerald-400"
                          placeholder="输入中文视频提示词..."
                        />
                      </div>
                      <div className="min-w-0">
                        <span className={`text-[10px] mb-1 block ${!activePromptIsZh ? 'text-emerald-300' : 'text-zinc-500'}`}>
                          英文 {!activePromptIsZh ? '(当前用于生成)' : '(未选中)'}
                        </span>
                        <textarea
                          value={shot.videoPrompt?.textToVideo || ''}
                          onChange={(event) => setProject((prev) => ({
                            ...prev,
                            shots: prev.shots.map((item) => item.id === shot.id ? {
                              ...item,
                              videoPrompt: { ...item.videoPrompt!, textToVideo: event.target.value, imageToVideo: event.target.value },
                            } : item),
                          }))}
                          className={`w-full h-24 text-xs font-mono bg-black/30 p-3 rounded-lg border outline-none resize-none ${!activePromptIsZh
                            ? 'text-zinc-200 border-emerald-500/70 ring-1 ring-emerald-500/30 focus:border-emerald-400'
                            : 'text-zinc-400 border-zinc-800/50 focus:border-emerald-500'
                            }`}
                          placeholder="输入英文视频提示词..."
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto pt-4 border-t border-zinc-800">
                    {shot.videoError && (
                      <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                        <p className="text-xs text-red-400 font-medium mb-1">生成失败</p>
                        <p className="text-xs text-red-300/80">{shot.videoError}</p>
                      </div>
                    )}

                    <div className="flex gap-4 mb-4">
                      {shot.imageUrl && (
                        <div className="flex-1">
                          <p className="text-[10px] text-zinc-500 mb-1">首帧参考</p>
                          <div className={`w-full ${aspectClass} rounded border border-zinc-800 overflow-hidden ${mediaBackdropClass}`}>
                            <img src={shot.imageUrl} className="w-full h-full object-contain cursor-pointer" onClick={() => setPreviewImage(shot.imageUrl!)} />
                          </div>
                        </div>
                      )}
                      {shot.lastFrameImageUrl && (
                        <div className="flex-1">
                          <p className="text-[10px] text-zinc-500 mb-1">尾帧参考</p>
                          <div className={`w-full ${aspectClass} rounded border border-zinc-800 overflow-hidden ${mediaBackdropClass}`}>
                            <img src={shot.lastFrameImageUrl} className="w-full h-full object-contain cursor-pointer" onClick={() => setPreviewImage(shot.lastFrameImageUrl!)} />
                          </div>
                        </div>
                      )}
                    </div>

                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">视频生成设置</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      <div>
                        <label className="block text-[10px] text-zinc-400 mb-1">时长 (秒)</label>
                        <input
                          type="number"
                          value={shot.duration}
                          onChange={(event) => setProject((prev) => ({
                            ...prev,
                            shots: prev.shots.map((item) => item.id === shot.id ? { ...item, duration: Number(event.target.value) } : item),
                          }))}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded p-1.5 text-xs text-white outline-none focus:border-indigo-500"
                          disabled={shot.videoStatus === 'generating'}
                          min="1"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-zinc-400 mb-1">分辨率</label>
                        <StudioSelect
                          value={selectedResolution}
                          onChange={(event) => updateShotVideoConfig(shot.id, { resolution: event.target.value as VideoConfig['resolution'] })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded p-1.5 text-xs text-white outline-none focus:border-indigo-500"
                          disabled={shot.videoStatus === 'generating'}
                        >
                          {resolutionOptions.map((resolution) => (
                            <option key={resolution} value={resolution}>{resolution}</option>
                          ))}
                        </StudioSelect>
                      </div>
                      <div>
                        <label className="block text-[10px] text-zinc-400 mb-1">画幅比例</label>
                        <StudioSelect
                          value={shot.videoConfig?.aspectRatio || project.brief?.aspectRatio || '16:9'}
                          onChange={(event) => updateShotVideoConfig(shot.id, { aspectRatio: event.target.value as AspectRatio })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded p-1.5 text-xs text-white outline-none focus:border-indigo-500"
                          disabled={shot.videoStatus === 'generating'}
                        >
                          {ASPECT_RATIO_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.value}</option>
                          ))}
                        </StudioSelect>
                      </div>
                      <div>
                        <label className="block text-[10px] text-zinc-400 mb-1">帧率 (估算)</label>
                        <StudioSelect
                          value={shot.videoConfig?.frameRate || 24}
                          onChange={(event) => updateShotVideoConfig(shot.id, { frameRate: Number(event.target.value) })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded p-1.5 text-xs text-white outline-none focus:border-indigo-500"
                          disabled={shot.videoStatus === 'generating'}
                        >
                          <option value="24">24 fps</option>
                          <option value="30">30 fps</option>
                          <option value="60">60 fps</option>
                        </StudioSelect>
                      </div>
                    </div>
                    <div className="space-y-2 mb-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={shot.videoConfig?.useFirstFrame ?? true}
                          onChange={(event) => updateShotVideoConfig(shot.id, { useFirstFrame: event.target.checked })}
                          className="rounded bg-zinc-900 border-zinc-700 text-indigo-500 focus:ring-indigo-500"
                          disabled={shot.videoStatus === 'generating'}
                        />
                        <span className="text-xs text-zinc-300">使用首帧图片作为起点</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={shot.videoConfig?.useLastFrame ?? true}
                          onChange={(event) => updateShotVideoConfig(shot.id, { useLastFrame: event.target.checked })}
                          className="rounded bg-zinc-900 border-zinc-700 text-indigo-500 focus:ring-indigo-500"
                          disabled={shot.videoStatus === 'generating'}
                        />
                        <span className="text-xs text-zinc-300">使用尾帧图片作为终点</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={shot.videoConfig?.useReferenceAssets ?? false}
                          onChange={(event) => updateShotVideoConfig(shot.id, { useReferenceAssets: event.target.checked })}
                          className="rounded bg-zinc-900 border-zinc-700 text-indigo-500 focus:ring-indigo-500"
                          disabled={shot.videoStatus === 'generating'}
                        />
                        <span className="text-xs text-zinc-300">使用一致性资产 (16:9, 忽略尾帧)</span>
                      </label>
                      {isSeedanceVideoSource ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg border border-zinc-800/70 bg-zinc-950/45 p-3">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={shot.videoConfig?.generateAudio ?? false}
                              onChange={(event) => updateShotVideoConfig(shot.id, { generateAudio: event.target.checked })}
                              className="rounded bg-zinc-900 border-zinc-700 text-indigo-500 focus:ring-indigo-500"
                              disabled={shot.videoStatus === 'generating'}
                            />
                            <span className="text-xs text-zinc-300">生成音频</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={shot.videoConfig?.returnLastFrame ?? false}
                              onChange={(event) => updateShotVideoConfig(shot.id, { returnLastFrame: event.target.checked })}
                              className="rounded bg-zinc-900 border-zinc-700 text-indigo-500 focus:ring-indigo-500"
                              disabled={shot.videoStatus === 'generating'}
                            />
                            <span className="text-xs text-zinc-300">返回尾帧</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={shot.videoConfig?.useWebSearch ?? false}
                              onChange={(event) => updateShotVideoConfig(shot.id, { useWebSearch: event.target.checked })}
                              className="rounded bg-zinc-900 border-zinc-700 text-indigo-500 focus:ring-indigo-500"
                              disabled={shot.videoStatus === 'generating'}
                            />
                            <span className="text-xs text-zinc-300">联网搜索</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={shot.videoConfig?.watermark ?? false}
                              onChange={(event) => updateShotVideoConfig(shot.id, { watermark: event.target.checked })}
                              className="rounded bg-zinc-900 border-zinc-700 text-indigo-500 focus:ring-indigo-500"
                              disabled={shot.videoStatus === 'generating'}
                            />
                            <span className="text-xs text-zinc-300">添加水印</span>
                          </label>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-between mb-2 mt-4 pt-4 border-t border-zinc-800/50">
                      <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">一致性参考资产 (最多3个)</h4>
                    </div>
                    <div className="flex gap-2 mb-4">
                      {project.assets.filter((asset) => asset.imageUrl).length === 0 ? (
                        <p className="text-xs text-zinc-600">没有可用的带图片的资产。请先在"创意简报与资产"页面生成或上传图片。</p>
                      ) : (
                        project.assets.filter((asset) => asset.imageUrl).map((asset) => {
                          const isSelected = shot.referenceAssets?.includes(asset.id);
                          return (
                            <button
                              key={asset.id}
                              onClick={() => {
                                setProject((prev) => ({
                                  ...prev,
                                  shots: prev.shots.map((item) => {
                                    if (item.id !== shot.id) {
                                      return item;
                                    }
                                    const refs = item.referenceAssets || [];
                                    if (isSelected) {
                                      return { ...item, referenceAssets: refs.filter((id) => id !== asset.id) };
                                    }
                                    if (refs.length >= 3) {
                                      alert('最多只能选择3个参考资产。');
                                      return item;
                                    }
                                    return { ...item, referenceAssets: [...refs, asset.id] };
                                  }),
                                }));
                              }}
                              className={`w-10 h-10 rounded-full border-2 transition-all ${isSelected ? 'border-indigo-500 scale-110' : 'border-transparent opacity-50 hover:opacity-100'}`}
                              title={asset.name}
                            >
                              <img src={asset.imageUrl} className="w-full h-full object-cover rounded-full" />
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {index < project.shots.length - 1 && (
                <div
                  ref={(element) => { transitionSectionRefs.current[shot.id] = element; }}
                  className="scroll-mt-44 min-w-0 flex flex-col items-center justify-center my-4 relative"
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-px h-full bg-zinc-800"></div>
                  </div>
                  <div className="relative z-10 min-w-0 overflow-hidden bg-zinc-950 p-6 rounded-xl border border-zinc-800 flex flex-col items-center gap-4 w-full max-w-2xl">
                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">转场视频 (镜头 {shot.shotNumber} ➔ {project.shots[index + 1].shotNumber})</h4>

                    <div className="w-full flex gap-4">
                      <div className="flex-1 flex flex-col items-center">
                        <span className="text-[10px] text-zinc-500 mb-1">镜头 {shot.shotNumber} 尾帧</span>
                        {shot.lastFrameImageUrl ? (
                          <div className={`w-full ${transitionAspectClass} rounded border border-zinc-800 overflow-hidden ${mediaBackdropClass}`}>
                            <img src={shot.lastFrameImageUrl} className="w-full h-full object-contain cursor-pointer" onClick={() => setPreviewImage(shot.lastFrameImageUrl!)} />
                          </div>
                        ) : (
                          <div className={`w-full ${transitionAspectClass} bg-zinc-900 rounded border border-zinc-800 flex items-center justify-center text-zinc-600 text-[10px]`}>未生成</div>
                        )}
                      </div>
                      <div className="flex-1 flex flex-col items-center">
                        <span className="text-[10px] text-zinc-500 mb-1">镜头 {project.shots[index + 1].shotNumber} 首帧</span>
                        {project.shots[index + 1].imageUrl ? (
                          <div className={`w-full ${transitionAspectClass} rounded border border-zinc-800 overflow-hidden ${mediaBackdropClass}`}>
                            <img src={project.shots[index + 1].imageUrl} className="w-full h-full object-contain cursor-pointer" onClick={() => setPreviewImage(project.shots[index + 1].imageUrl!)} />
                          </div>
                        ) : (
                          <div className={`w-full ${transitionAspectClass} bg-zinc-900 rounded border border-zinc-800 flex items-center justify-center text-zinc-600 text-[10px]`}>未生成</div>
                        )}
                      </div>
                    </div>

                    <div className="w-full space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                          <Video className="w-3 h-3" /> 转场提示词
                        </h4>
                        <button
                          onClick={() => handleGenerateTransitionPrompt(shot.id, project.shots[index + 1].id)}
                          disabled={generatingPrompts[`${shot.id}_transition`]}
                          className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2 py-1 rounded flex items-center gap-1 transition-colors disabled:opacity-50"
                        >
                          {generatingPrompts[`${shot.id}_transition`] ? <img src="./assets/loading.gif" alt="" className="w-3 h-3" /> : <RefreshCw className="w-3 h-3" />}
                          重新生成
                        </button>
                      </div>
                      {renderOperationModelPanel(`transition-prompt-${shot.id}`, 'text')}

                      <div className="space-y-2">
                        <div>
                          <span className="text-[10px] text-zinc-500 mb-1 block">中文 (仅供参考)</span>
                          <textarea
                            value={shot.transitionVideoPromptZh !== undefined ? shot.transitionVideoPromptZh : '两个场景之间平滑自然的过渡'}
                            onChange={(event) => setProject((prev) => ({
                              ...prev,
                              shots: prev.shots.map((item) => item.id === shot.id ? { ...item, transitionVideoPromptZh: event.target.value } : item),
                            }))}
                            className="w-full text-zinc-400 text-xs font-sans bg-black/30 p-3 rounded-lg border border-zinc-800/50 outline-none focus:border-emerald-500 resize-none"
                            rows={2}
                            placeholder="输入中文转场提示词..."
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-500 mb-1 block">英文 (用于生成)</span>
                          <textarea
                            value={shot.transitionVideoPrompt !== undefined ? shot.transitionVideoPrompt : 'A smooth and natural transition between the two scenes'}
                            onChange={(event) => setProject((prev) => ({
                              ...prev,
                              shots: prev.shots.map((item) => item.id === shot.id ? { ...item, transitionVideoPrompt: event.target.value } : item),
                            }))}
                            className="w-full text-zinc-400 text-xs font-mono bg-black/30 p-3 rounded-lg border border-zinc-800/50 outline-none focus:border-emerald-500 resize-none"
                            rows={2}
                            placeholder="输入英文转场提示词..."
                          />
                        </div>
                      </div>
                    </div>

                    {renderOperationModelPanel(transitionOperationKey, 'video', {
                      resolution: transitionVideoConfig.resolution,
                      frameRate: transitionVideoConfig.frameRate,
                      aspectRatio: transitionVideoConfig.aspectRatio,
                      seconds: transitionConfig.duration,
                    })}

                    <div className="w-full grid grid-cols-1 md:grid-cols-4 gap-3">
                      <label className="block">
                        <span className="block text-[10px] text-zinc-500 mb-1">转场时长（秒）</span>
                        <input
                          type="number"
                          min="4"
                          value={transitionConfig.duration}
                          onChange={(event) => updateTransitionVideoConfig(shot.id, { transitionVideoDuration: Math.max(4, Number(event.target.value) || 4) })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded p-1.5 text-xs text-white outline-none focus:border-indigo-500"
                          disabled={shot.transitionVideoStatus === 'generating'}
                        />
                      </label>
                      <label className="block">
                        <span className="block text-[10px] text-zinc-500 mb-1">转场比例</span>
                        <StudioSelect
                          value={transitionVideoConfig.aspectRatio}
                          onChange={(event) => updateTransitionRuntimeConfig({ aspectRatio: event.target.value as AspectRatio })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded p-1.5 text-xs text-white outline-none focus:border-indigo-500"
                          disabled={shot.transitionVideoStatus === 'generating'}
                        >
                          {ASPECT_RATIO_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.value}</option>
                          ))}
                        </StudioSelect>
                      </label>
                      <label className="block">
                        <span className="block text-[10px] text-zinc-500 mb-1">分辨率</span>
                        <StudioSelect
                          value={transitionVideoConfig.resolution}
                          onChange={(event) => updateTransitionRuntimeConfig({ resolution: event.target.value as VideoConfig['resolution'] })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded p-1.5 text-xs text-white outline-none focus:border-indigo-500"
                          disabled={shot.transitionVideoStatus === 'generating'}
                        >
                          {VIDEO_RESOLUTION_OPTIONS.map((resolution) => (
                            <option key={resolution} value={resolution}>{resolution}</option>
                          ))}
                        </StudioSelect>
                      </label>
                      <label className="block">
                        <span className="block text-[10px] text-zinc-500 mb-1">帧率 (估算)</span>
                        <StudioSelect
                          value={transitionVideoConfig.frameRate}
                          onChange={(event) => updateTransitionRuntimeConfig({ frameRate: Number(event.target.value) })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded p-1.5 text-xs text-white outline-none focus:border-indigo-500"
                          disabled={shot.transitionVideoStatus === 'generating'}
                        >
                          <option value="24">24 fps</option>
                          <option value="30">30 fps</option>
                          <option value="60">60 fps</option>
                        </StudioSelect>
                      </label>
                    </div>

                    <div className="w-full space-y-2 rounded-lg border border-zinc-800/70 bg-zinc-950/35 p-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={transitionVideoConfig.useFirstFrame}
                          onChange={(event) => updateTransitionRuntimeConfig({ useFirstFrame: event.target.checked })}
                          className="rounded bg-zinc-900 border-zinc-700 text-indigo-500 focus:ring-indigo-500"
                          disabled={shot.transitionVideoStatus === 'generating'}
                        />
                        <span className="text-xs text-zinc-300">使用当前镜头尾帧作为起点</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={transitionVideoConfig.useLastFrame}
                          onChange={(event) => updateTransitionRuntimeConfig({ useLastFrame: event.target.checked })}
                          className="rounded bg-zinc-900 border-zinc-700 text-indigo-500 focus:ring-indigo-500"
                          disabled={shot.transitionVideoStatus === 'generating'}
                        />
                        <span className="text-xs text-zinc-300">使用下一镜头首帧作为终点</span>
                      </label>
                      {isSeedanceTransitionVideoSource ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={transitionVideoConfig.generateAudio}
                              onChange={(event) => updateTransitionRuntimeConfig({ generateAudio: event.target.checked })}
                              className="rounded bg-zinc-900 border-zinc-700 text-indigo-500 focus:ring-indigo-500"
                              disabled={shot.transitionVideoStatus === 'generating'}
                            />
                            <span className="text-xs text-zinc-300">生成音频</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={transitionVideoConfig.returnLastFrame}
                              onChange={(event) => updateTransitionRuntimeConfig({ returnLastFrame: event.target.checked })}
                              className="rounded bg-zinc-900 border-zinc-700 text-indigo-500 focus:ring-indigo-500"
                              disabled={shot.transitionVideoStatus === 'generating'}
                            />
                            <span className="text-xs text-zinc-300">返回尾帧</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={transitionVideoConfig.useWebSearch}
                              onChange={(event) => updateTransitionRuntimeConfig({ useWebSearch: event.target.checked })}
                              className="rounded bg-zinc-900 border-zinc-700 text-indigo-500 focus:ring-indigo-500"
                              disabled={shot.transitionVideoStatus === 'generating'}
                            />
                            <span className="text-xs text-zinc-300">联网搜索</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={transitionVideoConfig.watermark}
                              onChange={(event) => updateTransitionRuntimeConfig({ watermark: event.target.checked })}
                              className="rounded bg-zinc-900 border-zinc-700 text-indigo-500 focus:ring-indigo-500"
                              disabled={shot.transitionVideoStatus === 'generating'}
                            />
                            <span className="text-xs text-zinc-300">添加水印</span>
                          </label>
                        </div>
                      ) : null}
                    </div>

                    {shot.transitionVideoUrl ? (
                      <div
                        className={`w-full rounded border border-zinc-800 overflow-hidden ${mediaBackdropClass}`}
                        style={{ aspectRatio: transitionVideoPreviewAspectRatio }}
                      >
                        <video
                          src={shot.transitionVideoUrl}
                          controls
                          className="w-full h-full object-contain"
                          onLoadedMetadata={(event) => {
                            const { videoWidth, videoHeight } = event.currentTarget;
                            if (!videoWidth || !videoHeight) {
                              return;
                            }
                            const nextAspectRatio = `${videoWidth} / ${videoHeight}`;
                            setTransitionVideoAspectRatios((prev) => (
                              prev[shot.id] === nextAspectRatio ? prev : { ...prev, [shot.id]: nextAspectRatio }
                            ));
                          }}
                        />
                      </div>
                    ) : shot.transitionVideoStatus === 'generating' ? (
                      <div
                        className="w-full relative rounded border border-[var(--studio-border)] overflow-hidden"
                        style={{ aspectRatio: fallbackTransitionAspectRatio }}
                      >
                        <div className="studio-loading-overlay text-[var(--studio-text)]">
                          <img src="./assets/loading.gif" alt="" className="studio-loading-gif" />
                          <div className="studio-loading-content">
                            <span className="text-xs font-medium">生成转场中...</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="w-full bg-zinc-900/50 rounded border border-zinc-800 border-dashed flex items-center justify-center text-zinc-500 text-xs"
                        style={{ aspectRatio: fallbackTransitionAspectRatio }}
                      >
                        未生成转场
                      </div>
                    )}

                    {shot.transitionVideoError && (
                      <div className="w-full p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400 text-center">
                        {shot.transitionVideoError}
                      </div>
                    )}
                    {shot.transitionVideoStatus === 'cancelled' && !shot.transitionVideoError && (
                      <div className="w-full p-2 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-200 text-center">
                        已取消转场视频生成
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleGenerateTransitionVideo(shot.id, project.shots[index + 1].id)}
                        disabled={shot.transitionVideoStatus === 'generating' || transitionMissingRequiredFrame}
                        className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-2 disabled:opacity-50 transition-colors"
                      >
                        {shot.transitionVideoStatus === 'generating' ? (
                          <><img src="./assets/loading.gif" alt="" className="w-3 h-3" /> 生成中</>
                        ) : shot.transitionVideoUrl ? (
                          <><RefreshCw className="w-3 h-3" /> 重新生成转场</>
                        ) : (
                          <><Play className="w-3 h-3" /> 生成转场视频</>
                        )}
                      </button>
                      {shot.transitionVideoStatus === 'generating' && (
                        <button
                          onClick={() => handleCancelTransitionVideo(shot.id)}
                          disabled={transitionCancelPending}
                          className="bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors disabled:opacity-60 disabled:cursor-wait"
                        >
                          {transitionCancelPending ? (
                            <>
                              <img src="./assets/loading.gif" alt="" className="w-3 h-3" />
                              取消中
                            </>
                          ) : (
                            <>
                              <X className="w-3 h-3" />
                              取消生成
                            </>
                          )}
                        </button>
                      )}
                    </div>
                    {transitionMissingRequiredFrame && (
                      <p className="text-[10px] text-zinc-500 text-center">请先生成已勾选的转场参考帧</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
