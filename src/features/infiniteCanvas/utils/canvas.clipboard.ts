// Ported from NiegeIP infinite-canvas; Tapdance service/data adapters.
import { remapCanvasPromptMentions } from './canvasPrompt.ts';
import type { CanvasNode, CanvasEdge } from '../types.ts'
export function cloneCanvasSelection(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  makeId: (prefix: string) => string,
  offset = 38,
  existingNodes: Pick<CanvasNode, 'title'>[] = nodes,
) {
  const titles = new Set(existingNodes.map((node) => node.title))
  const copyTitle = (source: CanvasNode) => {
    if (source.type !== 'image') return source.title
    const title = source.title?.trim() || '图片'
    const extension = title.match(/\.[a-zA-Z0-9]{1,10}$/)?.[0] ?? ''
    const stem = (extension ? title.slice(0, -extension.length) : title).replace(/ - 副本(?: \(\d+\))?$/, '')
    let index = 1
    let candidate = `${stem} - 副本${extension}`
    while (titles.has(candidate)) {
      index += 1
      candidate = `${stem} - 副本 (${index})${extension}`
    }
    titles.add(candidate)
    return candidate
  }
  const ids = new Map(nodes.map((node) => [node.id, makeId('canvas-node')]))
  const groups = new Map(
    nodes.flatMap((node) =>
      node.groupId ? [[node.groupId, makeId('canvas-group')] as const] : [],
    ),
  )
  const copies = nodes.map((source): CanvasNode => ({
    ...source,
    title: copyTitle(source),
    content: remapCanvasPromptMentions(source.content, nodes, ids),
    id: ids.get(source.id)!,
    x: source.x + offset,
    y: source.y + offset,
    groupId: source.groupId ? groups.get(source.groupId) : undefined,
    referenceNodeIds: source.referenceNodeIds?.flatMap((id) =>
      ids.has(id) ? [ids.get(id)!] : [],
    ),
    mentionNodeIds: source.mentionNodeIds?.map((id) => ids.get(id) || id),
    referenceGroupIds: source.referenceGroupIds?.flatMap((id) =>
      groups.has(id) ? [groups.get(id)!] : [],
    ),
    ...(source.videoGenerationConfig ? { videoGenerationConfig: {
      ...source.videoGenerationConfig,
      seedanceDraft: { ...source.videoGenerationConfig.seedanceDraft,
        prompt: { ...source.videoGenerationConfig.seedanceDraft.prompt, rawPrompt: remapCanvasPromptMentions(source.videoGenerationConfig.seedanceDraft.prompt.rawPrompt, nodes, ids) },
        assets: source.videoGenerationConfig.seedanceDraft.assets.map((asset) => ({ ...asset, id: ids.get(asset.id) || asset.id })),
      },
    } } : {}),
    taskId: undefined,
    pendingTask: undefined,
    status: source.mediaUrl.trim() ? 'completed' : 'idle',
    error: '',
  }))
  return {
    nodes: copies,
    edges: edges
      .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
      .map((edge) => ({
        ...edge,
        id: makeId('canvas-edge'),
        source: ids.get(edge.source)!,
        target: ids.get(edge.target)!,
      })),
  }
}
