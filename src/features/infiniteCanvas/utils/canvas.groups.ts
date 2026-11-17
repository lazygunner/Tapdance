// Ported from NiegeIP infinite-canvas; Tapdance service/data adapters.
import type { CanvasNode, CanvasFlow } from '../types.ts'

export function canvasGroups(nodes: readonly CanvasNode[]) {
  const groups = new Map<string, CanvasNode[]>()
  for (const node of nodes) {
    if (!node.groupId) continue
    const members = groups.get(node.groupId) ?? []
    members.push(node)
    groups.set(node.groupId, members)
  }
  return groups
}

/** A group may contain any node types, but only all-image groups carry image-reference semantics. */
export function imageGroups(nodes: readonly CanvasNode[]) {
  return new Map([...canvasGroups(nodes)].filter(([, members]) => members.every((node) => node.type === 'image')))
}

export function groupedReferences(node: CanvasNode, nodes: readonly CanvasNode[]): CanvasNode[] {
  const imageGroupIds = new Set(imageGroups(nodes).keys())
  return nodes.filter((source) => source.id !== node.id && source.type === 'image' &&
    (node.referenceNodeIds?.includes(source.id) || (source.groupId && imageGroupIds.has(source.groupId) && node.referenceGroupIds?.includes(source.groupId))))
}

export function groupHasConnections(document: CanvasFlow, memberIds: readonly string[]): boolean {
  const ids = new Set(memberIds)
  return document.edges.some((edge) => ids.has(edge.source) || ids.has(edge.target))
}

export function canGroupImages(document: CanvasFlow, memberIds: readonly string[]): boolean {
  const ids = new Set(memberIds)
  return ids.size >= 2 && document.nodes.filter((node) => ids.has(node.id)).length === ids.size &&
    document.nodes.every((node) => !ids.has(node.id) || (node.type === 'image' && !node.groupId))
}

export function canGroupNodes(document: CanvasFlow, memberIds: readonly string[]): boolean {
  const ids = new Set(memberIds)
  return ids.size >= 2 && document.nodes.filter((node) => ids.has(node.id)).length === ids.size &&
    document.nodes.every((node) => !ids.has(node.id) || (!node.groupId))
}

export function canSplitCanvasGroup(document: CanvasFlow, groupId: string): boolean {
  const members = document.nodes.filter((node) => node.groupId === groupId)
  return members.length > 0
}

export function splitImageGroup(document: CanvasFlow, groupId: string): CanvasFlow {
  return splitCanvasGroup(document, groupId)
}

export function splitCanvasGroup(document: CanvasFlow, groupId: string): CanvasFlow {
  if (!canSplitCanvasGroup(document, groupId)) return document
  const members = document.nodes.filter((node) => node.groupId === groupId)
  return { ...document, nodes: document.nodes.map((node) => ({
    ...node,
    groupId: node.groupId === groupId ? undefined : node.groupId,
    ...(node.referenceGroupIds?.includes(groupId) ? {
      referenceGroupIds: node.referenceGroupIds.filter((id) => id !== groupId),
      referenceNodeIds: [...new Set([...(node.referenceNodeIds ?? []), ...members.filter((member) => member.type === 'image').map((member) => member.id)])].filter((id) => id !== node.id),
    } : {}),
  })) }
}

export function combineReferenceNodes<T extends { materialId?: number | string; id: string }>(mentioned: T[], grouped: T[]): T[] {
  const seen = new Set<string>()
  // Pre-connected/grouped references keep their slots when mentioned in text.
  return [...grouped, ...mentioned].filter((node) => {
    const key = node.materialId === undefined ? `node:${node.id}` : `material:${node.materialId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function canReferenceImageGroup(document: CanvasFlow, groupId: string, targetId: string): boolean {
  const members = imageGroups(document.nodes).get(groupId) ?? []
  const target = document.nodes.find((node) => node.id === targetId)
  if (!members.length || !target || !['image', 'video'].includes(target.type)) return false
  const reachable = new Set([targetId])
  let changed = true
  while (changed) {
    changed = false
    for (const edge of document.edges) {
      if (reachable.has(edge.source) && !reachable.has(edge.target)) { reachable.add(edge.target); changed = true }
    }
  }
  return members.every((node) => !reachable.has(node.id))
}

export function removeGroupReferenceEdge(document: CanvasFlow, edgeId: string): CanvasFlow {
  const edge = document.edges.find((item) => item.id === edgeId)
  if (!edge) return document
  return { ...document, edges: document.edges.filter((item) => item.id !== edgeId), nodes: document.nodes.map((node) => {
    if (node.id !== edge.target) return node
    const source = document.nodes.find((item) => item.id === edge.source)
    const expanded = groupedReferences(node, document.nodes)
    const groupIds = source?.groupId && node.referenceGroupIds?.includes(source.groupId) ? node.referenceGroupIds.filter((id) => id !== source.groupId) : node.referenceGroupIds
    return { ...node, referenceGroupIds: groupIds, referenceNodeIds: [...new Set([...(node.referenceNodeIds ?? []), ...expanded.filter((item) => item.groupId === source?.groupId).map((item) => item.id)])].filter((id) => id !== edge.source) }
  }) }
}
