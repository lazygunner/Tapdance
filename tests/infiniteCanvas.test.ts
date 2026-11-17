import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmptyCanvasFlow, normalizeCanvasFlow } from '../src/features/infiniteCanvas/types.ts';
import { getCanvasEdgeRoute, getDirectIncomingCanvasNodes, getUpstreamCanvasNodes } from '../src/features/infiniteCanvas/utils/canvasConnections.ts';
import { createEmptyProject, getProjectResumeView, inferProjectType, isProjectEmpty } from '../src/features/projects/utils/projectLifecycle.ts';

const canvasNode = (id: string, x: number, y: number) => ({
  id, type: 'text' as const, x, y, width: 100, height: 120,
  title: id, content: id, mediaUrl: '', mimeType: '', status: 'idle' as const, error: '',
});

test('creates an empty canvas project that resumes directly in the canvas', () => {
  const project = createEmptyProject('infinite-canvas');

  assert.deepEqual(project.canvasFlow, createEmptyCanvasFlow());
  assert.equal(getProjectResumeView(project), 'infiniteCanvas');
  assert.equal(isProjectEmpty(project), true);
});

test('normalizes persisted canvas nodes, viewport and valid edges', () => {
  const flow = normalizeCanvasFlow({
    nodes: [
      { id: 'text-1', type: 'text', x: 12, y: 24, width: 100, height: 50, content: 'hello' },
      { id: 'image-1', type: 'image', x: 'invalid', y: 80, status: 'generating' },
    ],
    edges: [
      { id: 'valid', source: 'text-1', target: 'image-1' },
      { id: 'orphan', source: 'missing', target: 'image-1' },
      { id: 'self', source: 'text-1', target: 'text-1' },
    ],
    viewport: { x: 10, y: 20, zoom: 99 },
  });

  assert.equal(flow.nodes.length, 2);
  assert.equal(flow.nodes[0].width, 180);
  assert.equal(flow.nodes[1].x, 40);
  assert.equal(flow.nodes[1].status, 'generating');
  assert.deepEqual(flow.edges, [{ id: 'valid', source: 'text-1', target: 'image-1' }]);
  assert.deepEqual(flow.viewport, { x: 10, y: 20, zoom: 2.5 });
});

test('recognizes persisted infinite canvas projects', () => {
  assert.equal(inferProjectType({ projectType: 'infinite-canvas' }), 'infinite-canvas');
});

test('routes canvas edges according to node position', () => {
  const source = canvasNode('source', 0, 0);
  const straight = getCanvasEdgeRoute(source, canvasNode('straight', 200, 10));
  const curve = getCanvasEdgeRoute(source, canvasNode('curve', 320, 180));
  const orthogonal = getCanvasEdgeRoute(source, canvasNode('back', 20, 280));

  assert.equal(straight.kind, 'straight');
  assert.match(straight.path, /^M .+ L /u);
  assert.deepEqual(straight.midpoint, { x: 150, y: 65 });
  assert.equal(curve.kind, 'curve');
  assert.match(curve.path, / C /u);
  assert.deepEqual(curve.midpoint, { x: 210, y: 150 });
  assert.equal(orthogonal.kind, 'orthogonal');
  assert.equal((orthogonal.path.match(/ L /gu) || []).length, 5);
  assert.equal(orthogonal.midpoint.y, 448);
});

test('collects direct and transitive upstream nodes without looping', () => {
  const a = canvasNode('a', 0, 0);
  const b = canvasNode('b', 200, 0);
  const c = canvasNode('c', 400, 0);
  const flow = {
    nodes: [a, b, c],
    edges: [
      { id: 'a-b', source: 'a', target: 'b' },
      { id: 'b-c', source: 'b', target: 'c' },
      { id: 'a-c', source: 'a', target: 'c' },
      { id: 'c-a', source: 'c', target: 'a' },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };

  assert.deepEqual(getDirectIncomingCanvasNodes('c', flow).map((node) => node.id), ['b', 'a']);
  assert.deepEqual(getUpstreamCanvasNodes('c', flow).map((node) => node.id), ['b', 'a']);
});

test('normalizes persisted video generation configuration safely', () => {
  const flow = normalizeCanvasFlow({
    nodes: [{
      ...canvasNode('video', 0, 0),
      type: 'video',
      videoGenerationConfig: {
        sourceId: 'unknown.videoModel',
        seedanceModelKey: 'unknown',
        seedanceDraft: {
          baseTemplateId: 'unknown-template',
          assets: [{ id: 'bad', kind: 'document', role: 'reference_image', urlOrData: 'bad' }],
          prompt: { rawPrompt: 123 },
          options: { ratio: 'invalid', resolution: '8k', outputFormat: 'avi' },
        },
      },
    }],
  });
  const config = flow.nodes[0].videoGenerationConfig!;

  assert.equal(config.sourceId, 'seedance.seedance25ApiModel');
  assert.equal(config.seedanceModelKey, 'standard');
  assert.equal(config.seedanceDraft.baseTemplateId, 'free_text');
  assert.deepEqual(config.seedanceDraft.assets, []);
  assert.deepEqual(config.seedanceDraft.options, {
    ratio: '16:9', duration: 4, resolution: '720p', outputFormat: 'mp4',
    generateAudio: false, returnLastFrame: false, useWebSearch: false, watermark: false,
    safetyIdentifier: undefined, moduleSettings: undefined,
  });
});
