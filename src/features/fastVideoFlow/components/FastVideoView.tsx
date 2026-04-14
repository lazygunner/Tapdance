import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type KeyboardEvent as ReactKeyboardEvent, type LucideIcon, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Clock3, Image as ImageIcon, Play, RefreshCw, Search, Video, Volume2, X } from 'lucide-react';
import { motion } from 'motion/react';

import type { FastSceneDraft, FastVideoInput, FastVideoPromptDraft, SeedanceHealth, SeedanceTask } from '../types/fastTypes.ts';
import type { SeedanceDraft, SeedanceModelVersion, SeedanceOverlayTemplateId } from '../../seedance/types.ts';
import { SEEDANCE_MODEL_VERSIONS } from '../../seedance/modelVersions.ts';
import { FAST_FLOW_TEMPLATE_IDS, SEEDANCE_TEMPLATE_REGISTRY } from '../../seedance/config/seedanceTemplateRegistry.ts';
import { ClickPopover } from '../../../components/studio/ClickPopover.tsx';
import { StudioSelect } from '../../../components/studio/StudioPrimitives.tsx';
import { getSeedanceCostEstimate } from '../utils/seedanceCostEstimate.ts';

type SeedanceDraftPatch = Partial<Omit<SeedanceDraft, 'options' | 'prompt'>> & {
  options?: Partial<SeedanceDraft['options']>;
  prompt?: Partial<SeedanceDraft['prompt']>;
};

const FAST_REFERENCE_TYPE_LABELS: Record<NonNullable<FastVideoInput['referenceImages'][number]['referenceType']>, string> = {
  person: '人物参考图',
  scene: '场景参考图',
  product: '产品参考图',
  style: '风格参考图',
  other: '其他参考图',
};

const FAST_REFERENCE_VIDEO_TYPE_LABELS: Record<NonNullable<FastVideoInput['referenceVideos'][number]['referenceType']>, string> = {
  motion: '动作参考视频',
  camera: '运镜参考视频',
  effect: '特效参考视频',
  edit: '视频编辑参考',
  extend: '视频延长参考',
  other: '其他参考视频',
};

const FAST_OVERLAY_OPTIONS: Array<{
  id: SeedanceOverlayTemplateId;
  label: string;
  icon: LucideIcon;
}> = [
    { id: 'auto_audio', label: '生成音频', icon: Volume2 },
    { id: 'return_last_frame', label: '返回尾帧', icon: ImageIcon },
    { id: 'web_search', label: '联网搜索', icon: Search },
  ];

function getFastReferenceTypeLabel(referenceType?: FastVideoInput['referenceImages'][number]['referenceType']) {
  return FAST_REFERENCE_TYPE_LABELS[referenceType || 'other'] || FAST_REFERENCE_TYPE_LABELS.other;
}

function getFastReferenceVideoTypeLabel(referenceType?: FastVideoInput['referenceVideos'][number]['referenceType']) {
  return FAST_REFERENCE_VIDEO_TYPE_LABELS[referenceType || 'other'] || FAST_REFERENCE_VIDEO_TYPE_LABELS.other;
}

function isSelectedForVideo(selectedForVideo?: boolean) {
  return selectedForVideo !== false;
}

function getPromptReferenceToken(index: number) {
  return `图片${index + 1}`;
}

function getVideoPromptReferenceToken(index: number) {
  return `视频${index + 1}`;
}

type PromptVideoReferenceItem = {
  token: string;
  videoUrl: string;
  title: string;
  subtitle: string;
};

type PromptReferenceItem = {
  token: string;
  imageUrl: string;
  title: string;
  subtitle: string;
};

type PromptEditorSelection = {
  start: number;
  end: number;
};

type PromptEditorMentionMatch = {
  query: string;
  start: number;
  end: number;
};

type PromptEditorMentionState = {
  query: string;
  activeIndex: number;
  position: {
    left: number;
    top: number;
  };
};

type PromptEditorSuggestionItem = {
  token: string;
  kind: 'image' | 'video';
  title: string;
  subtitle: string;
  imageUrl?: string;
  videoUrl?: string;
};

const PROMPT_REFERENCE_TOKEN_REGEX = /((?:图片|视频)\s*[0-9０-９]+)/gu;
const PROMPT_EDITOR_PLACEHOLDER = '输入最终提交给 Seedance 的中文视频提示词；输入 @ 可直接插入图片 / 视频素材标签。';

function splitPromptTextByReferenceToken(text: string) {
  const segments: Array<{ type: 'text' | 'token'; value: string }> = [];
  let lastIndex = 0;

  for (const match of text.matchAll(PROMPT_REFERENCE_TOKEN_REGEX)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, start) });
    }
    segments.push({ type: 'token', value: token });
    lastIndex = start + token.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  if (segments.length === 0) {
    segments.push({ type: 'text', value: '' });
  }

  return segments;
}

function normalizePromptSearchText(text: string) {
  return text
    .replace(/\s+/gu, '')
    .replace(/[０-９]/gu, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xFEE0))
    .toLowerCase();
}

function isPromptMentionBoundary(character?: string) {
  if (!character) {
    return true;
  }

  return /[\s([{'"，。；：、！？（）【】《》“”‘’]/u.test(character);
}

function findPromptMentionMatch(text: string, caretOffset: number): PromptEditorMentionMatch | null {
  const prefix = text.slice(0, caretOffset);
  const atIndex = prefix.lastIndexOf('@');
  if (atIndex < 0) {
    return null;
  }

  const query = prefix.slice(atIndex + 1);
  if (/[\s\n\r]/u.test(query)) {
    return null;
  }

  const precedingCharacter = prefix[atIndex - 1];
  if (!isPromptMentionBoundary(precedingCharacter)) {
    return null;
  }

  return {
    query,
    start: atIndex,
    end: caretOffset,
  };
}

function serializePromptEditorNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || '';
  }

  if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
    return '';
  }

  if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    return Array.from(node.childNodes).map((child) => serializePromptEditorNode(child)).join('');
  }

  const element = node as HTMLElement;
  const token = element.dataset.promptToken;
  if (token) {
    return token;
  }

  if (element.tagName === 'BR') {
    return '\n';
  }

  const children = Array.from(element.childNodes);
  return children.map((child, index) => {
    const serializedChild = serializePromptEditorNode(child);
    if (
      child instanceof HTMLElement
      && (child.tagName === 'DIV' || child.tagName === 'P')
      && index < children.length - 1
      && !serializedChild.endsWith('\n')
    ) {
      return `${serializedChild}\n`;
    }

    return serializedChild;
  }).join('');
}

function serializePromptEditorContent(root: HTMLElement) {
  return serializePromptEditorNode(root).replace(/\u00A0/gu, ' ');
}

function createPromptTokenChip(root: HTMLElement, item: PromptEditorSuggestionItem) {
  const documentRef = root.ownerDocument;
  const chip = documentRef.createElement('span');
  chip.className = `fast-prompt-chip ${item.kind === 'image' ? 'fast-prompt-image-tag' : 'fast-prompt-video-tag'}`;
  chip.contentEditable = 'false';
  chip.tabIndex = -1;
  chip.dataset.promptToken = item.token;
  chip.title = `${item.token} · ${item.title}`;

  if (item.kind === 'image' && item.imageUrl) {
    const preview = documentRef.createElement('img');
    preview.src = item.imageUrl;
    preview.alt = '';
    preview.setAttribute('aria-hidden', 'true');
    preview.className = 'h-[18px] w-[18px] shrink-0 rounded-[4px] object-cover ring-1 ring-white/10';
    chip.append(preview);
  }

  if (item.kind === 'video' && item.videoUrl) {
    const preview = documentRef.createElement('span');
    preview.className = 'relative h-[18px] w-[26px] shrink-0 overflow-hidden rounded-[4px]';

    const video = documentRef.createElement('video');
    video.src = item.videoUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('aria-hidden', 'true');
    video.className = 'h-full w-full object-cover';
    preview.append(video);
    chip.append(preview);
  }

  const label = documentRef.createElement('span');
  label.className = 'text-[12px] font-semibold leading-6';
  label.textContent = item.token;
  chip.append(label);

  return chip;
}

function renderPromptEditorContent(
  root: HTMLElement,
  text: string,
  referenceItems: PromptReferenceItem[],
  videoReferenceItems: PromptVideoReferenceItem[],
) {
  const fragment = root.ownerDocument.createDocumentFragment();

  splitPromptTextByReferenceToken(text).forEach((segment) => {
    if (segment.type === 'text') {
      if (segment.value) {
        fragment.append(root.ownerDocument.createTextNode(segment.value));
      }
      return;
    }

    const imageRef = getPromptReferenceByToken(referenceItems, segment.value);
    if (imageRef) {
      fragment.append(createPromptTokenChip(root, {
        token: imageRef.token,
        kind: 'image',
        title: imageRef.title,
        subtitle: imageRef.subtitle,
        imageUrl: imageRef.imageUrl,
      }));
      return;
    }

    const videoRef = getVideoPromptReferenceByToken(videoReferenceItems, segment.value);
    if (videoRef) {
      fragment.append(createPromptTokenChip(root, {
        token: videoRef.token,
        kind: 'video',
        title: videoRef.title,
        subtitle: videoRef.subtitle,
        videoUrl: videoRef.videoUrl,
      }));
      return;
    }

    fragment.append(root.ownerDocument.createTextNode(segment.value));
  });

  root.replaceChildren(fragment);
}

