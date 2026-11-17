import type { CanvasNode } from '../types.ts';
import { materialMentionToken } from '../components/creation/promptMention.utils.ts';

/** Resolve NiegeIP's stable mention tokens into the per-kind reference labels used by Tapdance providers. */
export function resolveCanvasPromptMentions(value: string, references: readonly CanvasNode[]): string {
  const counts = { image: 0, video: 0, audio: 0 };
  const tokens = references.filter((node) => node.type !== 'text' && node.mediaUrl).map((node) => {
    const kind = node.type as keyof typeof counts;
    const index = ++counts[kind];
    const material = { id: node.id, kind, name: node.title };
    return { token: materialMentionToken(material), label: `${kind === 'image' ? '图片' : kind === 'video' ? '视频' : '音频'}${index}` };
  }).sort((a, b) => b.token.length - a.token.length);
  for (const { token, label } of tokens) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    value = value.replace(new RegExp(`${escaped}(?![A-Za-z0-9_-])`, 'gu'), label);
  }
  return value;
}

export function removeCanvasPromptMention(value: string, node: CanvasNode): string {
  if (node.type === 'text') return value;
  const token = materialMentionToken({ id: node.id, kind: node.type, name: node.title });
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return value.replace(new RegExp(`${escaped}(?![A-Za-z0-9_-])`, 'gu'), '').replace(/ {2,}/g, ' ').trim();
}

export function remapCanvasPromptMentions(value: string, nodes: readonly CanvasNode[], ids: ReadonlyMap<string, string>): string {
  for (const node of [...nodes].sort((a, b) => b.id.length - a.id.length)) {
    const id = ids.get(node.id);
    if (!id || node.type === 'text') continue;
    const token = materialMentionToken({ id: node.id, kind: node.type, name: node.title });
    const next = materialMentionToken({ id, kind: node.type, name: node.title });
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    value = value.replace(new RegExp(`${escaped}(?![A-Za-z0-9_-])`, 'gu'), next);
  }
  return value;
}
