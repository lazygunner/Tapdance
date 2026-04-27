import { getAssetLibraryRelativePath, isAssetLibraryUrl } from '../../../services/assetLibrary.ts';
import { ASSET_TYPE_LABELS } from '../../creativeFlow/utils/creativeFlowHelpers.ts';
import type { ImageCreationRecord } from '../../imageCreation/types.ts';
import type { Project, ProjectType } from '../../../types.ts';

export type LibraryAssetSourceType = ProjectType | 'image-creation';

export type LibraryAssetItem = {
  id: string;
  kind: 'image' | 'video';
  url: string;
  projectId: string;
  projectName: string;
  projectType: LibraryAssetSourceType;
  groupName: string;
  title: string;
  sourceLabel: string;
  createdAt: string;
};

export type AssetLibraryStatusItem = LibraryAssetItem & {
  savedToLibrary: boolean;
  savedRelativePath: string;
};

export type ProjectMediaCounts = {
  total: number;
  images: number;
  videos: number;
};

function collectProjectLibraryItems(project: Project): LibraryAssetItem[] {
  const projectName = project.name || '未命名项目';
  const groupName = (project.groupName || '').trim() || '未分组';
  const items: LibraryAssetItem[] = [];
  const projectCreatedAt = project.createdAt || '';
  const fastTaskCreatedAt = project.fastFlow.task.finishedAt
    || project.fastFlow.task.startedAt
    || project.fastFlow.task.lastCheckedAt
    || projectCreatedAt;

  const pushItem = (item: Omit<LibraryAssetItem, 'projectId' | 'projectName' | 'projectType' | 'groupName' | 'createdAt'> & { createdAt?: string }) => {
    const url = (item.url || '').trim();
    if (!url) {
      return;
    }

    items.push({
      ...item,
      url,
      projectId: project.id,
      projectName,
      projectType: project.projectType,
      groupName,
      createdAt: item.createdAt || projectCreatedAt,
    });
  };

  for (const asset of project.assets) {
    pushItem({
      id: `${project.id}:asset:${asset.id}`,
      kind: 'image',
      url: asset.imageUrl || '',
      title: asset.name || '一致性资产',
      sourceLabel: `资产 / ${ASSET_TYPE_LABELS[asset.type]}`,
    });
  }

  for (const shot of project.shots) {
    pushItem({
      id: `${project.id}:shot:${shot.id}:first`,
      kind: 'image',
      url: shot.imageUrl || '',
      title: `镜头 ${shot.shotNumber} 首帧`,
      sourceLabel: '创意分镜首帧',
    });
    pushItem({
      id: `${project.id}:shot:${shot.id}:last`,
      kind: 'image',
      url: shot.lastFrameImageUrl || '',
      title: `镜头 ${shot.shotNumber} 尾帧`,
      sourceLabel: '创意分镜尾帧',
    });
    pushItem({
      id: `${project.id}:shot:${shot.id}:video`,
      kind: 'video',
      url: shot.videoUrl || '',
      title: `镜头 ${shot.shotNumber} 视频`,
      sourceLabel: '创意镜头视频',
    });
    pushItem({
      id: `${project.id}:shot:${shot.id}:transition`,
      kind: 'video',
      url: shot.transitionVideoUrl || '',
      title: `镜头 ${shot.shotNumber} 转场`,
      sourceLabel: '创意转场视频',
    });
  }

  project.fastFlow.input.referenceImages.forEach((reference, index) => {
    pushItem({
      id: `${project.id}:fast-reference:${reference.id || index}`,
      kind: 'image',
      url: reference.imageUrl,
      title: reference.description || `参考图 ${index + 1}`,
      sourceLabel: '极速参考图',
    });
  });

  project.fastFlow.input.referenceVideos.forEach((reference, index) => {
    pushItem({
      id: `${project.id}:fast-reference-video:${reference.id || index}`,
      kind: 'video',
      url: reference.videoUrl,
      title: reference.description || `参考视频 ${index + 1}`,
      sourceLabel: '极速参考视频',
    });
  });

  project.fastFlow.scenes.forEach((scene, index) => {
    pushItem({
      id: `${project.id}:fast-scene:${scene.id}`,
      kind: 'image',
      url: scene.imageUrl || '',
      title: scene.title || `极速分镜 ${index + 1}`,
      sourceLabel: '极速分镜画面',
    });
  });

  pushItem({
    id: `${project.id}:fast-task:last-frame`,
    kind: 'image',
    url: project.fastFlow.task.lastFrameUrl || '',
    title: '极速视频尾帧',
    sourceLabel: '极速视频结果',
    createdAt: fastTaskCreatedAt,
  });
  pushItem({
    id: `${project.id}:fast-task:video`,
    kind: 'video',
    url: project.fastFlow.task.videoUrl || '',
    title: '极速视频成片',
    sourceLabel: '极速视频结果',
    createdAt: fastTaskCreatedAt,
  });

  return items;
}

function collectImageCreationLibraryItems(records: ImageCreationRecord[] = []): LibraryAssetItem[] {
  return records.flatMap((record) => record.outputs.map((output, index) => ({
    id: `${record.id}:image:${output.id || index}`,
    kind: 'image' as const,
    url: output.url,
    projectId: record.id,
    projectName: record.title || '图片制作',
    projectType: 'image-creation' as const,
    groupName: record.groupName || '未分组',
    title: output.title || `生成图片 ${index + 1}`,
    sourceLabel: '图片制作',
    createdAt: output.createdAt || record.createdAt,
  }))).filter((item) => item.url.trim());
}

