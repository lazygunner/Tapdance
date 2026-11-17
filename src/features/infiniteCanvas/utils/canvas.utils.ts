// Ported from NiegeIP infinite-canvas; Tapdance service/data adapters.
import type { CanvasEdge, CanvasNode, CanvasViewport, CanvasFlow } from '../types.ts'

// Mirrors the 13px handles positioned at top: 54px and left/right: -8px.
export const CANVAS_HANDLE_CENTER_Y = 61.5
export const CANVAS_HANDLE_CENTER_X_OFFSET = 0.5

export function getDirectUpstreamNodes(nodeId: string, document: Pick<CanvasFlow, 'nodes' | 'edges'>): CanvasNode[] {
  const byId = new Map(document.nodes.map((node) => [node.id, node]))
  return document.edges
    .filter((edge) => edge.target === nodeId)
    .map((edge) => byId.get(edge.source))
    .filter((node): node is CanvasNode => Boolean(node))
}

export function getRelatedEdgeIds(nodeId: string, document: Pick<CanvasFlow, 'edges'>): Set<string> {
  return new Set(document.edges.filter((edge) => edge.source === nodeId || edge.target === nodeId).map((edge) => edge.id))
}

export function edgePath(source: CanvasNode, target: CanvasNode, sourceAnchor?: { x: number; y: number }): { path: string; x: number; y: number } {
  const x1 = sourceAnchor?.x ?? source.x + source.width + CANVAS_HANDLE_CENTER_X_OFFSET
  const y1 = sourceAnchor?.y ?? source.y + (source.type === 'image' ? source.height / 2 : CANVAS_HANDLE_CENTER_Y)
  const x2 = target.x - CANVAS_HANDLE_CENTER_X_OFFSET
  const y2 = target.y + (target.type === 'image' ? target.height / 2 : CANVAS_HANDLE_CENTER_Y)
  const bend = Math.max(50, Math.min(200, Math.abs(x2 - x1) * 0.42))
  if (x2 > x1 + 40) return { path: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`, x: (x1 + x2) / 2, y: (y1 + y2) / 2 }
  const lane = Math.max(source.y + source.height, target.y + target.height) + 42
  return { path: `M ${x1} ${y1} L ${x1 + 42} ${y1} L ${x1 + 42} ${lane} L ${x2 - 42} ${lane} L ${x2 - 42} ${y2} L ${x2} ${y2}`, x: (x1 + x2) / 2, y: lane }
}

export function canConnect(source: string, target: string, edges: readonly CanvasEdge[]): boolean {
  return source !== target && !edges.some((edge) => edge.source === source && edge.target === target)
}

export function nodeMediaUrl(node: CanvasNode): string { return node.mediaUrl.trim() }

export interface CanvasViewportSize { width: number; height: number }
export interface CanvasNodeSize { width: number; height: number }
export interface CanvasRect extends CanvasNodeSize { x: number; y: number }

/** Group frames and alignment use the same geometry, including their header. */
export function canvasGroupBounds(members: readonly CanvasRect[], kind: 'group' | 'workflow' = 'group'): CanvasRect | undefined {
  if (!members.length) return undefined
  const padding = kind === 'workflow' ? 18 : 14
  const header = kind === 'workflow' ? 50 : 46
  const x = Math.min(...members.map((node) => node.x)) - padding
  const y = Math.min(...members.map((node) => node.y)) - header
  return { x, y, width: Math.max(...members.map((node) => node.x + node.width)) + padding - x, height: Math.max(...members.map((node) => node.y + node.height)) + padding - y }
}

function selectionGroupKey(node: CanvasNode): string | undefined {
  if (node.groupId) return `group:${node.groupId}`
  return undefined
}

/** Selecting a member keeps an existing group atomic during marquee and movement. */
export function expandCanvasSelection(nodes: readonly CanvasNode[], ids: readonly string[]): string[] {
  const selected = new Set(ids)
  const groups = new Set(nodes.filter((node) => selected.has(node.id)).map(selectionGroupKey).filter(Boolean))
  return nodes.filter((node) => selected.has(node.id) || Boolean(selectionGroupKey(node) && groups.has(selectionGroupKey(node)))).map((node) => node.id)
}

function canvasEntities(nodes: readonly CanvasNode[]): Array<{ rect: CanvasRect; ids: string[] }> {
  const groups = new Map<string, CanvasNode[]>()
  const entities: Array<{ rect: CanvasRect; ids: string[] }> = []
  for (const node of nodes) {
    const key = selectionGroupKey(node)
    if (!key) { entities.push({ rect: node, ids: [node.id] }); continue }
    const members = groups.get(key) ?? []
    members.push(node)
    groups.set(key, members)
  }
  for (const [key, members] of groups) {
    const rect = canvasGroupBounds(members, key.startsWith('workflow:') ? 'workflow' : 'group')
    if (rect) entities.push({ rect, ids: members.map((node) => node.id) })
  }
  return entities
}

export function canvasSelectionBounds(nodes: readonly CanvasNode[], ids: readonly string[]): CanvasRect | undefined {
  const selected = new Set(ids)
  const rects = canvasEntities(nodes).filter((entity) => entity.ids.some((id) => selected.has(id))).map((entity) => entity.rect)
  if (!rects.length) return undefined
  const x = Math.min(...rects.map((rect) => rect.x))
  const y = Math.min(...rects.map((rect) => rect.y))
  return { x, y, width: Math.max(...rects.map((rect) => rect.x + rect.width)) - x, height: Math.max(...rects.map((rect) => rect.y + rect.height)) - y }
}

/** Fit complete node/group bounds, leaving screen space for the canvas tools. */
export function fitCanvasViewport(nodes: readonly CanvasNode[], size: CanvasViewportSize, maxZoom: number): CanvasViewport {
  const bounds = canvasSelectionBounds(nodes, nodes.map((node) => node.id))
  if (!bounds || size.width <= 0 || size.height <= 0) return { x: 0, y: 0, zoom: maxZoom }
  const zoom = Math.max(0.1, Math.min(maxZoom, Math.max(1, size.width - 96) / bounds.width, Math.max(1, size.height - 192) / bounds.height))
  return {
    zoom,
    x: size.width / 2 - (bounds.x + bounds.width / 2) * zoom,
    y: (size.height - 64) / 2 - (bounds.y + bounds.height / 2) * zoom,
  }
}

/** Reveal a new image with the smallest pan; preserve a fully visible viewport. */
export function focusCanvasNodeViewport(node: CanvasRect, viewport: CanvasViewport, size: CanvasViewportSize, composerTop = size.height - 300, topInset = 64): CanvasViewport {
  if (size.width <= 0 || size.height <= 0) return viewport
  const left = 32
  const right = Math.max(left + 40, size.width - 32)
  const top = topInset
  const bottom = Math.max(top + 40, Math.min(size.height - 24, composerTop - 24))
  const zoom = Math.max(.1, Math.min(viewport.zoom, (bottom - top) / node.height, (right - left) / node.width))
  // If shrinking is necessary, keep the node's screen-space centre as the anchor.
  const x = viewport.x + (node.x + node.width / 2) * (viewport.zoom - zoom)
  const y = viewport.y + (node.y + node.height / 2) * (viewport.zoom - zoom)
  const nextX = Math.max(left - node.x * zoom, Math.min(x, right - (node.x + node.width) * zoom))
  const nextY = Math.max(top - node.y * zoom, Math.min(y, bottom - (node.y + node.height) * zoom))
  return nextX === viewport.x && nextY === viewport.y && zoom === viewport.zoom
    ? viewport
    : { x: nextX, y: nextY, zoom }
}

/** The caller normalizes drag direction before passing a world-coordinate rectangle. */
export function canvasMarqueeNodeIds(nodes: readonly CanvasNode[], rect: CanvasRect): string[] {
  return canvasEntities(nodes).filter(({ rect: target }) => rect.x < target.x + target.width && rect.x + rect.width > target.x && rect.y < target.y + target.height && rect.y + rect.height > target.y).flatMap((entity) => entity.ids)
}

/** Return a shared movement delta, snapping to other visible group frames or nodes. */
export function snapCanvasSelection(nodes: readonly CanvasNode[], ids: readonly string[], delta: { x: number; y: number }, zoom: number): CanvasSnapResult {
  const bounds = canvasSelectionBounds(nodes, ids)
  if (!bounds) return { ...delta, guides: [] }
  const moving = new Set(expandCanvasSelection(nodes, ids))
  const nearby = canvasEntities(nodes).filter((entity) => !entity.ids.some((id) => moving.has(id))).map((entity) => entity.rect)
  const result = snapCanvasNode(bounds, { x: bounds.x + delta.x, y: bounds.y + delta.y }, nearby, zoom)
  return { x: result.x - bounds.x, y: result.y - bounds.y, guides: result.guides }
}

export interface CanvasGuide {
  orientation: 'vertical' | 'horizontal'
  position: number
  start: number
  end: number
}

export interface CanvasSnapResult {
  x: number
  y: number
  guides: CanvasGuide[]
}

type SnapAxis = 'x' | 'y'

const DEFAULT_SNAP_SCREEN_THRESHOLD = 8
const DEFAULT_SNAP_NEARBY_DISTANCE = 520

function axisCandidates(node: CanvasNodeSize, other: CanvasRect, axis: SnapAxis) {
  if (axis === 'x') {
    return [
      { value: other.x, guide: other.x },
      { value: other.x + other.width - node.width, guide: other.x + other.width },
      { value: other.x + other.width / 2 - node.width / 2, guide: other.x + other.width / 2 },
      { value: other.x + other.width, guide: other.x + other.width },
      { value: other.x - node.width, guide: other.x },
    ]
  }
  return [
    { value: other.y, guide: other.y },
    { value: other.y + other.height - node.height, guide: other.y + other.height },
    { value: other.y + other.height / 2 - node.height / 2, guide: other.y + other.height / 2 },
    { value: other.y + other.height, guide: other.y + other.height },
    { value: other.y - node.height, guide: other.y },
  ]
}

/**
 * Snap a dragged node to nearby node edges/centres. The threshold is expressed
 * in screen pixels so zooming does not make alignment unexpectedly difficult.
 * Guides are transient UI data and are intentionally not part of the document.
 */
export function snapCanvasNode(
  node: CanvasNodeSize & { x: number; y: number },
  proposed: { x: number; y: number },
  nearbyNodes: readonly CanvasRect[],
  zoom: number,
  screenThreshold = DEFAULT_SNAP_SCREEN_THRESHOLD,
  nearbyDistance = DEFAULT_SNAP_NEARBY_DISTANCE,
): CanvasSnapResult {
  const threshold = screenThreshold / Math.max(0.01, zoom)
  const candidates = nearbyNodes.filter((other) => (
    Math.max(other.x - (proposed.x + node.width), proposed.x - (other.x + other.width), 0) <= nearbyDistance
      && Math.max(other.y - (proposed.y + node.height), proposed.y - (other.y + other.height), 0) <= nearbyDistance
  ))
  const findBest = (axis: SnapAxis) => {
    const position = axis === 'x' ? proposed.x : proposed.y
    let best: { value: number; guide: number; distance: number; other: CanvasRect } | undefined
    for (const other of candidates) {
      for (const candidate of axisCandidates(node, other, axis)) {
        const distance = Math.abs(candidate.value - position)
        if (distance <= threshold && (!best || distance < best.distance)) best = { value: candidate.value, guide: candidate.guide, distance, other }
      }
    }
    return best
  }
  const x = findBest('x')
  const y = findBest('y')
  const guides: CanvasGuide[] = []
  if (x) guides.push({ orientation: 'vertical', position: x.guide, start: Math.min(proposed.y, x.other.y) - 20, end: Math.max(proposed.y + node.height, x.other.y + x.other.height) + 20 })
  if (y) guides.push({ orientation: 'horizontal', position: y.guide, start: Math.min(proposed.x, y.other.x) - 20, end: Math.max(proposed.x + node.width, y.other.x + y.other.width) + 20 })
  return { x: x?.value ?? proposed.x, y: y?.value ?? proposed.y, guides }
}

/** Converts a visible viewport position into world coordinates and keeps new nodes out of nearby cards. */
export function getViewportNodePosition(
  viewport: CanvasViewport,
  viewportSize: CanvasViewportSize,
  nodeSize: CanvasNodeSize,
  existingNodes: readonly CanvasNode[] = [],
  offsetX = 96,
): { x: number; y: number } {
  const zoom = Math.max(0.01, viewport.zoom)
  const screenX = Math.max(24, viewportSize.width / 2 + Math.min(offsetX, viewportSize.width / 4))
  const screenY = Math.max(24, viewportSize.height / 2)
  const initial = {
    x: (screenX - viewport.x) / zoom - nodeSize.width / 2,
    y: (screenY - viewport.y) / zoom - nodeSize.height / 2,
  }
  return findNonOverlappingPosition(initial, nodeSize, existingNodes)
}

/** Finds a nearby free slot while keeping the requested starting point when possible. */
export function findNonOverlappingPosition(
  initial: { x: number; y: number },
  nodeSize: CanvasNodeSize,
  existingNodes: readonly CanvasNode[],
): { x: number; y: number } {
  const gap = 28
  const overlaps = (x: number, y: number) => existingNodes.some((node) => (
    x < node.x + node.width + gap && x + nodeSize.width + gap > node.x
      && y < node.y + node.height + gap && y + nodeSize.height + gap > node.y
  ))
  if (!overlaps(initial.x, initial.y)) return initial
  for (let index = 1; index <= 24; index += 1) {
    const column = Math.ceil(index / 2)
    const direction = index % 2 === 0 ? 1 : -1
    const candidate = {
      x: initial.x + direction * column * (nodeSize.width + gap),
      y: initial.y + (index % 2 === 0 ? 0 : column * (nodeSize.height + gap)),
    }
    if (!overlaps(candidate.x, candidate.y)) return candidate
  }
  return { x: initial.x, y: initial.y + nodeSize.height + gap }
}

export interface CanvasWheelInput {
  deltaX: number
  deltaY: number
  shiftKey?: boolean
  zoomKey?: boolean
  pointerX: number
  pointerY: number
}

/** Ctrl/Cmd+wheel zooms around the pointer; an ordinary wheel pans the world. */
export function updateViewportForWheel(
  viewport: CanvasViewport,
  input: CanvasWheelInput,
): CanvasViewport {
  if (!input.zoomKey) {
    const horizontalDelta = input.shiftKey && Math.abs(input.deltaX) < Math.abs(input.deltaY) ? input.deltaY : input.deltaX
    return { ...viewport, x: viewport.x - horizontalDelta, y: viewport.y - (input.shiftKey ? 0 : input.deltaY) }
  }
  const rectX = input.pointerX
  const rectY = input.pointerY
  const worldX = (rectX - viewport.x) / viewport.zoom
  const worldY = (rectY - viewport.y) / viewport.zoom
  const direction = input.deltaY < 0 ? 1 : -1
  const zoom = Math.min(2.2, Math.max(0.1, viewport.zoom * (direction > 0 ? 1.08 : 0.92)))
  // Keep the pointer anchored while zooming.
  return { zoom, x: rectX - worldX * zoom, y: rectY - worldY * zoom }
}
