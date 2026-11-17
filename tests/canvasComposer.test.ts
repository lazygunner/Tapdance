import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCanvasFlow, type CanvasNode } from '../src/features/infiniteCanvas/types.ts';
import { getUpstreamCanvasNodes } from '../src/features/infiniteCanvas/utils/canvasConnections.ts';
import { resolveCanvasPromptMentions, removeCanvasPromptMention } from '../src/features/infiniteCanvas/utils/canvasPrompt.ts';
import { getMentionedMaterialIds, materialMentionLabel, materialMentionToken, findPendingMentionMatch } from '../src/features/infiniteCanvas/components/creation/promptMention.utils.ts';
import { cloneCanvasSelection } from '../src/features/infiniteCanvas/utils/canvas.clipboard.ts';

const node = (id: string, type: CanvasNode['type'], extra: Partial<CanvasNode> = {}): CanvasNode => ({ id, type, x: 0, y: 0, width: 360, height: 300, title: id, content: '', mediaUrl: `data:${type}/test`, mimeType: '', status: 'idle', error: '', ...extra });

test('mention tokens keep stable node IDs while display labels follow current reference order', () => {
  const first = { id: 'first-image-id', kind: 'image' as const, name: '参考图' };
  const second = { id: 'second-image-id', kind: 'image' as const, name: '参考图二' };
  assert.equal(materialMentionToken(first), '@图片first-image-id');
  assert.equal(materialMentionLabel(first, [first, second], [second.id, first.id]), '@图片2');
  assert.deepEqual(getMentionedMaterialIds('@图片first-image-id 配合 @图片second-image-id，@图片first-image-id', [first, second]), [first.id, second.id]);
  assert.deepEqual(getMentionedMaterialIds('普通邮箱 test@example.com', [first]), []);
  assert.deepEqual(getMentionedMaterialIds('@图片first-image-id-extra', [first]), []);
});

test('mention reference resolution includes videos and audio without altering manually connected inputs', () => {
  const image = node('image-id', 'image');
  const video = node('video-id', 'video');
  const audio = node('audio-id', 'audio');
  const target = node('target', 'video', { mentionNodeIds: [video.id, audio.id], referenceNodeIds: [audio.id, image.id, video.id] });
  const flow = normalizeCanvasFlow({ nodes: [image, video, audio, target], edges: [{ id: 'manual', source: image.id, target: target.id }] });
  assert.deepEqual(getUpstreamCanvasNodes(target.id, flow).map((item) => item.id), [audio.id, image.id, video.id]);
  flow.nodes[3].mentionNodeIds = [];
  assert.deepEqual(getUpstreamCanvasNodes(target.id, flow).map((item) => item.id), [image.id]);
  assert.equal(flow.edges[0].source, image.id);
});

test('provider prompts receive readable per-kind reference labels instead of persisted UUID tokens', () => {
  const refs = [node('image-b', 'image'), node('video-a', 'video'), node('image-a', 'image'), node('audio-a', 'audio')];
  const prompt = '让 @图片image-a 随 @视频video-a 的镜头运动，参考 @图片image-b，配合 @音频audio-a。';
  assert.equal(resolveCanvasPromptMentions(prompt, refs), '让 图片2 随 视频1 的镜头运动，参考 图片1，配合 音频1。');
  assert.equal(resolveCanvasPromptMentions('普通文本与 @图片unknown-id', refs), '普通文本与 @图片unknown-id');
});

test('source mention completion does not reopen a menu inside an already completed token', () => {
  const material = { id: 'image-a', kind: 'image' as const, name: '参考图' };
  assert.equal(findPendingMentionMatch('@图片image-a', 10, [material]), null);
  assert.deepEqual(findPendingMentionMatch('场景 @参考', 6, [material]), { query: '参考', start: 3, end: 6 });
  assert.equal(findPendingMentionMatch('test@example.com', 16, [material]), null);
});

test('composer settings and mention references survive save/reopen and clone with remapped references', () => {
  const reference = node('reference', 'image');
  const target = node('target', 'image', { mentionNodeIds: [reference.id], imageGenerationConfig: { sourceId: 'gemini.imageModel', ratio: '3:4', count: 4 } });
  const normalized = normalizeCanvasFlow({ nodes: [reference, target] });
  assert.deepEqual(normalized.nodes[1].imageGenerationConfig, target.imageGenerationConfig);
  let nextId = 0;
  const copied = cloneCanvasSelection(normalized.nodes, [], () => `copy-${++nextId}`);
  assert.deepEqual(copied.nodes[1].mentionNodeIds, [copied.nodes[0].id]);
  assert.deepEqual(copied.nodes[1].imageGenerationConfig, target.imageGenerationConfig);
  const invalid = normalizeCanvasFlow({ nodes: [{ ...target, imageGenerationConfig: { ...target.imageGenerationConfig, count: 99 } }] });
  assert.equal(invalid.nodes[0].imageGenerationConfig?.count, undefined);
});

test('copied composer text follows cloned reference IDs and retains external mention references', () => {
  const reference = node('ref-a', 'image');
  const target = normalizeCanvasFlow({ nodes: [{ ...node('target', 'video', { content: '@图片ref-a 镜头推进', mentionNodeIds: ['ref-a'] }), videoGenerationConfig: { sourceId: 'gemini.fastVideoModel', seedanceModelKey: 'standard', seedanceDraft: { prompt: { rawPrompt: '@图片ref-a 镜头推进' } } } }] }).nodes[0];
  let id = 0;
  const together = cloneCanvasSelection([reference, target], [], () => `cloned-${++id}`);
  assert.equal(together.nodes[1].content, `@图片${together.nodes[0].id} 镜头推进`);
  assert.equal(together.nodes[1].videoGenerationConfig?.seedanceDraft.prompt.rawPrompt, together.nodes[1].content);
  assert.equal(removeCanvasPromptMention(target.content, reference), '镜头推进');
  const alone = cloneCanvasSelection([target], [], () => `alone-${++id}`);
  assert.deepEqual(alone.nodes[0].mentionNodeIds, ['ref-a']);
  assert.equal(alone.nodes[0].content, target.content);
});
