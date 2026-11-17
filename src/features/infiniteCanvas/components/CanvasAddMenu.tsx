// Ported from NiegeIP; generation capabilities use Tapdance configuration.
import { useEffect, useRef } from 'react'
import { AudioLines, FileText, FolderOpen, Image, Sparkles, Upload, Video } from 'lucide-react'
import type { CanvasNodeType } from '../types.ts'

interface Props {
  x: number
  y: number
  busy: boolean
  onAdd: (type: CanvasNodeType) => void
  onUpload: () => void
  onMaterials: () => void
  onClose: () => void
}

export function CanvasAddMenu({ x, y, busy, onAdd, onUpload, onMaterials, onClose }: Props) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement
    const container = root.current
    root.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) onClose() }
    document.addEventListener('pointerdown', outside)
    return () => {
      document.removeEventListener('pointerdown', outside)
      if (previous instanceof HTMLElement && container?.contains(document.activeElement)) previous.focus({ preventScroll: true })
    }
  }, [onClose])
  return <div className="canvas-add-menu" ref={root} role="menu" aria-label="添加节点" style={{ left: x, top: y }} onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
    event.stopPropagation()
    const buttons = Array.from<HTMLButtonElement>(root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
    const index = buttons.findIndex((button) => button === document.activeElement)
    if (event.key === 'Escape') { event.preventDefault(); onClose() }
    if (event.key === 'Tab') onClose()
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length
      buttons[next]?.focus()
    }
  }}>
    <span className="canvas-add-menu__title">添加节点</span>
    <button role="menuitem" type="button" onClick={() => onAdd('image')}><Image size={17} />图片</button>
    <button role="menuitem" type="button" onClick={() => onAdd('video')}><Video size={17} />视频</button>
    <button role="menuitem" type="button" onClick={() => onAdd('audio')}><AudioLines size={17} />音频</button>
    <button role="menuitem" type="button" onClick={() => onAdd('text')}><FileText size={17} />文字</button>
    <div role="separator" />
    <button role="menuitem" type="button" disabled={busy} onClick={onUpload}><Upload size={17} />{busy ? '正在上传…' : '上传'}</button>
    <button role="menuitem" type="button" onClick={onMaterials}><FolderOpen size={17} />素材选择</button>
  </div>
}
