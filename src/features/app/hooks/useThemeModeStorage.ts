import { useEffect, useState } from 'react';

import type { WorkspaceThemeMode } from '../../../components/studio/WorkspaceViews.tsx';
import { loadPersistedAppState, savePersistedAppState } from '../services/appStateStore.ts';

const THEME_MODE_STATE_KEY = 'ui_theme_mode';

export function useThemeModeStorage(defaultThemeMode: WorkspaceThemeMode = 'dark', suspendPersistence = false) {
  const [themeMode, setThemeMode] = useState<WorkspaceThemeMode>(defaultThemeMode);
  const [isThemeModeLoaded, setIsThemeModeLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const persisted = await loadPersistedAppState<WorkspaceThemeMode>(THEME_MODE_STATE_KEY);
        if (!cancelled && (persisted.value === 'light' || persisted.value === 'dark')) {
          setThemeMode(persisted.value);
        }
      } catch (error) {
        console.error('Failed to load theme mode', error);
      } finally {
        if (!cancelled) {
          setIsThemeModeLoaded(true);
        }
      }
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isThemeModeLoaded) {
      return;
    }

    if (suspendPersistence) {
      return;
    }

    void savePersistedAppState(THEME_MODE_STATE_KEY, themeMode).catch((error) => {
      console.error('Failed to save theme mode', error);
    });
  }, [isThemeModeLoaded, suspendPersistence, themeMode]);

  useEffect(() => {
    if (!isThemeModeLoaded || typeof document === 'undefined') {
      return;
    }

    const isLight = themeMode === 'light';
    document.documentElement.classList.toggle('theme-light', isLight);
    document.body.classList.toggle('theme-light', isLight);
    document.documentElement.dataset.themeMode = themeMode;
    document.body.dataset.themeMode = themeMode;
  }, [isThemeModeLoaded, themeMode]);

  return {
    themeMode,
    setThemeMode,
    isThemeModeLoaded,
  };
}
