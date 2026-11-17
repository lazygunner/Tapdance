import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCanvasFlow, type CanvasFlow, type CanvasNode } from '../src/features/infiniteCanvas/types.ts';
import { arrangeCanvasNodes } from '../src/features/infiniteCanvas/utils/canvas.layout.ts';
import { canvasMarqueeNodeIds, expandCanvasSelection, canvasGroupBounds, snapCanvasSelection, updateViewportForWheel, fitCanvasViewport, focusCanvasNodeViewport } from '../src/features/infiniteCanvas/utils/canvas.utils.ts';
import { cloneCanvasSelection } from '../src/features/infiniteCanvas/utils/canvas.clipboard.ts';
import { canGroupNodes, splitCanvasGroup, groupedReferences, canReferenceImageGroup, removeGroupReferenceEdge } from '../src/features/infiniteCanvas/utils/canvas.groups.ts';
import { moveCanvasNodesToRecycleBin, restoreCanvasRecycleBinEntry, permanentlyDeleteCanvasRecycleBinEntry } from '../src/features/infiniteCanvas/utils/canvas.recycle-bin.ts';
import { getUpstreamCanvasNodes } from '../src/features/infiniteCanvas/utils/canvasConnections.ts';
import { reduceEdits, type EditState } from '../src/features/infiniteCanvas/editor/editHistory.ts';
import { createEmptyProject, isProjectEmpty } from '../src/features/projects/utils/projectLifecycle.ts';

const node = (id: string, x = 0, y = 0, extra: Partial<CanvasNode> = {}): CanvasNode => ({ id, type: 'image', x, y, width: 200, height: 160, title: id, content: '', mediaUrl: '', mimeType: '', status: 'idle', error: '', ...extra });
const doc = (nodes: CanvasNode[], edges: CanvasFlow['edges'] = []): CanvasFlow => ({ nodes, edges, viewport: { x: 0, y: 0, zoom: 1 } });
const edge = (source: string, target: string) => ({ id: `${source}-${target}`, source, target });

test('marquee includes group header and interior, and selecting a member expands atomically', () => {
  const nodes = [node('a', 100, 100, { groupId: 'g' }), node('b', 400, 100, { groupId: 'g', type: 'video' }), node('free', 50, 500)];
  assert.deepEqual(canvasGroupBounds(nodes.slice(0, 2)), { x: 86, y: 54, width: 528, height: 220 });
  assert.deepEqual(expandCanvasSelection(nodes, ['a']), ['a', 'b']);
  assert.deepEqual(canvasMarqueeNodeIds(nodes, { x: 330, y: 60, width: 20, height: 10 }), ['a', 'b']);
  assert.deepEqual(canvasMarqueeNodeIds(nodes, { x: 330, y: 140, width: 20, height: 10 }), ['a', 'b']);
});

test('multi-selection does not snap against itself, tolerance is in screen pixels', () => {
  assert.deepEqual(snapCanvasSelection([node('a'), node('b', 300, 100)], ['a', 'b'], { x: 3, y: 4 }, 1), { x: 3, y: 4, guides: [] });
  const nodes = [node('a'), node('target', 300, 200)];
  const snap = snapCanvasSelection(nodes, ['a'], { x: 98, y: 0 }, 1);
  assert.equal(snap.x, 100);
  assert.ok(snap.guides.some((guide) => guide.orientation === 'vertical'));
});

test('wheel pans normally and modifier zoom preserves the pointer world coordinate', () => {
  const viewport = { x: 12, y: 30, zoom: .8 };
  assert.deepEqual(updateViewportForWheel(viewport, { deltaX: 5, deltaY: 20, pointerX: 100, pointerY: 80 }), { x: 7, y: 10, zoom: .8 });
  const next = updateViewportForWheel(viewport, { deltaX: 0, deltaY: -30, zoomKey: true, pointerX: 100, pointerY: 80 });
  assert.ok(next.zoom > viewport.zoom);
  assert.ok(Math.abs((100 - next.x) / next.zoom - (100 - viewport.x) / viewport.zoom) < 1e-9);
});

test('fit viewport contains all nodes including negative coordinates', () => {
  const nodes = [node('a', -1000, -700), node('b', 2000, 900)];
  const viewport = fitCanvasViewport(nodes, { width: 1000, height: 700 }, 1);
  for (const item of nodes) {
    assert.ok(item.x * viewport.zoom + viewport.x >= 0);
    assert.ok((item.x + item.width) * viewport.zoom + viewport.x <= 1000);
    assert.ok(item.y * viewport.zoom + viewport.y >= 0);
    assert.ok((item.y + item.height) * viewport.zoom + viewport.y <= 700);
  }
});

