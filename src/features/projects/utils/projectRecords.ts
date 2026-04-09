import { getNormalizedProjectGroupFields } from '../../../services/projectGroups.ts';
import { resequenceShots } from '../../creativeFlow/utils/creativeFlowHelpers.ts';
import { normalizeFastVideoProject } from '../../fastVideoFlow/services/fastFlowMappers.ts';
import type { Project, Shot } from '../../../types.ts';
import { inferProjectType, normalizeProjectCreatedAt } from './projectLifecycle.ts';

export function normalizeProjectRecord(value: Partial<Project>): Project {
  const projectType = inferProjectType(value);
  const resolvedId = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : crypto.randomUUID();
  const normalizedName = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : '未命名项目';
  const createdAt = normalizeProjectCreatedAt(value.createdAt);
  const { groupId, groupName } = getNormalizedProjectGroupFields(value, resolvedId, normalizedName);

  return {
    id: resolvedId,
    projectType,
    name: normalizedName,
    nameCustomized: Boolean(value.nameCustomized && typeof value.name === 'string' && value.name.trim()),
    createdAt,
    groupId,
    groupName,
    category: '',
    idea: typeof value.idea === 'string' ? value.idea : '',
    selectedStyleId: value.selectedStyleId || value.brief?.stylePresetId || '',
    customStyleDescription: typeof value.customStyleDescription === 'string' ? value.customStyleDescription : '',
    styleSelectionMode: value.styleSelectionMode || 'manual',
    inputAspectRatio: value.inputAspectRatio || value.brief?.aspectRatio || '16:9',
    brief: value.brief || null,
    assets: Array.isArray(value.assets) ? value.assets : [],
    shots: Array.isArray(value.shots) ? resequenceShots(value.shots as Shot[]) : [],
    fastFlow: normalizeFastVideoProject(value.fastFlow),
  };
}

export function toProjectListEntry(value: Partial<Project>): Project {
  const normalized = normalizeProjectRecord(value);
  return {
    ...normalized,
    shots: normalized.shots.map((shot) => ({
      ...shot,
      videoOperation: undefined,
      transitionVideoOperation: undefined,
    })),
    fastFlow: {
      ...normalized.fastFlow,
      task: {
        ...normalized.fastFlow.task,
        raw: undefined,
      },
    },
  };
}

export function upsertProjectListEntry(items: Project[], nextProject: Project) {
  const existingIndex = items.findIndex((item) => item.id === nextProject.id);
  if (existingIndex < 0) {
    return [nextProject, ...items];
  }

  const nextItems = [...items];
  nextItems[existingIndex] = nextProject;
  return nextItems;
}
