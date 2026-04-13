import type { ChangeEvent, Dispatch, ReactNode, SetStateAction } from 'react';

import { Eye, FileText, Film, Image as ImageIcon, Package, Plus, Trash2, Upload, Users } from 'lucide-react';
import { motion } from 'motion/react';

import { StudioSelect } from '../../../components/studio/StudioPrimitives.tsx';
import type { Asset, AspectRatio, Project } from '../../../types.ts';
import {
  ASPECT_RATIO_OPTIONS,
  ASSET_TYPE_LABELS,
  CHARACTER_DETAIL_FIELDS,
  CHARACTER_TYPE_OPTIONS,
  PRODUCT_DETAIL_FIELDS,
  SCENE_DETAIL_FIELDS,
  createEmptyAssetDraft,
  normalizeCharacterType,
  type CharacterPrompt,
  type ProductPrompt,
} from '../utils/creativeFlowHelpers.ts';

type CreativeBriefPageProps = {
  project: Project;
  newAsset: Partial<Asset>;
  isAddingAsset: boolean;
  isGeneratingShots: boolean;
  generatingAssetImages: Record<string, boolean>;
  generatingAssetPrompts: Record<string, boolean>;
  setProject: Dispatch<SetStateAction<Project>>;
  setPreviewImage: Dispatch<SetStateAction<string | null>>;
  setNewAsset: Dispatch<SetStateAction<Partial<Asset>>>;
  setIsAddingAsset: Dispatch<SetStateAction<boolean>>;
  renderOperationModelPanel: (operationKey: string, category: 'text' | 'image' | 'video') => ReactNode;
  onGenerateShots: () => void;
  onDownloadImage: (url: string, filename: string) => void;
  onGenerateAssetPrompt: (asset: Asset) => void;
  onGenerateAssetImage: (asset: Asset) => void;
  onFileUpload: (event: ChangeEvent<HTMLInputElement>, assetId: string) => void;
  onAddAsset: () => void;
  onUpdateNewAssetCharacterDetail: (key: keyof CharacterPrompt, value: CharacterPrompt[keyof CharacterPrompt]) => void;
  onUpdateAssetCharacterDetail: (assetId: string, key: keyof CharacterPrompt, value: CharacterPrompt[keyof CharacterPrompt]) => void;
  onUpdateNewAssetSceneDetail: (key: keyof NonNullable<Asset['scenePrompt']>, value: string) => void;
  onUpdateAssetSceneDetail: (assetId: string, key: keyof NonNullable<Asset['scenePrompt']>, value: string) => void;
  onUpdateNewAssetProductDetail: (key: keyof ProductPrompt, value: ProductPrompt[keyof ProductPrompt]) => void;
  onUpdateAssetProductDetail: (assetId: string, key: keyof ProductPrompt, value: ProductPrompt[keyof ProductPrompt]) => void;
};

