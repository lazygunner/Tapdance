import { useEffect, useRef, useState } from 'react';

import type { ApiSettings } from '../../../types.ts';
import {
  defaultApiSettings,
  loadApiSettings,
  loadPersistedApiSettings,
  saveApiSettings,
  setCachedApiSettings,
} from '../../../services/apiConfig.ts';

export function useApiSettingsStorage(suspendPersistence = false) {
  const [apiSettings, setApiSettings] = useState<ApiSettings>(() => loadApiSettings());
  const [isApiSettingsLoaded, setIsApiSettingsLoaded] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const persisted = await loadPersistedApiSettings();
        if (!cancelled) {
          setApiSettings(persisted);
        }
      } catch (error) {
        console.error('Failed to hydrate API settings', error);
        if (!cancelled) {
          setApiSettings(defaultApiSettings);
        }
      } finally {
        if (!cancelled) {
          loadedRef.current = true;
          setIsApiSettingsLoaded(true);
        }
      }
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setCachedApiSettings(apiSettings);
  }, [apiSettings]);

  useEffect(() => {
    if (!loadedRef.current) {
      return;
    }

    if (suspendPersistence) {
      return;
    }

    void saveApiSettings(apiSettings);
  }, [apiSettings, suspendPersistence]);

  return {
    apiSettings,
    setApiSettings,
    isApiSettingsLoaded,
  };
}
