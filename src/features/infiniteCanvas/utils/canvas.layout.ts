// Ported from NiegeIP infinite-canvas; Tapdance service/data adapters.
import type { CanvasEdge, CanvasNode } from '../types.ts'

type Item = { id: string; width: number; height: number }
type Link = { source: string; target: string }
type Position = { x: number; y: number }

/** Collapse cycles before assigning longest-path generation levels. */
function generationLevels(items: Item[], links: Link[]): Map<string, number> {
  const outgoing = new Map(items.map((item) => [item.id, [] as string[]]))
  for (const link of links) outgoing.get(link.source)?.push(link.target)
  const indices = new Map<string, number>(), low = new Map<string, number>()
  const stack: string[] = [], active = new Set<string>(), components: string[][] = []
  const visit = (id: string) => {
    const index = indices.size
    indices.set(id, index); low.set(id, index); stack.push(id); active.add(id)
    for (const target of outgoing.get(id) ?? []) {
      if (!indices.has(target)) { visit(target); low.set(id, Math.min(low.get(id) ?? index, low.get(target) ?? index)) }
      else if (active.has(target)) low.set(id, Math.min(low.get(id) ?? index, indices.get(target) ?? index))
    }
    if (low.get(id) !== index) return
    const component: string[] = []
    let member: string | undefined
    do { member = stack.pop(); if (member !== undefined) { active.delete(member); component.push(member) } } while (member !== id && member !== undefined)
    components.push(component)
  }
  for (const item of items) if (!indices.has(item.id)) visit(item.id)
  const owner = new Map(components.flatMap((members, index) => members.map((id) => [id, index] as const)))
  const levels = new Map<number, number>()
  // Tarjan emits downstream components first, so reverse order is topological.
  for (let index = components.length - 1; index >= 0; index--) {
    const level = levels.get(index) ?? 0
    for (const id of components[index] ?? []) for (const target of outgoing.get(id) ?? []) {
      const next = owner.get(target)
      if (next !== undefined && next !== index) levels.set(next, Math.max(levels.get(next) ?? 0, level + 1))
    }
  }
  return new Map(items.map((item) => [item.id, levels.get(owner.get(item.id) ?? -1) ?? 0]))
}

/** Same-generation items stack vertically; downstream columns follow their sources. */
function layout(items: Item[], links: Link[], gapX: number, gapY: number): Map<string, Position> {
  const levels = generationLevels(items, links)
  const positions = new Map<string, Position>()
  const heights = new Map(items.map((item) => [item.id, item.height]))
  const columns = new Map<number, Item[]>()
  for (const item of items) {
    const level = levels.get(item.id) ?? 0
    const column = columns.get(level) ?? []
    column.push(item); columns.set(level, column)
  }
  let x = 0
  for (const [, column] of [...columns].sort(([a], [b]) => a - b)) {
    const desiredY = (item: Item) => {
      const centers = links.filter((link) => link.target === item.id).flatMap((link) => {
        const position = positions.get(link.source)
        return position ? [position.y + (heights.get(link.source) ?? 0) / 2] : []
      })
      return centers.length ? Math.max(0, centers.reduce((sum, center) => sum + center, 0) / centers.length - item.height / 2) : 0
    }
    const ordered = column.map((item) => ({ item, y: desiredY(item) })).sort((a, b) => a.y - b.y)
    let bottom = 0
    for (const { item, y } of ordered) {
      const top = Math.max(bottom, y)
      positions.set(item.id, { x, y: top }); bottom = top + item.height + gapY
    }
    x += Math.max(...column.map((item) => item.width)) + gapX
  }
  return positions
}

/** Lay out generation chains left to right, with source batches stacked vertically. */
export function arrangeCanvasNodes(nodes: CanvasNode[], edges: CanvasEdge[] = []): CanvasNode[] {
  const ids = new Set(nodes.map((node) => node.id))
  const links: Link[] = []
  const seen = new Map<string, Set<string>>()
  const addLink = (source: string, target: string) => {
    if (source === target || !ids.has(source) || !ids.has(target)) return
    const targets = seen.get(source) ?? new Set<string>()
    if (!targets.has(target)) { links.push({ source, target }); targets.add(target); seen.set(source, targets) }
  }
  edges.forEach((edge) => addLink(edge.source, edge.target))
  for (const node of nodes) {
    node.referenceNodeIds?.forEach((source) => addLink(source, node.id))
    for (const source of nodes) {
      if (source.groupId && node.referenceGroupIds?.includes(source.groupId)) addLink(source.id, node.id)
    }
  }
  // Keep group frames separate, but also reflow their members by generation.
  const remaining = new Set(nodes), blocks: CanvasNode[][] = []
  while (remaining.size) {
    const first = remaining.values().next().value
    if (!first) break
    remaining.delete(first)
    const block = [first]
    for (const member of block) for (const candidate of remaining) {
      if ((member.groupId && member.groupId === candidate.groupId)) {
        block.push(candidate); remaining.delete(candidate)
      }
    }
    blocks.push(block)
  }
  const owners = new Map<string, string>()
  const localPositions = new Map<string, Position>()
  const items = blocks.map((block, index) => {
    const id = String(index), memberIds = new Set(block.map((node) => node.id))
    const positions = layout(block, links.filter((link) => memberIds.has(link.source) && memberIds.has(link.target)), 120, 90)
    for (const node of block) { owners.set(node.id, id); localPositions.set(node.id, positions.get(node.id) ?? { x: 0, y: 0 }) }
    return { id, width: Math.max(...block.map((node) => (positions.get(node.id)?.x ?? 0) + node.width)), height: Math.max(...block.map((node) => (positions.get(node.id)?.y ?? 0) + node.height)) }
  })
  const blockLinks = links.flatMap((link) => {
    const source = owners.get(link.source), target = owners.get(link.target)
    return source !== undefined && target !== undefined && source !== target ? [{ source, target }] : []
  })
  // Internal workflow links also make a block connected, even without external edges.
  const connectedOwners = new Set(links.flatMap((link) => [owners.get(link.source), owners.get(link.target)]))
  const connected = items.filter((item) => connectedOwners.has(item.id))
  const isolated = items.filter((item) => !connectedOwners.has(item.id))
  const positions = layout(connected, blockLinks, 160, 140)
  const isolatedX = connected.length
    ? Math.max(...connected.map((item) => (positions.get(item.id)?.x ?? 0) + item.width)) + 160
    : 0
  let isolatedY = 0
  for (const item of isolated) {
    positions.set(item.id, { x: isolatedX, y: isolatedY })
    isolatedY += item.height + 140
  }
  return nodes.map((node) => {
    const block = positions.get(owners.get(node.id) ?? ''), local = localPositions.get(node.id)
    return { ...node, x: 80 + (block?.x ?? 0) + (local?.x ?? 0), y: 100 + (block?.y ?? 0) + (local?.y ?? 0) }
  })
}