test('copy remaps groups, references and internal edges without copying external connections', () => {
  let sequence = 0;
  const nodes = [node('a', 0, 0, { groupId: 'g', status: 'generating', taskId: 'live' }), node('b', 300, 0, { groupId: 'g', referenceNodeIds: ['a', 'outside'] })];
  const copy = cloneCanvasSelection(nodes, [edge('a', 'b'), edge('outside', 'a')], () => `copy-${++sequence}`);
  assert.equal(copy.edges.length, 1);
  assert.equal(copy.edges[0].source, copy.nodes[0].id);
  assert.equal(copy.nodes[0].groupId, copy.nodes[1].groupId);
  assert.notEqual(copy.nodes[0].groupId, 'g');
  assert.equal(copy.nodes[0].status, 'idle');
  assert.equal(copy.nodes[0].taskId, undefined);
  assert.deepEqual(copy.nodes[1].referenceNodeIds, [copy.nodes[0].id]);
  assert.equal(nodes[0].status, 'generating');
});

test('group split retains references and source replacement is reflected immediately', () => {
  const original = doc([node('a', 0, 0, { groupId: 'g', mediaUrl: 'old' }), node('b', 300, 0, { groupId: 'g' }), node('v', 600, 0, { type: 'video', referenceGroupIds: ['g'] })]);
  assert.equal(canGroupNodes(original, ['a', 'b']), false);
  assert.equal(canGroupNodes(doc([node('a'), node('b')]), ['a', 'b']), true);
  const split = splitCanvasGroup(original, 'g');
  split.nodes[0] = { ...split.nodes[0], mediaUrl: 'new' };
  assert.deepEqual(split.nodes[2].referenceNodeIds, ['a', 'b']);
  assert.equal(groupedReferences(split.nodes[2], split.nodes)[0].mediaUrl, 'new');
});

test('group references reject feedback and removing a group edge retains other members', () => {
  const original = doc([node('a', 0, 0, { groupId: 'g' }), node('b', 300, 0, { groupId: 'g' }), node('v', 600, 0, { type: 'video', referenceGroupIds: ['g'] })], [edge('a', 'v')]);
  assert.equal(canReferenceImageGroup(original, 'g', 'v'), true);
  assert.equal(canReferenceImageGroup({ ...original, edges: [edge('v', 'b')] }, 'g', 'v'), false);
  const removed = removeGroupReferenceEdge(original, 'a-v');
  assert.deepEqual(groupedReferences(removed.nodes[2], removed.nodes).map((item) => item.id), ['b']);
});

test('upstream generation expands image groups and honors explicit reference order', () => {
  const flow = doc([node('a', 0, 0, { groupId: 'g' }), node('b', 0, 0, { groupId: 'g' }), node('v', 0, 0, { type: 'video', referenceGroupIds: ['g'], referenceNodeIds: ['b', 'a'] })], [edge('a', 'v')]);
  assert.deepEqual(getUpstreamCanvasNodes('v', flow).map((item) => item.id), ['b', 'a']);
});

test('layout handles cycles, respects generation direction and is stable on repeated arrange', () => {
  const nodes = ['a', 'b', 'c', 'd'].map((id) => node(id));
  const edges = [edge('a', 'b'), edge('b', 'a'), edge('b', 'c')];
  const arranged = arrangeCanvasNodes(nodes, edges);
  assert.ok(arranged[2].x > arranged[0].x + arranged[0].width);
  assert.notEqual(arranged[0].y, arranged[1].y);
  assert.deepEqual(arrangeCanvasNodes(arranged, edges), arranged);
});

test('recycle restore reconnects endpoints deleted and restored separately', () => {
  const original = doc([node('a'), node('b', 300)], [edge('a', 'b')]);
  let flow = moveCanvasNodesToRecycleBin(original, ['a'], 'entry-a', '2026-11-16');
  flow = moveCanvasNodesToRecycleBin(flow, ['b'], 'entry-b', '2026-11-16');
  flow = normalizeCanvasFlow(flow);
  flow = restoreCanvasRecycleBinEntry(flow, 'entry-a');
  assert.equal(flow.edges.length, 0);
  flow = restoreCanvasRecycleBinEntry(flow, 'entry-b');
  assert.deepEqual(flow.edges, original.edges);
  assert.equal(flow.nodes.length, 2);
  assert.equal(flow.recycleBin?.length, 0);
});

test('recycle bin persists group, reference order and generation options, and counts as nonempty', () => {
  const project = createEmptyProject('infinite-canvas');
  project.canvasFlow = moveCanvasNodesToRecycleBin(doc([node('a', 0, 0, { groupId: 'g', referenceNodeIds: ['b'], mediaWidth: 1920, mediaHeight: 1080 })]), ['a'], 'trash', '2026-11-16');
  assert.equal(isProjectEmpty(project), false);
  const normalized = normalizeCanvasFlow(project.canvasFlow);
  assert.equal(normalized.recycleBin?.[0].nodes[0].groupId, 'g');
  assert.deepEqual(normalized.recycleBin?.[0].nodes[0].referenceNodeIds, ['b']);
  assert.equal(normalized.recycleBin?.[0].nodes[0].mediaWidth, 1920);
  assert.equal(permanentlyDeleteCanvasRecycleBinEntry(normalized, 'trash').recycleBin?.length, 0);
});

