import type { ChangeEvent, Dispatch, ReactNode, SetStateAction } from 'react';

import { ArrowDown, ArrowUp, Eye, FileText, GripVertical, Image as ImageIcon, Languages, Plus, RefreshCw, Trash2, Upload, Video, X } from 'lucide-react';
import { motion } from 'motion/react';

import type { Project, Shot } from '../../../types.ts';
import type { ProjectGroupImageAsset } from '../../../services/projectGroups.ts';
import {
  getAspectRatioClass,
  getFrameEditPromptKey,
  getFrameEditTemplate,
  hasLastFramePrompt,
  resequenceShots,
} from '../utils/creativeFlowHelpers.ts';

type ThemeMode = 'light' | 'dark';

type HistoryMaterialPickerState = {
  shotId: string;
  frameType: 'first' | 'last';
} | null;

type CreativeShotsPageProps = {
  project: Project;
  themeMode: ThemeMode;
  currentGroupImageAssets: ProjectGroupImageAsset[];
  dragOverShotId: string | null;
  draggingShotId: string | null;
  generatingPrompts: Record<string, boolean>;
  generatingImages: Record<string, boolean>;
  translatingPrompts: Record<string, boolean>;
  frameEditPrompts: Record<string, string>;
  setProject: Dispatch<SetStateAction<Project>>;
  setPreviewImage: Dispatch<SetStateAction<string | null>>;
  setDragOverShotId: Dispatch<SetStateAction<string | null>>;
  setDraggingShotId: Dispatch<SetStateAction<string | null>>;
  setFrameEditPrompts: Dispatch<SetStateAction<Record<string, string>>>;
  setHistoryMaterialPicker: Dispatch<SetStateAction<HistoryMaterialPickerState>>;
  renderOperationModelPanel: (operationKey: string, category: 'text' | 'image' | 'video') => ReactNode;
  handleReorderShots: (draggedShotId: string, targetShotId: string) => void;
  handleGeneratePrompts: (shotId: string) => void;
  handleGenerateTransitionPrompt: (shotId: string, nextShotId: string) => void;
  handleGenerateFirstFrame: (shotId: string) => void;
  handleGenerateLastFrame: (shotId: string) => void;
  handleUploadFirstFrame: (event: ChangeEvent<HTMLInputElement>, shotId: string) => void;
  handleUploadLastFrame: (event: ChangeEvent<HTMLInputElement>, shotId: string) => void;
  handleTranslatePrompts: (shotId: string) => void;
  handleDownloadImage: (url: string, filename: string) => void;
  toggleShotGroupReferenceImage: (shotId: string, imageId: string) => void;
  handleModifyFrameFromCurrentImage: (shotId: string, frameType: 'first' | 'last') => void;
};

