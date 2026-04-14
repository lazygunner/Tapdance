import { useEffect, useRef, useState } from 'react';

import { loadPersistedAppState, savePersistedAppState } from '../../app/services/appStateStore.ts';
import type { Project } from '../../../types.ts';

type UseProjectStorageArgs = {
  project: Project;
  view: string;
  isProjectDetailView: (view: string) => boolean;
  isProjectEmpty: (project: Project) => boolean;
  toProjectListEntry: (value: Partial<Project>) => Project;
  upsertProjectListEntry: (items: Project[], nextProject: Project) => Project[];
  projectListSyncDelayMs: number;
  projectPersistDelayMs: number;
  suspendPersistence?: boolean;
};

const PROJECTS_STATE_KEY = 'projects';

export function useProjectStorage({
  project,
  view,
  isProjectDetailView,
  isProjectEmpty,
  toProjectListEntry,
  upsertProjectListEntry,
  projectListSyncDelayMs,
  projectPersistDelayMs,
  suspendPersistence = false,
}: UseProjectStorageArgs) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const toProjectListEntryRef = useRef(toProjectListEntry);
  const upsertProjectListEntryRef = useRef(upsertProjectListEntry);
  const isProjectDetailViewRef = useRef(isProjectDetailView);
  const isProjectEmptyRef = useRef(isProjectEmpty);

  useEffect(() => {
    toProjectListEntryRef.current = toProjectListEntry;
  }, [toProjectListEntry]);

  useEffect(() => {
    upsertProjectListEntryRef.current = upsertProjectListEntry;
  }, [upsertProjectListEntry]);

  useEffect(() => {
    isProjectDetailViewRef.current = isProjectDetailView;
  }, [isProjectDetailView]);

  useEffect(() => {
    isProjectEmptyRef.current = isProjectEmpty;
  }, [isProjectEmpty]);

  useEffect(() => {
    let cancelled = false;

    const loadProjects = async () => {
      try {
        const persisted = await loadPersistedAppState<Project[]>(PROJECTS_STATE_KEY);
        if (cancelled) {
          return;
        }

        if (persisted.value && Array.isArray(persisted.value)) {
          setProjects(persisted.value.map((item) => toProjectListEntryRef.current(item)));
          return;
        }
      } catch (error) {
        console.error('Failed to load projects from bridge store', error);
      } finally {
        if (!cancelled) {
          setIsLoaded(true);
        }
      }
    };

    void loadProjects();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (suspendPersistence) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          await savePersistedAppState(PROJECTS_STATE_KEY, projects);
        } catch (error) {
          console.error('Failed to save projects to bridge store', error);
          alert('持久化数据库写入失败，无法保存项目。');
        }
      })();
    }, projectPersistDelayMs);

    return () => window.clearTimeout(timeoutId);
  }, [isLoaded, projectPersistDelayMs, projects, suspendPersistence]);

  useEffect(() => {
    if (!project.id) {
      return;
    }

    if (suspendPersistence) {
      return;
    }

    if (!isProjectDetailViewRef.current(view) && isProjectEmptyRef.current(project)) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const nextProject = toProjectListEntryRef.current(project);
      setProjects((prev) => upsertProjectListEntryRef.current(prev, nextProject));
    }, projectListSyncDelayMs);

    return () => window.clearTimeout(timeoutId);
  }, [project, projectListSyncDelayMs, suspendPersistence, view]);

  return {
    projects,
    setProjects,
    isLoaded,
  };
}