test('undo drag preserves asynchronously completed media, redo preserves it too', () => {
  let state: EditState<CanvasFlow> = { value: doc([node('a')]), past: [], future: [] };
  state = reduceEdits(state, { type: 'edit', group: 'drag', update: (flow) => ({ ...flow, nodes: flow.nodes.map((item) => ({ ...item, x: 50 })) }) });
  state = reduceEdits(state, { type: 'system', update: (flow) => ({ ...flow, nodes: flow.nodes.map((item) => ({ ...item, mediaUrl: 'generated.png', status: 'completed' })) }) });
  state = reduceEdits(state, { type: 'edit', group: 'drag', update: (flow) => ({ ...flow, nodes: flow.nodes.map((item) => ({ ...item, x: 100 })) }) });
  state = reduceEdits(state, { type: 'undo' });
  assert.equal(state.value.nodes[0].x, 0);
  assert.equal(state.value.nodes[0].mediaUrl, 'generated.png');
  assert.equal(state.value.nodes[0].status, 'completed');
  state = reduceEdits(state, { type: 'redo' });
  assert.equal(state.value.nodes[0].x, 100);
  assert.equal(state.value.nodes[0].mediaUrl, 'generated.png');
});

test('text edits undo normally, and live generation nodes are not erased by undo creation', () => {
  let state: EditState<CanvasFlow> = { value: doc([node('t', 0, 0, { type: 'text', content: 'before' })]), past: [], future: [] };
  state = reduceEdits(state, { type: 'edit', update: (flow) => ({ ...flow, nodes: flow.nodes.map((item) => ({ ...item, content: 'after' })) }) });
  assert.equal(reduceEdits(state, { type: 'undo' }).value.nodes[0].content, 'before');
  state = { value: doc([]), past: [], future: [] };
  state = reduceEdits(state, { type: 'edit', update: doc([node('a')]) });
  state = reduceEdits(state, { type: 'system', update: (flow) => ({ ...flow, nodes: flow.nodes.map((item) => ({ ...item, status: 'generating' })) }) });
  assert.equal(reduceEdits(state, { type: 'undo' }).value.nodes.length, 1);
});

test('undo creation does not discard a completed image result received asynchronously', () => {
  let state: EditState<CanvasFlow> = { value: doc([]), past: [], future: [] };
  state = reduceEdits(state, { type: 'edit', update: doc([node('a')]) });
  state = reduceEdits(state, { type: 'system', update: (flow) => ({ ...flow, nodes: flow.nodes.map((item) => ({ ...item, status: 'completed', mediaUrl: 'generated.png' })) }) });
  assert.equal(reduceEdits(state, { type: 'undo' }).value.nodes[0].mediaUrl, 'generated.png');
});

test('only task identifiers and provider are persisted; duplicate never copies a live query', () => {
  const raw = doc([node('video', 0, 0, { type: 'video', status: 'generating', pendingTask: { provider: 'seedance', id: 'task-id', mock: false } })]);
  const normalized = normalizeCanvasFlow({ ...raw, nodes: [{ ...raw.nodes[0], pendingTask: { ...raw.nodes[0].pendingTask, apiKey: 'must-not-be-persisted' } }] });
  assert.deepEqual(normalized.nodes[0].pendingTask, { provider: 'seedance', id: 'task-id', mock: false });
  let i = 0;
  assert.equal(cloneCanvasSelection(normalized.nodes, [], () => `copy-${++i}`).nodes[0].pendingTask, undefined);
});

test('image model and ratio survive project normalization while invalid ratios are dropped', () => {
  const flow = normalizeCanvasFlow({ nodes: [{ ...node('image'), imageGenerationConfig: { sourceId: 'gemini.imageModel', ratio: '3:4' } }] });
  assert.deepEqual(flow.nodes[0].imageGenerationConfig, { sourceId: 'gemini.imageModel', ratio: '3:4' });
  assert.equal(normalizeCanvasFlow({ nodes: [{ ...node('image'), imageGenerationConfig: { sourceId: 'gemini.imageModel', ratio: 'invalid' } }] }).nodes[0].imageGenerationConfig, undefined);
});

test('revealing an offscreen node leaves its action toolbar below the workspace header', () => {
  const item = node('new', 5000, 5000);
  const size = { width: 1280, height: 684 };
  const viewport = focusCanvasNodeViewport(item, { x: 0, y: 0, zoom: 1 }, size, size.height - 80, 106);
  assert.ok(item.y * viewport.zoom + viewport.y >= 106);
  assert.ok((item.y + item.height) * viewport.zoom + viewport.y <= size.height - 80);
  assert.ok(item.x * viewport.zoom + viewport.x >= 32);
});
