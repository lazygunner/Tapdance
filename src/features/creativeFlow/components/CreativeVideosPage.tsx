import type { Dispatch, MutableRefObject, ReactNode, SetStateAction } from 'react';

import { Image as ImageIcon, Play, RefreshCw, Video, X } from 'lucide-react';
import { motion } from 'motion/react';

import { StudioSelect } from '../../../components/studio/StudioPrimitives.tsx';
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
  resolution?: '720p' | '1080p';
  frameRate?: number;
  aspectRatio?: AspectRatio;
};

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
  updateTransitionVideoConfig: (shotId: string, updates: Partial<Pick<Shot, 'transitionVideoDuration' | 'transitionVideoAspectRatio'>>) => void;
  handleGenerateVideo: (shotId: string) => void;
  handleCancelVideo: (shotId: string) => void;
  handleRegenerateVideoPrompts: (shotId: string) => void;
  handleGenerateTransitionPrompt: (shotId: string, nextShotId: string) => void;
  handleGenerateTransitionVideo: (shotId: string, nextShotId: string) => void;
  handleCancelTransitionVideo: (shotId: string) => void;
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
}: CreativeVideosPageProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-6xl mx-auto py-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-white">视频生成</h2>
          <p className="text-zinc-400 text-sm mt-1">为每个镜头生成最终的视频片段。</p>
        </div>
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
          const transitionAspectClass = getAspectRatioClass(transitionConfig.aspectRatio);
          const mediaBackdropClass = themeMode === 'light'
            ? 'bg-white'
            : 'bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900';
          const videoOperationKey = getShotVideoOperationKey(shot.id);
          const transitionOperationKey = getTransitionVideoOperationKey(shot.id);
          const videoPromptRegenKey = `${shot.id}_video_prompt`;
          const videoSourceId = getOperationSourceId(videoOperationKey, 'video');
          const promptLanguage = getPromptLanguageBySourceId(videoSourceId);
          const activePromptIsZh = promptLanguage === 'zh';
          const videoCancelPending = isOperationCancelPending(videoOperationKey);
          const transitionCancelPending = isOperationCancelPending(transitionOperationKey);

          return (
            <div key={shot.id} className="space-y-4">
              <div
                ref={(element) => { videoSectionRefs.current[shot.id] = element; }}
                className="scroll-mt-44 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col md:flex-row"
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
                      <img src="/assets/loading.gif" alt="" className="studio-loading-gif" />
                      <div className="studio-loading-content">
                        <span className="text-xs font-medium bg-indigo-500/20 px-3 py-1 rounded-full border border-indigo-500/30">
                          生成中 (预计 1-2 分钟)...
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-6 flex-1 flex flex-col">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-medium text-white mb-1">镜头 {shot.shotNumber}</h3>
                      <p className="text-sm text-zinc-400">{shot.action}</p>
                    </div>
                    <div className="flex items-center gap-2">
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
                          <><img src="/assets/loading.gif" alt="" className="w-4 h-4" /> 生成中</>
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
                              <img src="/assets/loading.gif" alt="" className="w-4 h-4" />
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
                        {generatingPrompts[videoPromptRegenKey] ? <img src="/assets/loading.gif" alt="" className="w-3 h-3" /> : <RefreshCw className="w-3 h-3" />}
                        重新生成
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
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
                      <div>
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
                          value={shot.videoConfig?.resolution || '720p'}
                          onChange={(event) => updateShotVideoConfig(shot.id, { resolution: event.target.value as '720p' | '1080p' })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded p-1.5 text-xs text-white outline-none focus:border-indigo-500"
                          disabled={shot.videoStatus === 'generating'}
                        >
                          <option value="720p">720p</option>
                          <option value="1080p">1080p</option>
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
                        <span className="text-xs text-zinc-300">使用尾帧图片作为终点 (强制 720p)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={shot.videoConfig?.useReferenceAssets ?? false}
                          onChange={(event) => updateShotVideoConfig(shot.id, { useReferenceAssets: event.target.checked })}
                          className="rounded bg-zinc-900 border-zinc-700 text-indigo-500 focus:ring-indigo-500"
                          disabled={shot.videoStatus === 'generating'}
                        />
                        <span className="text-xs text-zinc-300">使用一致性资产 (强制 720p, 16:9, 忽略尾帧)</span>
                      </label>
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
                  className="scroll-mt-44 flex flex-col items-center justify-center my-4 relative"
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-px h-full bg-zinc-800"></div>
                  </div>
                  <div className="relative z-10 bg-zinc-950 p-6 rounded-xl border border-zinc-800 flex flex-col items-center gap-4 w-full max-w-2xl">
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
                          {generatingPrompts[`${shot.id}_transition`] ? <img src="/assets/loading.gif" alt="" className="w-3 h-3" /> : <RefreshCw className="w-3 h-3" />}
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

                    <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-3">
                      <label className="block">
                        <span className="block text-[10px] text-zinc-500 mb-1">转场时长（秒）</span>
                        <input
                          type="number"
                          min="1"
                          value={transitionConfig.duration}
                          onChange={(event) => updateTransitionVideoConfig(shot.id, { transitionVideoDuration: Math.max(1, Number(event.target.value) || 3) })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded p-1.5 text-xs text-white outline-none focus:border-indigo-500"
                          disabled={shot.transitionVideoStatus === 'generating'}
                        />
                      </label>
                      <label className="block">
                        <span className="block text-[10px] text-zinc-500 mb-1">转场比例</span>
                        <StudioSelect
                          value={transitionConfig.aspectRatio}
                          onChange={(event) => updateTransitionVideoConfig(shot.id, { transitionVideoAspectRatio: event.target.value as AspectRatio })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded p-1.5 text-xs text-white outline-none focus:border-indigo-500"
                          disabled={shot.transitionVideoStatus === 'generating'}
                        >
                          {ASPECT_RATIO_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.value}</option>
                          ))}
                        </StudioSelect>
                      </label>
                    </div>

                    {shot.transitionVideoUrl ? (
                      <div className={`w-full ${transitionAspectClass} rounded border border-zinc-800 overflow-hidden ${mediaBackdropClass}`}>
                        <video src={shot.transitionVideoUrl} controls className="w-full h-full object-contain" />
                      </div>
                    ) : shot.transitionVideoStatus === 'generating' ? (
                      <div className={`w-full ${transitionAspectClass} relative rounded border border-[var(--studio-border)] overflow-hidden`}>
                        <div className="studio-loading-overlay text-[var(--studio-text)]">
                          <img src="/assets/loading.gif" alt="" className="studio-loading-gif" />
                          <div className="studio-loading-content">
                            <span className="text-xs font-medium">生成转场中...</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className={`w-full ${transitionAspectClass} bg-zinc-900/50 rounded border border-zinc-800 border-dashed flex items-center justify-center text-zinc-500 text-xs`}>
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
                        disabled={shot.transitionVideoStatus === 'generating' || !shot.lastFrameImageUrl || !project.shots[index + 1].imageUrl}
                        className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-2 disabled:opacity-50 transition-colors"
                      >
                        {shot.transitionVideoStatus === 'generating' ? (
                          <><img src="/assets/loading.gif" alt="" className="w-3 h-3" /> 生成中</>
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
                              <img src="/assets/loading.gif" alt="" className="w-3 h-3" />
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
                    {renderOperationModelPanel(transitionOperationKey, 'video', {
                      resolution: '720p',
                      frameRate: 24,
                      aspectRatio: transitionConfig.aspectRatio,
                      seconds: transitionConfig.duration,
                    })}
                    {(!shot.lastFrameImageUrl || !project.shots[index + 1].imageUrl) && (
                      <p className="text-[10px] text-zinc-500 text-center">需要当前镜头的尾帧和下一个镜头的首帧</p>
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
