import { useRef, useState, type PointerEvent } from 'react';
import { AudioLines, Copy, Download, FileText, FolderOpen, Image, LoaderCircle, Maximize2, Plus, Trash2, Upload, Video, WandSparkles } from 'lucide-react';
import type { CanvasNode, CanvasNodeType } from '../types.ts';

const icons = { text: FileText, image: Image, video: Video, audio: AudioLines };
const labels = { text: '文字', image: '图片', video: '视频', audio: '音频' };

type Props = {
  key?: string;
  node: CanvasNode;
  selected: boolean;
  connecting: boolean;
  onSelect: (additive: boolean) => void;
  onDrag: (event: PointerEvent) => void;
  onChange: (patch: Partial<CanvasNode>) => void;
  onDimensions: (width: number, height: number) => void;
  onConnect: (event: PointerEvent) => void;
  onKeyboardConnect: () => void;
  onFinishConnection: () => void;
  onAddConnected: (type: CanvasNodeType, direction: 'upstream' | 'downstream') => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onUpload: () => void;
  onMaterials: () => void;
  onGenerate: () => void;
  onPreview: () => void;
  onDownload: () => void;
  onSave: () => void;
};

/** NiegeIP's compact media card, with Tapdance callbacks replacing cloud materials/tasks. */
export function CanvasNodeCard({ node, selected, connecting, onSelect, onDrag, onChange, onDimensions, onConnect, onKeyboardConnect, onFinishConnection, onAddConnected, onDuplicate, onDelete, onUpload, onMaterials, onGenerate, onPreview, onDownload, onSave }: Props) {
  const Icon = icons[node.type];
  const [failedUrl, setFailedUrl] = useState<string>();
  const [addMenu, setAddMenu] = useState<'upstream' | 'downstream'>();
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const hasMedia = Boolean(node.mediaUrl);
  return <article
    className={`canvas-node ${selected ? 'is-selected' : ''} ${node.status === 'generating' ? 'is-generating' : ''}`}
    data-canvas-node-id={node.id}
    data-canvas-input-node-id={node.id}
    data-selected={selected}
    aria-label={`${labels[node.type]}节点：${node.title}`}
    tabIndex={0}
    style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
    onPointerDownCapture={(event) => { pressOrigin.current = { x: event.clientX, y: event.clientY }; }}
    onPointerDown={(event) => { pressOrigin.current = { x: event.clientX, y: event.clientY }; onDrag(event); }}
    onClick={(event) => {
      event.stopPropagation();
      if (!event.shiftKey && !(event.target as Element).closest('button') && (!pressOrigin.current || Math.hypot(event.clientX - pressOrigin.current.x, event.clientY - pressOrigin.current.y) < 4)) onSelect(false);
      pressOrigin.current = null;
    }}
    onFocus={(event) => { if (event.target === event.currentTarget) onSelect(false); }}
    onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect(event.shiftKey); } }}
  >
    <header className="canvas-node__header">
      <Icon size={14} aria-hidden="true" />
      <input aria-label="节点名称" value={node.title} onChange={(event) => onChange({ title: event.target.value })} onPointerDown={(event) => event.stopPropagation()} />
      <button type="button" aria-label="创建副本" title="创建副本" onPointerDown={(event) => event.stopPropagation()} onClick={onDuplicate}><Copy size={13} /></button>
      <button type="button" aria-label="删除节点" title="删除节点" onPointerDown={(event) => event.stopPropagation()} onClick={onDelete}><Trash2 size={13} /></button>
    </header>
    <div className="canvas-node__body" onPointerDown={(event) => { if ((event.target as HTMLElement).closest('button,input,textarea,audio,video')) event.stopPropagation(); }}>
      {node.type === 'text' ? <textarea className="resize-none" aria-label="文字内容" placeholder="输入创作提示词或叙事内容…" value={node.content} onChange={(event) => onChange({ content: event.target.value })} /> : <div className="canvas-node__media">
        {!hasMedia ? <div className="canvas-node__empty"><Icon size={28} /><span>添加{labels[node.type]}素材</span><div><button type="button" disabled={node.status === 'generating'} onClick={onUpload}><Upload size={14} />上传</button>{node.type !== 'audio' && <button type="button" disabled={node.status === 'generating'} onClick={onMaterials}><FolderOpen size={14} />素材选择</button>}</div></div> : <>
          {node.type === 'image' && <img src={node.mediaUrl} alt={node.title} draggable={false} onDoubleClick={onPreview} onLoad={(event) => onDimensions(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)} onError={() => setFailedUrl(node.mediaUrl)} />}
          {node.type === 'video' && <video src={node.mediaUrl} controls playsInline preload="metadata" onLoadedMetadata={(event) => onDimensions(event.currentTarget.videoWidth, event.currentTarget.videoHeight)} onError={() => setFailedUrl(node.mediaUrl)} />}
          {node.type === 'audio' && <audio src={node.mediaUrl} controls preload="metadata" onError={() => setFailedUrl(node.mediaUrl)} />}
          {failedUrl === node.mediaUrl && <div className="canvas-node__media-error" role="status">素材加载失败，请重新上传或选择素材。<button type="button" disabled={node.status === 'generating'} onClick={onUpload}>重新上传</button></div>}
        </>}
        {node.status === 'generating' && <div className="canvas-node__progress" role="status"><LoaderCircle size={24} className="animate-spin" /><span>正在生成…</span></div>}
      </div>}
      {node.error && <p className="canvas-node__error" role="status">{node.error}</p>}
    </div>
    {selected && <div className="canvas-node__actions" onPointerDown={(event) => event.stopPropagation()}>
      {node.type !== 'audio' && <button type="button" disabled={node.status === 'generating'} onClick={onGenerate}><WandSparkles size={14} />{node.status === 'generating' ? '生成中…' : node.pendingTask ? '继续查询' : node.type === 'text' ? '生成文字' : '创作'}</button>}
      {hasMedia && <>{node.type !== 'audio' && <button type="button" title="保存到资产库" aria-label="保存到资产库" onClick={onSave}><FolderOpen size={14} /></button>}<button type="button" title="预览素材" aria-label="预览素材" onClick={onPreview}><Maximize2 size={14} /></button><button type="button" title="下载素材" aria-label="下载素材" onClick={onDownload}><Download size={14} /></button><button type="button" title="替换素材" aria-label="替换素材" disabled={node.status === 'generating'} onClick={onUpload}><Upload size={14} /></button></>}
    </div>}
    <button type="button" data-canvas-input-node-id={node.id} className="canvas-node__handle canvas-node__handle--input" aria-label="输入连接手柄" title="输入连接手柄" onPointerDown={(event) => event.stopPropagation()} onClick={onFinishConnection} />
    <button type="button" className={`canvas-node__handle canvas-node__handle--output ${connecting ? 'is-connecting' : ''}`} aria-label="输出连接手柄" title="拖动连接下游节点" onPointerDown={onConnect} onClick={(event) => { if (event.detail === 0) onKeyboardConnect(); }} />
    {(['upstream', 'downstream'] as const).map((direction) => <div key={direction} className={`canvas-node__add canvas-node__add--${direction}`} onPointerDown={(event) => event.stopPropagation()}>
      <button type="button" aria-label={direction === 'upstream' ? '添加上游节点' : '添加下游节点'} aria-expanded={addMenu === direction} onClick={() => setAddMenu(addMenu === direction ? undefined : direction)}><Plus size={15} /></button>
      {addMenu === direction && <div className="canvas-node__add-menu" onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setAddMenu(undefined); } }}>{(['image', 'video', 'audio', 'text'] as const).map((type) => <button key={type} type="button" onClick={() => { onAddConnected(type, direction); setAddMenu(undefined); }}>{labels[type]}</button>)}</div>}
    </div>)}
  </article>;
}