function getPromptEditorOffset(root: HTMLElement, container: Node, offset: number) {
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(root);
  range.setEnd(container, offset);
  return serializePromptEditorNode(range.cloneContents()).length;
}

function capturePromptEditorSelection(root: HTMLElement): PromptEditorSelection | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return null;
  }

  return {
    start: getPromptEditorOffset(root, range.startContainer, range.startOffset),
    end: getPromptEditorOffset(root, range.endContainer, range.endOffset),
  };
}

function getPromptEditorChildIndex(node: Node) {
  if (!node.parentNode) {
    return 0;
  }

  return Array.from(node.parentNode.childNodes).findIndex((child) => child === node);
}

function locatePromptEditorBoundary(root: HTMLElement, offset: number): { container: Node; offset: number } {
  const target = Math.max(0, offset);

  const search = (node: Node, remaining: number): { found: boolean; container: Node; offset: number; remaining: number } => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      const boundedOffset = Math.min(remaining, text.length);
      if (remaining <= text.length) {
        return { found: true, container: node, offset: boundedOffset, remaining: 0 };
      }
      return { found: false, container: node, offset: text.length, remaining: remaining - text.length };
    }

    if (!(node instanceof HTMLElement)) {
      return { found: false, container: root, offset: root.childNodes.length, remaining };
    }

    const token = node.dataset.promptToken;
    if (token) {
      const parent = node.parentNode || root;
      const index = getPromptEditorChildIndex(node);
      if (remaining <= 0) {
        return { found: true, container: parent, offset: index, remaining: 0 };
      }
      if (remaining <= token.length) {
        return { found: true, container: parent, offset: index + 1, remaining: 0 };
      }
      return { found: false, container: parent, offset: index + 1, remaining: remaining - token.length };
    }

    if (node.tagName === 'BR') {
      const parent = node.parentNode || root;
      const index = getPromptEditorChildIndex(node);
      if (remaining <= 1) {
        return { found: true, container: parent, offset: index + 1, remaining: 0 };
      }
      return { found: false, container: parent, offset: index + 1, remaining: remaining - 1 };
    }

    let nextRemaining = remaining;
    const children = Array.from(node.childNodes);
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      const result = search(child, nextRemaining);
      if (result.found) {
        return result;
      }
      nextRemaining = result.remaining;
    }

    return {
      found: false,
      container: node,
      offset: node.childNodes.length,
      remaining: nextRemaining,
    };
  };

  const result = search(root, target);
  if (result.found) {
    return { container: result.container, offset: result.offset };
  }

  return {
    container: root,
    offset: root.childNodes.length,
  };
}

function restorePromptEditorSelection(root: HTMLElement, selection: PromptEditorSelection) {
  const browserSelection = window.getSelection();
  if (!browserSelection) {
    return;
  }

  const startBoundary = locatePromptEditorBoundary(root, selection.start);
  const endBoundary = locatePromptEditorBoundary(root, selection.end);
  const range = root.ownerDocument.createRange();
  range.setStart(startBoundary.container, startBoundary.offset);
  range.setEnd(endBoundary.container, endBoundary.offset);
  browserSelection.removeAllRanges();
  browserSelection.addRange(range);
}

function insertTextAtPromptSelection(root: HTMLElement, text: string) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return;
  }

  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return;
  }

  range.deleteContents();
  const textNode = root.ownerDocument.createTextNode(text);
  range.insertNode(textNode);
  range.setStart(textNode, textNode.textContent?.length || 0);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function getPromptEditorCaretRect(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return root.getBoundingClientRect();
  }

  const range = selection.getRangeAt(0).cloneRange();
  range.collapse(true);
  const rect = range.getBoundingClientRect();
  if (rect.width || rect.height) {
    return rect;
  }

  const firstRect = range.getClientRects()[0];
  return firstRect || root.getBoundingClientRect();
}

function getAdjacentPromptTokenRange(
  text: string,
  offset: number,
  direction: 'backward' | 'forward',
  referenceItems: PromptReferenceItem[],
  videoReferenceItems: PromptVideoReferenceItem[],
) {
  for (const match of text.matchAll(PROMPT_REFERENCE_TOKEN_REGEX)) {
    const token = match[0];
    const start = match.index ?? 0;
    const end = start + token.length;
    const hasRenderableToken = Boolean(
      getPromptReferenceByToken(referenceItems, token)
      || getVideoPromptReferenceByToken(videoReferenceItems, token),
    );

    if (!hasRenderableToken) {
      continue;
    }

    if (direction === 'backward' && end === offset) {
      return { start, end };
    }

    if (direction === 'forward' && start === offset) {
      return { start, end };
    }
  }

  return null;
}

function normalizePromptReferenceToken(token: string) {
  const normalized = token
    .replace(/\s+/gu, '')
    .replace(/[０-９]/gu, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xFEE0));
  const match = /^图片(\d+)$/u.exec(normalized);
  if (!match) {
    return null;
  }

  return `图片${match[1]}`;
}

function normalizeVideoPromptReferenceToken(token: string) {
  const normalized = token
    .replace(/\s+/gu, '')
    .replace(/[０-９]/gu, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xFEE0));
  const match = /^视频(\d+)$/u.exec(normalized);
  if (!match) {
    return null;
  }

  return `视频${match[1]}`;
}

function getPromptReferenceByToken(
  referenceItems: PromptReferenceItem[],
  token: string,
) {
  const normalizedToken = normalizePromptReferenceToken(token);
  if (!normalizedToken) {
    return null;
  }

  return referenceItems.find((item) => item.token === normalizedToken) || null;
}

function getVideoPromptReferenceByToken(
  videoReferenceItems: PromptVideoReferenceItem[],
  token: string,
) {
  const normalizedToken = normalizeVideoPromptReferenceToken(token);
  if (!normalizedToken) {
    return null;
  }

  return videoReferenceItems.find((item) => item.token === normalizedToken) || null;
}

