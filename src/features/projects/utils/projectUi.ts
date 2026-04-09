import type { Project } from '../../../types.ts';

export function formatProjectCreatedAt(value?: string) {
  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp)) {
    return '--';
  }

  const date = new Date(timestamp);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}月${day}日 ${hours}:${minutes}`;
}

export function getProjectSummary(project: Project): string {
  if (project.projectType === 'fast-video') {
    return project.fastFlow.input.prompt || '暂无极速视频提示词';
  }

  return project.idea || '暂无创意描述';
}
