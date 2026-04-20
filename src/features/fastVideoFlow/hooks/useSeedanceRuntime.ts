import { useState } from 'react';

import { appendModelInvocationLog, type ModelInvocationLogEntry } from '../../../services/modelInvocationLog';
import type { ApiSettings, Project } from '../../../types.ts';
import type { SeedanceHealth } from '../types/fastTypes.ts';
import { fetchSeedanceHealth } from '../services/seedanceBridgeClient.ts';
import { SEEDANCE_MODEL_VERSIONS } from '../../seedance/modelVersions.ts';
import { compileSeedanceRequest } from '../../seedance/services/seedanceDraft.ts';
import type { SeedanceDraft } from '../../seedance/types.ts';

type SeedanceLogEntry = {
  operation: string;
  status: 'success' | 'error';
  request: unknown;
  response?: unknown;
  error?: string;
  executor?: 'ark' | 'cli';
  sourceId?: ModelInvocationLogEntry['sourceId'];
  modelName?: string;
};

type UseSeedanceRuntimeArgs = {
  apiSettings: ApiSettings;
  project: Project;
  useMockMode: boolean;
};

export function useSeedanceRuntime({
  apiSettings,
  project,
  useMockMode,
}: UseSeedanceRuntimeArgs) {
  const [seedanceHealth, setSeedanceHealth] = useState<SeedanceHealth | null>(null);
  const [isRefreshingSeedanceHealth, setIsRefreshingSeedanceHealth] = useState(false);

  const getSeedanceArkModelMeta = (modelKey: 'standard' | 'fast' = project.fastFlow.executionConfig.apiModelKey) => (
    modelKey === 'fast'
      ? {
        sourceId: 'seedance.fastApiModel' as const,
        modelName: apiSettings.seedance.fastApiModel.trim(),
      }
      : {
        sourceId: 'seedance.apiModel' as const,
        modelName: apiSettings.seedance.apiModel.trim(),
      }
  );

  const buildSeedanceDraftLogSnapshot = (draft: SeedanceDraft) => ({
    templateId: draft.baseTemplateId,
    overlayTemplateIds: draft.overlayTemplateIds,
    prompt: {
      rawPrompt: draft.prompt.rawPrompt,
      optimizedPrompt: draft.prompt.optimizedPrompt,
      diagnostics: draft.prompt.diagnostics,
    },
    options: {
      ...draft.options,
      moduleSettings: draft.options.moduleSettings ? { ...draft.options.moduleSettings } : undefined,
    },
    assets: draft.assets.map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      source: asset.source,
      role: asset.role,
      label: asset.label,
      urlOrData: asset.urlOrData,
    })),
  });

  const buildCompiledSeedanceRequestLogSnapshot = (draft: SeedanceDraft) => {
    try {
      return compileSeedanceRequest(draft);
    } catch (error: any) {
      return {
        compileError: error?.message || '编译 Seedance 请求失败。',
      };
    }
  };

  const buildSeedanceSubmitLogRequest = (draft: SeedanceDraft, executor: 'ark' | 'cli', apiModelKey = project.fastFlow.executionConfig.apiModelKey) => {
    const draftSnapshot = buildSeedanceDraftLogSnapshot(draft);
    if (executor === 'ark') {
      const arkModelMeta = getSeedanceArkModelMeta(apiModelKey);
      return {
        projectId: project.id,
        executor: 'ark' as const,
        modelKey: apiModelKey,
        model: arkModelMeta.modelName,
        templateId: draft.baseTemplateId,
        overlayTemplateIds: draft.overlayTemplateIds,
        draft: draftSnapshot,
        compiledRequest: buildCompiledSeedanceRequestLogSnapshot(draft),
      };
    }

    return {
      projectId: project.id,
      executor: 'cli' as const,
      modelVersion: apiSettings.seedance.cliModelVersion,
      bridgeUrl: apiSettings.seedance.bridgeUrl || '/api/seedance',
      templateId: draft.baseTemplateId,
      overlayTemplateIds: draft.overlayTemplateIds,
      draft: draftSnapshot,
    };
  };

  const appendSeedanceLog = (entry: SeedanceLogEntry) => {
    const executor = entry.executor || project.fastFlow.executionConfig.executor;
    const defaultMeta = executor === 'ark'
      ? {
        provider: 'seedance-ark' as const,
        ...getSeedanceArkModelMeta(project.fastFlow.executionConfig.apiModelKey),
      }
      : {
        provider: 'seedance-cli' as const,
        sourceId: 'seedance.cliModelVersion' as const,
        modelName: apiSettings.seedance.cliModelVersion,
      };
    appendModelInvocationLog({
      provider: defaultMeta.provider,
      operation: entry.operation,
      status: entry.status,
      sourceId: entry.sourceId ?? defaultMeta.sourceId,
      modelName: entry.modelName ?? defaultMeta.modelName,
      request: entry.request,
      response: entry.response,
      error: entry.error,
    });
  };

  const refreshSeedanceHealth = async () => {
    if (useMockMode) {
      const mockHealth: SeedanceHealth = {
        cliAvailable: true,
        loginStatus: 'logged_in',
        modelVersions: [...SEEDANCE_MODEL_VERSIONS],
        credit: {
          total_credit: 9999,
        },
        checkedAt: new Date().toISOString(),
      };
      setSeedanceHealth(mockHealth);
      appendSeedanceLog({
        operation: 'seedanceHealthCheck',
        status: 'success',
        executor: 'cli',
        sourceId: 'seedance.bridgeUrl',
        request: { useMockMode: true, executor: 'cli' },
        response: mockHealth,
      });
      return;
    }

    setIsRefreshingSeedanceHealth(true);
    try {
      const health = await fetchSeedanceHealth(apiSettings.seedance.bridgeUrl);
      setSeedanceHealth(health);
      appendSeedanceLog({
        operation: 'seedanceHealthCheck',
        status: 'success',
        executor: 'cli',
        sourceId: 'seedance.bridgeUrl',
        request: { bridgeUrl: apiSettings.seedance.bridgeUrl || '/api/seedance', executor: 'cli' },
        response: health,
      });
    } catch (error: any) {
      const fallbackHealth: SeedanceHealth = {
        cliAvailable: false,
        loginStatus: 'error',
        modelVersions: [...SEEDANCE_MODEL_VERSIONS],
        checkedAt: new Date().toISOString(),
        error: error?.message || 'Seedance bridge 不可用。',
      };
      setSeedanceHealth(fallbackHealth);
      appendSeedanceLog({
        operation: 'seedanceHealthCheck',
        status: 'error',
        executor: 'cli',
        sourceId: 'seedance.bridgeUrl',
        request: { bridgeUrl: apiSettings.seedance.bridgeUrl || '/api/seedance', executor: 'cli' },
        error: fallbackHealth.error,
      });
    } finally {
      setIsRefreshingSeedanceHealth(false);
    }
  };

  return {
    seedanceHealth,
    isRefreshingSeedanceHealth,
    refreshSeedanceHealth,
    getSeedanceArkModelMeta,
    buildSeedanceSubmitLogRequest,
    appendSeedanceLog,
  };
}
