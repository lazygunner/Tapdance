// Ported from NiegeIP production studio; Tapdance adapters only.
import './creation.css';
import { Fragment, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ClipboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Film, Image, Music2 } from 'lucide-react'
import { CREATION_PROMPT_MAX_CHARACTERS } from './materials.ts'
import type { CreationMaterial } from './materials.ts'
import { findPendingMentionMatch, getMentionedMaterialIds, orderMentionMaterials, materialMentionLabel, materialMentionToken } from './promptMention.utils.ts'

type SelectionOffset = { start: number; end: number }
type EditSnapshot = { value: string; selection: SelectionOffset | null }
type MentionState = { query: string; activeIndex: number }

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function splitContent(value: string, materials: readonly CreationMaterial[]) {
  const tokens = materials.map(materialMentionToken).sort((left, right) => right.length - left.length)
  if (tokens.length === 0) return [{ type: 'text' as const, value }]
  const matcher = new RegExp(`(${tokens.map(escapeRegExp).join('|')})(?![A-Za-z0-9_-])`, 'gu')
  const result: Array<{ type: 'text' | 'token'; value: string }> = []
  let last = 0
  for (const match of value.matchAll(matcher)) {
    const start = match.index ?? 0
    if (start > last) result.push({ type: 'text', value: value.slice(last, start) })
    result.push({ type: 'token', value: match[0] })
    last = start + match[0].length
  }
  if (last < value.length) result.push({ type: 'text', value: value.slice(last) })
  return result.length > 0 ? result : [{ type: 'text' as const, value: '' }]
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return ''
  if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) return Array.from(node.childNodes).map(serializeNode).join('')
  const element = node as HTMLElement
  if (element.dataset.promptToken) return element.dataset.promptToken
  if (element.tagName === 'BR') return '\n'
  const children = Array.from(element.childNodes)
  return children.map((child, index) => {
    const text = serializeNode(child)
    return child instanceof HTMLElement && (child.tagName === 'DIV' || child.tagName === 'P') && index < children.length - 1 && !text.endsWith('\n') ? `${text}\n` : text
  }).join('')
}

function serialize(root: HTMLElement) {
  // Chromium leaves a placeholder BR after deleting the entire editable value.
  if (root.childNodes.length === 1 && root.firstChild instanceof HTMLBRElement) return ''
  return serializeNode(root).replace(/\u00a0/gu, ' ')
}

function render(root: HTMLElement, value: string, materials: readonly CreationMaterial[], numberedMaterialIds?: readonly string[]) {
  const fragment = root.ownerDocument.createDocumentFragment()
  splitContent(value, materials).forEach((segment) => {
    if (segment.type === 'text') {
      if (segment.value) fragment.append(root.ownerDocument.createTextNode(segment.value))
      return
    }
    const material = materials.find((item) => materialMentionToken(item) === segment.value)
    if (!material) {
      fragment.append(root.ownerDocument.createTextNode(segment.value))
      return
    }
    const chip = root.ownerDocument.createElement('span')
    chip.className = `creation-prompt-mention creation-prompt-mention--${material.kind}`
    chip.contentEditable = 'false'
    chip.dataset.promptToken = segment.value
    chip.dataset.materialId = String(material.id)
    chip.title = `${materialMentionLabel(material, materials, numberedMaterialIds)} · ${material.name}`
    if (material.kind === 'image' && materialUrl(material)) {
      const image = root.ownerDocument.createElement('img')
      image.src = materialUrl(material)
      image.alt = ''
      image.setAttribute('aria-hidden', 'true')
      chip.append(image)
    } else if (material.kind === 'video' && materialUrl(material)) {
      const video = root.ownerDocument.createElement('video')
      video.src = materialUrl(material)
      video.muted = true
      video.playsInline = true
      video.preload = 'metadata'
      video.setAttribute('aria-hidden', 'true')
      chip.append(video)
    } else {
      const icon = root.ownerDocument.createElement('span')
      icon.className = 'creation-prompt-mention__icon'
      icon.textContent = material.kind === 'audio' ? '音' : '素材'
      icon.setAttribute('aria-hidden', 'true')
      chip.append(icon)
    }
    const label = root.ownerDocument.createElement('span')
    label.className = 'creation-prompt-mention__label'
    label.textContent = `${materialMentionLabel(material, materials, numberedMaterialIds)}${material.name.trim() ? `（${material.name.trim()}）` : ''}`
    chip.append(label)
    fragment.append(chip)
  })
  root.replaceChildren(fragment)
}

