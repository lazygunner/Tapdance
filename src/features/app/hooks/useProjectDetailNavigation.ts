import { useCallback, useEffect, useRef } from 'react';

type UseProjectDetailNavigationArgs<View> = {
  view: View;
  isProjectDetailView: (view: View) => boolean;
  setView: (view: View) => void;
  setSelectedGroupId: (value: string | null) => void;
  homeView: View;
};

export function useProjectDetailNavigation<View>({
  view,
  isProjectDetailView,
  setView,
  setSelectedGroupId,
  homeView,
}: UseProjectDetailNavigationArgs<View>) {
  const hasProjectDetailHistoryEntryRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const currentState = typeof window.history.state === 'object' && window.history.state !== null
      ? window.history.state
      : {};
    const currentIsProjectDetailView = isProjectDetailView(view);

    if (currentIsProjectDetailView && !hasProjectDetailHistoryEntryRef.current) {
      window.history.pushState({ ...currentState, aiDirectorView: 'project-detail' }, '');
      hasProjectDetailHistoryEntryRef.current = true;
      return;
    }

    if (!currentIsProjectDetailView) {
      window.history.replaceState({ ...currentState, aiDirectorView: 'home' }, '');
      hasProjectDetailHistoryEntryRef.current = false;
    }
  }, [view, isProjectDetailView]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handlePopState = () => {
      if (!isProjectDetailView(view)) {
        return;
      }

      setSelectedGroupId(null);
      setView(homeView);
      hasProjectDetailHistoryEntryRef.current = false;
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [homeView, isProjectDetailView, setSelectedGroupId, setView, view]);

  const handleBackToHome = useCallback(() => {
    if (typeof window !== 'undefined' && hasProjectDetailHistoryEntryRef.current) {
      window.history.back();
      return;
    }

    setSelectedGroupId(null);
    setView(homeView);
  }, [homeView, setSelectedGroupId, setView]);

  return {
    handleBackToHome,
  };
}
