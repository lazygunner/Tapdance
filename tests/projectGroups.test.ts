import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyFastVideoProject } from '../src/features/fastVideoFlow/services/fastFlowMappers.ts';
import { buildDefaultGroupName, collectProjectGeneratedImageAssets, getNormalizedProjectGroupFields, getProjectGroupImageAssets, getProjectGroupSummary } from '../src/services/projectGroups.ts';
import type { Project } from '../src/types.ts';

function createProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    projectType: 'creative-video',
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

test('getNormalizedProjectGroupFields auto-creates a dedicated group for legacy project without grouping', () => {
  const groupFields = getNormalizedProjectGroupFields({
    id: 'legacy-project-1',
    name: '旧项目 A',
  }, 'legacy-project-1', '旧项目 A');

  assert.equal(groupFields.groupId, 'project-group:legacy-project-1');
  assert.equal(groupFields.groupName, '旧项目 A 分组');
});

test('getNormalizedProjectGroupFields migrates legacy category into shared group binding', () => {
  const first = getNormalizedProjectGroupFields({
    id: 'legacy-project-1',
    name: '旧项目 A',
    category: '饮料广告',
  }, 'legacy-project-1', '旧项目 A');
  const second = getNormalizedProjectGroupFields({
    id: 'legacy-project-2',
    name: '旧项目 B',
    category: '饮料广告',
  }, 'legacy-project-2', '旧项目 B');

  assert.equal(first.groupId, 'legacy-group:饮料广告');
  assert.equal(second.groupId, 'legacy-group:饮料广告');
  assert.equal(first.groupName, '饮料广告');
  assert.equal(second.groupName, '饮料广告');
});

test('buildDefaultGroupName skips existing group names', () => {
  const projects = [
    createProject({ id: 'project-1', groupId: 'group-1', groupName: '新分组 1' }),
    createProject({ id: 'project-2', groupId: 'group-2', groupName: '新分组 2' }),
  ];

  assert.equal(buildDefaultGroupName(projects), '新分组 3');
});

test('getProjectGroupSummary aggregates projects and limits preview images to four', () => {
  const projects = [
    createProject({
      id: 'project-1',
      groupId: 'legacy-group:饮料广告',
      groupName: '饮料广告',
      shots: [
        {
          id: 'shot-1',
          shotNumber: 1,
          duration: 3,
          shotSize: '中景',
          cameraAngle: '平视',
          cameraMovement: '固定',
          subject: '主角',
          action: '动作 A',
          mood: '兴奋',
          transition: '硬切',
          imageUrl: 'data:image/png;base64,AAA=',
        },
      ],
    }),
    createProject({
      id: 'project-2',
      groupId: 'legacy-group:饮料广告',
      groupName: '饮料广告',
      assets: [
        {
          id: 'asset-1',
          type: 'product',
          name: '产品图',
          description: '',
          imageUrl: 'data:image/png;base64,BBB=',
        },
      ],
    }),
  ];

  const groups = getProjectGroupSummary(projects);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, '饮料广告');
  assert.equal(groups[0].projects.length, 2);
  assert.equal(groups[0].previewImages.length, 2);
});

test('collectProjectGeneratedImageAssets collects assets and first/last frames', () => {
  const project = createProject({
    id: 'project-1',
    groupId: 'group-1',
    groupName: '测试分组',
    assets: [
      {
        id: 'asset-1',
        type: 'product',
        name: '产品图',
        description: '',
        imageUrl: 'data:image/png;base64,AAA=',
      },
    ],
    shots: [
      {
        id: 'shot-1',
        shotNumber: 1,
        duration: 3,
        shotSize: '中景',
        cameraAngle: '平视',
        cameraMovement: '固定',
        subject: '主角',
        action: '动作 A',
        mood: '兴奋',
        transition: '硬切',
        imageUrl: 'data:image/png;base64,BBB=',
        lastFrameImageUrl: 'data:image/png;base64,CCC=',
      },
    ],
  });

  const images = collectProjectGeneratedImageAssets(project);

  assert.equal(images.length, 3);
  assert.ok(images.some((item) => item.sourceType === 'asset'));
  assert.ok(images.some((item) => item.sourceType === 'shot-first'));
  assert.ok(images.some((item) => item.sourceType === 'shot-last'));
});

test('getProjectGroupImageAssets filters images by group id', () => {
  const projects = [
    createProject({
      id: 'project-1',
      groupId: 'group-1',
      groupName: '组 A',
      shots: [
        {
          id: 'shot-1',
          shotNumber: 1,
          duration: 3,
          shotSize: '中景',
          cameraAngle: '平视',
          cameraMovement: '固定',
          subject: '主角',
          action: '动作 A',
          mood: '兴奋',
          transition: '硬切',
          imageUrl: 'data:image/png;base64,AAA=',
        },
      ],
    }),
    createProject({
      id: 'project-2',
      groupId: 'group-2',
      groupName: '组 B',
      shots: [
        {
          id: 'shot-2',
          shotNumber: 1,
          duration: 3,
          shotSize: '中景',
          cameraAngle: '平视',
          cameraMovement: '固定',
          subject: '主角',
          action: '动作 B',
          mood: '兴奋',
          transition: '硬切',
          imageUrl: 'data:image/png;base64,BBB=',
        },
      ],
    }),
  ];

  const groupImages = getProjectGroupImageAssets('group-1', projects);

  assert.equal(groupImages.length, 1);
  assert.equal(groupImages[0].projectId, 'project-1');
});
