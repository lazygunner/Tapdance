import type { Project } from '../types.ts';

export type ProjectGroupRecord = {
  id: string;
  name: string;
};

export type ProjectGroupSummary = {
  id: string;
  name: string;
  projects: Project[];
  previewImages: string[];
};

export type ProjectGroupImageAsset = {
  id: string;
  groupId: string;
  projectId: string;
  projectName: string;
  sourceType: 'asset' | 'shot-first' | 'shot-last' | 'ad-storyboard' | 'ad-packaging' | 'ad-logo' | 'fast-scene';
  title: string;
  sourceLabel: string;
  imageUrl: string;
};

export function normalizeProjectGroupName(groupName?: string) {
  return (groupName || '').trim();
}

export function buildProjectScopedGroupName(projectName?: string) {
  const normalizedName = (projectName || '').trim();
  return `${normalizedName || '未命名项目'} 分组`;
}

export function getNormalizedProjectGroupFields(
  value: Partial<Project>,
  fallbackProjectId: string,
  fallbackProjectName: string,
) {
  const legacyCategory = normalizeProjectGroupName(value.groupName || value.category);
  const groupName = normalizeProjectGroupName(value.groupName) || legacyCategory || buildProjectScopedGroupName(fallbackProjectName);
  const groupId = typeof value.groupId === 'string' && value.groupId.trim()
    ? value.groupId.trim()
    : legacyCategory
      ? `legacy-group:${legacyCategory}`
      : `project-group:${fallbackProjectId}`;

  return {
    groupId,
    groupName,
  };
}

export function normalizeProjectGroupRecord(value: Partial<ProjectGroupRecord>): ProjectGroupRecord {
  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id.trim() : crypto.randomUUID(),
    name: normalizeProjectGroupName(value.name) || '未命名分组',
  };
}

export function mergeProjectGroupsWithProjects(groups: Array<Partial<ProjectGroupRecord>>, projects: Project[]) {
  const merged = new Map<string, ProjectGroupRecord>();

  for (const group of groups) {
    const normalizedGroup = normalizeProjectGroupRecord(group);
    merged.set(normalizedGroup.id, normalizedGroup);
  }

  for (const project of projects) {
    const { groupId, groupName } = getNormalizedProjectGroupFields(project, project.id, project.name);
    if (!groupId || !groupName) {
      continue;
    }

    if (!merged.has(groupId)) {
      merged.set(groupId, {
        id: groupId,
        name: groupName,
      });
    }
  }

  return Array.from(merged.values()).sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'));
}

export function buildDefaultGroupName(groups: Array<{ name?: string; groupName?: string; category?: string }>) {
  const existingNames = new Set(
    groups
      .map((group) => normalizeProjectGroupName(group.groupName || group.category || group.name))
      .filter(Boolean),
  );

  let index = 1;
  while (existingNames.has(`新分组 ${index}`)) {
    index += 1;
  }

  return `新分组 ${index}`;
}

export function collectProjectPreviewImages(project: Project) {
  const candidates: string[] = [
    ...project.shots.flatMap((shot) => [shot.imageUrl, shot.lastFrameImageUrl]),
    ...project.assets.map((asset) => asset.imageUrl),
    ...project.fastFlow.scenes.map((scene) => scene.imageUrl),
  ].filter((value): value is string => Boolean((value || '').trim()));

  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    result.push(candidate);
    if (result.length >= 4) {
      break;
    }
  }

  return result;
}

export function collectProjectGeneratedImageAssets(project: Project): ProjectGroupImageAsset[] {
  const groupId = project.groupId || '';
  const projectName = project.name || '未命名项目';
  const images: ProjectGroupImageAsset[] = [];

  for (const asset of project.assets) {
    if (!asset.imageUrl) {
      continue;
    }
    images.push({
      id: `${project.id}:asset:${asset.id}`,
      groupId,
      projectId: project.id,
      projectName,
      sourceType: 'asset',
      title: asset.name || '一致性资产',
      sourceLabel: `资产 / ${asset.type}`,
      imageUrl: asset.imageUrl,
    });
  }

  for (const shot of project.shots) {
    if (shot.imageUrl) {
      images.push({
        id: `${project.id}:shot:${shot.id}:first`,
        groupId,
        projectId: project.id,
        projectName,
        sourceType: 'shot-first',
        title: `镜头 ${shot.shotNumber} 首帧`,
        sourceLabel: '首帧',
        imageUrl: shot.imageUrl,
      });
    }

    if (shot.lastFrameImageUrl) {
      images.push({
        id: `${project.id}:shot:${shot.id}:last`,
        groupId,
        projectId: project.id,
        projectName,
        sourceType: 'shot-last',
        title: `镜头 ${shot.shotNumber} 尾帧`,
        sourceLabel: '尾帧',
        imageUrl: shot.lastFrameImageUrl,
      });
    }
  }

  for (const scene of project.fastFlow.scenes) {
    if (!scene.imageUrl) {
      continue;
    }

    images.push({
      id: `${project.id}:fast-scene:${scene.id}`,
      groupId,
      projectId: project.id,
      projectName,
      sourceType: 'fast-scene',
      title: scene.title || '极速分镜',
      sourceLabel: '极速分镜',
      imageUrl: scene.imageUrl,
    });
  }

  return images;
}

export function getProjectGroupImageAssets(groupId: string, projects: Project[]) {
  const normalizedGroupId = (groupId || '').trim();
  if (!normalizedGroupId) {
    return [];
  }

  const items = projects
    .filter((project) => project.groupId === normalizedGroupId)
    .flatMap((project) => collectProjectGeneratedImageAssets(project));

  const seen = new Set<string>();
  return items.filter((item) => {
    const dedupeKey = `${item.imageUrl}::${item.sourceLabel}`;
    if (seen.has(dedupeKey)) {
      return false;
    }
    seen.add(dedupeKey);
    return true;
  });
}

export function getProjectGroupSummary(groupRecords: ProjectGroupRecord[], projects: Project[]): ProjectGroupSummary[];
export function getProjectGroupSummary(projects: Project[]): ProjectGroupSummary[];
export function getProjectGroupSummary(
  groupRecordsOrProjects: ProjectGroupRecord[] | Project[],
  maybeProjects?: Project[],
): ProjectGroupSummary[] {
  const groupRecords = Array.isArray(maybeProjects) ? groupRecordsOrProjects as ProjectGroupRecord[] : [];
  const projects = (maybeProjects || groupRecordsOrProjects) as Project[];
  const groups = new Map<string, ProjectGroupSummary>();

  for (const group of groupRecords) {
    const normalizedGroup = normalizeProjectGroupRecord(group);
    groups.set(normalizedGroup.id, {
      id: normalizedGroup.id,
      name: normalizedGroup.name,
      projects: [],
      previewImages: [],
    });
  }

  for (const project of projects) {
    const { groupId, groupName } = getNormalizedProjectGroupFields(project, project.id, project.name);
    if (!groupId || !groupName) {
      continue;
    }

    if (!groups.has(groupId)) {
      groups.set(groupId, {
        id: groupId,
        name: groupName,
        projects: [],
        previewImages: [],
      });
    }

    const currentGroup = groups.get(groupId)!;
    currentGroup.name = currentGroup.name || groupName;
    currentGroup.projects.push(project);
  }

  for (const group of groups.values()) {
    group.previewImages = group.projects.flatMap((project) => collectProjectPreviewImages(project)).slice(0, 4);
  }

  return Array.from(groups.values()).sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'));
}