export function CreativeShotsPage({
  project,
  themeMode,
  currentGroupImageAssets,
  dragOverShotId,
  draggingShotId,
  generatingPrompts,
  generatingImages,
  translatingPrompts,
  frameEditPrompts,
  setProject,
  setPreviewImage,
  setDragOverShotId,
  setDraggingShotId,
  setFrameEditPrompts,
  setHistoryMaterialPicker,
  renderOperationModelPanel,
  handleReorderShots,
  handleGeneratePrompts,
  handleGenerateTransitionPrompt,
  handleGenerateFirstFrame,
  handleGenerateLastFrame,
  handleUploadFirstFrame,
  handleUploadLastFrame,
  handleTranslatePrompts,
  handleDownloadImage,
  toggleShotGroupReferenceImage,
  handleModifyFrameFromCurrentImage,
}: CreativeShotsPageProps) {
  const shotAspectClass = getAspectRatioClass(project.brief?.aspectRatio || '16:9');
  const frameEditPanelClass = themeMode === 'light'
    ? 'rounded-lg border border-stone-300 bg-stone-100/95 p-3 space-y-3'
    : 'rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 space-y-3';
  const frameEditHeadingClass = themeMode === 'light'
    ? 'text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-600'
    : 'text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500';
  const frameEditMetaClass = themeMode === 'light' ? 'text-[10px] text-stone-500' : 'text-[10px] text-zinc-600';
  const frameEditTemplateButtonClass = themeMode === 'light'
    ? 'rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-[11px] text-stone-700 hover:bg-stone-200 transition-colors'
    : 'rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-800 transition-colors';
  const frameEditTextareaClass = themeMode === 'light'
    ? 'w-full rounded-lg bg-white border border-stone-300 px-3 py-2 text-xs text-stone-900 outline-none focus:border-indigo-500 resize-none'
    : 'w-full rounded-lg bg-black/30 border border-zinc-800 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-indigo-500 resize-none';

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-6xl mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white">分镜列表</h2>
          <p className="text-zinc-400 text-sm mt-1">支持调整顺序、沿用上一镜头背景，并可直接上传尾帧。</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const newShot: Shot = {
                id: crypto.randomUUID(),
                shotNumber: project.shots.length + 1,
                duration: 5,
                shotSize: '中景',
                cameraAngle: '平视',
                cameraMovement: '固定',
                subject: '新主体',
                action: '在此描述动作...',
                mood: '中性',
                transition: '硬切',
                usePreviousShotBackground: false,
              };
              setProject((prev) => ({ ...prev, shots: resequenceShots([...prev.shots, newShot]) }));
            }}
            className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            添加镜头
          </button>
          <button
            onClick={async () => {
              for (const shot of project.shots) {
                if (!shot.imagePrompt) {
                  await handleGeneratePrompts(shot.id);
                }
              }
              for (let index = 0; index < project.shots.length - 1; index += 1) {
                const currentShot = project.shots[index];
                const nextShot = project.shots[index + 1];
                if (!currentShot.transitionVideoPrompt || !currentShot.transitionVideoPromptZh) {
                  await handleGenerateTransitionPrompt(currentShot.id, nextShot.id);
                }
              }
            }}
            className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <FileText className="w-4 h-4" />
            生成所有提示词
          </button>
          <button
            onClick={async () => {
              for (const shot of project.shots) {
                if (shot.imagePrompt && !shot.imageUrl) {
                  await handleGenerateFirstFrame(shot.id);
                }
                if (shot.imagePrompt && hasLastFramePrompt(shot) && !shot.lastFrameImageUrl) {
                  await handleGenerateLastFrame(shot.id);
                }
              }
            }}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <ImageIcon className="w-4 h-4" />
            生成所有分镜图
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {project.shots.map((shot, index) => (
          <div
            key={shot.id}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOverShotId(shot.id);
            }}
            onDragLeave={() => {
              if (dragOverShotId === shot.id) {
                setDragOverShotId(null);
              }
            }}
            onDrop={() => {
              if (draggingShotId) {
                handleReorderShots(draggingShotId, shot.id);
              }
              setDraggingShotId(null);
              setDragOverShotId(null);
            }}
            className={`bg-zinc-900 border rounded-xl overflow-hidden transition-colors ${dragOverShotId === shot.id ? 'border-indigo-500' : 'border-zinc-800'}`}
          >
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
              <div className="flex items-center gap-4">
                <div
                  draggable
                  onDragStart={() => setDraggingShotId(shot.id)}
                  onDragEnd={() => {
                    setDraggingShotId(null);
                    setDragOverShotId(null);
                  }}
                  className="inline-flex items-center gap-2 text-zinc-500 cursor-grab active:cursor-grabbing"
                >
                  <GripVertical className="w-4 h-4" />
                  <span className="text-[10px] uppercase tracking-[0.2em]">拖动排序</span>
                </div>
                <span className="text-2xl font-black text-zinc-700 italic">#{String(shot.shotNumber).padStart(2, '0')}</span>
                <div className="flex flex-wrap gap-2">
                  <div className="flex items-center bg-zinc-800 rounded px-2 py-1 focus-within:ring-1 ring-indigo-500">
                    <input
                      type="number"
                      value={shot.duration}
                      onChange={(event) => setProject((prev) => ({
                        ...prev,
                        shots: prev.shots.map((item) => item.id === shot.id ? { ...item, duration: Number(event.target.value) } : item),
                      }))}
                      className="w-8 bg-transparent text-zinc-300 text-xs font-mono outline-none text-right"
                    />
                    <span className="text-zinc-500 text-xs font-mono ml-0.5">s</span>
                  </div>
                  <input
                    type="text"
                    value={shot.shotSize}
                    onChange={(event) => setProject((prev) => ({
                      ...prev,
                      shots: prev.shots.map((item) => item.id === shot.id ? { ...item, shotSize: event.target.value } : item),
                    }))}
                    className="px-2 py-1 bg-zinc-800 text-zinc-300 text-xs rounded outline-none focus:ring-1 ring-indigo-500 w-24"
                  />
                  <input
                    type="text"
                    value={shot.cameraAngle}
                    onChange={(event) => setProject((prev) => ({
                      ...prev,
                      shots: prev.shots.map((item) => item.id === shot.id ? { ...item, cameraAngle: event.target.value } : item),
                    }))}
                    className="px-2 py-1 bg-zinc-800 text-zinc-300 text-xs rounded outline-none focus:ring-1 ring-indigo-500 w-24"
                  />
                  <input
                    type="text"
                    value={shot.cameraMovement}
                    onChange={(event) => setProject((prev) => ({
                      ...prev,
                      shots: prev.shots.map((item) => item.id === shot.id ? { ...item, cameraMovement: event.target.value } : item),
                    }))}
                    className="px-2 py-1 bg-zinc-800 text-zinc-300 text-xs rounded outline-none focus:ring-1 ring-indigo-500 w-24"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => index > 0 && handleReorderShots(shot.id, project.shots[index - 1].id)}
                  disabled={index === 0}
                  className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="上移镜头"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => index < project.shots.length - 1 && handleReorderShots(shot.id, project.shots[index + 1].id)}
                  disabled={index === project.shots.length - 1}
                  className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="下移镜头"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleGeneratePrompts(shot.id)}
                  disabled={generatingPrompts[shot.id]}
                  data-testid={`shot-generate-prompts-${shot.id}`}
                  className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
                  title="生成提示词"
                >
                  {generatingPrompts[shot.id] ? <img src="/assets/loading.gif" alt="" className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setProject((prev) => ({ ...prev, shots: resequenceShots(prev.shots.filter((item) => item.id !== shot.id)) }))}
                  className="p-2 hover:bg-red-500/10 rounded-lg text-zinc-500 hover:text-red-400 transition-colors"
                  title="删除镜头"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                {renderOperationModelPanel(`shot-prompt-${shot.id}`, 'text')}
                <div>
                  <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">画面动作</h4>
                  <textarea
                    value={shot.action}
                    onChange={(event) => setProject((prev) => ({
                      ...prev,
                      shots: prev.shots.map((item) => item.id === shot.id ? { ...item, action: event.target.value } : item),
                    }))}
                    className="w-full bg-transparent text-white border-b border-transparent hover:border-zinc-800 focus:border-indigo-500 outline-none resize-none transition-colors"
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">主体</h4>
                    <input
                      type="text"
                      value={shot.subject}
                      onChange={(event) => setProject((prev) => ({
                        ...prev,
                        shots: prev.shots.map((item) => item.id === shot.id ? { ...item, subject: event.target.value } : item),
                      }))}
                      className="w-full bg-transparent text-zinc-300 text-sm border-b border-transparent hover:border-zinc-800 focus:border-indigo-500 outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">情绪</h4>
                    <input
                      type="text"
                      value={shot.mood}
                      onChange={(event) => setProject((prev) => ({
                        ...prev,
                        shots: prev.shots.map((item) => item.id === shot.id ? { ...item, mood: event.target.value } : item),
                      }))}
                      className="w-full bg-transparent text-zinc-300 text-sm border-b border-transparent hover:border-zinc-800 focus:border-indigo-500 outline-none transition-colors"
                    />
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">台词 / 旁白</h4>
                  <input
                    type="text"
                    value={shot.dialog || ''}
                    onChange={(event) => setProject((prev) => ({
                      ...prev,
                      shots: prev.shots.map((item) => item.id === shot.id ? { ...item, dialog: event.target.value } : item),
                    }))}
                    placeholder="可选台词或旁白..."
                    className="w-full bg-transparent text-zinc-300 text-sm italic border-b border-transparent hover:border-zinc-800 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>

                <div className="mt-4 pt-4 border-t border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">一致性参考资产 (最多5个)</h4>
                  </div>
                  <div className="flex gap-2">
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
                                  if (refs.length >= 5) {
                                    alert('最多只能选择5个参考资产。');
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

                <div className="mt-4 pt-4 border-t border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">同组已生成图片参考 (最多4张)</h4>
                    <span className="text-[10px] text-zinc-600">
                      {(shot.groupReferenceImageIds || []).length} / 4
                    </span>
                  </div>
                  {currentGroupImageAssets.filter((item) => item.imageUrl !== shot.imageUrl && item.imageUrl !== shot.lastFrameImageUrl).length === 0 ? (
                    <p className="text-xs text-zinc-600">当前分组还没有可复用的已生成图片。</p>
                  ) : (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {currentGroupImageAssets
                        .filter((item) => item.imageUrl !== shot.imageUrl && item.imageUrl !== shot.lastFrameImageUrl)
                        .map((image) => {
                          const isSelected = shot.groupReferenceImageIds?.includes(image.id);
                          return (
                            <button
                              key={image.id}
                              type="button"
                              onClick={() => toggleShotGroupReferenceImage(shot.id, image.id)}
                              className={`shrink-0 w-20 ${isSelected ? 'opacity-100' : 'opacity-75 hover:opacity-100'} transition-opacity`}
                              title={`${image.projectName} / ${image.title}`}
                            >
                              <div className={`relative w-20 h-20 rounded-lg overflow-hidden border ${isSelected ? 'border-indigo-500 ring-2 ring-indigo-500/30' : 'border-zinc-800'}`}>
                                <img src={image.imageUrl} alt={image.title} className="w-full h-full object-cover" />
                                <span className="absolute left-1 top-1 rounded bg-black/70 px-1 py-0.5 text-[9px] text-white">{image.sourceLabel}</span>
                              </div>
                              <div className="mt-1 text-[10px] text-zinc-500 line-clamp-2">{image.title}</div>
                            </button>
                          );
                        })}
                    </div>
                  )}
                  <p className="mt-2 text-[11px] text-zinc-600">首帧、尾帧生成以及“基于当前图修改”都会同时参考这里选中的同组图片。</p>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(shot.usePreviousShotBackground)}
                      onChange={(event) => setProject((prev) => ({
                        ...prev,
                        shots: prev.shots.map((item) => item.id === shot.id ? { ...item, usePreviousShotBackground: event.target.checked } : item),
                      }))}
                      className="mt-0.5 rounded bg-zinc-900 border-zinc-700 text-indigo-500 focus:ring-indigo-500"
                    />
                    <div>
                      <div className="text-sm text-white">沿用上一镜头背景</div>
                      <div className="text-[11px] text-zinc-500 mt-1">
                        {index === 0
                          ? '第一个镜头没有上一张图，可从第二个镜头开始使用。'
                          : project.shots[index - 1].lastFrameImageUrl || project.shots[index - 1].imageUrl
                            ? `生成首帧时会把镜头 ${project.shots[index - 1].shotNumber} 的已有画面作为背景参考。`
                            : `请先为镜头 ${project.shots[index - 1].shotNumber} 生成首帧或尾帧，再开启该选项。`}
                      </div>
                    </div>
                  </label>
                </div>

                {shot.imagePrompt && (
                  <div className="mt-4 pt-4 border-t border-zinc-800 relative">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" /> 首帧图像提示词 (Pro)
                      </h4>
                      <button
                        onClick={() => handleTranslatePrompts(shot.id)}
                        disabled={translatingPrompts[shot.id]}
                        className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2 py-1 rounded flex items-center gap-1 transition-colors disabled:opacity-50"
                        title="基于中文重新生成英文提示词"
                      >
                        {translatingPrompts[shot.id] ? <img src="/assets/loading.gif" alt="" className="w-3 h-3" /> : <Languages className="w-3 h-3" />}
                        中译英
                      </button>
                    </div>
                    <div className="space-y-2">
                      <textarea
                        value={shot.imagePrompt.professional}
                        onChange={(event) => setProject((prev) => ({
                          ...prev,
                          shots: prev.shots.map((item) => item.id === shot.id ? { ...item, imagePrompt: { ...item.imagePrompt!, professional: event.target.value } } : item),
                        }))}
                        className="w-full text-zinc-400 text-xs font-mono bg-black/30 p-3 rounded-lg border border-zinc-800/50 outline-none focus:border-indigo-500 resize-none"
                        rows={3}
                      />
                      <textarea
                        value={shot.imagePrompt.professionalZh}
                        onChange={(event) => setProject((prev) => ({
                          ...prev,
                          shots: prev.shots.map((item) => item.id === shot.id ? { ...item, imagePrompt: { ...item.imagePrompt!, professionalZh: event.target.value } } : item),
                        }))}
                        className="w-full text-zinc-500 text-xs bg-black/30 p-3 rounded-lg border border-zinc-800/50 outline-none focus:border-indigo-500 resize-none"
                        rows={2}
                      />
                    </div>

                    {(shot.imagePrompt.lastFrameProfessional !== undefined || shot.imagePrompt.lastFrameProfessionalZh !== undefined) && (
                      <>
                        <h4 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mt-4 mb-2 flex items-center gap-1">
                          <ImageIcon className="w-3 h-3" /> 尾帧图像提示词 (Pro)
                        </h4>
                        <div className="space-y-2">
                          <textarea
                            value={shot.imagePrompt.lastFrameProfessional || ''}
                            onChange={(event) => setProject((prev) => ({
                              ...prev,
                              shots: prev.shots.map((item) => item.id === shot.id ? { ...item, imagePrompt: { ...item.imagePrompt!, lastFrameProfessional: event.target.value } } : item),
                            }))}
                            className="w-full text-zinc-400 text-xs font-mono bg-black/30 p-3 rounded-lg border border-zinc-800/50 outline-none focus:border-indigo-500 resize-none"
                            rows={3}
                          />
                          <textarea
                            value={shot.imagePrompt.lastFrameProfessionalZh || ''}
                            onChange={(event) => setProject((prev) => ({
                              ...prev,
                              shots: prev.shots.map((item) => item.id === shot.id ? { ...item, imagePrompt: { ...item.imagePrompt!, lastFrameProfessionalZh: event.target.value } } : item),
                            }))}
                            className="w-full text-zinc-500 text-xs bg-black/30 p-3 rounded-lg border border-zinc-800/50 outline-none focus:border-indigo-500 resize-none"
                            rows={2}
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}

                {shot.videoPrompt && (
                  <div className="mt-4">
                    <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <Video className="w-3 h-3" /> 视频提示词 (文生视频)
                    </h4>
                    <div className="space-y-2">
                      <textarea
                        value={shot.videoPrompt.textToVideo}
                        onChange={(event) => setProject((prev) => ({
                          ...prev,
                          shots: prev.shots.map((item) => item.id === shot.id ? { ...item, videoPrompt: { ...item.videoPrompt!, textToVideo: event.target.value } } : item),
                        }))}
                        className="w-full text-zinc-400 text-xs font-mono bg-black/30 p-3 rounded-lg border border-zinc-800/50 outline-none focus:border-emerald-500 resize-none"
                        rows={3}
                      />
                      <textarea
                        value={shot.videoPrompt.textToVideoZh}
                        onChange={(event) => setProject((prev) => ({
                          ...prev,
                          shots: prev.shots.map((item) => item.id === shot.id ? { ...item, videoPrompt: { ...item.videoPrompt!, textToVideoZh: event.target.value } } : item),
                        }))}
                        className="w-full text-zinc-500 text-xs bg-black/30 p-3 rounded-lg border border-zinc-800/50 outline-none focus:border-emerald-500 resize-none"
                        rows={2}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-4">
                {renderOperationModelPanel(`shot-image-${shot.id}`, 'image')}
                <div className={`bg-black/50 rounded-lg border border-zinc-800 overflow-hidden flex flex-col items-center justify-center ${shotAspectClass} relative group`}>
                  <div className="absolute top-2 left-2 bg-black/80 text-white text-xs px-2 py-1 rounded backdrop-blur-sm z-10">首帧</div>
                  {shot.imageUrl ? (
                    <>
                      <img src={shot.imageUrl} alt={`Shot ${shot.shotNumber} First Frame`} className="w-full h-full object-cover cursor-pointer" onClick={() => setPreviewImage(shot.imageUrl!)} />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-sm pointer-events-none">
                        <div className="flex gap-2 pointer-events-auto">
                          <button
                            onClick={() => setPreviewImage(shot.imageUrl!)}
                            className="bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 transition-colors"
                            title="预览首帧"
                          >
                            <Eye className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDownloadImage(shot.imageUrl!, `shot-${shot.shotNumber}-first-frame.png`)}
                            className="bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 transition-colors"
                            title="下载首帧"
                          >
                            <Upload className="w-3 h-3 rotate-180" />
                          </button>
                          <button
                            onClick={() => setProject((prev) => ({
                              ...prev,
                              shots: prev.shots.map((item) => item.id === shot.id ? { ...item, imageUrl: '' } : item),
                            }))}
                            className="bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 transition-colors"
                            title="清空首帧"
                          >
                            <X className="w-3 h-3" />
                            清空
                          </button>
                          <button
                            onClick={() => handleGenerateFirstFrame(shot.id)}
                            disabled={generatingImages[`${shot.id}_first`]}
                            data-testid={`shot-generate-first-frame-${shot.id}`}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 transition-colors disabled:opacity-50"
                          >
                            {generatingImages[`${shot.id}_first`] ? <img src="/assets/loading.gif" alt="" className="w-3 h-3" /> : <RefreshCw className="w-3 h-3" />}
                            重新生成
                          </button>
                          <label className="bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer">
                            <Upload className="w-3 h-3" />
                            上传
                            <input type="file" accept="image/*" className="hidden" onChange={(event) => handleUploadFirstFrame(event, shot.id)} />
                          </label>
                        </div>
                      </div>
                      {generatingImages[`${shot.id}_first`] && (
                        <div className="studio-loading-overlay text-[var(--studio-text)]">
                          <img src="/assets/loading.gif" alt="" className="studio-loading-gif" />
                          <div className="studio-loading-content">
                            <span className="text-xs font-medium">首帧重新生成中...</span>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center p-4 my-auto w-full h-full flex flex-col items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                      <p className="text-xs text-zinc-500 mb-4">未生成首帧</p>
                      <div className="flex gap-2 flex-wrap justify-center">
                        {shot.imagePrompt && (
                          <button
                            onClick={() => handleGenerateFirstFrame(shot.id)}
                            disabled={generatingImages[`${shot.id}_first`]}
                            data-testid={`shot-generate-first-frame-${shot.id}`}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 transition-colors disabled:opacity-50"
                          >
                            {generatingImages[`${shot.id}_first`] ? <img src="/assets/loading.gif" alt="" className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                            生成
                          </button>
                        )}
                        <label className="bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer">
                          <Upload className="w-3 h-3" />
                          上传
                          <input type="file" accept="image/*" className="hidden" onChange={(event) => handleUploadFirstFrame(event, shot.id)} />
                        </label>
                        <button
                          type="button"
                          onClick={() => setHistoryMaterialPicker({ shotId: shot.id, frameType: 'first' })}
                          disabled={currentGroupImageAssets.filter((item) => item.imageUrl !== shot.imageUrl && item.imageUrl !== shot.lastFrameImageUrl).length === 0}
                          className="bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 transition-colors disabled:opacity-50"
                        >
                          <Eye className="w-3 h-3" />
                          选择历史素材
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {shot.imageUrl && (
                  <div className={frameEditPanelClass}>
                    <div className="flex items-center justify-between gap-3">
                      <h5 className={frameEditHeadingClass}>基于当前首帧修改</h5>
                      <div className="flex items-center gap-2">
                        <span className={frameEditMetaClass}>以当前首帧为底图</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: 'camera-angle' as const, label: '修改摄像机视角' },
                        { id: 'replace-object' as const, label: '替换物体' },
                        { id: 'remove-foreground' as const, label: '去除前景人物/物体' },
                      ].map((template) => (
                        <button
                          key={`${shot.id}-first-${template.id}`}
                          type="button"
                          onClick={() => setFrameEditPrompts((prev) => ({
                            ...prev,
                            [getFrameEditPromptKey(shot.id, 'first')]: getFrameEditTemplate(template.id),
                          }))}
                          className={frameEditTemplateButtonClass}
                        >
                          {template.label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={frameEditPrompts[getFrameEditPromptKey(shot.id, 'first')] || ''}
                      onChange={(event) => setFrameEditPrompts((prev) => ({ ...prev, [getFrameEditPromptKey(shot.id, 'first')]: event.target.value }))}
                      rows={4}
                      placeholder="输入修改要求，系统会基于当前首帧进行修改。"
                      className={frameEditTextareaClass}
                    />
                    <button
                      type="button"
                      onClick={() => handleModifyFrameFromCurrentImage(shot.id, 'first')}
                      disabled={generatingImages[`${shot.id}_first_edit`]}
                      className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {generatingImages[`${shot.id}_first_edit`]
                        ? <span className="inline-flex items-center gap-2"><img src="/assets/loading.gif" alt="" className="w-4 h-4" />修改中</span>
                        : '基于当前首帧修改'}
                    </button>
                  </div>
                )}
                <div className={`bg-black/50 rounded-lg border border-zinc-800 overflow-hidden flex flex-col items-center justify-center ${shotAspectClass} relative group`}>
                  <div className="absolute top-2 left-2 bg-black/80 text-white text-xs px-2 py-1 rounded backdrop-blur-sm z-10">尾帧</div>
                  {shot.lastFrameImageUrl ? (
                    <>
                      <img src={shot.lastFrameImageUrl} alt={`Shot ${shot.shotNumber} Last Frame`} className="w-full h-full object-cover cursor-pointer" onClick={() => setPreviewImage(shot.lastFrameImageUrl!)} />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-sm pointer-events-none">
                        <div className="flex gap-2 pointer-events-auto">
                          <button
                            onClick={() => setPreviewImage(shot.lastFrameImageUrl!)}
                            className="bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 transition-colors"
                            title="预览尾帧"
                          >
                            <Eye className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDownloadImage(shot.lastFrameImageUrl!, `shot-${shot.shotNumber}-last-frame.png`)}
                            className="bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 transition-colors"
                            title="下载尾帧"
                          >
                            <Upload className="w-3 h-3 rotate-180" />
                          </button>
                          <button
                            onClick={() => setProject((prev) => ({
                              ...prev,
                              shots: prev.shots.map((item) => item.id === shot.id ? { ...item, lastFrameImageUrl: '' } : item),
                            }))}
                            className="bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 transition-colors"
                            title="清空尾帧"
                          >
                            <X className="w-3 h-3" />
                            清空
                          </button>
                          <button
                            onClick={() => handleGenerateLastFrame(shot.id)}
                            disabled={generatingImages[`${shot.id}_last`] || !shot.imageUrl}
                            data-testid={`shot-generate-last-frame-${shot.id}`}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 transition-colors disabled:opacity-50"
                          >
                            {generatingImages[`${shot.id}_last`] ? <img src="/assets/loading.gif" alt="" className="w-3 h-3" /> : <RefreshCw className="w-3 h-3" />}
                            重新生成
                          </button>
                          <label className="bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer">
                            <Upload className="w-3 h-3" />
                            上传
                            <input type="file" accept="image/*" className="hidden" onChange={(event) => handleUploadLastFrame(event, shot.id)} />
                          </label>
                        </div>
                      </div>
                      {generatingImages[`${shot.id}_last`] && (
                        <div className="studio-loading-overlay text-[var(--studio-text)]">
                          <img src="/assets/loading.gif" alt="" className="studio-loading-gif" />
                          <div className="studio-loading-content">
                            <span className="text-xs font-medium">尾帧重新生成中...</span>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center p-4 my-auto w-full h-full flex flex-col items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                      <p className="text-xs text-zinc-500 mb-4">未生成尾帧</p>
                      <div className="flex gap-2 flex-wrap justify-center">
                        {shot.imagePrompt && hasLastFramePrompt(shot) && (
                          <button
                            onClick={() => handleGenerateLastFrame(shot.id)}
                            disabled={generatingImages[`${shot.id}_last`] || !shot.imageUrl}
                            data-testid={`shot-generate-last-frame-${shot.id}`}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 transition-colors disabled:opacity-50"
                            title={!shot.imageUrl ? '请先生成或上传首帧' : ''}
                          >
                            {generatingImages[`${shot.id}_last`] ? <img src="/assets/loading.gif" alt="" className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                            生成
                          </button>
                        )}
                        <label className="bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer">
                          <Upload className="w-3 h-3" />
                          上传
                          <input type="file" accept="image/*" className="hidden" onChange={(event) => handleUploadLastFrame(event, shot.id)} />
                        </label>
                        <button
                          type="button"
                          onClick={() => setHistoryMaterialPicker({ shotId: shot.id, frameType: 'last' })}
                          disabled={currentGroupImageAssets.filter((item) => item.imageUrl !== shot.imageUrl && item.imageUrl !== shot.lastFrameImageUrl).length === 0}
                          className="bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 transition-colors disabled:opacity-50"
                        >
                          <Eye className="w-3 h-3" />
                          选择历史素材
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {shot.lastFrameImageUrl && (
                  <div className={frameEditPanelClass}>
                    <div className="flex items-center justify-between gap-3">
                      <h5 className={frameEditHeadingClass}>基于当前尾帧修改</h5>
                      <div className="flex items-center gap-2">
                        <span className={frameEditMetaClass}>以当前尾帧为底图</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: 'camera-angle' as const, label: '修改摄像机视角' },
                        { id: 'replace-object' as const, label: '替换物体' },
                        { id: 'remove-foreground' as const, label: '去除前景人物/物体' },
                      ].map((template) => (
                        <button
                          key={`${shot.id}-last-${template.id}`}
                          type="button"
                          onClick={() => setFrameEditPrompts((prev) => ({
                            ...prev,
                            [getFrameEditPromptKey(shot.id, 'last')]: getFrameEditTemplate(template.id),
                          }))}
                          className={frameEditTemplateButtonClass}
                        >
                          {template.label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={frameEditPrompts[getFrameEditPromptKey(shot.id, 'last')] || ''}
                      onChange={(event) => setFrameEditPrompts((prev) => ({ ...prev, [getFrameEditPromptKey(shot.id, 'last')]: event.target.value }))}
                      rows={4}
                      placeholder="输入修改要求，系统会基于当前尾帧进行修改。"
                      className={frameEditTextareaClass}
                    />
                    <button
                      type="button"
                      onClick={() => handleModifyFrameFromCurrentImage(shot.id, 'last')}
                      disabled={generatingImages[`${shot.id}_last_edit`]}
                      className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {generatingImages[`${shot.id}_last_edit`]
                        ? <span className="inline-flex items-center gap-2"><img src="/assets/loading.gif" alt="" className="w-4 h-4" />修改中</span>
                        : '基于当前尾帧修改'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
