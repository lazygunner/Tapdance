import { useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';

import { AlertTriangle, Clapperboard, Database, Loader2, MessageSquareText, Plus, Settings2, Trash2, Upload, Video } from 'lucide-react';
import { motion } from 'motion/react';

import { StudioModal, StudioSelect } from '../../../components/studio/StudioPrimitives.tsx';
import type { ApiSettings, ModelSourceId } from '../../../types.ts';
import {
  DEFAULT_VOLCENGINE_BASE_URL,
  DEFAULT_MODEL_ROLE_META,
  getDefaultModelSource,
  getPricedModelEntries,
  getProviderModelCatalog,
  getProviderPromptLanguageCatalog,
  resolveModelSource,
  type ModelProviderId,
  type ModelRole,
} from '../../../services/apiConfig.ts';
import { clearModelInvocationLogs, type ModelInvocationLogEntry } from '../../../services/modelInvocationLog.ts';
import type { SeedanceHealth } from '../../fastVideoFlow/types/fastTypes.ts';
import {
  GEMINI_PROVIDER_MODEL_FIELDS,
  MODEL_ROLE_ORDER,
  PROMPT_LANGUAGE_FLAGS,
  PROVIDER_CARD_META,
  VOLCENGINE_PROVIDER_MODEL_FIELDS,
  VOLCENGINE_ROLE_FIELDS,
  VOLCENGINE_ROLE_SOURCE_IDS,
  type GeminiModelField,
  type VolcengineModelField,
} from '../utils/apiConfigUi.ts';

type ApiConfigPageProps = {
  apiSettings: ApiSettings;
  setApiSettings: Dispatch<SetStateAction<ApiSettings>>;
  seedanceHealth: SeedanceHealth | null;
  renderSeedanceHealthPanel: () => ReactNode;
  usdToCnyRate: number;
  modelInvocationLogs: ModelInvocationLogEntry[];
  onRestoreDefaults: () => void;
  onInitializeDatabase: () => void | Promise<void>;
  isInitializingDatabase: boolean;
  getSourceProviderKey: (sourceId: ModelSourceId) => ModelProviderId;
  getGeminiRoleModelOptions: (role: ModelRole) => Array<{ sourceId: ModelSourceId; modelName: string; label: string }>;
  getVolcengineRoleModelOptions: (role: ModelRole) => Array<{ value: string; label: string }>;
  getProviderRoleCatalogOptions: (apiSettings: ApiSettings, providerId: ModelProviderId, role: ModelRole, configuredValue: string) => Array<{ value: string; label: string }>;
  updateGeminiRoleModel: (role: ModelRole, modelId: string) => void;
};

type CustomModelDraft = {
  providerId: ModelProviderId;
  role: ModelRole;
  name: string;
  modelId: string;
};

function createCustomModelDraft(providerId: ModelProviderId): CustomModelDraft {
  return {
    providerId,
    role: 'text',
    name: '',
    modelId: '',
  };
}

function getProviderCustomModels(settings: ApiSettings, providerId: ModelProviderId) {
  return providerId === 'volcengine' ? settings.volcengine.customModels : settings.gemini.customModels;
}

function getProviderRoleConfiguredModel(settings: ApiSettings, providerId: ModelProviderId, role: ModelRole) {
  if (providerId === 'gemini') {
    if (role === 'image') {
      return settings.gemini.imageModel;
    }
    if (role === 'video') {
      return settings.gemini.fastVideoModel;
    }
    return settings.gemini.textModel;
  }

  if (role === 'image') {
    return settings.volcengine.imageModel;
  }
  if (role === 'video') {
    return settings.volcengine.videoModel;
  }
  return settings.volcengine.textModel;
}

function applyProviderRoleModelToSettings(settings: ApiSettings, providerId: ModelProviderId, role: ModelRole, modelId: string): ApiSettings {
  if (providerId === 'gemini') {
    if (role === 'image') {
      return {
        ...settings,
        gemini: {
          ...settings.gemini,
          imageModel: modelId,
          proImageModel: modelId,
        },
      };
    }

    if (role === 'video') {
      return {
        ...settings,
        gemini: {
          ...settings.gemini,
          fastVideoModel: modelId,
          proVideoModel: modelId,
        },
      };
    }

    return {
      ...settings,
      gemini: {
        ...settings.gemini,
        textModel: modelId,
      },
    };
  }

  const field = VOLCENGINE_ROLE_FIELDS[role];
  return {
    ...settings,
    volcengine: {
      ...settings.volcengine,
      [field]: modelId,
    },
  };
}

export function ApiConfigPage({
  apiSettings,
  setApiSettings,
  seedanceHealth,
  renderSeedanceHealthPanel,
  usdToCnyRate,
  modelInvocationLogs,
  onRestoreDefaults,
  onInitializeDatabase,
  isInitializingDatabase,
  getSourceProviderKey,
  getGeminiRoleModelOptions,
  getVolcengineRoleModelOptions,
  getProviderRoleCatalogOptions,
  updateGeminiRoleModel,
}: ApiConfigPageProps) {
  const [isInitializeDatabaseModalOpen, setIsInitializeDatabaseModalOpen] = useState(false);
  const [isCustomModelModalOpen, setIsCustomModelModalOpen] = useState(false);
  const [customModelDraft, setCustomModelDraft] = useState<CustomModelDraft>(() => createCustomModelDraft('gemini'));
  const [customModelError, setCustomModelError] = useState('');
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  const openCustomModelModal = (providerId: ModelProviderId) => {
    setCustomModelDraft(createCustomModelDraft(providerId));
    setCustomModelError('');
    setIsCustomModelModalOpen(true);
  };

  const closeCustomModelModal = () => {
    setCustomModelError('');
    setIsCustomModelModalOpen(false);
  };

  const handleSaveCustomModel = () => {
    const providerId = customModelDraft.providerId;
    const role = customModelDraft.role;
    const name = customModelDraft.name.trim();
    const modelId = customModelDraft.modelId.trim();

    if (!name) {
      setCustomModelError('请填写模型显示名称。');
      return;
    }

    if (!modelId) {
      setCustomModelError('请填写模型 ID / Endpoint。');
      return;
    }

    const hasDuplicate = getProviderModelCatalog(providerId, role, apiSettings)
      .some((item) => item.modelId.trim().toLowerCase() === modelId.toLowerCase());
    if (hasDuplicate) {
      setCustomModelError('该模型 ID 已存在于当前服务商的同类模型列表中。');
      return;
    }

    setApiSettings((prev) => {
      const nextCustomModels = [...getProviderCustomModels(prev, providerId), { role, name, modelId }];
      const nextSettings = providerId === 'volcengine'
        ? {
          ...prev,
          volcengine: {
            ...prev.volcengine,
            customModels: nextCustomModels,
          },
        }
        : {
          ...prev,
          gemini: {
            ...prev.gemini,
            customModels: nextCustomModels,
          },
        };

      return applyProviderRoleModelToSettings(nextSettings, providerId, role, modelId);
    });

    closeCustomModelModal();
  };

  const handleRemoveCustomModel = (providerId: ModelProviderId, role: ModelRole, modelId: string) => {
    setApiSettings((prev) => {
      const nextCustomModels = getProviderCustomModels(prev, providerId)
        .filter((item) => !(item.role === role && item.modelId === modelId));
      const nextSettings = providerId === 'volcengine'
        ? {
          ...prev,
          volcengine: {
            ...prev.volcengine,
            customModels: nextCustomModels,
          },
        }
        : {
          ...prev,
          gemini: {
            ...prev.gemini,
            customModels: nextCustomModels,
          },
        };

      if (getProviderRoleConfiguredModel(prev, providerId, role).trim() !== modelId.trim()) {
        return nextSettings;
      }

      const fallbackModelId = getProviderModelCatalog(providerId, role, nextSettings)[0]?.modelId || '';
      return applyProviderRoleModelToSettings(nextSettings, providerId, role, fallbackModelId);
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-5xl mx-auto py-8">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 mb-8">
        <div className="flex items-start gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-white text-zinc-900 flex items-center justify-center shrink-0">
            <Settings2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">默认模型配置</h2>
            <p className="text-zinc-400 text-sm mt-1">工作流只保留文本、生图、视频三类默认模型。每一类都先选供应商，再选该供应商下的具体模型。</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(Object.keys(DEFAULT_MODEL_ROLE_META) as Array<keyof typeof DEFAULT_MODEL_ROLE_META>).map((roleKey) => {
            const role = roleKey;
            const meta = DEFAULT_MODEL_ROLE_META[role];
            const value = apiSettings.defaultModels[role] || getDefaultModelSource(apiSettings, role);
            const Icon = role === 'text' ? MessageSquareText : role === 'video' ? Video : Clapperboard;
            const selectedProvider = getSourceProviderKey(value) as 'gemini' | 'volcengine';
            const geminiOptions = getGeminiRoleModelOptions(role);
            const volcengineSourceId = VOLCENGINE_ROLE_SOURCE_IDS[role];
            const volcengineOptions = getVolcengineRoleModelOptions(role);
            const providerOptions = [
              ...(geminiOptions.length > 0 ? [{ value: 'gemini' as const, label: 'Google AI Studio' }] : []),
              ...(volcengineOptions.length > 0 ? [{ value: 'volcengine' as const, label: '火山引擎 Ark' }] : []),
            ];
            const selectedModelValue = selectedProvider === 'volcengine'
              ? (resolveModelSource(apiSettings, volcengineSourceId) || volcengineOptions[0]?.value || '')
              : (geminiOptions.find((option) => option.sourceId === value)?.sourceId || geminiOptions[0]?.sourceId || '');

            return (
              <div key={role} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-zinc-300" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{meta.title}</p>
                  </div>
                </div>
                <label className="block mb-3">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider">供应商</span>
                  <StudioSelect
                    value={selectedProvider}
                    onChange={(event) => {
                      const provider = event.target.value as 'gemini' | 'volcengine';
                      if (provider === 'volcengine') {
                        setApiSettings((prev) => ({
                          ...prev,
                          defaultModels: {
                            ...prev.defaultModels,
                            [role]: VOLCENGINE_ROLE_SOURCE_IDS[role],
                          },
                        }));
                        return;
                      }

                      const nextGeminiOption = getGeminiRoleModelOptions(role)[0];
                      if (!nextGeminiOption) {
                        return;
                      }

                      setApiSettings((prev) => ({
                        ...prev,
                        defaultModels: {
                          ...prev.defaultModels,
                          [role]: nextGeminiOption.sourceId,
                        },
                      }));
                    }}
                    className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                  >
                    {providerOptions.map((provider) => (
                      <option key={provider.value} value={provider.value}>
                        {provider.label}
                      </option>
                    ))}
                  </StudioSelect>
                </label>
                <StudioSelect
                  value={selectedModelValue}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (selectedProvider === 'volcengine') {
                      const field = VOLCENGINE_ROLE_FIELDS[role];
                      setApiSettings((prev) => ({
                        ...prev,
                        volcengine: {
                          ...prev.volcengine,
                          [field]: nextValue,
                        },
                        defaultModels: {
                          ...prev.defaultModels,
                          [role]: VOLCENGINE_ROLE_SOURCE_IDS[role],
                        },
                      }));
                      return;
                    }

                    setApiSettings((prev) => ({
                      ...prev,
                      defaultModels: {
                        ...prev.defaultModels,
                        [role]: nextValue as ModelSourceId,
                      },
                    }));
                  }}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                >
                  {(selectedProvider === 'volcengine' ? volcengineOptions : geminiOptions).length === 0 ? (
                    <option value="">请先填写可用模型</option>
                  ) : (
                    (selectedProvider === 'volcengine' ? volcengineOptions : geminiOptions).map((option) => (
                      <option
                        key={selectedProvider === 'volcengine' ? option.value : option.sourceId}
                        value={selectedProvider === 'volcengine' ? option.value : option.sourceId}
                      >
                        {option.label}
                      </option>
                    ))
                  )}
                </StudioSelect>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-white">连接配置</h2>
          <p className="text-zinc-400 text-sm mt-1">管理 Gemini、火山云和 Seedance CLI 的连接方式与默认参数。配置会自动保存在当前浏览器。</p>
        </div>
        <button
          onClick={onRestoreDefaults}
          className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          恢复默认值
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {(['gemini', 'volcengine'] as ModelProviderId[]).map((providerId) => {
          const isVolcengine = providerId === 'volcengine';
          const meta = PROVIDER_CARD_META[providerId];
          const modelFieldGroups = providerId === 'gemini' ? GEMINI_PROVIDER_MODEL_FIELDS : VOLCENGINE_PROVIDER_MODEL_FIELDS;
          const promptLanguageCatalog = getProviderPromptLanguageCatalog(providerId);
          const currentPromptLanguage = isVolcengine ? apiSettings.volcengine.promptLanguage : apiSettings.gemini.promptLanguage;
          const customModels = getProviderCustomModels(apiSettings, providerId);

          return (
            <section key={providerId} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <div className="flex items-center justify-between gap-4 mb-6">
                <h3 className="text-lg font-semibold text-white">{meta.title}</h3>
                <div className="flex items-center gap-3 flex-wrap justify-end">
                  <button
                    type="button"
                    onClick={() => openCustomModelModal(providerId)}
                    className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-900 hover:text-white"
                  >
                    <Plus className="h-4 w-4" />
                    添加模型
                  </button>
                  <div className="inline-flex items-center rounded-lg border border-zinc-800 bg-zinc-950 p-1">
                    {promptLanguageCatalog.supported.map((language) => (
                      <button
                        key={`${providerId}-${language}`}
                        type="button"
                        aria-label={language === 'zh' ? '切换为中文提示词' : 'Switch to English prompts'}
                        title={language === 'zh' ? '中文提示词' : 'English prompts'}
                        onClick={() => {
                          if (isVolcengine) {
                            setApiSettings((prev) => ({ ...prev, volcengine: { ...prev.volcengine, promptLanguage: language } }));
                            return;
                          }
                          setApiSettings((prev) => ({ ...prev, gemini: { ...prev.gemini, promptLanguage: language } }));
                        }}
                        className={`h-8 w-10 rounded-md text-base leading-none transition-colors ${currentPromptLanguage === language
                          ? 'bg-indigo-600 text-white'
                          : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                          }`}
                      >
                        {PROMPT_LANGUAGE_FLAGS[language]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <label className="block">
                  <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">API Key</span>
                  <input
                    type="password"
                    value={isVolcengine ? apiSettings.volcengine.apiKey : apiSettings.gemini.apiKey}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (isVolcengine) {
                        setApiSettings((prev) => ({ ...prev, volcengine: { ...prev.volcengine, apiKey: value } }));
                        return;
                      }
                      setApiSettings((prev) => ({ ...prev, gemini: { ...prev.gemini, apiKey: value } }));
                    }}
                    placeholder={isVolcengine ? '按方舟 API Key 填写' : '留空则继续使用 AI Studio Key 或 GEMINI_API_KEY'}
                    className="mt-2 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                  />
                </label>

                {isVolcengine && (
                  <label className="block">
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">API Base URL / 第三方 Endpoint</span>
                    <input
                      value={apiSettings.volcengine.baseUrl}
                      onChange={(event) => setApiSettings((prev) => ({
                        ...prev,
                        volcengine: {
                          ...prev.volcengine,
                          baseUrl: event.target.value,
                        },
                      }))}
                      placeholder={DEFAULT_VOLCENGINE_BASE_URL}
                      className="mt-2 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                    />
                    <p className="mt-2 text-xs leading-5 text-zinc-500">
                      默认走官方地址 {DEFAULT_VOLCENGINE_BASE_URL}。如果填写第三方兼容网关，将优先使用该地址，请求火山 Ark 与 Seedance 任务 API 时都不会再走官方 URL。
                    </p>
                  </label>
                )}

                <div className="space-y-3">
                  {MODEL_ROLE_ORDER.map((role) => (
                    <div key={`${providerId}-${role}`} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                      <div className="mb-3">
                        <p className="text-xs font-semibold text-zinc-300">{DEFAULT_MODEL_ROLE_META[role].title}</p>
                      </div>
                      <div className={`grid gap-3 ${modelFieldGroups[role].length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                        {modelFieldGroups[role].map((fieldConfig) => {
                          const configuredValue = providerId === 'gemini'
                            ? apiSettings.gemini[fieldConfig.field as GeminiModelField]
                            : apiSettings.volcengine[fieldConfig.field as VolcengineModelField];
                          const options = getProviderRoleCatalogOptions(apiSettings, providerId, role, configuredValue);
                          const selectedValue = configuredValue || options[0]?.value || '';

                          return (
                            <label key={fieldConfig.sourceId} className="block">
                              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{fieldConfig.label}</span>
                              <StudioSelect
                                value={selectedValue}
                                onChange={(event) => {
                                  const nextValue = event.target.value;
                                  if (providerId === 'gemini') {
                                    updateGeminiRoleModel(role, nextValue);
                                    return;
                                  }

                                  const field = fieldConfig.field as VolcengineModelField;
                                  setApiSettings((prev) => ({
                                    ...prev,
                                    volcengine: {
                                      ...prev.volcengine,
                                      [field]: nextValue,
                                    },
                                  }));
                                }}
                                className="mt-2 w-full bg-black/30 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                              >
                                {options.length === 0 ? (
                                  <option value="">暂无可用模型</option>
                                ) : (
                                  options.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))
                                )}
                              </StudioSelect>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-xs font-semibold text-zinc-300">自定义模型</p>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                        用于补充当前服务商没有内置的模型。添加后会直接出现在对应类型的模型下拉框中。
                      </p>
                    </div>
                    <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[10px] text-zinc-400">
                      {customModels.length} 个
                    </span>
                  </div>

                  {customModels.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-zinc-800 bg-black/20 px-4 py-3 text-xs text-zinc-500">
                      还没有手动添加的模型。
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {customModels.map((item) => (
                        <div key={`${providerId}-${item.role}-${item.modelId}`} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-black/20 px-4 py-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium text-white">{item.name}</p>
                              <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-400">
                                {DEFAULT_MODEL_ROLE_META[item.role].title}
                              </span>
                            </div>
                            <p className="mt-1 truncate font-mono text-xs text-zinc-500">{item.modelId}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveCustomModel(providerId, item.role, item.modelId)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-400 transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-200"
                            aria-label={`删除模型 ${item.name}`}
                            title="删除模型"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {providerId === 'volcengine' && (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                    <div className="mb-4">
                      <p className="text-xs font-semibold text-zinc-300">Seedance 2.0 任务 API</p>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                        复用上方火山引擎 API Key。用于创意视频和极速视频中的 Ark Seedance 提交、查询和取消。
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className="block">
                        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Seedance 默认执行器</span>
                        <StudioSelect
                          value={apiSettings.seedance.defaultExecutor}
                          onChange={(event) => setApiSettings((prev) => ({
                            ...prev,
                            seedance: {
                              ...prev.seedance,
                              defaultExecutor: event.target.value as ApiSettings['seedance']['defaultExecutor'],
                            },
                          }))}
                          className="mt-2 w-full bg-black/30 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                        >
                          <option value="ark">Ark API</option>
                          <option value="cli">本地 CLI</option>
                        </StudioSelect>
                      </label>

                      <label className="block">
                        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">任务轮询间隔（秒）</span>
                        <input
                          type="number"
                          min="5"
                          max="60"
                          value={apiSettings.seedance.pollIntervalSec}
                          onChange={(event) => setApiSettings((prev) => ({
                            ...prev,
                            seedance: {
                              ...prev.seedance,
                              pollIntervalSec: Math.max(5, Math.min(60, Number(event.target.value) || 15)),
                            },
                          }))}
                          className="mt-2 w-full bg-black/30 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                        />
                      </label>

                      <label className="block">
                        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Seedance 2.0 接入点</span>
                        <input
                          value={apiSettings.seedance.apiModel}
                          onChange={(event) => setApiSettings((prev) => ({
                            ...prev,
                            seedance: {
                              ...prev.seedance,
                              apiModel: event.target.value,
                            },
                          }))}
                          placeholder="例如 doubao-seedance-2-0-260128"
                          className="mt-2 w-full bg-black/30 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                        />
                      </label>

                      <label className="block">
                        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Seedance 2.0 Fast 接入点</span>
                        <input
                          value={apiSettings.seedance.fastApiModel}
                          onChange={(event) => setApiSettings((prev) => ({
                            ...prev,
                            seedance: {
                              ...prev.seedance,
                              fastApiModel: event.target.value,
                            },
                          }))}
                          placeholder="例如 doubao-seedance-2-0-fast-260128"
                          className="mt-2 w-full bg-black/30 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                        />
                      </label>
                    </div>
                  </div>
                )}

                {providerId === 'volcengine' && (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400 leading-relaxed">
                    当前版本已内置一组按官方文档整理的火山引擎模型预设，也支持追加自定义模型和第三方兼容 Endpoint。Seedance Ark API 和通用 Ark 模型共用这一张 API Key。
                    <div className="flex flex-wrap gap-4 mt-3">
                      <a href="https://www.volcengine.com/docs/82379/1366799?lang=zh" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">
                        火山云图像生成文档
                      </a>
                      <a href="https://www.volcengine.com/docs/82379/1824121?lang=zh" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">
                        火山云视频生成文档
                      </a>
                      <a href="https://www.volcengine.com/docs/82379/1330310?lang=zh" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">
                        火山云模型列表
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <section className="mt-6 bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-lg font-semibold text-white">Seedance 2.0 CLI</h3>
            <p className="text-zinc-400 text-sm mt-1">本地 `dreamina` CLI 和 bridge 状态。API Key 与 Ark 接入点请在“字节火山引擎 API”中配置。</p>
          </div>
          {renderSeedanceHealthPanel()}
        </div>

        <div className="mt-6 grid grid-cols-1 xl:grid-cols-[0.42fr_0.58fr] gap-6">
          <div className="space-y-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">CLI 状态</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-xs ${seedanceHealth?.cliAvailable ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200' : 'border-zinc-700 bg-zinc-900 text-zinc-400'}`}>
                  CLI {seedanceHealth?.cliAvailable ? '可用' : '不可用'}
                </span>
                <span className={`rounded-full border px-2.5 py-1 text-xs ${seedanceHealth?.loginStatus === 'logged_in'
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
                  : seedanceHealth?.loginStatus === 'logged_out'
                    ? 'border-amber-500/20 bg-amber-500/10 text-amber-200'
                    : 'border-zinc-700 bg-zinc-900 text-zinc-400'
                  }`}>
                  {seedanceHealth?.loginStatus === 'logged_in' ? '已登录' : seedanceHealth?.loginStatus === 'logged_out' ? '未登录' : '状态未知'}
                </span>
                <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-400">
                  余额 {typeof seedanceHealth?.credit?.total_credit === 'number' ? seedanceHealth.credit.total_credit : '未知'}
                </span>
              </div>
              <p className="mt-3 text-xs text-zinc-500">
                {seedanceHealth?.cliAvailable
                  ? seedanceHealth?.loginStatus === 'logged_out'
                    ? '请先在本机终端执行 dreamina login 或 dreamina login --headless。'
                    : 'bridge 会通过本地命令检查 CLI、登录态和额度。'
                  : '当前未检测到 dreamina 命令，或 bridge 未启动。'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
            <Upload className="w-4 h-4 text-sky-300" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">火山 TOS 对象存储配置</h3>
            <p className="text-zinc-400 text-sm mt-1">用于上传参考视频到火山 TOS 并获取公网 URL。启用后，在极速视频流中可直接上传本地视频作为参考素材。</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={!!apiSettings.tos?.enabled}
              onClick={() => setApiSettings((prev) => ({
                ...prev,
                tos: {
                  ...prev.tos!,
                  enabled: !prev.tos?.enabled,
                },
              }))}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${apiSettings.tos?.enabled ? 'border-sky-500/40 bg-sky-500/30' : 'border-zinc-700 bg-zinc-800'}`}
            >
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${apiSettings.tos?.enabled ? 'translate-x-5.5' : 'translate-x-1'}`} />
            </button>
            <span className="text-sm text-zinc-300">启用 TOS 上传</span>
            {apiSettings.tos?.enabled && (
              <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-300">已启用</span>
            )}
          </div>

          {apiSettings.tos?.enabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <label className="block">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Region</span>
                <input
                  value={apiSettings.tos?.region || ''}
                  onChange={(event) => setApiSettings((prev) => ({ ...prev, tos: { ...prev.tos!, region: event.target.value } }))}
                  placeholder="例：cn-beijing"
                  className="mt-2 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Endpoint</span>
                <input
                  value={apiSettings.tos?.endpoint || ''}
                  onChange={(event) => setApiSettings((prev) => ({ ...prev, tos: { ...prev.tos!, endpoint: event.target.value } }))}
                  placeholder="例：https://tos-cn-beijing.volces.com（不要带 bucket 前缀）"
                  className="mt-2 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Bucket</span>
                <input
                  value={apiSettings.tos?.bucket || ''}
                  onChange={(event) => setApiSettings((prev) => ({ ...prev, tos: { ...prev.tos!, bucket: event.target.value } }))}
                  placeholder="例：my-video-bucket"
                  className="mt-2 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">路径前缀（可选）</span>
                <input
                  value={apiSettings.tos?.pathPrefix || ''}
                  onChange={(event) => setApiSettings((prev) => ({ ...prev, tos: { ...prev.tos!, pathPrefix: event.target.value } }))}
                  placeholder="例：reference-videos/"
                  className="mt-2 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">AccessKey ID</span>
                <input
                  type="password"
                  value={apiSettings.tos?.accessKeyId || ''}
                  onChange={(event) => setApiSettings((prev) => ({ ...prev, tos: { ...prev.tos!, accessKeyId: event.target.value } }))}
                  placeholder="AK..."
                  className="mt-2 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">AccessKey Secret</span>
                <input
                  type="password"
                  value={apiSettings.tos?.accessKeySecret || ''}
                  onChange={(event) => setApiSettings((prev) => ({ ...prev, tos: { ...prev.tos!, accessKeySecret: event.target.value } }))}
                  placeholder="SK..."
                  className="mt-2 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
                />
              </label>

              <div className="md:col-span-2 rounded-xl border border-amber-500/20 bg-amber-500/6 px-4 py-3 text-xs text-amber-200 leading-5">
                ⚠️ AK/SK 仅存储在当前浏览器本地，不会上传到任何服务器。仅适合内部工具使用，请勿在生产环境中暴露密钥。
              </div>

              <div className="md:col-span-2 rounded-xl border border-sky-500/20 bg-sky-500/6 px-4 py-4 text-xs leading-5">
                <div className="font-semibold text-sky-300 mb-2">📋 必须先在 TOS 控制台配置 Bucket CORS 规则（浏览器直传必需）</div>
                <p className="text-zinc-400 mb-3">
                  进入 <strong className="text-zinc-200">火山云控制台 → 对象存储 → 选择 Bucket → 权限管理 → 跨域设置</strong>，新增如下规则：
                </p>
                {currentOrigin ? (
                  <div className="mb-3 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface-soft)] px-3 py-2">
                    <div className="text-zinc-500 uppercase tracking-[0.2em] text-[10px]">当前应用域名</div>
                    <div className="mt-1 break-all font-mono text-emerald-300">{currentOrigin}</div>
                  </div>
                ) : null}
                <div className="space-y-1.5 text-zinc-300 font-mono bg-zinc-950/60 rounded-lg p-3">
                  <div><span className="text-zinc-500">来源（AllowedOrigin）：</span><span className="text-emerald-300">{currentOrigin || '当前应用域名'}</span></div>
                  <div><span className="text-zinc-500">方法（AllowedMethod）：</span><span className="text-emerald-300">PUT, GET, HEAD</span></div>
                  <div><span className="text-zinc-500">允许头（AllowedHeader）：</span><span className="text-emerald-300">*</span></div>
                  <div><span className="text-zinc-500">暴露头（ExposeHeader）：</span><span className="text-emerald-300">ETag</span></div>
                  <div><span className="text-zinc-500">缓存时间（MaxAgeSeconds）：</span><span className="text-emerald-300">3600</span></div>
                </div>
                <p className="text-zinc-500 mt-2">开发调试也建议直接填写当前域名；只有临时排查时再把 AllowedOrigin 放宽为 <span className="font-mono">*</span>。</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="mt-6 bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">预估费用说明</h3>
            <p className="text-[11px] text-zinc-500 mt-1">模型单价来自内置配置。未配置价格的模型，在工作流里会留空，不再显示“按官方计费”。</p>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium text-zinc-300">计费口径</p>
            <p className="text-[11px] text-zinc-500 mt-1">图片按张；文本和视频按 token。视频会按当前分辨率、帧率和时长估算总价。</p>
            <p className="text-[11px] text-zinc-500 mt-1">价格统一按人民币显示；仅配置美元价格时按 1 USD = ¥{usdToCnyRate} 换算。</p>
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-300">视频估算公式</p>
            <p className="text-[11px] text-zinc-500 mt-1">tokens = (宽(px) x 高(px) x 帧率 x 时长(秒)) / 1024</p>
            <p className="text-[11px] text-zinc-500 mt-1">总价 = tokens / 1,000,000 x 模型单价。未填写时长时，会按 1 秒折算显示每秒费用。</p>
          </div>
          <div className="pt-2 border-t border-zinc-800">
            <p className="text-xs font-medium text-zinc-300">已配置模型价格</p>
            <div className="space-y-1 mt-2">
              {getPricedModelEntries().map((entry) => (
                <p key={`${entry.providerId}-${entry.role}-${entry.modelId}`} className="text-[11px] text-zinc-500">
                  {entry.name} ({entry.modelId}) · {entry.priceLabel}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <div>
            <h3 className="text-lg font-semibold text-white">模型调用日志</h3>
            <p className="text-xs text-zinc-400 mt-1">记录模型、请求参数和返回参数，方便排查具体是哪次调用、用了哪个模型。</p>
          </div>
          <button
            onClick={() => {
              clearModelInvocationLogs();
            }}
            className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            清空日志
          </button>
        </div>

        {modelInvocationLogs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950 p-6 text-sm text-zinc-500">
            还没有模型调用记录。发起一次提示词、图片或视频请求后，这里会显示最近 50 条日志。
          </div>
        ) : (
          <div className="space-y-3 max-h-[32rem] overflow-y-auto pr-1">
            {modelInvocationLogs.map((log) => (
              <div key={log.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-white">{log.operation}</p>
                    <p className="text-[11px] text-zinc-500 mt-1">{new Date(log.timestamp).toLocaleString('zh-CN')}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] px-2 py-1 rounded-full border ${log.status === 'success' ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' : 'text-red-300 bg-red-500/10 border-red-500/20'}`}>
                      {log.status === 'success' ? '成功' : '失败'}
                    </span>
                    <span className="text-[10px] px-2 py-1 rounded-full border border-zinc-700 text-zinc-400">
                      {log.provider === 'volcengine'
                        ? '火山引擎'
                        : log.provider === 'seedance-ark'
                          ? 'Ark API'
                          : log.provider === 'seedance-cli'
                            ? 'Seedance CLI'
                            : 'Gemini'}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-zinc-400 mt-3">模型：{log.modelName || '未配置'} </p>
                <p className="text-xs text-zinc-500 mt-1">来源：{log.sourceId || '未知'}</p>
                {log.error && <p className="text-xs text-red-400 mt-2">{log.error}</p>}
                <details className="mt-3">
                  <summary className="text-xs text-indigo-400 cursor-pointer">查看请求参数</summary>
                  <pre className="mt-2 text-[11px] text-zinc-400 bg-black/30 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(log.request, null, 2)}</pre>
                </details>
                <details className="mt-2">
                  <summary className="text-xs text-indigo-400 cursor-pointer">查看返回参数</summary>
                  <pre className="mt-2 text-[11px] text-zinc-400 bg-black/30 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(log.response ?? null, null, 2)}</pre>
                </details>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/5 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-200">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">危险操作</h3>
              <p className="mt-1 text-sm text-zinc-400">
                重新初始化 app 本地数据库。会清空 API 设置、项目列表、主题偏好等持久化数据，完成后自动刷新应用。
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsInitializeDatabaseModalOpen(true)}
            disabled={isInitializingDatabase}
            className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/12 px-4 py-2 text-sm font-medium text-red-100 transition-colors hover:bg-red-500/18 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isInitializingDatabase ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
            初始化数据库
          </button>
        </div>
      </section>

      <StudioModal
        open={isCustomModelModalOpen}
        onClose={closeCustomModelModal}
        className="max-w-lg p-0"
      >
        <div className="p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-200">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-200/80">自定义模型</p>
              <h3 className="mt-2 text-xl font-semibold text-white">添加 {PROVIDER_CARD_META[customModelDraft.providerId].title} 模型</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                填写后会把模型加入当前服务商的可选列表，并自动切换当前类型到这个模型。
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">服务商</div>
              <div className="mt-2 text-sm font-medium text-white">{PROVIDER_CARD_META[customModelDraft.providerId].title}</div>
            </div>

            <label className="block">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">模型类型</span>
              <StudioSelect
                value={customModelDraft.role}
                onChange={(event) => {
                  setCustomModelError('');
                  setCustomModelDraft((prev) => ({
                    ...prev,
                    role: event.target.value as ModelRole,
                  }));
                }}
                className="mt-2 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
              >
                {MODEL_ROLE_ORDER.map((role) => (
                  <option key={`custom-model-role-${role}`} value={role}>
                    {DEFAULT_MODEL_ROLE_META[role].title}
                  </option>
                ))}
              </StudioSelect>
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">显示名称</span>
              <input
                value={customModelDraft.name}
                onChange={(event) => {
                  setCustomModelError('');
                  setCustomModelDraft((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }));
                }}
                placeholder="例如 Doubao Seed 1.8"
                className="mt-2 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">模型 ID / Endpoint</span>
              <input
                value={customModelDraft.modelId}
                onChange={(event) => {
                  setCustomModelError('');
                  setCustomModelDraft((prev) => ({
                    ...prev,
                    modelId: event.target.value,
                  }));
                }}
                placeholder="例如 doubao-seed-1-8-251228"
                className="mt-2 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
              />
            </label>

            {customModelError ? (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {customModelError}
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={closeCustomModelModal}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSaveCustomModel}
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-4 py-2 text-sm font-medium text-indigo-300 transition-colors hover:bg-indigo-500/20"
            >
              <Plus className="h-4 w-4" />
              保存并使用
            </button>
          </div>
        </div>
      </StudioModal>

      <StudioModal
        open={isInitializeDatabaseModalOpen}
        onClose={() => {
          if (!isInitializingDatabase) {
            setIsInitializeDatabaseModalOpen(false);
          }
        }}
        closeOnOverlayClick={!isInitializingDatabase}
        className="max-w-xl p-0"
      >
        <div className="p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-200">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-red-200/80">二次确认</p>
              <h3 className="mt-2 text-xl font-semibold text-white">确认重新初始化 app 数据库？</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                该操作会清空当前 app 的本地持久化数据，包括 API 设置、项目列表、主题偏好，以及其他保存在 SQLite 数据库中的状态。
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                确认后会立即执行初始化，并在完成后自动刷新应用。这个操作不可撤销。
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-xs leading-6 text-zinc-400">
            若你只是想恢复模型或 API 字段默认值，使用上方“恢复默认值”即可；这里只有在需要彻底清空本地数据库时再执行。
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsInitializeDatabaseModalOpen(false)}
              disabled={isInitializingDatabase}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                void onInitializeDatabase();
              }}
              disabled={isInitializingDatabase}
              className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/14 px-4 py-2 text-sm font-medium text-red-100 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isInitializingDatabase ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              {isInitializingDatabase ? '初始化中...' : '确认初始化'}
            </button>
          </div>
        </div>
      </StudioModal>
    </motion.div>
  );
}