export function countProjectMediaItems(projects: Project[], imageCreationRecords: ImageCreationRecord[] = []): ProjectMediaCounts {
  let images = 0;
  let videos = 0;

  const countImage = (value?: string) => {
    if (typeof value === 'string' && value.trim()) {
      images += 1;
    }
  };
  const countVideo = (value?: string) => {
    if (typeof value === 'string' && value.trim()) {
      videos += 1;
    }
  };

  for (const project of projects) {
    project.assets.forEach((asset) => countImage(asset.imageUrl));

    project.shots.forEach((shot) => {
      countImage(shot.imageUrl);
      countImage(shot.lastFrameImageUrl);
      countVideo(shot.videoUrl);
      countVideo(shot.transitionVideoUrl);
    });

    project.fastFlow.input.referenceImages.forEach((reference) => countImage(reference.imageUrl));
    project.fastFlow.input.referenceVideos.forEach((reference) => countVideo(reference.videoUrl));
    project.fastFlow.scenes.forEach((scene) => countImage(scene.imageUrl));
    countImage(project.fastFlow.task.lastFrameUrl);
    countVideo(project.fastFlow.task.videoUrl);
  }

  for (const record of imageCreationRecords) {
    record.outputs.forEach((output) => countImage(output.url));
  }

  return {
    total: images + videos,
    images,
    videos,
  };
}

export function buildAssetLibraryStatusItems(projects: Project[], imageCreationRecords: ImageCreationRecord[] = []): AssetLibraryStatusItem[] {
  return [
    ...projects.flatMap((project) => collectProjectLibraryItems(project)),
    ...collectImageCreationLibraryItems(imageCreationRecords),
  ].map((item) => {
    const savedRelativePath = getAssetLibraryRelativePath(item.url);
    return {
      ...item,
      savedRelativePath,
      savedToLibrary: Boolean(savedRelativePath) && isAssetLibraryUrl(item.url),
    };
  });
}

export function applyLibraryItemUrlToProject(project: Project, itemId: string, nextUrl: string): Project {
  if (itemId === `${project.id}:fast-task:last-frame`) {
    return {
      ...project,
      fastFlow: {
        ...project.fastFlow,
        task: {
          ...project.fastFlow.task,
          lastFrameUrl: nextUrl,
        },
      },
    };
  }

  if (itemId === `${project.id}:fast-task:video`) {
    return {
      ...project,
      fastFlow: {
        ...project.fastFlow,
        task: {
          ...project.fastFlow.task,
          videoUrl: nextUrl,
          videoStorageKey: '',
        },
      },
    };
  }

  if (itemId.startsWith(`${project.id}:asset:`)) {
    const assetId = itemId.slice(`${project.id}:asset:`.length);
    return {
      ...project,
      assets: project.assets.map((asset) => asset.id === assetId ? { ...asset, imageUrl: nextUrl } : asset),
    };
  }

  if (itemId.startsWith(`${project.id}:shot:`)) {
    const segments = itemId.split(':');
    const shotId = segments[2];
    const variant = segments[3];

    return {
      ...project,
      shots: project.shots.map((shot) => {
        if (shot.id !== shotId) {
          return shot;
        }

        if (variant === 'first') {
          return { ...shot, imageUrl: nextUrl };
        }
        if (variant === 'last') {
          return { ...shot, lastFrameImageUrl: nextUrl };
        }
        if (variant === 'video') {
          return { ...shot, videoUrl: nextUrl, videoStorageKey: '' };
        }
        if (variant === 'transition') {
          return { ...shot, transitionVideoUrl: nextUrl, transitionVideoStorageKey: '' };
        }

        return shot;
      }),
    };
  }

  if (itemId.startsWith(`${project.id}:fast-reference:`)) {
    const referenceId = itemId.slice(`${project.id}:fast-reference:`.length);
    return {
      ...project,
      fastFlow: {
        ...project.fastFlow,
        input: {
          ...project.fastFlow.input,
          referenceImages: project.fastFlow.input.referenceImages.map((reference, index) => (
            reference.id === referenceId || String(index) === referenceId
              ? { ...reference, imageUrl: nextUrl }
              : reference
          )),
        },
      },
    };
  }

  if (itemId.startsWith(`${project.id}:fast-reference-video:`)) {
    const referenceId = itemId.slice(`${project.id}:fast-reference-video:`.length);
    return {
      ...project,
      fastFlow: {
        ...project.fastFlow,
        input: {
          ...project.fastFlow.input,
          referenceVideos: project.fastFlow.input.referenceVideos.map((reference, index) => (
            reference.id === referenceId || String(index) === referenceId
              ? { ...reference, videoUrl: nextUrl, videoMeta: null }
              : reference
          )),
        },
      },
    };
  }

  if (itemId.startsWith(`${project.id}:fast-scene:`)) {
    const sceneId = itemId.slice(`${project.id}:fast-scene:`.length);
    return {
      ...project,
      fastFlow: {
        ...project.fastFlow,
        scenes: project.fastFlow.scenes.map((scene) => scene.id === sceneId ? {
          ...scene,
          imageUrl: nextUrl,
          imageStorageKey: '',
        } : scene),
      },
    };
  }

  return project;
}

export function applyLibraryItemUrlToImageCreationRecord(record: ImageCreationRecord, itemId: string, nextUrl: string): ImageCreationRecord {
  if (!itemId.startsWith(`${record.id}:image:`)) {
    return record;
  }

  const outputId = itemId.slice(`${record.id}:image:`.length);
  return {
    ...record,
    outputs: record.outputs.map((output, index) => (
      output.id === outputId || String(index) === outputId
        ? {
          ...output,
          url: nextUrl,
          savedRelativePath: getAssetLibraryRelativePath(nextUrl),
        }
        : output
    )),
  };
}