function PromptTokenEditor({
  value,
  referenceItems,
  videoReferenceItems,
  themeMode = 'dark',
  onChange,
}: {
  value: string;
  referenceItems: PromptReferenceItem[];
  videoReferenceItems: PromptVideoReferenceItem[];
  themeMode?: 'light' | 'dark';
  onChange: (value: string) => void;
}) {
  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const selectionRef = useRef<PromptEditorSelection | null>(null);
  const isComposingRef = useRef(false);
  const [mentionState, setMentionState] = useState<PromptEditorMentionState | null>(null);

  const suggestionItems: PromptEditorSuggestionItem[] = [
    ...referenceItems.map((item) => ({
      token: item.token,
      kind: 'image' as const,
      title: item.title,
      subtitle: item.subtitle,
      imageUrl: item.imageUrl,
    })),
    ...videoReferenceItems.map((item) => ({
      token: item.token,
      kind: 'video' as const,
      title: item.title,
      subtitle: item.subtitle,
      videoUrl: item.videoUrl,
    })),
  ];

  const filteredSuggestionItems = mentionState
    ? suggestionItems.filter((item) => {
      const normalizedQuery = normalizePromptSearchText(mentionState.query);
      if (!normalizedQuery) {
        return true;
      }

      const haystack = normalizePromptSearchText(`${item.token} ${item.title} ${item.subtitle}`);
      return haystack.includes(normalizedQuery);
    })
    : [];
  const insertPromptTagButtonClass = themeMode === 'light'
    ? 'inline-flex items-center gap-1.5 rounded-full border border-stone-300 px-2.5 py-1 text-[11px] text-stone-700 transition-colors hover:border-stone-400 hover:bg-stone-100'
    : 'inline-flex items-center gap-1.5 rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-900 hover:text-white';

  const syncMentionState = () => {
    if (!editorRef.current || !editorShellRef.current) {
      setMentionState(null);
      return;
    }

    const selection = capturePromptEditorSelection(editorRef.current);
    selectionRef.current = selection;
    if (!selection || selection.start !== selection.end) {
      setMentionState(null);
      return;
    }

    const editorText = serializePromptEditorContent(editorRef.current);
    const mentionMatch = findPromptMentionMatch(editorText, selection.start);
    if (!mentionMatch) {
      setMentionState(null);
      return;
    }

    const caretRect = getPromptEditorCaretRect(editorRef.current);
    const shellRect = editorShellRef.current.getBoundingClientRect();
    const maxLeft = Math.max(12, shellRect.width - 292);
    const nextLeft = Math.min(Math.max(12, caretRect.left - shellRect.left), maxLeft);

    setMentionState((previous) => ({
      query: mentionMatch.query,
      activeIndex: previous?.query === mentionMatch.query ? previous.activeIndex : 0,
      position: {
        left: nextLeft,
        top: Math.max(8, caretRect.bottom - shellRect.top + 8),
      },
    }));
  };

  const commitEditorValue = (nextValue: string, nextSelection?: PromptEditorSelection | null) => {
    selectionRef.current = nextSelection ?? null;
    onChange(nextValue);
  };

  const commitFromEditorDom = () => {
    if (!editorRef.current) {
      return;
    }

    const nextValue = serializePromptEditorContent(editorRef.current);
    const nextSelection = capturePromptEditorSelection(editorRef.current);
    if (nextValue !== value) {
      commitEditorValue(nextValue, nextSelection);
    } else {
      selectionRef.current = nextSelection;
    }
    syncMentionState();
  };

  const openMentionPicker = () => {
    if (!editorRef.current) {
      return;
    }

    editorRef.current.focus();
    const currentText = serializePromptEditorContent(editorRef.current);
    const currentSelection = capturePromptEditorSelection(editorRef.current) || {
      start: currentText.length,
      end: currentText.length,
    };
    restorePromptEditorSelection(editorRef.current, currentSelection);

    const needsLeadingSpace = currentSelection.start > 0 && !/\s/u.test(currentText[currentSelection.start - 1] || '');
    insertTextAtPromptSelection(editorRef.current, needsLeadingSpace ? ' @' : '@');
    commitFromEditorDom();
  };

  const insertSuggestionToken = (item: PromptEditorSuggestionItem) => {
    if (!editorRef.current) {
      return;
    }

    const editorText = serializePromptEditorContent(editorRef.current);
    const currentSelection = capturePromptEditorSelection(editorRef.current);
    if (!currentSelection) {
      return;
    }

    const mentionMatch = findPromptMentionMatch(editorText, currentSelection.start);
    if (!mentionMatch) {
      return;
    }

    const nextValue = `${editorText.slice(0, mentionMatch.start)}${item.token}${editorText.slice(currentSelection.end)}`;
    const caretOffset = mentionMatch.start + item.token.length;
    setMentionState(null);
    commitEditorValue(nextValue, { start: caretOffset, end: caretOffset });
  };

  useLayoutEffect(() => {
    if (!editorRef.current || isComposingRef.current) {
      return;
    }

    const activeElement = document.activeElement;
    const editor = editorRef.current;
    const isFocused = activeElement === editor;
    const selection = isFocused ? (selectionRef.current || capturePromptEditorSelection(editor)) : null;

    renderPromptEditorContent(editor, value, referenceItems, videoReferenceItems);

    if (selection && document.activeElement === editor) {
      restorePromptEditorSelection(editor, selection);
    }
  }, [value, referenceItems, videoReferenceItems]);

  useEffect(() => {
    if (!mentionState) {
      return;
    }

    if (filteredSuggestionItems.length === 0 && mentionState.activeIndex !== 0) {
      setMentionState((previous) => previous ? { ...previous, activeIndex: 0 } : previous);
      return;
    }

    if (filteredSuggestionItems.length > 0 && mentionState.activeIndex >= filteredSuggestionItems.length) {
      setMentionState((previous) => previous ? { ...previous, activeIndex: filteredSuggestionItems.length - 1 } : previous);
    }
  }, [filteredSuggestionItems.length, mentionState]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (mentionState) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (filteredSuggestionItems.length > 0) {
          setMentionState((previous) => previous ? {
            ...previous,
            activeIndex: (previous.activeIndex + 1) % filteredSuggestionItems.length,
          } : previous);
        }
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (filteredSuggestionItems.length > 0) {
          setMentionState((previous) => previous ? {
            ...previous,
            activeIndex: (previous.activeIndex - 1 + filteredSuggestionItems.length) % filteredSuggestionItems.length,
          } : previous);
        }
        return;
      }

      if (event.key === 'Enter' || event.key === 'Tab') {
        if (filteredSuggestionItems.length > 0) {
          event.preventDefault();
          insertSuggestionToken(filteredSuggestionItems[mentionState.activeIndex] || filteredSuggestionItems[0]);
          return;
        }
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setMentionState(null);
        return;
      }
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (!editorRef.current) {
        return;
      }
      insertTextAtPromptSelection(editorRef.current, '\n');
      commitFromEditorDom();
      return;
    }

    if ((event.key === 'Backspace' || event.key === 'Delete') && editorRef.current) {
      const selection = capturePromptEditorSelection(editorRef.current);
      if (!selection || selection.start !== selection.end) {
        return;
      }

      const editorText = serializePromptEditorContent(editorRef.current);
      const tokenRange = getAdjacentPromptTokenRange(
        editorText,
        selection.start,
        event.key === 'Backspace' ? 'backward' : 'forward',
        referenceItems,
        videoReferenceItems,
      );

      if (!tokenRange) {
        return;
      }

      event.preventDefault();
      const nextValue = `${editorText.slice(0, tokenRange.start)}${editorText.slice(tokenRange.end)}`;
      commitEditorValue(nextValue, { start: tokenRange.start, end: tokenRange.start });
      setMentionState(null);
    }
  };

  const handlePaste = (event: ReactClipboardEvent<HTMLDivElement>) => {
    if (!editorRef.current) {
      return;
    }

    event.preventDefault();
    const text = event.clipboardData.getData('text/plain').replace(/\r\n?/gu, '\n');
    insertTextAtPromptSelection(editorRef.current, text);
    commitFromEditorDom();
  };

  return (
    <div ref={editorShellRef} className="relative mt-3 flex-1">
      <div className="mb-2 flex items-center justify-between gap-3 text-[11px] text-zinc-500">
        <span>
          输入 <span className="text-rose-300">@</span> 选择素材；
        </span>
        <button
          type="button"
          onClick={openMentionPicker}
          className={insertPromptTagButtonClass}
        >
          <ImageIcon className="h-3.5 w-3.5" />
          插入素材标签
        </button>
      </div>
      <div className="fast-prompt-editor-shell rounded-xl border border-zinc-800 bg-zinc-950 focus-within:border-rose-500">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          spellCheck={false}
          data-placeholder={PROMPT_EDITOR_PLACEHOLDER}
          className="fast-prompt-rich-editor"
          onInput={() => {
            if (isComposingRef.current) {
              return;
            }
            commitFromEditorDom();
          }}
          onFocus={() => {
            if (!editorRef.current) {
              return;
            }

            if (editorRef.current.childNodes.length === 0 && value) {
              renderPromptEditorContent(editorRef.current, value, referenceItems, videoReferenceItems);
            }

            selectionRef.current = capturePromptEditorSelection(editorRef.current);
            syncMentionState();
          }}
          onBlur={() => {
            selectionRef.current = editorRef.current ? capturePromptEditorSelection(editorRef.current) : null;
            setMentionState(null);
          }}
          onMouseUp={() => syncMentionState()}
          onKeyUp={() => syncMentionState()}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onCompositionStart={() => {
            isComposingRef.current = true;
            setMentionState(null);
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
            commitFromEditorDom();
          }}
        />
      </div>
      {mentionState ? (
        <div
          className="fast-prompt-mention-panel"
          style={{
            left: mentionState.position.left,
            top: mentionState.position.top,
          }}
        >
          {filteredSuggestionItems.length > 0 ? filteredSuggestionItems.map((item, index) => {
            const isActive = index === mentionState.activeIndex;
            return (
              <button
                key={item.token}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  insertSuggestionToken(item);
                }}
                className={`fast-prompt-mention-item ${isActive ? 'fast-prompt-mention-item-active' : ''}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {item.kind === 'image' ? (
                    <img src={item.imageUrl} alt="" aria-hidden="true" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="relative h-9 w-12 shrink-0 overflow-hidden rounded-lg bg-zinc-900">
                      <video
                        src={item.videoUrl}
                        muted
                        playsInline
                        preload="metadata"
                        aria-hidden="true"
                        className="h-full w-full object-cover"
                      />
                    </span>
                  )}
                  <span className="min-w-0 text-left">
                    <span className="block truncate text-sm text-white">{item.title}</span>
                    <span className="block truncate text-[11px] text-zinc-500">{item.subtitle}</span>
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${item.kind === 'image' ? 'bg-sky-500/12 text-sky-200' : 'bg-violet-500/12 text-violet-200'}`}>
                  {item.token}
                </span>
              </button>
            );
          }) : (
            <div className="px-3 py-2 text-sm text-zinc-500">
              没有匹配的素材标签
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

const SEEDANCE_RATIO_OPTIONS: Array<{ value: SeedanceDraft['options']['ratio']; label: string }> = [
  { value: 'adaptive', label: '自动 adaptive' },
  { value: '16:9', label: '横屏 16:9' },
  { value: '9:16', label: '竖屏 9:16' },
  { value: '1:1', label: '正方形 1:1' },
  { value: '4:3', label: '经典 4:3' },
  { value: '3:4', label: '竖构图 3:4' },
  { value: '21:9', label: '电影宽幅 21:9' },
];

function formatTokenCount(tokenCount: number) {
  if (tokenCount >= 1_000_000) {
    return `${(tokenCount / 1_000_000).toFixed(2).replace(/\.00$/u, '')}M`;
  }
  if (tokenCount >= 1_000) {
    return `${(tokenCount / 1_000).toFixed(1).replace(/\.0$/u, '')}K`;
  }
  return `${Math.round(tokenCount)}`;
}

function formatCny(amount: number) {
  if (amount >= 1) {
    return `¥${amount.toFixed(2).replace(/\.00$/u, '').replace(/(\.\d*?[1-9])0+$/u, '$1')}`;
  }
  return `¥${amount.toFixed(4).replace(/\.?0+$/u, '')}`;
}

function parseTimestampMs(value?: string) {
  const normalized = (value || '').trim();
  if (!normalized) {
    return undefined;
  }

  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function formatElapsedTime(elapsedMs: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}小时 ${minutes}分 ${seconds}秒`;
  }
  if (minutes > 0) {
    return `${minutes}分 ${seconds}秒`;
  }
  return `${seconds}秒`;
}

type Props = {
  input: FastVideoInput;
  scenes: FastSceneDraft[];
  videoPrompt: FastVideoPromptDraft | null;
  seedanceDraft: SeedanceDraft;
  draftIssues: string[];
  task: SeedanceTask;
  executionConfig: {
    executor: 'ark' | 'cli';
    apiModelKey: 'standard' | 'fast';
    cliModelVersion: SeedanceModelVersion;
    pollIntervalSec: number;
    videoResolution: '480p' | '720p';
  };
  health: SeedanceHealth | null;
  isSubmitting: boolean;
  isRefreshingStatus: boolean;
  isCancellingTask: boolean;
  canCancelTask: boolean;
  isRegeneratingPrompt: boolean;
  onUpdatePrompt: (patch: Partial<FastVideoPromptDraft>) => void;
  onUpdateDraft: (patch: SeedanceDraftPatch) => void;
  onUpdateExecutionConfig: (patch: Partial<Props['executionConfig']>) => void;
  onRegeneratePrompt: () => void;
  onSubmit: () => void;
  onRefreshStatus: () => void;
  onCancelTask: () => void;
  onPreviewImage: (url: string) => void;
  onToggleReferenceSelection: (referenceId: string) => void;
  onToggleReferenceVideoSelection: (referenceId: string) => void;
  onToggleSceneSelection: (sceneId: string) => void;
  themeMode?: 'light' | 'dark';
  healthPanel?: ReactNode;
  hideHeader?: boolean;
};

type MetricCardTone = 'neutral' | 'rose' | 'amber' | 'sky' | 'emerald';

const METRIC_CARD_TONE_CLASS_NAMES: Record<MetricCardTone, string> = {
  neutral: 'border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
  rose: 'border-rose-400/20 bg-[linear-gradient(135deg,rgba(244,63,94,0.14),rgba(255,255,255,0.02))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
  amber: 'border-amber-400/20 bg-[linear-gradient(135deg,rgba(251,191,36,0.14),rgba(255,255,255,0.02))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
  sky: 'border-sky-400/20 bg-[linear-gradient(135deg,rgba(56,189,248,0.14),rgba(255,255,255,0.02))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
  emerald: 'border-emerald-400/20 bg-[linear-gradient(135deg,rgba(52,211,153,0.14),rgba(255,255,255,0.02))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
};

const METRIC_CARD_LABEL_CLASS_NAMES: Record<MetricCardTone, string> = {
  neutral: 'border-zinc-700/70 bg-zinc-950/72 text-zinc-200',
  rose: 'border-rose-500/20 bg-zinc-950/72 text-rose-200',
  amber: 'border-amber-500/20 bg-zinc-950/72 text-amber-200',
  sky: 'border-sky-500/20 bg-zinc-950/72 text-sky-200',
  emerald: 'border-emerald-500/20 bg-zinc-950/72 text-emerald-200',
};

function getTaskTone(remoteStatus?: string, hasSubmission = false) {
  const normalized = normalizeStatusKey(remoteStatus);

  if (!hasSubmission) {
    return {
      shellClass: 'border-zinc-800 bg-zinc-950/60',
      accentClass: 'text-zinc-300',
      badgeClass: 'border-zinc-700 bg-zinc-900 text-zinc-300',
    };
  }

  if (normalized === 'success') {
    return {
      shellClass: 'border-emerald-500/20 bg-zinc-950/80',
      accentClass: 'text-emerald-300',
      badgeClass: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200',
    };
  }
  if (normalized === 'fail' || normalized === 'failed') {
    return {
      shellClass: 'border-red-500/20 bg-zinc-950/80',
      accentClass: 'text-red-300',
      badgeClass: 'border-red-500/20 bg-red-500/10 text-red-200',
    };
  }
  if (normalized === 'cancelled' || normalized === 'canceled') {
    return {
      shellClass: 'border-zinc-700 bg-zinc-950/70',
      accentClass: 'text-zinc-200',
      badgeClass: 'border-zinc-600 bg-zinc-900 text-zinc-200',
    };
  }
  if (normalized === 'querying') {
    return {
      shellClass: 'border-amber-500/20 bg-zinc-950/80',
      accentClass: 'text-amber-200',
      badgeClass: 'border-amber-500/20 bg-amber-500/10 text-amber-100',
    };
  }
  return {
    shellClass: 'border-zinc-800 bg-zinc-950/60',
    accentClass: 'text-zinc-300',
    badgeClass: 'border-zinc-700 bg-zinc-900 text-zinc-300',
  };
}

function normalizeStatusKey(value?: string | null) {
  return (value || '').trim().toLowerCase();
}

function getTaskStatusLabel(remoteStatus?: string, hasSubmission = false) {
  if (!hasSubmission) {
    return '未提交';
  }

  return formatGenStatus(remoteStatus).label;
}

function formatGenStatus(value?: string) {
  const normalized = normalizeStatusKey(value);
  if (!normalized) {
    return { label: '未返回', raw: '' };
  }
  if (normalized === 'querying') {
    return { label: '处理中', raw: value || '' };
  }
  if (normalized === 'success') {
    return { label: '已完成', raw: value || '' };
  }
  if (normalized === 'fail' || normalized === 'failed') {
    return { label: '失败', raw: value || '' };
  }
  if (normalized === 'cancelled' || normalized === 'canceled') {
    return { label: '已取消', raw: value || '' };
  }
  return { label: value || '未返回', raw: value || '' };
}

function formatQueueStatus(value?: string) {
  const normalized = normalizeStatusKey(value);
  if (!normalized) {
    return { label: '未返回', raw: '' };
  }
  if (normalized === 'queueing' || normalized === 'queued') {
    return { label: '排队中', raw: value || '' };
  }
  if (normalized === 'generating') {
    return { label: '生成中', raw: value || '' };
  }
  if (normalized === 'success' || normalized === 'completed') {
    return { label: '已完成', raw: value || '' };
  }
  if (normalized === 'fail' || normalized === 'failed') {
    return { label: '失败', raw: value || '' };
  }
  if (normalized === 'cancelled' || normalized === 'canceled') {
    return { label: '已取消', raw: value || '' };
  }
  return { label: value || '未返回', raw: value || '' };
}

function formatTaskTimestamp(value?: string, emptyLabel = '尚未检查') {
  const normalized = (value || '').trim();
  if (!normalized) {
    return emptyLabel;
  }

  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) {
    return normalized;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}

function SeedanceTaskLoadingDisplay({ task }: { task: SeedanceTask }) {
  const queue = formatQueueStatus(task.queueStatus);
  const label = task.status === 'submitting'
    ? '正在提交即梦 Seedance 任务'
    : queue.label === '排队中'
      ? '正在等待即梦开始生成'
      : '正在同步即梦生成进度';
  const description = task.status === 'submitting'
    ? '系统正在整理分镜图、写入本地临时文件，并调用 dreamina multimodal2video 发起任务。'
    : queue.label === '排队中'
      ? '任务已提交，当前处于队列等待阶段。页面会自动刷新状态，开始生成后会继续同步并在完成后下载视频。'
      : '任务已进入处理阶段，系统会持续同步云端状态，并在成功后自动下载视频文件。';

  return (
    <div className="mt-3 rounded-2xl border border-amber-500/20 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.16),rgba(24,24,27,0.94)_58%)] px-4 py-4 overflow-hidden">
      <div className="flex items-center gap-4">
        <div className="relative w-16 h-16 shrink-0">
          <motion.div
            className="absolute inset-1.5 rounded-full border border-amber-300/30"
            animate={{ scale: [0.92, 1.08, 0.92], opacity: [0.28, 0.65, 0.28] }}
            transition={{ duration: 2.2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute inset-0 rounded-full border border-amber-400/15"
            animate={{ scale: [1, 1.16, 1], opacity: [0.18, 0.42, 0.18] }}
            transition={{ duration: 2.8, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut', delay: 0.2 }}
          />
          <motion.div
            className="absolute inset-0"
            animate={{ rotate: 360 }}
            transition={{ duration: 6, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
          >
            <div className="absolute left-1/2 top-0 -translate-x-1/2 w-2 h-2 rounded-full bg-amber-300 shadow-[0_0_14px_rgba(252,211,77,0.75)]" />
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-orange-300 shadow-[0_0_12px_rgba(253,186,116,0.7)]" />
            <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-yellow-200 shadow-[0_0_10px_rgba(254,240,138,0.7)]" />
          </motion.div>
          <div className="absolute inset-[0.95rem] rounded-full bg-zinc-950/90 border border-amber-500/20 flex items-center justify-center">
            <motion.div
              className="w-5 h-5 rounded-full bg-gradient-to-br from-amber-200 via-amber-400 to-orange-400"
              animate={{ scale: [0.9, 1.06, 0.9], opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 1.4, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
            />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-amber-100">{label}</div>
          <div className="mt-1 text-[11px] text-amber-50/70 leading-5">
            {description}
          </div>

          <div className="mt-3 space-y-1.5">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-1 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-amber-300/0 via-amber-300 to-orange-300/0"
                  initial={{ x: '-110%' }}
                  animate={{ x: ['-110%', '120%'] }}
                  transition={{
                    duration: 1.7,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: 'easeInOut',
                    delay: index * 0.18,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SeedanceVideoPendingPreview({
  task,
  isTaskActive,
}: {
  task: SeedanceTask;
  isTaskActive: boolean;
}) {
  const queueStatus = formatQueueStatus(task.queueStatus);
  const remoteStatus = formatGenStatus(task.remoteStatus);
  const statusCopy = task.status === 'submitting'
    ? {
      chip: '任务提交中',
      title: '正在写入最终视频任务',
      description: '素材、提示词与参数已经锁定，系统正在创建本次最终视频任务。',
    }
    : queueStatus.label === '排队中'
      ? {
        chip: '处理中',
        title: '排队中',
        description: '',
      }
      : queueStatus.label === '生成中' || isTaskActive
        ? {
          chip: '生成中',
          title: '正在生成视频',
          description: '',
        }
        : {
          chip: '同步中',
          title: '正在同步最终视频结果',
          description: `云端当前为 ${remoteStatus.label}，系统正在更新最终视频文件。`,
        };

  return (
    <div className="studio-final-video-pending relative aspect-video overflow-hidden">
      <div aria-hidden="true" className="studio-final-video-pending__base absolute inset-0" />
      <motion.div
        aria-hidden="true"
        className="studio-final-video-pending__orb studio-final-video-pending__orb--shadow absolute -left-[20%] top-[-14%] h-[132%] w-[44%]"
        style={{
          borderRadius: '46% 54% 58% 42% / 44% 38% 62% 56%',
          willChange: 'transform, opacity',
        }}
        animate={{
          x: [0, 104, -92, 44, 0],
          y: [0, 52, -86, 34, 0],
          scale: [1, 1.18, 0.84, 1.08, 1],
          rotate: [0, -13, 9, -5, 0],
          opacity: [0.9, 1, 0.82, 0.96, 0.9],
        }}
        transition={{ duration: 7.8, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden="true"
        className="studio-final-video-pending__orb studio-final-video-pending__orb--sky absolute right-[-14%] top-[-22%] h-[94%] w-[74%]"
        style={{
          borderRadius: '58% 42% 48% 52% / 49% 53% 47% 51%',
          willChange: 'transform, opacity',
        }}
        animate={{
          x: [0, -132, 108, -48, 0],
          y: [0, 86, -62, 38, 0],
          scale: [1, 1.2, 0.88, 1.1, 1],
          rotate: [0, 11, -9, 5, 0],
          opacity: [0.66, 0.98, 0.68, 0.9, 0.66],
        }}
        transition={{ duration: 8.4, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden="true"
        className="studio-final-video-pending__orb studio-final-video-pending__orb--cyan absolute left-[22%] top-[48%] h-[60%] w-[60%]"
        style={{
          borderRadius: '49% 51% 43% 57% / 58% 38% 62% 42%',
          willChange: 'transform, opacity',
        }}
        animate={{
          x: [0, 148, -116, 54, 0],
          y: [0, -96, 64, -28, 0],
          scale: [0.94, 1.24, 0.84, 1.08, 0.94],
          rotate: [0, -10, 7, -4, 0],
          opacity: [0.54, 0.94, 0.58, 0.84, 0.54],
        }}
        transition={{ duration: 6.9, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden="true"
        className="studio-final-video-pending__orb studio-final-video-pending__orb--warm absolute left-[36%] top-[-18%] h-[74%] w-[28%]"
        style={{
          borderRadius: '42% 58% 44% 56% / 55% 38% 62% 45%',
          willChange: 'transform, opacity',
        }}
        animate={{
          x: [0, -88, 72, -34, 0],
          y: [0, 112, -78, 22, 0],
          scale: [0.9, 1.18, 0.9, 1.04, 0.9],
          rotate: [0, 8, -6, 3, 0],
          opacity: [0.32, 0.78, 0.38, 0.62, 0.32],
        }}
        transition={{ duration: 6.2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden="true"
        className="studio-final-video-pending__sweep absolute inset-y-[-14%] left-[-34%] w-[48%]"
        style={{ willChange: 'transform, opacity' }}
        animate={{ x: [-240, 1280], opacity: [0, 0.95, 0] }}
        transition={{ duration: 4.2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
      />
      <div aria-hidden="true" className="studio-final-video-pending__veil absolute inset-0" />

      <div className="studio-final-video-pending__chip absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium backdrop-blur-md">
        <span>{statusCopy.chip}</span>
        <motion.span
          className="studio-final-video-pending__chip-arrow tracking-[0.24em]"
          animate={{ x: [0, 5, 0], opacity: [0.42, 1, 0.42] }}
          transition={{ duration: 1.05, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
        >
          &gt;&gt;&gt;
        </motion.span>
      </div>

      <div className="studio-final-video-pending__copy absolute inset-x-0 bottom-0 z-10 px-5 pb-5 pt-12">
        <div className="max-w-sm">
          <div className="studio-final-video-pending__title text-sm font-medium">{statusCopy.title}</div>
          <div className="studio-final-video-pending__description mt-1 text-[11px] leading-5">{statusCopy.description}</div>
        </div>
      </div>
    </div>
  );
}

export function FastVideoView({
  input,
  scenes,
  videoPrompt,
  seedanceDraft,
  draftIssues,
  task,
  executionConfig,
  health,
  isSubmitting,
  isRefreshingStatus,
  isCancellingTask,
  canCancelTask,
  isRegeneratingPrompt,
  onUpdatePrompt,
  onUpdateDraft,
  onUpdateExecutionConfig,
  onRegeneratePrompt,
  onSubmit,
  onRefreshStatus,
  onCancelTask,
  onPreviewImage,
  onToggleReferenceSelection,
  onToggleReferenceVideoSelection,
  onToggleSceneSelection,
  themeMode = 'dark',
  healthPanel,
  hideHeader = false,
}: Props) {
  const readyReferenceImages = input.referenceImages.filter((reference) => reference.imageUrl.trim());
  const readyStoryboardScenes = scenes.filter((scene) => scene.imageUrl);
  const selectedReferenceImages = readyReferenceImages.filter((reference) => isSelectedForVideo(reference.selectedForVideo));
  const selectedStoryboardScenes = readyStoryboardScenes.filter((scene) => isSelectedForVideo(scene.selectedForVideo));
  const readyReferenceVideos = (input.referenceVideos || []).filter((reference) => reference.videoUrl.trim());
  const selectedReferenceVideos = readyReferenceVideos.filter((reference) => isSelectedForVideo(reference.selectedForVideo));
  const selectedReferenceVideoCount = selectedReferenceVideos.length;
  const selectedReferenceCount = readyReferenceImages.filter((reference) => isSelectedForVideo(reference.selectedForVideo)).length;
  const selectedSceneCount = readyStoryboardScenes.filter((scene) => isSelectedForVideo(scene.selectedForVideo)).length;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const startedAtMs = parseTimestampMs(task.startedAt);
  const finishedAtMs = parseTimestampMs(task.finishedAt);
  const elapsedMs = startedAtMs ? Math.max(0, (finishedAtMs ?? nowMs) - startedAtMs) : 0;
  const elapsedLabel = startedAtMs ? formatElapsedTime(elapsedMs) : '尚未开始';
  const isTaskActive = task.status === 'submitting' || task.status === 'generating';

  useEffect(() => {
    if (!isTaskActive) {
      setNowMs(Date.now());
      return;
    }

    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isTaskActive, task.startedAt, task.finishedAt]);

  if (!videoPrompt) {
    return (
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto py-10">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
          <h2 className="text-2xl font-bold text-white">视频生成</h2>
          <p className="text-zinc-400 mt-3">请先在极速输入页填写提示词，或先生成分镜图。</p>
        </div>
      </motion.div>
    );
  }

  const canSubmit = draftIssues.length === 0
    && videoPrompt.prompt.trim().length > 0
    && !isSubmitting
    && !isCancellingTask
    && !isTaskActive;
  const creditText = typeof health?.credit?.total_credit === 'number' ? `${health.credit.total_credit}` : '未知';
  const hasSubmittedTask = Boolean(task.taskId || task.submitId);
  const canRefreshStatus = hasSubmittedTask && task.status !== 'submitting' && !isRefreshingStatus && !isCancellingTask;
  const generateActionBusy = isSubmitting || isTaskActive;
  const normalizedRemoteStatus = normalizeStatusKey(task.remoteStatus);
  const normalizedQueueStatus = normalizeStatusKey(task.queueStatus);
  const taskTone = getTaskTone(task.remoteStatus, hasSubmittedTask);
  const genStatus = formatGenStatus(task.remoteStatus);
  const showFinalVideoGeneratingPreview = normalizedRemoteStatus !== 'success'
    && normalizedRemoteStatus !== 'fail'
    && normalizedRemoteStatus !== 'failed'
    && normalizedRemoteStatus !== 'cancelled'
    && normalizedRemoteStatus !== 'canceled'
    && (
      isTaskActive
      || normalizedRemoteStatus === 'querying'
      || normalizedQueueStatus === 'queueing'
      || normalizedQueueStatus === 'queued'
      || normalizedQueueStatus === 'generating'
    );
  const activeTemplate = SEEDANCE_TEMPLATE_REGISTRY[seedanceDraft.baseTemplateId];
  const costEstimate = getSeedanceCostEstimate(input, seedanceDraft, executionConfig);
  const promptReferenceItems: PromptReferenceItem[] = (() => {
    if (seedanceDraft.baseTemplateId === 'multi_image_reference') {
      const uniqueItems = new Map<string, Omit<PromptReferenceItem, 'token'>>();

      selectedReferenceImages.forEach((reference, index) => {
        if (!reference.imageUrl || uniqueItems.has(reference.imageUrl)) {
          return;
        }

        uniqueItems.set(reference.imageUrl, {
          imageUrl: reference.imageUrl,
          title: reference.description?.trim() || `参考图 ${index + 1}`,
          subtitle: getFastReferenceTypeLabel(reference.referenceType),
        });
      });

      selectedStoryboardScenes.forEach((scene, index) => {
        if (!scene.imageUrl || uniqueItems.has(scene.imageUrl)) {
          return;
        }

        uniqueItems.set(scene.imageUrl, {
          imageUrl: scene.imageUrl,
          title: scene.title || `分镜 ${index + 1}`,
          subtitle: '已确认分镜',
        });
      });

      return Array.from(uniqueItems.values()).map((item, index) => ({
        ...item,
        token: getPromptReferenceToken(index),
      }));
    }

    if (seedanceDraft.baseTemplateId === 'first_frame') {
      const firstSceneImage = selectedStoryboardScenes[0]?.imageUrl;
      return firstSceneImage ? [{
        token: getPromptReferenceToken(0),
        imageUrl: firstSceneImage,
        title: selectedStoryboardScenes[0]?.title || '首帧参考',
        subtitle: '首帧分镜',
      }] : [];
    }

    if (seedanceDraft.baseTemplateId === 'first_last_frame') {
      const frameCandidates = [
        {
          imageUrl: selectedStoryboardScenes[0]?.imageUrl,
          title: selectedStoryboardScenes[0]?.title || '首帧参考',
          subtitle: '首帧分镜',
        },
        {
          imageUrl: selectedStoryboardScenes[selectedStoryboardScenes.length - 1]?.imageUrl,
          title: selectedStoryboardScenes[selectedStoryboardScenes.length - 1]?.title || '尾帧参考',
          subtitle: '尾帧分镜',
        },
      ];

      return frameCandidates
        .filter((item): item is Omit<PromptReferenceItem, 'token'> => Boolean(item.imageUrl))
        .map((item, index) => ({
          ...item,
          token: getPromptReferenceToken(index),
        }));
    }

    return [];
  })();
  // Video reference tokens — always available when videos are selected
  const promptVideoReferenceItems: PromptVideoReferenceItem[] = selectedReferenceVideos.map((video, index) => ({
    token: getVideoPromptReferenceToken(index),
    videoUrl: video.videoUrl,
    title: video.description?.trim() || `参考视频 ${index + 1}`,
    subtitle: getFastReferenceVideoTypeLabel(video.referenceType),
  }));
  const fieldLabelClassName = 'text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500';
  const controlClassName = 'mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-rose-500';
  const taskMetricTone: MetricCardTone = !hasSubmittedTask
    ? 'neutral'
    : normalizedRemoteStatus === 'success'
      ? 'emerald'
      : normalizedRemoteStatus === 'fail' || normalizedRemoteStatus === 'failed'
        ? 'rose'
        : normalizedRemoteStatus === 'cancelled' || normalizedRemoteStatus === 'canceled'
          ? 'neutral'
          : normalizedRemoteStatus === 'querying'
            ? 'amber'
            : 'sky';

  const renderMetaValue = (label: string, value: string, raw?: string, options?: { mono?: boolean }) => (
    <div className="flex items-start justify-between gap-3">
      <span className="text-zinc-400">{label}</span>
      <div className="text-right">
        <div className={`${options?.mono ? 'font-mono' : ''} text-zinc-100`}>{value}</div>
        {raw && raw !== value ? (
          <div className="mt-0.5 text-[11px] text-zinc-500 font-mono">{raw}</div>
        ) : null}
      </div>
    </div>
  );

  const renderSummaryCard = (
    label: string,
    value: string,
    options?: {
      raw?: string;
      mono?: boolean;
      spanTwo?: boolean;
      tone?: MetricCardTone;
      infoContent?: ReactNode;
      headerRight?: ReactNode;
      className?: string;
      valueClassName?: string;
    },
  ) => {
    const tone = options?.tone || 'neutral';

    return (
      <div className={`rounded-xl border px-3 py-2.5 ${METRIC_CARD_TONE_CLASS_NAMES[tone]} ${options?.spanTwo ? 'col-span-2' : ''} ${options?.className || ''}`}>
        <div className="flex items-start justify-between gap-2">
          <div className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${METRIC_CARD_LABEL_CLASS_NAMES[tone]}`}>
            <span>{label}</span>
            {options?.infoContent ? (
              <ClickPopover
                ariaLabel={`查看${label}说明`}
                trigger="!"
                className="ml-1"
                buttonClassName="inline-flex h-4 w-4 items-center justify-center rounded-full border border-current/25 text-[10px] font-bold leading-none opacity-80 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/20"
                panelClassName="w-64 rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface-contrast)] px-3 py-2 text-xs leading-5 text-[var(--studio-muted)] shadow-[0_18px_48px_rgba(2,8,23,0.18)] backdrop-blur-xl"
                content={options.infoContent}
              />
            ) : null}
          </div>
          {options?.headerRight ? <div className="shrink-0">{options.headerRight}</div> : null}
        </div>
        <div className={`mt-1 text-sm text-zinc-100 ${options?.mono ? 'font-mono break-all' : ''} ${options?.valueClassName || ''}`}>{value}</div>
        {options?.raw && options.raw !== value ? (
          <div className="mt-1 text-[11px] text-zinc-500 font-mono break-all">{options.raw}</div>
        ) : null}
      </div>
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className={`w-full space-y-4 ${hideHeader ? 'pb-6 pt-4' : 'py-6'}`}>
      {!hideHeader ? (
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-rose-400/80">Seedance Execution</p>
            <h2 className="text-2xl xl:text-3xl font-bold text-white mt-2">视频生成</h2>
            <p className="text-sm text-zinc-400 mt-2 max-w-3xl">
              使用已确认的分镜图与视频提示词提交 Seedance。支持 Ark API 与本地 `dreamina multimodal2video` 两种执行器。
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSubmit}
              className={`rounded-xl px-4 py-2 text-sm transition-colors ${canSubmit ? 'bg-sky-500 hover:bg-sky-400 text-zinc-950' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
            >
              {generateActionBusy ? <span className="inline-flex items-center gap-2"><img src="./assets/loading.gif" alt="" className="w-4 h-4" />生成中</span> : <span className="inline-flex items-center gap-2"><Play className="w-4 h-4" />生成视频</span>}
            </button>
            {canCancelTask ? (
              <button
                type="button"
                onClick={onCancelTask}
                disabled={isCancellingTask || isRefreshingStatus}
                className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-200 transition-colors hover:bg-red-500/14 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCancellingTask
                  ? <span className="inline-flex items-center gap-2"><img src="./assets/loading.gif" alt="" className="w-4 h-4" />取消中</span>
                  : <span className="inline-flex items-center gap-2"><X className="w-4 h-4" />取消生成任务</span>}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.96fr)_minmax(340px,0.96fr)] gap-4 items-start">
        <div className="space-y-4">
          <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="text-white font-semibold">参考素材与已确认分镜</div>
              <div className="text-xs text-zinc-500">
                {[
                  readyReferenceImages.length > 0 && `参考图 ${selectedReferenceCount}/${readyReferenceImages.length} 已选`,
                  readyStoryboardScenes.length > 0 && `分镜 ${selectedSceneCount}/${readyStoryboardScenes.length} 已选`,
                  readyReferenceVideos.length > 0 && `参考视频 ${selectedReferenceVideoCount}/${readyReferenceVideos.length} 已选`,
                ].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div className="mt-2 text-xs text-zinc-500">
              只有勾选的素材会传给 Seedance API。提示词中可用 <span className="text-sky-400">图片1</span> / <span className="text-violet-400">视频1</span> 引用对应素材。
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 pr-1">
              {readyReferenceImages.map((reference, index) => (
                <div key={reference.id} className="shrink-0 w-32 xl:w-36">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => onPreviewImage(reference.imageUrl)}
                      className="block w-full text-left"
                    >
                      <div className={`aspect-video rounded-xl overflow-hidden border bg-zinc-950 flex items-center justify-center transition-colors ${isSelectedForVideo(reference.selectedForVideo) ? 'border-sky-500/30' : 'border-zinc-800 opacity-65'}`}>
                        <img src={reference.imageUrl} alt={`original-reference-${index + 1}`} className="w-full h-full object-cover" />
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onToggleReferenceSelection(reference.id);
                      }}
                      className={`absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border backdrop-blur-sm transition-colors ${isSelectedForVideo(reference.selectedForVideo) ? 'border-sky-400/35 bg-sky-500/20 text-sky-100' : 'border-zinc-700/90 bg-zinc-950/86 text-zinc-400 hover:text-zinc-200'}`}
                      title={isSelectedForVideo(reference.selectedForVideo) ? '已选中参与执行' : '未选中参与执行'}
                    >
                      {isSelectedForVideo(reference.selectedForVideo) ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="mt-2 text-sm text-zinc-300">图片{index + 1}</div>
                  <div className="text-[11px] text-sky-300">类型：{getFastReferenceTypeLabel(reference.referenceType)}</div>
                </div>
              ))}
              {readyStoryboardScenes.map((scene, index) => (
                <div key={scene.id} className="shrink-0 w-32 xl:w-36">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => onPreviewImage(scene.imageUrl!)}
                      className="block w-full text-left"
                    >
                      <div className={`aspect-video rounded-xl overflow-hidden border bg-zinc-950 flex items-center justify-center transition-colors ${isSelectedForVideo(scene.selectedForVideo) ? 'border-rose-500/30' : 'border-zinc-800 opacity-65'}`}>
                        <img src={scene.imageUrl} alt={scene.title} className="w-full h-full object-cover" />
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onToggleSceneSelection(scene.id);
                      }}
                      className={`absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border backdrop-blur-sm transition-colors ${isSelectedForVideo(scene.selectedForVideo) ? 'border-rose-400/35 bg-rose-500/20 text-rose-100' : 'border-zinc-700/90 bg-zinc-950/86 text-zinc-400 hover:text-zinc-200'}`}
                      title={isSelectedForVideo(scene.selectedForVideo) ? '已选中参与执行' : '未选中参与执行'}
                    >
                      {isSelectedForVideo(scene.selectedForVideo) ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="mt-2 text-sm text-zinc-300">{scene.title}</div>
                  <div className="text-[11px] text-zinc-500">已确认分镜 {index + 1}</div>
                </div>
              ))}
              {readyReferenceVideos.map((video, index) => (
                <div key={video.id} className="shrink-0 w-32 xl:w-36">
                  <div className="relative">
                    <div className={`aspect-video rounded-xl overflow-hidden border bg-zinc-950 flex items-center justify-center transition-colors ${isSelectedForVideo(video.selectedForVideo) ? 'border-violet-500/30' : 'border-zinc-800 opacity-65'}`}>
                      {video.videoUrl ? (
                        <video
                          src={video.videoUrl}
                          muted
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="inline-flex items-center gap-2 text-xs text-zinc-600">
                          <Video className="w-4 h-4" />
                          无预览
                        </div>
                      )}
                      <div className="absolute bottom-1 left-1 rounded bg-violet-500/80 px-1 py-0.5 text-[9px] font-bold text-white">
                        视频{index + 1}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onToggleReferenceVideoSelection(video.id);
                      }}
                      className={`absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border backdrop-blur-sm transition-colors ${isSelectedForVideo(video.selectedForVideo) ? 'border-violet-400/35 bg-violet-500/20 text-violet-100' : 'border-zinc-700/90 bg-zinc-950/86 text-zinc-400 hover:text-zinc-200'}`}
                      title={isSelectedForVideo(video.selectedForVideo) ? '已选中参与执行' : '未选中参与执行'}
                    >
                      {isSelectedForVideo(video.selectedForVideo) ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="mt-2 text-sm text-violet-300">视频{index + 1}</div>
                  <div className="text-[11px] text-violet-500">参考视频</div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col min-h-[360px]">
            <div className="flex items-center justify-between gap-4">
              <div className="text-white font-semibold">视频提示词（中文）</div>
              <button
                type="button"
                onClick={onRegeneratePrompt}
                disabled={isRegeneratingPrompt}
                className={`rounded-xl border px-3 py-2 text-sm transition-colors ${isRegeneratingPrompt ? 'border-zinc-800 text-zinc-500 cursor-not-allowed' : 'border-zinc-700 text-white hover:bg-zinc-800'}`}
              >
                {isRegeneratingPrompt ? <span className="inline-flex items-center gap-2"><img src="./assets/loading.gif" alt="" className="w-4 h-4" />重新生成中</span> : <span className="inline-flex items-center gap-2"><RefreshCw className="w-4 h-4" />重新生成提示词</span>}
              </button>
            </div>
            <PromptTokenEditor
              value={videoPrompt.promptZh || videoPrompt.prompt}
              referenceItems={promptReferenceItems}
              videoReferenceItems={promptVideoReferenceItems}
              themeMode={themeMode}
              onChange={(nextValue) => onUpdatePrompt({ prompt: nextValue, promptZh: nextValue })}
            />
          </section>
        </div>

        <div className="space-y-4">
          <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[var(--studio-text)] font-semibold">费用预估</div>
              <div className="text-xs text-[var(--studio-dim)]">按 24fps 估算</div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-zinc-200 sm:grid-cols-10">
              {renderSummaryCard('当前模型', costEstimate.modelLabel, {
                tone: 'amber',
                className: 'sm:col-span-6',
                valueClassName: 'break-words leading-5',
              })}
              {renderSummaryCard('计费单价', `${formatCny(costEstimate.unitPrice)} / 百万tokens`, {
                tone: 'amber',
                infoContent: costEstimate.billingLabel,
                className: 'sm:col-span-4',
              })}
              {renderSummaryCard('估算 tokens', formatTokenCount(costEstimate.totalTokens), {
                tone: 'amber',
                className: 'sm:col-span-5',
                infoContent: (
                  <>
                    当前按 {costEstimate.dimensionPresetLabel} 折算，尺寸 {costEstimate.width} x {costEstimate.height}。
                    {' '}
                    估算公式：({costEstimate.inputDurationSec.toFixed(1).replace(/\.0$/u, '')} + {costEstimate.outputDurationSec}) x {costEstimate.width} x {costEstimate.height} x {costEstimate.frameRate} / 1024 = {formatTokenCount(costEstimate.totalTokens)}。
                    {seedanceDraft.options.ratio === 'adaptive' ? ` 当前 adaptive 按输入画幅 ${costEstimate.effectiveRatio} 折算。` : ''}
                  </>
                ),
              })}
              {renderSummaryCard('预估费用', formatCny(costEstimate.estimatedCost), {
                tone: 'amber',
                className: 'sm:col-span-5',
              })}
            </div>
          </section>

          <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-white font-semibold">执行参数</div>
              <div className="text-right text-xs text-zinc-500">
                {(executionConfig.executor === 'ark' ? 'Ark API' : '本地 CLI')}
                {' · '}
                {`画幅：${seedanceDraft.options.ratio} · 时长：${seedanceDraft.options.duration || 10}s · 分辨率：${seedanceDraft.options.resolution}`}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mt-3">
              <label className="block">
                <span className={fieldLabelClassName}>执行器</span>
                <StudioSelect
                  value={executionConfig.executor}
                  onChange={(event) => onUpdateExecutionConfig({ executor: event.target.value as Props['executionConfig']['executor'] })}
                  className={controlClassName}
                >
                  <option value="ark">Ark API</option>
                  <option value="cli">本地 CLI</option>
                </StudioSelect>
              </label>
              {executionConfig.executor === 'ark' ? (
                <label className="block">
                  <span className={fieldLabelClassName}>Ark 模型</span>
                  <StudioSelect
                    value={executionConfig.apiModelKey}
                    onChange={(event) => onUpdateExecutionConfig({ apiModelKey: event.target.value as Props['executionConfig']['apiModelKey'] })}
                    className={controlClassName}
                  >
                    <option value="standard">Seedance 2.0</option>
                    <option value="fast">Seedance 2.0 Fast</option>
                  </StudioSelect>
                </label>
              ) : (
                <label className="block">
                  <span className={fieldLabelClassName}>CLI 模型版本</span>
                  <StudioSelect
                    value={executionConfig.cliModelVersion}
                    onChange={(event) => onUpdateExecutionConfig({ cliModelVersion: event.target.value as Props['executionConfig']['cliModelVersion'] })}
                    className={controlClassName}
                  >
                    {SEEDANCE_MODEL_VERSIONS.map((modelVersion) => (
                      <option key={modelVersion} value={modelVersion}>{modelVersion}</option>
                    ))}
                  </StudioSelect>
                </label>
              )}
              <label className="block">
                <span className={fieldLabelClassName}>功能模板</span>
                <StudioSelect
                  value={seedanceDraft.baseTemplateId}
                  onChange={(event) => onUpdateDraft({ baseTemplateId: event.target.value as SeedanceDraft['baseTemplateId'] })}
                  className={controlClassName}
                >
                  {FAST_FLOW_TEMPLATE_IDS.map((templateId) => (
                    <option key={templateId} value={templateId}>{SEEDANCE_TEMPLATE_REGISTRY[templateId].title}</option>
                  ))}
                </StudioSelect>
              </label>
              <label className="block">
                <span className={fieldLabelClassName}>画幅</span>
                <StudioSelect
                  value={seedanceDraft.options.ratio}
                  onChange={(event) => onUpdateDraft({ options: { ratio: event.target.value as SeedanceDraft['options']['ratio'] } })}
                  className={controlClassName}
                >
                  {SEEDANCE_RATIO_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </StudioSelect>
              </label>
              <label className="block">
                <span className={fieldLabelClassName}>时长（4-15 秒）</span>
                <input
                  type="number"
                  min={4}
                  max={15}
                  value={seedanceDraft.options.duration || 10}
                  onChange={(event) => onUpdateDraft({ options: { duration: Math.max(4, Math.min(15, Number(event.target.value) || 10)) } })}
                  className={controlClassName}
                />
              </label>
              <label className="block">
                <span className={fieldLabelClassName}>分辨率</span>
                <StudioSelect
                  value={seedanceDraft.options.resolution}
                  onChange={(event) => onUpdateDraft({ options: { resolution: event.target.value as SeedanceDraft['options']['resolution'] } })}
                  className={controlClassName}
                >
                  <option value="480p">480p</option>
                  <option value="720p">720p</option>
                </StudioSelect>
              </label>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-300 md:col-span-2 xl:col-span-3">
                <div className="flex items-baseline gap-2 overflow-hidden">
                  <span className="shrink-0 font-medium text-white">{activeTemplate.title}</span>
                  <span className="truncate text-zinc-400">{activeTemplate.description}</span>
                </div>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 space-y-3 md:col-span-2 xl:col-span-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className={fieldLabelClassName}>叠加能力</div>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {FAST_OVERLAY_OPTIONS.map((option) => {
                    const checked = seedanceDraft.overlayTemplateIds.includes(option.id);
                    const disabled = !activeTemplate.supportedOverlays.includes(option.id);
                    const Icon = option.icon;
                    return (
                      <label
                        key={option.id}
                        className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors ${disabled
                          ? 'border-zinc-900 bg-zinc-950/60 text-zinc-600'
                          : checked
                            ? 'studio-accent-chip-red shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                            : 'border-zinc-800 bg-transparent text-zinc-300 hover:border-zinc-700 hover:bg-white/[0.02]'
                          }`}
                      >
                        <span className="inline-flex min-w-0 items-center gap-2.5">
                          <Icon className={`h-4 w-4 shrink-0 ${disabled ? 'text-zinc-600' : checked ? 'studio-accent-text-red' : 'text-zinc-400'}`} />
                          <span>{option.label}</span>
                        </span>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={(event) => {
                            const overlayTemplateIds = event.target.checked
                              ? [...seedanceDraft.overlayTemplateIds, option.id]
                              : seedanceDraft.overlayTemplateIds.filter((item) => item !== option.id);
                            onUpdateDraft({ overlayTemplateIds });
                          }}
                          className="rounded border-zinc-700 bg-zinc-950"
                        />
                      </label>
                    );
                  })}
                  <label
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors ${seedanceDraft.options.watermark
                      ? 'studio-accent-chip-red shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                      : 'border-zinc-800 bg-transparent text-zinc-300 hover:border-zinc-700 hover:bg-white/[0.02]'
                      }`}
                  >
                    <span className="inline-flex min-w-0 items-center gap-2.5">
                      <Video className={`h-4 w-4 shrink-0 ${seedanceDraft.options.watermark ? 'studio-accent-text-red' : 'text-zinc-400'}`} />
                      <span>保留水印</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={seedanceDraft.options.watermark}
                      onChange={(event) => onUpdateDraft({ options: { watermark: event.target.checked } })}
                      className="rounded border-zinc-700 bg-zinc-950"
                    />
                  </label>
                </div>
              </div>
              {draftIssues.length > 0 ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 md:col-span-2 xl:col-span-3">
                  {draftIssues.map((issue) => (
                    <div key={issue}>{issue}</div>
                  ))}
                </div>
              ) : null}
            </div>

            {executionConfig.executor === 'cli' ? (
              <div className="mt-4 border-t border-zinc-800 pt-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-white font-medium">CLI 状态摘要</div>
                  <div className="text-xs text-zinc-500">仅本地执行使用</div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm text-zinc-400">
                  {renderSummaryCard('CLI 可用', health?.cliAvailable ? '是' : '否', { tone: 'sky' })}
                  {renderSummaryCard('登录状态', health?.loginStatus || 'unknown', { tone: 'sky' })}
                  {renderSummaryCard('剩余额度', creditText, { tone: 'sky' })}
                </div>
                <div className="text-xs text-zinc-500">
                  当前仅本地 CLI 需要这组健康检查；Ark API 走火山引擎 API Key 与 Seedance 模型 / 接入点配置。
                </div>
                {healthPanel ? <div>{healthPanel}</div> : null}
              </div>
            ) : null}
          </section>
        </div>

        <div className="space-y-4">
          <section className={`border rounded-2xl p-4 ${taskTone.shellClass}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className={taskTone.accentClass}>
                  {!hasSubmittedTask ? <Clock3 className="w-4 h-4" /> : normalizedRemoteStatus === 'success' ? <CheckCircle2 className="w-4 h-4" /> : normalizedRemoteStatus === 'fail' || normalizedRemoteStatus === 'failed' ? <AlertTriangle className="w-4 h-4" /> : normalizedRemoteStatus === 'querying' ? <img src="./assets/loading.gif" alt="" className="w-4 h-4" /> : <Clock3 className="w-4 h-4" />}
                </span>
                <div className="font-semibold text-[var(--studio-text)]">任务状态</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onRefreshStatus}
                  disabled={!canRefreshStatus}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${canRefreshStatus ? 'border-zinc-700 text-zinc-100 hover:bg-zinc-900/70' : 'border-zinc-800 text-zinc-600 cursor-not-allowed'}`}
                >
                  {isRefreshingStatus ? <img src="./assets/loading.gif" alt="" className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  <span>{isRefreshingStatus ? '查询中' : '查询状态'}</span>
                </button>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${taskTone.badgeClass}`}>
                  {getTaskStatusLabel(task.remoteStatus, hasSubmittedTask)}
                </span>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-zinc-200">
              {renderSummaryCard('任务编号', task.taskId || task.submitId || '未提交', {
                mono: true,
                spanTwo: true,
                tone: taskMetricTone,
                headerRight: (
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${METRIC_CARD_LABEL_CLASS_NAMES[taskMetricTone]}`}>
                    云端状态 · {hasSubmittedTask ? genStatus.label : '未提交'}
                  </span>
                ),
              })}
              <div className={`col-span-2 rounded-xl border px-3 py-2.5 ${METRIC_CARD_TONE_CLASS_NAMES[taskMetricTone]}`}>
                <div className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${METRIC_CARD_LABEL_CLASS_NAMES[taskMetricTone]}`}>时间线</div>
                <div className="mt-2 space-y-1.5 text-xs text-zinc-300">
                  {renderMetaValue(isTaskActive ? '生成耗时' : '总耗时', elapsedLabel)}
                  {renderMetaValue('开始', formatTaskTimestamp(task.startedAt, '尚未开始'))}
                  {task.finishedAt ? renderMetaValue('结束', formatTaskTimestamp(task.finishedAt, '未结束')) : null}
                  {renderMetaValue('检查', formatTaskTimestamp(task.lastCheckedAt))}
                </div>
              </div>
            </div>
            {task.error ? (
              <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {task.error}
              </div>
            ) : null}
          </section>

          <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="text-white font-semibold">最终视频</div>
              <div className="text-xs text-zinc-500">本地任务完成后自动更新</div>
            </div>
            <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 overflow-hidden">
              {showFinalVideoGeneratingPreview ? (
                <SeedanceVideoPendingPreview task={task} isTaskActive={isTaskActive} />
              ) : task.videoUrl ? (
                <video src={task.videoUrl} controls className="w-full aspect-video object-contain bg-black" />
              ) : (
                <div className="aspect-video flex items-center justify-center text-zinc-600 text-sm">
                  <span className="inline-flex items-center gap-2"><Video className="w-4 h-4" />尚未生成视频</span>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </motion.div>
  );
}
