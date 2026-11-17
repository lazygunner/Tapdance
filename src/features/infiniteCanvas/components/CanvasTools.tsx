// Ported from NiegeIP infinite-canvas.
import { useState } from 'react'
import { AudioLines, FileText, Hand, MousePointer2, Image, LayoutGrid, Map, Minus, PanelLeft, Plus, RotateCcw, Video, Waypoints, X } from 'lucide-react'
import type { CanvasNode, CanvasViewport } from '../types.ts'
import { DEFAULT_CANVAS_VIEWPORT } from '../types.ts'
import { fitCanvasViewport } from '../utils/canvas.utils.ts'

interface Props {
  nodes: CanvasNode[]
  viewport: CanvasViewport
  size: { width: number; height: number }
  ready: boolean
  assetsOpen: boolean
  edgesHidden: boolean
  interactionMode: 'select' | 'hand'
  onInteractionMode: (mode: 'select' | 'hand') => void
  selectedId?: string
  onAssets: () => void
  onEdges: () => void
  onArrange: () => void
  onSelect: (node: CanvasNode) => void
  onViewport: (viewport: CanvasViewport) => void
}
const icons = { image: Image, video: Video, audio: AudioLines, text: FileText }

export function CanvasTools({ nodes, viewport, size, ready, assetsOpen, edgesHidden, interactionMode, onInteractionMode, selectedId, onAssets, onEdges, onArrange, onSelect, onViewport }: Props) {
  const [mapOpen, setMapOpen] = useState(false)
  const view = { x: -viewport.x / viewport.zoom, y: -viewport.y / viewport.zoom, width: size.width / viewport.zoom, height: size.height / viewport.zoom }
  const left = Math.min(view.x, ...nodes.map((node) => node.x)) - 80
  const top = Math.min(view.y, ...nodes.map((node) => node.y)) - 80
  const width = Math.max(view.x + view.width, ...nodes.map((node) => node.x + node.width)) - left + 80
  const height = Math.max(view.y + view.height, ...nodes.map((node) => node.y + node.height)) - top + 80
  const zoom = (delta: number) => {
    const next = Math.min(2.2, Math.max(.1, viewport.zoom + delta))
    onViewport({ zoom: next, x: size.width / 2 - (size.width / 2 - viewport.x) * next / viewport.zoom, y: size.height / 2 - (size.height / 2 - viewport.y) * next / viewport.zoom })
  }
  return <>
    {assetsOpen && <aside className="canvas-assets" id="canvas-assets" aria-label="资产列表">
      <header><strong>资产列表</strong><button type="button" aria-label="收起资产列表" title="收起资产列表" onClick={onAssets}><X size={16} /></button></header>
      <div className="canvas-assets__list">{!ready ? <p role="status">画布内容尚未加载</p> : !nodes.length ? <p>画布暂无资产，添加节点后将在这里显示。</p> : nodes.map((node) => {
        const Icon = icons[node.type]
        return <button type="button" key={node.id} className={selectedId === node.id ? 'is-selected' : ''} aria-pressed={selectedId === node.id} onClick={() => onSelect(node)} title={node.title}>
          <span className="canvas-assets__thumbnail">{node.type === 'image' && node.mediaUrl ? <img src={node.mediaUrl} alt="" onError={(event) => { event.currentTarget.style.display = 'none' }} /> : null}<Icon size={18} /></span>
          <span>{node.title || '未命名节点'}{(node.groupId) && <small>{'已成组'}</small>}</span>
        </button>
      })}</div><footer>共 {nodes.length} 个节点</footer>
    </aside>}
    <div className="canvas-tools" aria-label="画布工具">
      {mapOpen && <div className="canvas-minimap"><svg viewBox={`${left} ${top} ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="画布小地图，点击定位；也可通过资产列表定位节点" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); onViewport({ ...viewport, x: size.width / 2 - (left + (event.clientX - rect.left) / rect.width * width) * viewport.zoom, y: size.height / 2 - (top + (event.clientY - rect.top) / rect.height * height) * viewport.zoom }) }}>
        {nodes.map((node) => <rect key={node.id} x={node.x} y={node.y} width={node.width} height={node.height} className={selectedId === node.id ? 'is-selected' : ''} />)}
        <rect className="canvas-minimap__viewport" {...view} />
      </svg>{!nodes.length && <span>暂无节点</span>}</div>}
      <button type="button" title="资产管理" aria-label="资产管理" aria-expanded={assetsOpen} aria-controls="canvas-assets" onClick={onAssets}><PanelLeft size={16} /><span className="canvas-tools__asset-label">资产管理</span></button>
      <button type="button" title="整理画布" aria-label="整理画布" disabled={!ready || !nodes.length} onClick={onArrange}><LayoutGrid size={16} /></button>
      <button type="button" title="画布小地图" aria-label="画布小地图" aria-pressed={mapOpen} disabled={!ready} onClick={() => setMapOpen(!mapOpen)}><Map size={16} /></button>
      <button type="button" title={edgesHidden ? '显示连线' : '隐藏连线'} aria-label={edgesHidden ? '显示连线' : '隐藏连线'} aria-pressed={edgesHidden} disabled={!ready} onClick={onEdges}><Waypoints size={16} /></button>
      <button type="button" title="选择模式：左键框选或移动节点" aria-label="选择模式" aria-pressed={interactionMode === 'select'} disabled={!ready} onClick={() => onInteractionMode('select')}><MousePointer2 size={16} /></button>
      <button type="button" title="抓手模式：左键拖动画布（空格可临时切换）" aria-label="抓手模式" aria-pressed={interactionMode === 'hand'} disabled={!ready} onClick={() => onInteractionMode('hand')}><Hand size={16} /></button>
      <button type="button" title="缩小" aria-label="缩小" disabled={!ready || viewport.zoom <= .1} onClick={() => zoom(-.1)}><Minus size={16} /></button>
      <span className="infinite-canvas-zoom" aria-live="polite">{Math.round(viewport.zoom * 100)}%</span>
      <button type="button" title="放大" aria-label="放大" disabled={!ready || viewport.zoom >= 2.2} onClick={() => zoom(.1)}><Plus size={16} /></button>
      <button type="button" title="复位视口：适应全部内容" aria-label="复位视口" disabled={!ready} onClick={() => onViewport(fitCanvasViewport(nodes, size, DEFAULT_CANVAS_VIEWPORT.zoom))}><RotateCcw size={15} /></button>
    </div>
  </>
}
