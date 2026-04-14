import type { Dispatch, SetStateAction } from 'react';

import type { ApiSettings, ModelSourceId } from '../../../types.ts';
import { ApiConfigPage } from './ApiConfigPage.tsx';
import { SeedanceHealthPanel } from '../../fastVideoFlow/components/SeedanceHealthPanel.tsx';
import type { SeedanceHealth } from '../../fastVideoFlow/types/fastTypes.ts';
import type { ModelProviderId, ModelRole } from '../../../services/apiConfig.ts';
import type { ModelInvocationLogEntry } from '../../../services/modelInvocationLog.ts';

type ApiConfigWorkspaceProps = {
  apiSettings: ApiSettings;
  setApiSettings: Dispatch<SetStateAction<ApiSettings>>;
  seedanceHealth: SeedanceHealth | null;
  isRefreshingSeedanceHealth: boolean;
  onRefreshSeedanceHealth: () => void | Promise<void>;
  usdToCnyRate: number;
  modelInvocationLogs: ModelInvocationLogEntry[];
  onRestoreDefaults: () => void;
  onInitializeDatabase: () => void | Promise<void>;
  isInitializingDatabase: boolean;
  getSourceProviderKey: (sourceId: ModelSourceId) => ModelProviderId;
  getGeminiRoleModelOptions: (role: ModelRole) => Array<{ sourceId: ModelSourceId; modelName: string; label: string }>;
  getVolcengineRoleModelOptions: (role: ModelRole) => Array<{ value: string; label: string }>;
  getProviderRoleCatalogOptions: (providerId: ModelProviderId, role: ModelRole, configuredValue: string) => Array<{ value: string; label: string }>;
  updateGeminiRoleModel: (role: ModelRole, modelId: string) => void;
};

export function ApiConfigWorkspace({
  apiSettings,
  setApiSettings,
  seedanceHealth,
  isRefreshingSeedanceHealth,
  onRefreshSeedanceHealth,
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
}: ApiConfigWorkspaceProps) {
  return (
    <ApiConfigPage
      apiSettings={apiSettings}
      setApiSettings={setApiSettings}
      seedanceHealth={seedanceHealth}
      renderSeedanceHealthPanel={() => (
        <SeedanceHealthPanel
          seedanceHealth={seedanceHealth}
          isRefreshingSeedanceHealth={isRefreshingSeedanceHealth}
          onRefreshSeedanceHealth={() => void onRefreshSeedanceHealth()}
        />
      )}
      usdToCnyRate={usdToCnyRate}
      modelInvocationLogs={modelInvocationLogs}
      onRestoreDefaults={onRestoreDefaults}
      onInitializeDatabase={onInitializeDatabase}
      isInitializingDatabase={isInitializingDatabase}
      getSourceProviderKey={getSourceProviderKey}
      getGeminiRoleModelOptions={getGeminiRoleModelOptions}
      getVolcengineRoleModelOptions={getVolcengineRoleModelOptions}
      getProviderRoleCatalogOptions={getProviderRoleCatalogOptions}
      updateGeminiRoleModel={updateGeminiRoleModel}
    />
  );
}
