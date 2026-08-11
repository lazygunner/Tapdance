import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project, Shot } from '../src/types.ts';
import { createEmptyFastVideoProject } from '../src/features/fastVideoFlow/services/fastFlowMappers.ts';
import { createEmptyVideoEditProject } from '../src/features/videoEditing/services/videoEditProject.ts';
import { buildWorkspaceTelemetry } from '../src/features/app/utils/workspaceTelemetry.ts';

function createBaseProject(projectType: Project['projectType'], id: string): Project {
  return {
    id,
    projectType,
    name: id,
    createdAt: '2026-01-01T00:00:00.000Z',
    idea: '',
    brief: null,
    assets: [],
    shots: [],
    fastFlow: createEmptyFastVideoProject(),
    videoEditFlow: createEmptyVideoEditProject(),
  };
}

function createFastProject(): Project {
  const project = createBaseProject('fast-video', 'fast-1');
  project.fastFlow.input = {
    ...project.fastFlow.input,
    prompt: '生成一段产品视频',
    aspectRatio: '16:9',
    durationSec: 10,
  };
  project.fastFlow.videoPrompt = {
    prompt: '生成一段产品视频',
    promptZh: '生成一段产品视频',
  };
  project.fastFlow.task = {
    ...project.fastFlow.task,
    taskId: 'task-1',
    status: 'completed',
    remoteStatus: 'success',
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:02:00.000Z',
    videoUrl: 'https://example.com/final.mp4',
  };
  return project;
}

function createCreativeProject(): Project {
  const project = createBaseProject('creative-video', 'creative-1');
  project.shots = [{
    id: 'shot-1',
    shotNumber: 1,
    duration: 5,
    shotSize: 'wide',
    cameraAngle: 'eye-level',
    cameraMovement: 'static',
    subject: 'product',
    action: 'turntable',
    mood: 'clean',
    transition: 'cut',
    referenceAssets: [],
    imageUrl: 'https://example.com/frame.jpg',
    videoUrl: 'https://example.com/shot.mp4',
  } satisfies Shot];
  return project;
}

test('buildWorkspaceTelemetry aggregates video cost, token, duration, and output counts', () => {
  const stats = buildWorkspaceTelemetry([
    createFastProject(),
    createCreativeProject(),
  ], 1);

  assert.equal(stats.projectCount, 2);
  assert.equal(stats.groupCount, 1);
  assert.equal(stats.fastProjectCount, 1);
  assert.equal(stats.creativeProjectCount, 1);
  assert.equal(stats.submittedFastTaskCount, 1);
  assert.equal(stats.billableFastTaskCount, 1);
  assert.equal(stats.completedFastTaskCount, 1);
  assert.equal(stats.generatedVideoCount, 2);
  assert.equal(stats.generatedImageCount, 1);
  assert.equal(stats.totalGenerationMs, 120_000);
  assert.equal(stats.averageGenerationMs, 120_000);
  assert.equal(stats.completionRate, 1);
  assert.equal(Math.round(stats.usedEstimatedTokens), 216_000);
  assert.equal(Number(stats.usedEstimatedCostCny.toFixed(3)), 15.12);
});

test('buildWorkspaceTelemetry does not invent a Seedance budget for empty fast projects', () => {
  const stats = buildWorkspaceTelemetry([createBaseProject('fast-video', 'empty-fast')], 0);

  assert.equal(stats.fastProjectCount, 1);
  assert.equal(stats.plannedFastProjectCount, 0);
  assert.equal(stats.totalEstimatedTokens, 0);
  assert.equal(stats.usedEstimatedCostCny, 0);
});
