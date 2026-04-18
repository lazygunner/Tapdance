import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyFastVideoProject } from '../src/features/fastVideoFlow/services/fastFlowMappers.ts';
import { applyLibraryItemUrlToProject, buildAssetLibraryStatusItems, countProjectMediaItems } from '../src/features/assetLibrary/utils/assetLibraryItems.ts';
import { saveMediaToAssetLibrary } from '../src/services/assetLibrary.ts';
import type { Project } from '../src/types.ts';

function createProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    projectType: 'fast-video',
    name: '测试项目',
    nameCustomized: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    groupId: 'group-1',
    groupName: '测试分组',
    idea: '',
    selectedStyleId: '',
    customStyleDescription: '',
    styleSelectionMode: 'manual',
    inputAspectRatio: '16:9',
    brief: null,
    assets: [],
    shots: [],
    fastFlow: createEmptyFastVideoProject(),
    ...overrides,
  };
}

test('saveMediaToAssetLibrary delegates remote media downloads to the bridge', async () => {
  const originalFetch = globalThis.fetch;
  const fetchCalls: Array<{ input: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ input: String(input), init });
    return new Response(JSON.stringify({
      rootPath: '/tmp/assets',
      relativePath: 'group/project/videos/final.mp4',
      absolutePath: '/tmp/assets/group/project/videos/final.mp4',
      fileName: 'final.mp4',
      kind: 'video',
      url: '/api/seedance/assets/file?path=group%2Fproject%2Fvideos%2Ffinal.mp4',
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }) as typeof fetch;

  try {
    const saved = await saveMediaToAssetLibrary({
      sourceUrl: 'https://example.com/output.mp4',
      kind: 'video',
      assetId: 'asset-1',
      title: '成片',
      groupName: '分组',
      projectName: '项目',
      baseUrl: 'http://127.0.0.1:3210/api/seedance',
    });

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].input, 'http://127.0.0.1:3210/api/seedance/assets/save');
    assert.equal(saved.url, 'http://127.0.0.1:3210/api/seedance/assets/file?path=group%2Fproject%2Fvideos%2Ffinal.mp4');

    const payload = JSON.parse(String(fetchCalls[0].init?.body || '{}'));
    assert.equal(payload.sourceUrl, 'https://example.com/output.mp4');
    assert.equal(payload.dataBase64, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('saveMediaToAssetLibrary resolves relative bridge media URLs before delegating them to the bridge', async () => {
  const originalFetch = globalThis.fetch;
  const fetchCalls: Array<{ input: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ input: String(input), init });
    return new Response(JSON.stringify({
      rootPath: '/tmp/assets',
      relativePath: 'group/project/videos/final.mp4',
      absolutePath: '/tmp/assets/group/project/videos/final.mp4',
      fileName: 'final.mp4',
      kind: 'video',
      url: '/api/seedance/assets/file?path=group%2Fproject%2Fvideos%2Ffinal.mp4',
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }) as typeof fetch;

  try {
    await saveMediaToAssetLibrary({
      sourceUrl: '/api/seedance/file/demo-task/final.mp4',
      kind: 'video',
      assetId: 'asset-2',
      title: '成片',
      groupName: '分组',
      projectName: '项目',
      baseUrl: 'http://127.0.0.1:3210/api/seedance',
    });

    const payload = JSON.parse(String(fetchCalls[0].init?.body || '{}'));
    assert.equal(payload.sourceUrl, 'http://127.0.0.1:3210/api/seedance/file/demo-task/final.mp4');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('asset library includes fast reference videos and writes saved urls back', () => {
  const fastFlow = createEmptyFastVideoProject();
  fastFlow.input.referenceVideos = [{
    id: 'reference-video-1',
    videoUrl: 'https://example.com/reference.mp4',
    description: '动作参考视频',
    referenceType: 'motion',
  }];
  const project = createProject({ fastFlow });

  const items = buildAssetLibraryStatusItems([project]);
  const referenceVideoItem = items.find((item) => item.id === 'project-1:fast-reference-video:reference-video-1');

  assert.ok(referenceVideoItem);
  assert.equal(referenceVideoItem.kind, 'video');
  assert.equal(referenceVideoItem.url, 'https://example.com/reference.mp4');
  assert.equal(referenceVideoItem.sourceLabel, '极速参考视频');
  assert.deepEqual(countProjectMediaItems([project]), { total: 1, images: 0, videos: 1 });

  const updatedProject = applyLibraryItemUrlToProject(project, referenceVideoItem.id, '/api/seedance/assets/file?path=reference.mp4');

  assert.equal(updatedProject.fastFlow.input.referenceVideos[0].videoUrl, '/api/seedance/assets/file?path=reference.mp4');
  assert.equal(updatedProject.fastFlow.input.referenceVideos[0].videoMeta, null);
});