export function CreativeBriefPage({
  project,
  newAsset,
  isAddingAsset,
  isGeneratingShots,
  generatingAssetImages,
  generatingAssetPrompts,
  setProject,
  setPreviewImage,
  setNewAsset,
  setIsAddingAsset,
  renderOperationModelPanel,
  onGenerateShots,
  onDownloadImage,
  onGenerateAssetPrompt,
  onGenerateAssetImage,
  onFileUpload,
  onAddAsset,
  onUpdateNewAssetCharacterDetail,
  onUpdateAssetCharacterDetail,
  onUpdateNewAssetSceneDetail,
  onUpdateAssetSceneDetail,
  onUpdateNewAssetProductDetail,
  onUpdateAssetProductDetail,
}: CreativeBriefPageProps) {
  if (!project.brief) {
    return null;
  }

  const hasMissingAssetImages = project.assets.some((asset) => !asset.imageUrl);
  const canSaveNewAsset = Boolean(newAsset.name?.trim()) && (
    newAsset.type === 'character'
    || newAsset.type === 'scene'
    || Boolean(newAsset.description?.trim())
  );
  const characterAssets = project.assets.filter((asset) => asset.type === 'character');
  const sceneAssets = project.assets.filter((asset) => asset.type === 'scene');
  const otherAssets = project.assets.filter((asset) => asset.type !== 'character' && asset.type !== 'scene');

  const renderAssetCard = (asset: Asset) => (
    <div key={asset.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex gap-4 items-start">
      <div
        className="w-40 h-40 bg-zinc-800 rounded-lg flex items-center justify-center shrink-0 overflow-hidden relative group cursor-pointer"
        onClick={() => asset.imageUrl && setPreviewImage(asset.imageUrl)}
      >
        {asset.imageUrl ? (
          <img src={asset.imageUrl} className="w-full h-full object-cover" />
        ) : (
          asset.type === 'character'
            ? <Users className="w-8 h-8 text-zinc-500" />
            : asset.type === 'product'
              ? <Package className="w-8 h-8 text-zinc-500" />
              : <ImageIcon className="w-8 h-8 text-zinc-500" />
        )}
        <div
          className="absolute inset-0 bg-black/65 opacity-0 group-hover:opacity-100 transition-opacity p-3 flex items-center justify-center"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="grid grid-cols-2 gap-2 w-full">
            {asset.imageUrl ? (
              <button
                onClick={() => setPreviewImage(asset.imageUrl!)}
                className="text-[11px] bg-zinc-700 text-white px-2 py-1.5 rounded hover:bg-zinc-600 flex items-center justify-center gap-1 min-w-0"
              >
                <Eye className="w-3 h-3 shrink-0" />
                <span className="truncate">预览</span>
              </button>
            ) : <div />}
            {asset.imageUrl ? (
              <button
                onClick={() => onDownloadImage(asset.imageUrl!, `${asset.name}.png`)}
                className="text-[11px] bg-zinc-700 text-white px-2 py-1.5 rounded hover:bg-zinc-600 flex items-center justify-center gap-1 min-w-0"
              >
                <Upload className="w-3 h-3 rotate-180 shrink-0" />
                <span className="truncate">下载</span>
              </button>
            ) : <div />}
            <button
              onClick={() => onGenerateAssetImage(asset)}
              disabled={generatingAssetImages[asset.id]}
              data-testid={`asset-generate-${asset.id}`}
              className="text-[11px] bg-indigo-600 text-white px-2 py-1.5 rounded hover:bg-indigo-500 disabled:opacity-50 flex items-center justify-center gap-1 min-w-0"
            >
              {generatingAssetImages[asset.id] ? <img src="./assets/loading.gif" alt="" className="w-3 h-3 shrink-0" /> : <ImageIcon className="w-3 h-3 shrink-0" />}
              <span className="truncate">生成</span>
            </button>
            <label className="text-[11px] bg-zinc-700 text-white px-2 py-1.5 rounded hover:bg-zinc-600 cursor-pointer flex items-center justify-center gap-1 min-w-0">
              <Upload className="w-3 h-3 shrink-0" />
              <span className="truncate">上传</span>
              <input type="file" accept="image/*" className="hidden" onChange={(event) => onFileUpload(event, asset.id)} />
            </label>
          </div>
        </div>
        {generatingAssetImages[asset.id] && (
          <div className="studio-loading-overlay text-[var(--studio-text)]">
            <img src="./assets/loading.gif" alt="" className="studio-loading-gif" />
            <div className="studio-loading-content">
              <span className="text-[10px] font-medium">生成中...</span>
            </div>
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 flex flex-col">
        <div className="flex items-start gap-2 mb-2">
          <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 bg-zinc-800 text-zinc-300 rounded uppercase tracking-wider">
            {ASSET_TYPE_LABELS[asset.type]}
          </span>
          <input
            type="text"
            value={asset.name}
            onChange={(event) => setProject((prev) => ({
              ...prev,
              assets: prev.assets.map((item) => item.id === asset.id ? { ...item, name: event.target.value } : item),
            }))}
            className="min-w-0 flex-1 font-medium text-white bg-transparent border-b border-transparent hover:border-zinc-800 focus:border-indigo-500 outline-none transition-colors"
          />
          <button
            onClick={() => setProject((prev) => ({ ...prev, assets: prev.assets.filter((item) => item.id !== asset.id) }))}
            data-testid={`asset-delete-${asset.id}`}
            className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors shrink-0"
            title="删除资产"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        <textarea
          value={asset.description}
          onChange={(event) => setProject((prev) => ({
            ...prev,
            assets: prev.assets.map((item) => item.id === asset.id ? { ...item, description: event.target.value } : item),
          }))}
          placeholder={asset.type === 'character'
            ? '角色基础描述（可留空）'
            : asset.type === 'scene'
              ? '场景基础描述（可留空）'
              : asset.type === 'product'
                ? '产品基础描述（建议填写）'
                : '添加基础描述...'}
          className="w-full flex-1 bg-transparent text-xs text-zinc-400 border-b border-transparent hover:border-zinc-800 focus:border-indigo-500 outline-none resize-none transition-colors"
        />
        {(asset.type === 'character' || asset.type === 'scene' || asset.type === 'product') && (
          <details className="mt-2 rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2">
            <summary className="cursor-pointer text-[11px] text-zinc-500">高级一致性字段（可选）</summary>
            {asset.type === 'character' && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                <label className="block">
                  <span className="block text-[10px] text-zinc-500 mb-1">角色类型（必选）</span>
                  <StudioSelect
                    value={normalizeCharacterType(asset.characterPrompt?.characterType)}
                    onChange={(event) => onUpdateAssetCharacterDetail(asset.id, 'characterType', event.target.value === 'animal' ? 'animal' : 'human')}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-1.5 text-[11px] text-white outline-none focus:border-indigo-500"
                  >
                    {CHARACTER_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </StudioSelect>
                </label>
                {CHARACTER_DETAIL_FIELDS.map((field) => (
                  <label key={`${asset.id}-${field.key}`} className="block">
                    <span className="block text-[10px] text-zinc-500 mb-1">{field.label}</span>
                    <input
                      type="text"
                      value={asset.characterPrompt?.[field.key] || ''}
                      onChange={(event) => onUpdateAssetCharacterDetail(asset.id, field.key, event.target.value)}
                      placeholder={field.placeholder}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-1.5 text-[11px] text-white outline-none focus:border-indigo-500"
                    />
                  </label>
                ))}
              </div>
            )}
            {asset.type === 'scene' && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                {SCENE_DETAIL_FIELDS.map((field) => (
                  <label key={`${asset.id}-${field.key}`} className="block">
                    <span className="block text-[10px] text-zinc-500 mb-1">{field.label}</span>
                    <input
                      type="text"
                      value={asset.scenePrompt?.[field.key] || ''}
                      onChange={(event) => onUpdateAssetSceneDetail(asset.id, field.key, event.target.value)}
                      placeholder={field.placeholder}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-1.5 text-[11px] text-white outline-none focus:border-indigo-500"
                    />
                  </label>
                ))}
              </div>
            )}
            {asset.type === 'product' && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                {PRODUCT_DETAIL_FIELDS.map((field) => (
                  <label key={`${asset.id}-${field.key}`} className="block">
                    <span className="block text-[10px] text-zinc-500 mb-1">{field.label}</span>
                    <input
                      type="text"
                      value={asset.productPrompt?.[field.key] || ''}
                      onChange={(event) => onUpdateAssetProductDetail(asset.id, field.key, event.target.value)}
                      placeholder={field.placeholder}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-1.5 text-[11px] text-white outline-none focus:border-indigo-500"
                    />
                  </label>
                ))}
              </div>
            )}
          </details>
        )}
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] font-medium text-zinc-500 uppercase">图像提示词 (英文)</label>
            <button
              onClick={() => onGenerateAssetPrompt(asset)}
              disabled={generatingAssetPrompts[asset.id]}
              className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
            >
              {generatingAssetPrompts[asset.id] ? <img src="./assets/loading.gif" alt="" className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
              生成/翻译提示词
            </button>
          </div>
          {renderOperationModelPanel(`asset-prompt-${asset.id}`, 'text')}
          <textarea
            value={asset.imagePrompt || ''}
            onChange={(event) => setProject((prev) => ({
              ...prev,
              assets: prev.assets.map((item) => item.id === asset.id ? { ...item, imagePrompt: event.target.value } : item),
            }))}
            placeholder="输入英文提示词，或点击上方按钮自动生成..."
            className="w-full h-16 bg-black/30 text-xs text-zinc-400 font-mono border border-zinc-800/50 rounded p-2 outline-none focus:border-indigo-500 resize-none transition-colors"
          />
        </div>
        <div className="mt-3">
          {renderOperationModelPanel(`asset-image-${asset.id}`, 'image')}
        </div>
      </div>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white">创意简报</h2>
          <p className="text-zinc-400 text-sm mt-1">你的想法的结构化拆解。你可以编辑这些细节。</p>
        </div>
        <button
          onClick={onGenerateShots}
          disabled={isGeneratingShots || hasMissingAssetImages}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 disabled:opacity-50 transition-colors"
          title={hasMissingAssetImages ? '请先为所有资产生成或上传图片' : ''}
        >
          {isGeneratingShots ? <img src="./assets/loading.gif" alt="" className="w-4 h-4" /> : <Film className="w-4 h-4" />}
          生成分镜列表
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">题材</h3>
              <input
                type="text"
                value={project.brief.theme}
                onChange={(event) => setProject((prev) => prev.brief ? { ...prev, brief: { ...prev.brief, theme: event.target.value } } : prev)}
                className="w-full bg-transparent text-white border-b border-transparent hover:border-zinc-800 focus:border-indigo-500 outline-none transition-colors"
              />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">风格</h3>
              <input
                type="text"
                value={project.brief.style}
                onChange={(event) => setProject((prev) => prev.brief ? { ...prev, brief: { ...prev.brief, style: event.target.value } } : prev)}
                className="w-full bg-transparent text-white border-b border-transparent hover:border-zinc-800 focus:border-indigo-500 outline-none transition-colors"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">画幅比例</h3>
              <StudioSelect
                value={project.brief.aspectRatio}
                onChange={(event) => setProject((prev) => prev.brief ? {
                  ...prev,
                  inputAspectRatio: event.target.value as AspectRatio,
                  brief: { ...prev.brief, aspectRatio: event.target.value as AspectRatio },
                } : prev)}
                className="w-full bg-transparent text-white border-b border-transparent hover:border-zinc-800 focus:border-indigo-500 outline-none transition-colors"
              >
                {ASPECT_RATIO_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.value}</option>
                ))}
              </StudioSelect>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">时长</h3>
              <input
                type="text"
                value={project.brief.duration}
                onChange={(event) => setProject((prev) => prev.brief ? { ...prev, brief: { ...prev.brief, duration: event.target.value } } : prev)}
                className="w-full bg-transparent text-white border-b border-transparent hover:border-zinc-800 focus:border-indigo-500 outline-none transition-colors"
              />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">发布平台</h3>
              <input
                type="text"
                value={project.brief.platform}
                onChange={(event) => setProject((prev) => prev.brief ? { ...prev, brief: { ...prev.brief, platform: event.target.value } } : prev)}
                className="w-full bg-transparent text-white border-b border-transparent hover:border-zinc-800 focus:border-indigo-500 outline-none transition-colors"
              />
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">情绪</h3>
            <input
              type="text"
              value={project.brief.mood}
              onChange={(event) => setProject((prev) => prev.brief ? { ...prev, brief: { ...prev.brief, mood: event.target.value } } : prev)}
              className="w-full bg-transparent text-white border-b border-transparent hover:border-zinc-800 focus:border-indigo-500 outline-none transition-colors"
            />
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          <div>
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">角色 (逗号分隔)</h3>
            <textarea
              value={project.brief.characters.join(', ')}
              onChange={(event) => setProject((prev) => prev.brief ? {
                ...prev,
                brief: {
                  ...prev.brief,
                  characters: event.target.value.split(',').map((item) => item.trim()).filter(Boolean),
                },
              } : prev)}
              className="w-full bg-transparent text-white border-b border-transparent hover:border-zinc-800 focus:border-indigo-500 outline-none resize-none transition-colors"
              rows={2}
            />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">场景 (逗号分隔)</h3>
            <textarea
              value={project.brief.scenes.join(', ')}
              onChange={(event) => setProject((prev) => prev.brief ? {
                ...prev,
                brief: {
                  ...prev.brief,
                  scenes: event.target.value.split(',').map((item) => item.trim()).filter(Boolean),
                },
              } : prev)}
              className="w-full bg-transparent text-white border-b border-transparent hover:border-zinc-800 focus:border-indigo-500 outline-none resize-none transition-colors"
              rows={2}
            />
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 md:col-span-2">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">事件摘要</h3>
          <textarea
            value={project.brief.events}
            onChange={(event) => setProject((prev) => prev.brief ? { ...prev, brief: { ...prev.brief, events: event.target.value } } : prev)}
            className="w-full bg-transparent text-white border-b border-transparent hover:border-zinc-800 focus:border-indigo-500 outline-none resize-none transition-colors leading-relaxed"
            rows={4}
          />
        </div>
      </div>

      <div className="mt-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white">一致性资产</h2>
            <p className="text-zinc-400 text-sm mt-1">先写基础描述即可，复杂一致性字段已经折叠为可选高级项。生成分镜时将自动关联。</p>
          </div>
          <button
            onClick={() => {
              setNewAsset(createEmptyAssetDraft('character'));
              setIsAddingAsset(true);
            }}
            className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            添加资产
          </button>
        </div>

        {isAddingAsset && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-8">
            <h3 className="text-lg font-medium text-white mb-4">新资产</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">类型</label>
                  <StudioSelect
                    value={newAsset.type}
                    onChange={(event) => setNewAsset((prev) => ({
                      ...prev,
                      type: event.target.value as Asset['type'],
                      characterPrompt: event.target.value === 'character'
                        ? { ...(prev.characterPrompt || {}), characterType: normalizeCharacterType(prev.characterPrompt?.characterType) }
                        : prev.characterPrompt,
                      productPrompt: event.target.value === 'product' ? { ...(prev.productPrompt || {}) } : prev.productPrompt,
                    }))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-white outline-none focus:border-indigo-500"
                  >
                    <option value="character">角色 (Character)</option>
                    <option value="scene">场景 (Scene)</option>
                    <option value="product">产品 (Product)</option>
                    <option value="style">风格 (Style)</option>
                    <option value="prop">道具 (Prop)</option>
                  </StudioSelect>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">名称</label>
                  <input
                    type="text"
                    value={newAsset.name}
                    onChange={(event) => setNewAsset((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="例如：赛博杀手，霓虹小巷"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-white outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  {newAsset.type === 'character'
                    ? '角色基础描述（建议填写）'
                    : newAsset.type === 'scene'
                      ? '场景基础描述（建议填写）'
                      : newAsset.type === 'product'
                        ? '产品基础描述（建议填写）'
                        : '基础描述'}
                </label>
                <textarea
                  value={newAsset.description}
                  onChange={(event) => setNewAsset((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder={newAsset.type === 'character'
                    ? '例如：冷峻年轻剑客，五官立体，气质克制。'
                    : newAsset.type === 'scene'
                      ? '例如：雾气缭绕的山门庭院，石灯与台阶层叠。'
                      : newAsset.type === 'product'
                        ? '例如：黑色金属桌面烤炉，前面板有 logo，适合商业产品特写。'
                        : '描述外貌、服装、光线、情绪等特征。'}
                  className="w-full h-24 bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-white outline-none focus:border-indigo-500 resize-none"
                />
              </div>
              {(newAsset.type === 'character' || newAsset.type === 'scene' || newAsset.type === 'product') && (
                <details className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3">
                  <summary className="cursor-pointer text-xs text-zinc-500">高级一致性字段（可选）</summary>
                  {newAsset.type === 'character' && (
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <label className="block">
                        <span className="block text-[11px] text-zinc-500 mb-1">角色类型（必选）</span>
                        <StudioSelect
                          value={normalizeCharacterType(newAsset.characterPrompt?.characterType)}
                          onChange={(event) => onUpdateNewAssetCharacterDetail('characterType', event.target.value === 'animal' ? 'animal' : 'human')}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-white outline-none focus:border-indigo-500"
                        >
                          {CHARACTER_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </StudioSelect>
                      </label>
                      {CHARACTER_DETAIL_FIELDS.map((field) => (
                        <label key={field.key} className="block">
                          <span className="block text-[11px] text-zinc-500 mb-1">{field.label}</span>
                          <input
                            type="text"
                            value={newAsset.characterPrompt?.[field.key] || ''}
                            onChange={(event) => onUpdateNewAssetCharacterDetail(field.key, event.target.value)}
                            placeholder={field.placeholder}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-white outline-none focus:border-indigo-500"
                          />
                        </label>
                      ))}
                    </div>
                  )}
                  {newAsset.type === 'scene' && (
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {SCENE_DETAIL_FIELDS.map((field) => (
                        <label key={field.key} className="block">
                          <span className="block text-[11px] text-zinc-500 mb-1">{field.label}</span>
                          <input
                            type="text"
                            value={newAsset.scenePrompt?.[field.key] || ''}
                            onChange={(event) => onUpdateNewAssetSceneDetail(field.key, event.target.value)}
                            placeholder={field.placeholder}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-white outline-none focus:border-indigo-500"
                          />
                        </label>
                      ))}
                    </div>
                  )}
                  {newAsset.type === 'product' && (
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {PRODUCT_DETAIL_FIELDS.map((field) => (
                        <label key={field.key} className="block">
                          <span className="block text-[11px] text-zinc-500 mb-1">{field.label}</span>
                          <input
                            type="text"
                            value={newAsset.productPrompt?.[field.key] || ''}
                            onChange={(event) => onUpdateNewAssetProductDetail(field.key, event.target.value)}
                            placeholder={field.placeholder}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-white outline-none focus:border-indigo-500"
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </details>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setIsAddingAsset(false)}
                  className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={onAddAsset}
                  disabled={!canSaveNewAsset}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  保存资产
                </button>
              </div>
            </div>
          </div>
        )}

        {project.assets.length === 0 && !isAddingAsset ? (
          <div className="text-center py-16 bg-zinc-900/50 border border-zinc-800 border-dashed rounded-xl">
            <Users className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">尚未定义资产</h3>
            <p className="text-zinc-400 max-w-md mx-auto">在此处添加角色或场景，以确保 AI 在所有镜头中生成一致的提示词。</p>
          </div>
        ) : (
          <div className="space-y-8">
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">角色一致性资产</h3>
                <span className="text-xs text-zinc-500">{characterAssets.length} 项</span>
              </div>
              {characterAssets.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {characterAssets.map((asset) => renderAssetCard(asset))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500">暂无角色资产。</p>
              )}
            </section>

            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">场景一致性资产</h3>
                <span className="text-xs text-zinc-500">{sceneAssets.length} 项</span>
              </div>
              {sceneAssets.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {sceneAssets.map((asset) => renderAssetCard(asset))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500">暂无场景资产。</p>
              )}
            </section>

            {otherAssets.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">其他资产</h3>
                  <span className="text-xs text-zinc-500">{otherAssets.length} 项</span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {otherAssets.map((asset) => renderAssetCard(asset))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
      <div className="flex justify-between items-center mt-8 pt-8 border-t border-zinc-800">
        <p className="text-sm text-zinc-500">
          {hasMissingAssetImages ? '请先为所有资产生成或上传图片以继续' : '简报和资产已准备就绪。'}
        </p>
        <button
          onClick={onGenerateShots}
          disabled={isGeneratingShots || hasMissingAssetImages}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 disabled:opacity-50 transition-colors"
          title={hasMissingAssetImages ? '请先为所有资产生成或上传图片' : ''}
        >
          {isGeneratingShots ? <img src="./assets/loading.gif" alt="" className="w-4 h-4" /> : <Film className="w-4 h-4" />}
          生成分镜列表
        </button>
      </div>
    </motion.div>
  );
}