function offsetAt(root: HTMLElement, node: Node, offset: number) {
  const range = root.ownerDocument.createRange()
  range.selectNodeContents(root)
  range.setEnd(node, offset)
  return serializeNode(range.cloneContents()).length
}

function captureSelection(root: HTMLElement): SelectionOffset | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  return { start: offsetAt(root, range.startContainer, range.startOffset), end: offsetAt(root, range.endContainer, range.endOffset) }
}

function locate(root: HTMLElement, target: number) {
  let remaining = Math.max(0, target)
  const walk = (node: Node): { node: Node; offset: number } | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length ?? 0
      if (remaining <= length) return { node, offset: remaining }
      remaining -= length
      return null
    }
    if (!(node instanceof HTMLElement)) return null
    if (node.dataset.promptToken) {
      const parent = node.parentNode ?? root
      const index = Array.from(parent.childNodes).indexOf(node)
      if (remaining <= 0) return { node: parent, offset: index }
      const tokenLength = node.dataset.promptToken.length
      if (remaining <= tokenLength) {
        remaining = 0
        return { node: parent, offset: index + 1 }
      }
      remaining -= tokenLength
      return null
    }
    if (node.tagName === 'BR') {
      const parent = node.parentNode ?? root
      const index = Array.from(parent.childNodes).indexOf(node)
      if (remaining <= 1) return { node: parent, offset: index + 1 }
      remaining -= 1
      return null
    }
    for (const child of Array.from(node.childNodes)) {
      const result = walk(child)
      if (result) return result
    }
    return null
  }
  return walk(root) ?? { node: root, offset: root.childNodes.length }
}

function restoreSelection(root: HTMLElement, selection: SelectionOffset) {
  const browserSelection = window.getSelection()
  if (!browserSelection) return
  const start = locate(root, selection.start)
  const end = locate(root, selection.end)
  const range = root.ownerDocument.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  browserSelection.removeAllRanges()
  browserSelection.addRange(range)
}

function materialUrl(material: CreationMaterial) {
  return material.displayUrl?.trim() || material.url?.trim() || ''
}

function removeAdjacentToken(value: string, offset: number, direction: 'backward' | 'forward', materials: readonly CreationMaterial[]) {
  const tokens = materials.map(materialMentionToken)
  for (const token of tokens) {
    const separatorOffset = direction === 'backward' && /\s/u.test(value[offset - 1] ?? '') ? offset - 1 : offset
    const start = direction === 'backward' ? separatorOffset - token.length : offset
    if (start >= 0 && value.slice(start, start + token.length) === token) return { start, end: direction === 'backward' ? offset : start + token.length }
  }
  return null
}

