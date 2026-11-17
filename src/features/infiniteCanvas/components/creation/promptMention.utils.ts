// Ported from NiegeIP production studio; Tapdance adapters only.
import type { CreationMaterial } from './materials.ts'

export type PromptMentionMatch = { query: string; start: number; end: number }

const MATERIAL_KIND_LABELS = {
  image: '图片',
  video: '视频',
  audio: '音频',
} as const

export function materialMentionToken(material: CreationMaterial) {
  const kind = MATERIAL_KIND_LABELS[material.kind]
  return `@${kind}${String(material.id)}`
}

/**
 * Keep the persisted token id-based while presenting a compact, human-readable
 * label using the current composer's reference-strip order, across media kinds.
 */
export function materialMentionLabel(material: CreationMaterial, materials: readonly CreationMaterial[], numberedMaterialIds?: readonly string[]) {
  const order = numberedMaterialIds ?? materials.map((item) => String(item.id))
  const index = order.indexOf(String(material.id))
  return `@${MATERIAL_KIND_LABELS[material.kind]}${index >= 0 ? index + 1 : '（未引用）'}`
}

/** Convert persisted id-based tokens into compact labels for project/task text. */
export function humanizeMaterialMentions(value: string, references?: readonly { materialId: number | string; role: string }[]) {
  if (references !== undefined) {
    const labels = new Map<string, string>()
    references.forEach((reference, index) => {
      const kind = reference.role === 'reference_video' ? '视频' : reference.role === 'reference_audio' ? '音频' : '图片'
      const token = `@${kind}${reference.materialId}`
      if (!labels.has(token)) labels.set(token, `@${kind}${index + 1}`)
    })
    return value.replace(/@\s*(图片|视频|音频)([A-Za-z0-9_-]+)/gu, (token, kind: string, id: string) => labels.get(`@${kind}${id}`) ?? token)
  }
  const counters: Record<keyof typeof MATERIAL_KIND_LABELS, number> = { image: 0, video: 0, audio: 0 }
  const labels = new Map<string, string>()
  return value.replace(/@(图片|视频|音频)([A-Za-z0-9_-]+)/gu, (token, label: string) => {
    const kind = label === '图片' ? 'image' : label === '视频' ? 'video' : 'audio'
    const existing = labels.get(token)
    if (existing) return existing
    counters[kind] += 1
    const display = `@${label}${counters[kind]}`
    labels.set(token, display)
    return display
  })
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function getMentionedMaterialIds(value: string, materials: readonly CreationMaterial[]) {
  const tokens = new Map(materials.map((material) => [materialMentionToken(material), String(material.id)]))
  const tokenValues = [...tokens.keys()].sort((left, right) => right.length - left.length)
  if (tokenValues.length === 0) return []
  // Also accept the human-friendly form users may type or paste, e.g.
  // "@ 图片1". Matching still requires a known material token, so ordinary
  // @ text is never treated as a reference.
  const spacedTokenValues = tokenValues.map((token) => escapeRegExp(token).replace(/^@/u, '@\\s*'))
  const matcher = new RegExp(`(${spacedTokenValues.join('|')})(?![A-Za-z0-9_-])`, 'gu')
  const ids: string[] = []
  for (const match of value.matchAll(matcher)) {
    const id = tokens.get(match[0].replace(/^@\\s*/u, '@'))
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

function isMentionBoundary(character?: string) {
  return !character || /[\s([{"'，。；：、！？（）【】《》“”‘’]/u.test(character)
}

/** Finds only an unfinished @ query; completed material tokens also contain @. */
export function findPendingMentionMatch(value: string, caretOffset: number, materials: readonly CreationMaterial[]): PromptMentionMatch | null {
  const prefix = value.slice(0, caretOffset)
  const atIndex = prefix.lastIndexOf('@')
  if (atIndex < 0) return null
  const normalizedTail = prefix.slice(atIndex).replace(/^@[ \t]+/u, '@')
  const completedToken = materials.map(materialMentionToken).some((token) => normalizedTail.startsWith(token))
  if (completedToken) return null
  const query = prefix.slice(atIndex + 1).replace(/^[ \t]+/u, '')
  if (/[\s\n\r]/u.test(query) || !isMentionBoundary(prefix[atIndex - 1])) return null
  return { query, start: atIndex, end: caretOffset }
}

/** Match the mention menu to the visible reference order without changing token IDs. */
export function orderMentionMaterials(materials: readonly CreationMaterial[], numberedMaterialIds?: readonly string[]) {
  if (!numberedMaterialIds) return [...materials]
  const ranks = new Map<string, number>()
  numberedMaterialIds.forEach((id, index) => { if (!ranks.has(id)) ranks.set(id, index) })
  return [...materials].sort((left, right) =>
    (ranks.get(String(left.id)) ?? Number.MAX_SAFE_INTEGER) - (ranks.get(String(right.id)) ?? Number.MAX_SAFE_INTEGER))
}
