// Ported from NiegeIP infinite-canvas; Tapdance service/data adapters.
import type { CanvasRecycleBinEntry, CanvasFlow } from '../types.ts'

export function moveCanvasNodesToRecycleBin(
  document: CanvasFlow,
  nodeIds: readonly string[],
  entryId: string,
  deletedAt: string,
): CanvasFlow {
  const ids = new Set(nodeIds)
  const nodes = document.nodes.filter((node) => ids.has(node.id))
  if (!nodes.length) return document

  const edges = document.edges.filter((edge) => ids.has(edge.source) || ids.has(edge.target))
  const entry: CanvasRecycleBinEntry = { id: entryId, deletedAt, nodes, edges }
  return {
    ...document,
    nodes: document.nodes.filter((node) => !ids.has(node.id)),
    edges: document.edges.filter((edge) => !ids.has(edge.source) && !ids.has(edge.target)),
    recycleBin: [...(document.recycleBin ?? []), entry],
  }
}

export function restoreCanvasRecycleBinEntry(
  document: CanvasFlow,
  entryId: string,
): CanvasFlow {
  const entry = document.recycleBin?.find((item) => item.id === entryId)
  if (!entry) return document

  const activeIds = new Set(document.nodes.map((node) => node.id))
  if (entry.nodes.some((node) => activeIds.has(node.id))) return document
  const nodeIds = new Set([...activeIds, ...entry.nodes.map((node) => node.id)])
  const connections = new Set(document.edges.map((edge) => `${edge.source}\u0000${edge.target}`))
  const edges = entry.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)).filter((edge) => {
    const key = `${edge.source}\u0000${edge.target}`
    if (connections.has(key)) return false
    connections.add(key)
    return true
  })
  const pendingEdges = entry.edges.filter((edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target))
  const remainingEntries = document.recycleBin?.filter((item) => item.id !== entryId).map((item) => {
    const entryNodeIds = new Set(item.nodes.map((node) => node.id))
    const edgesForEntry = pendingEdges.filter((edge) => entryNodeIds.has(edge.source) || entryNodeIds.has(edge.target))
    if (!edgesForEntry.length) return item
    const knownEdges = new Set(item.edges.map((edge) => `${edge.source}\u0000${edge.target}`))
    return { ...item, edges: [...item.edges, ...edgesForEntry.filter((edge) => {
      const key = `${edge.source}\u0000${edge.target}`
      if (knownEdges.has(key)) return false
      knownEdges.add(key)
      return true
    })] }
  }) ?? []
  const edgeIds = new Set(document.edges.map((edge) => edge.id))
  const restoredEdges = edges.map((edge, index) => {
    let id = edge.id
    if (edgeIds.has(id)) {
      id = `${entry.id}-restored-${index + 1}`
      let suffix = 2
      while (edgeIds.has(id)) id = `${entry.id}-restored-${index + 1}-${suffix++}`
    }
    edgeIds.add(id)
    return { ...edge, id }
  })

  return {
    ...document,
    nodes: [...document.nodes, ...entry.nodes],
    edges: [...document.edges, ...restoredEdges],
    recycleBin: remainingEntries,
  }
}

export function permanentlyDeleteCanvasRecycleBinEntry(
  document: CanvasFlow,
  entryId: string,
): CanvasFlow {
  if (!document.recycleBin?.some((item) => item.id === entryId)) return document
  return { ...document, recycleBin: document.recycleBin.filter((item) => item.id !== entryId) }
}
