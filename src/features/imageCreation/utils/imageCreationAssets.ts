import type { ProjectGroupImageAsset } from '../../../services/projectGroups.ts';
import type { ImageCreationRecord } from '../types.ts';

export function collectImageCreationGeneratedImageAssets(records: ImageCreationRecord[]): ProjectGroupImageAsset[] {
  return records.flatMap((record) => record.outputs.map((output, index) => ({
    id: `${record.id}:image:${output.id || index}`,
    groupId: record.groupId,
    projectId: record.id,
    projectName: record.title || '图片制作',
    sourceType: 'image-creation' as const,
    title: output.title || `生成图片 ${index + 1}`,
    sourceLabel: '图片制作',
    imageUrl: output.url,
    createdAt: output.createdAt || record.createdAt,
  }))).filter((item) => item.imageUrl.trim());
}
