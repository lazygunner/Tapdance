import { groupedReferences } from './canvas.groups.ts';
import type { CanvasFlow, CanvasNode } from '../types.ts';

export type CanvasEdgeRoute = {
  kind: 'straight' | 'curve' | 'orthogonal';
  path: string;
  midpoint: { x: number; y: number };
};

export function getCanvasEdgeRoute(source: CanvasNode, target: CanvasNode): CanvasEdgeRoute {
  const x1 = source.x + source.width;
  const y1 = source.y + source.height / 2;
  const x2 = target.x;
  const y2 = target.y + target.height / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx >= 40 && Math.abs(dy) <= 36) {
    return { kind: 'straight', path: `M ${x1} ${y1} L ${x2} ${y2}`, midpoint: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 } };
  }

  if (dx >= 80) {
    const controlOffset = Math.min(180, Math.max(48, dx * 0.42));
    return {
      kind: 'curve',
      path: `M ${x1} ${y1} C ${x1 + controlOffset} ${y1}, ${x2 - controlOffset} ${y2}, ${x2} ${y2}`,
      midpoint: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 },
    };
  }

  const routeBelow = target.y + target.height / 2 >= source.y + source.height / 2;
  const laneY = routeBelow
    ? Math.max(source.y + source.height, target.y + target.height) + 48
    : Math.min(source.y, target.y) - 48;
  const sourceLaneX = x1 + 48;
  const targetLaneX = x2 - 48;
  return {
    kind: 'orthogonal',
    path: `M ${x1} ${y1} L ${sourceLaneX} ${y1} L ${sourceLaneX} ${laneY} L ${targetLaneX} ${laneY} L ${targetLaneX} ${y2} L ${x2} ${y2}`,
    midpoint: { x: (sourceLaneX + targetLaneX) / 2, y: laneY },
  };
}

export function getDirectIncomingCanvasNodes(nodeId: string, flow: CanvasFlow): CanvasNode[] {
  const nodesById = new Map(flow.nodes.map((node) => [node.id, node]));
  return flow.edges
    .filter((edge) => edge.target === nodeId)
    .map((edge) => nodesById.get(edge.source))
    .filter((node): node is CanvasNode => Boolean(node));
}

export function getUpstreamCanvasNodes(nodeId: string, flow: CanvasFlow): CanvasNode[] {
  const nodesById = new Map(flow.nodes.map((node) => [node.id, node]));
  const incomingIds = new Map<string, string[]>();
  flow.edges.forEach((edge) => {
    incomingIds.set(edge.target, [...(incomingIds.get(edge.target) || []), edge.source]);
  });

  for (const node of flow.nodes) {
    const references = [...groupedReferences(node, flow.nodes).map((source) => source.id), ...(node.mentionNodeIds || [])];
    incomingIds.set(node.id, [...new Set([...(incomingIds.get(node.id) || []), ...references])]);
  }
  const visited = new Set<string>([nodeId]);
  const queue = [...(incomingIds.get(nodeId) || [])];
  const result: CanvasNode[] = [];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    const current = nodesById.get(currentId);
    if (!current) continue;
    result.push(current);
    queue.push(...(incomingIds.get(currentId) || []));
  }
  const order = flow.nodes.find((node) => node.id === nodeId)?.referenceNodeIds || [];
  return result.sort((a, b) => {
    const ai = order.indexOf(a.id), bi = order.indexOf(b.id);
    return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi);
  });
}