export function PromptMentionEditor({
  value,
  materials,
  connectedMaterialIds,
  numberedMaterialIds,
  placeholder,
  emptyMaterialsMessage,
  maxLength = CREATION_PROMPT_MAX_CHARACTERS,
  ariaLabel = '创作提示词',
  portalSuggestions = false,
  onChange,
  onMentionedMaterialIdsChange,
  onBeforeMention,
}: {
  key?: string
  value: string
  materials: readonly CreationMaterial[]
  connectedMaterialIds?: readonly string[]
  numberedMaterialIds?: readonly string[]
  placeholder?: string
  emptyMaterialsMessage?: string
  maxLength?: number
  ariaLabel?: string
  portalSuggestions?: boolean
  onChange: (value: string) => void
  onMentionedMaterialIdsChange?: (ids: string[]) => void
  onBeforeMention?: (material: CreationMaterial) => boolean
}) {
  const shellRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const pendingSelectionRef = useRef<SelectionOffset | null>(null)
  const renderedRef = useRef<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const composingRef = useRef(false)
  const historyRef = useRef<{ past: EditSnapshot[]; future: EditSnapshot[]; value: string }>({ past: [], future: [], value })
  const beforeSelectionRef = useRef<SelectionOffset | null>(null)
  const [mention, setMention] = useState<MentionState | null>(null)

  const connectedIds = connectedMaterialIds === undefined ? undefined : new Set([...connectedMaterialIds, ...(numberedMaterialIds ?? [])])
  const matchingMaterials = mention
    ? orderMentionMaterials(materials, numberedMaterialIds).filter((material) => {
      const query = mention.query.toLocaleLowerCase()
      return !query || `${material.name} ${materialMentionLabel(material, materials, numberedMaterialIds)}`.toLocaleLowerCase().includes(query)
    })
    : []
  const suggestions = connectedIds ? [...matchingMaterials.filter((material) => connectedIds.has(String(material.id))), ...matchingMaterials.filter((material) => !connectedIds.has(String(material.id)))] : matchingMaterials
  const firstUnconnectedIndex = connectedIds ? suggestions.findIndex((material) => !connectedIds.has(String(material.id))) : -1

  const syncMention = () => {
    if (!editorRef.current) return setMention(null)
    const selection = captureSelection(editorRef.current)
    if (!selection || selection.start !== selection.end) return setMention(null)
    const match = findPendingMentionMatch(serialize(editorRef.current), selection.start, materials)
    setMention(match ? (previous) => ({ query: match.query, activeIndex: previous?.query === match.query ? previous.activeIndex : 0 }) : null)
  }

  const commit = (nextValue: string, nextSelection?: SelectionOffset | null) => {
    const boundedValue = Array.from(nextValue).slice(0, maxLength).join('')
    const boundedSelection = nextSelection ? { start: Math.min(nextSelection.start, boundedValue.length), end: Math.min(nextSelection.end, boundedValue.length) } : null
    const history = historyRef.current
    if (boundedValue !== history.value) {
      history.past.push({ value: history.value, selection: beforeSelectionRef.current ?? (editorRef.current ? captureSelection(editorRef.current) : null) })
      if (history.past.length > 100) history.past.shift()
      history.future = []
      history.value = boundedValue
    }
    beforeSelectionRef.current = null
    pendingSelectionRef.current = boundedValue !== value ? boundedSelection : null
    onChange(boundedValue)
    onMentionedMaterialIdsChange?.(getMentionedMaterialIds(boundedValue, materials))
  }

  const commitDom = () => {
    if (!editorRef.current) return
    const nextValue = serialize(editorRef.current)
    const nextSelection = captureSelection(editorRef.current)
    if (nextValue !== value) commit(nextValue, nextSelection)
    syncMention()
  }

  useLayoutEffect(() => {
    if (!editorRef.current || composingRef.current) return
    const root = editorRef.current
    if (historyRef.current.value !== value) {
      historyRef.current = { past: [], future: [], value }
    }
    // Parent renders often rebuild the material array. Do not replace an
    // unchanged DOM while the browser is placing a caret or selecting text.
    const signature = JSON.stringify([value, numberedMaterialIds, materials.map((material) => [material.id, material.kind, material.name, materialUrl(material)])])
    if (renderedRef.current === signature && serialize(root) === value) return
    const focused = document.activeElement === root
    const selection = focused ? (pendingSelectionRef.current ?? captureSelection(root)) : null
    const scrollTop = root.scrollTop
    render(root, value, materials, numberedMaterialIds)
    renderedRef.current = signature
    pendingSelectionRef.current = null
    if (focused && selection) restoreSelection(root, selection)
    root.scrollTop = scrollTop
  }, [materials, numberedMaterialIds, value])

  useLayoutEffect(() => {
    const panel = panelRef.current
    const active = panel?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!panel || !active) return
    // Scroll only the options panel; scrollIntoView can also move the canvas.
    if (active.offsetTop < panel.scrollTop) panel.scrollTop = active.offsetTop
    else if (active.offsetTop + active.offsetHeight > panel.scrollTop + panel.clientHeight) panel.scrollTop = active.offsetTop + active.offsetHeight - panel.clientHeight
  }, [mention?.activeIndex, mention?.query])

  // Canvas composers scroll independently; mount their suggestions outside the
  // clipping surface and keep the popup aligned with the visible editor.
  const canvasPopup = Boolean(mention && portalSuggestions)
  useLayoutEffect(() => {
    const panel = panelRef.current
    const editor = editorRef.current
    if (!canvasPopup || !panel || !editor) return
    const update = () => {
      const rect = editor.getBoundingClientRect()
      const viewport = window.visualViewport
      const top = (viewport?.offsetTop ?? 0) + 8
      const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - 8
      const left = (viewport?.offsetLeft ?? 0) + 8
      const width = Math.min(rect.width, (viewport?.width ?? window.innerWidth) - 16)
      const above = Math.max(0, rect.top - top - 6)
      const below = Math.max(0, bottom - rect.bottom - 6)
      const opensAbove = above >= Math.min(240, panel.scrollHeight) || above >= below
      Object.assign(panel.style, {
        position: 'fixed', zIndex: '320', boxSizing: 'border-box',
        left: `${Math.max(left, Math.min(rect.left, left + (viewport?.width ?? window.innerWidth) - 16 - width))}px`,
        right: 'auto', width: `${width}px`,
        maxHeight: `${Math.min(240, opensAbove ? above : below)}px`,
        top: opensAbove ? 'auto' : `${rect.bottom + 6}px`,
        bottom: opensAbove ? `${window.innerHeight - rect.top + 6}px` : 'auto',
        overscrollBehavior: 'contain',
      })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(editor)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [canvasPopup, mention?.query])

  const insertSuggestion = (material: CreationMaterial) => {
    if (!editorRef.current || onBeforeMention && !onBeforeMention(material)) return
    const text = serialize(editorRef.current)
    const selection = captureSelection(editorRef.current)
    if (!selection) return
    const match = findPendingMentionMatch(text, selection.start, materials)
    if (!match) return
    const token = materialMentionToken(material)
    const suffix = text.slice(selection.end)
    const reusesSeparator = Boolean(suffix && /^\s/u.test(suffix))
    const separator = reusesSeparator ? '' : ' '
    const next = `${text.slice(0, match.start)}${token}${separator}${suffix}`
    setMention(null)
    // When the suffix already starts with a space/newline, keep it and move
    // past its first code point; otherwise the next character would land
    // between the chip and the existing whitespace.
    const caretOffset = match.start + token.length + (reusesSeparator ? 1 : separator.length)
    commit(next, { start: caretOffset, end: caretOffset })
  }

  const restoreHistory = (redo: boolean) => {
    const root = editorRef.current
    if (!root) return
    const history = historyRef.current
    const source = redo ? history.future : history.past
    const snapshot = source.pop()
    if (!snapshot) return
    const destination = redo ? history.past : history.future
    destination.push({ value: history.value, selection: captureSelection(root) })
    history.value = snapshot.value
    beforeSelectionRef.current = null
    pendingSelectionRef.current = snapshot.selection
    render(root, snapshot.value, materials, numberedMaterialIds)
    restoreSelection(root, snapshot.selection ?? { start: snapshot.value.length, end: snapshot.value.length })
    setMention(null)
    onChange(snapshot.value)
    onMentionedMaterialIdsChange?.(getMentionedMaterialIds(snapshot.value, materials))
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (composingRef.current || event.nativeEvent.isComposing || event.keyCode === 229) return
    if (editorRef.current) beforeSelectionRef.current = captureSelection(editorRef.current)
    const key = event.key.toLowerCase()
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      if (key === 'z' || key === 'y') {
        event.preventDefault()
        event.stopPropagation()
        restoreHistory(key === 'y' || event.shiftKey)
        return
      }
      if (key === 'a' && editorRef.current) {
        event.preventDefault()
        event.stopPropagation()
        restoreSelection(editorRef.current, { start: 0, end: serialize(editorRef.current).length })
        return
      }
    }
    if (mention) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        if (suggestions.length > 0) setMention({ ...mention, activeIndex: (mention.activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length })
        return
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && suggestions.length > 0) {
        event.preventDefault()
        const suggestion = suggestions[mention.activeIndex] ?? suggestions[0]
        if (suggestion) insertSuggestion(suggestion)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setMention(null)
        return
      }
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (editorRef.current) {
        const selection = window.getSelection()
        if (selection?.rangeCount) {
          const range = selection.getRangeAt(0)
          range.deleteContents()
          range.insertNode(editorRef.current.ownerDocument.createTextNode('\n'))
          range.collapse(false)
          commitDom()
        }
      }
      return
    }
    if ((event.key === 'Backspace' || event.key === 'Delete') && editorRef.current) {
      const selection = captureSelection(editorRef.current)
      if (!selection || selection.start !== selection.end) return
      const range = removeAdjacentToken(serialize(editorRef.current), selection.start, event.key === 'Backspace' ? 'backward' : 'forward', materials)
      if (!range) return
      event.preventDefault()
      const next = `${value.slice(0, range.start)}${value.slice(range.end)}`
      commit(next, { start: range.start, end: range.start })
      setMention(null)
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (!editorRef.current) return
    event.preventDefault()
    beforeSelectionRef.current = captureSelection(editorRef.current)
    const text = event.clipboardData.getData('text/plain').replace(/\r\n?/gu, '\n')
    const selection = window.getSelection()
    if (!selection?.rangeCount) return
    const range = selection.getRangeAt(0)
    range.deleteContents()
    const node = editorRef.current.ownerDocument.createTextNode(text)
    range.insertNode(node)
    range.setStart(node, text.length)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    commitDom()
  }

  const panel = mention && <div className="creation-prompt-mention-panel" id={panelId} ref={panelRef} role="listbox" aria-label="可引用素材">
      {suggestions.length > 0 ? suggestions.map((material, index) => <Fragment key={materialMentionToken(material)}>
        {index === firstUnconnectedIndex && <div className="creation-prompt-mention-panel__divider" role="presentation">其他未连线素材</div>}
        <button
        className={index === mention.activeIndex ? 'is-active' : undefined}
        id={`${panelId}-${index}`}
        aria-selected={index === mention.activeIndex}
        title={material.name}
        key={materialMentionToken(material)}
        onMouseDown={(event) => { event.preventDefault(); insertSuggestion(material) }}
        role="option"
        type="button"
      >
        <span className={`creation-prompt-mention-panel__preview creation-prompt-mention-panel__preview--${material.kind}`}>
          {material.kind === 'image' && materialUrl(material) ? <img alt="" src={materialUrl(material)} /> : material.kind === 'video' && materialUrl(material) ? <video aria-hidden="true" muted playsInline preload="metadata" src={materialUrl(material)} /> : material.kind === 'audio' ? <Music2 size={16} /> : material.kind === 'image' ? <Image size={16} /> : <Film size={16} />}
        </span>
        <span className="creation-prompt-mention-panel__text"><strong>{material.name}</strong><small>{materialMentionLabel(material, materials, numberedMaterialIds)}</small></span>
      </button></Fragment>) : <span className="creation-prompt-mention-panel__empty">{materials.length === 0 ? emptyMaterialsMessage || '没有匹配的素材' : '没有匹配的素材'}</span>}
    </div>

  return <div className="creation-prompt-mention-editor" ref={shellRef}>
    <div
      ref={editorRef}
      aria-label={ariaLabel}
      aria-multiline="true"
      aria-autocomplete="list"
      aria-controls={mention ? panelId : undefined}
      aria-activedescendant={mention && suggestions.length > 0 ? `${panelId}-${Math.min(mention.activeIndex, suggestions.length - 1)}` : undefined}
      className="creation-prompt-mention-editor__input"
      contentEditable
      data-placeholder={placeholder ?? '描述角色、场景、构图、色彩与光线；输入 @ 选择素材…'}
      aria-keyshortcuts="Control+Z Meta+Z Control+Shift+Z Meta+Shift+Z Control+Y"
      onBeforeInput={() => { if (!composingRef.current && editorRef.current) beforeSelectionRef.current = captureSelection(editorRef.current) }}
      onBlur={() => setMention(null)}
      onCompositionEnd={() => { composingRef.current = false; commitDom() }}
      onCompositionStart={() => { beforeSelectionRef.current = editorRef.current ? captureSelection(editorRef.current) : null; composingRef.current = true; setMention(null) }}
      onFocus={syncMention}
      onInput={() => { if (!composingRef.current) commitDom() }}
      onKeyDown={handleKeyDown}
      onKeyUp={(event) => { if (!['Escape', 'Enter', 'Tab', 'ArrowDown', 'ArrowUp'].includes(event.key)) syncMention() }}
      onMouseUp={syncMention}
      onPaste={handlePaste}
      role="textbox"
      spellCheck={false}
      suppressContentEditableWarning
    />
    {canvasPopup ? createPortal(<div className={document.querySelector('.app-shell')?.classList.contains('theme-light') ? 'theme-light' : 'theme-dark'}>{panel}</div>, document.body) : panel}
  </div>
}
