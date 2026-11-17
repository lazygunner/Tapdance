// Ported from NiegeIP infinite-canvas.
import { Keyboard, Undo2, Redo2 } from 'lucide-react'
import { editorShortcuts, isMacKeyboard } from '../editor/shortcuts.ts'
export function CanvasShortcutPanel({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}) {
  const modifier = isMacKeyboard() ? '⌘' : 'Ctrl'
  return (
    <div className="infinite-canvas-hint canvas-shortcuts">
      <button
        type="button"
        aria-label="撤销"
        title={`${modifier} + Z`}
        disabled={!canUndo}
        onClick={onUndo}
      >
        <Undo2 size={15} />
      </button>
      <button
        type="button"
        aria-label="重做"
        title={`${modifier} + Shift + Z`}
        disabled={!canRedo}
        onClick={onRedo}
      >
        <Redo2 size={15} />
      </button>
      <span className="canvas-shortcuts__summary">
        空格拖动 · Shift 增选 · {modifier} + Z 撤销
      </span>
      <details
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            event.currentTarget.open = false
            event.currentTarget.querySelector('summary')?.focus()
          }
        }}
      >
        <summary>
          <Keyboard size={15} />
          快捷键
        </summary>
        <div className="canvas-shortcuts__panel" aria-label="画布快捷键">
          {['编辑', '选择'].map((section) => (
            <section key={section}>
              <strong>{section}</strong>
              {editorShortcuts
                .filter((item) => item.section === section)
                .map((item) => (
                  <p key={item.id}>
                    <span>{item.label}</span>
                    <kbd>{item.keys.replace('Mod', modifier)}</kbd>
                  </p>
                ))}
              {section === '编辑' && (
                <>
                  <p>
                    <span>复制 / 粘贴节点</span>
                    <kbd>{modifier} + C / V</kbd>
                  </p>
                  {!isMacKeyboard() && (
                    <p>
                      <span>重做（备用）</span>
                      <kbd>Ctrl + Y</kbd>
                    </p>
                  )}
                  <p>
                    <span>粘贴图片 / 视频</span>
                    <kbd>{modifier} + V</kbd>
                  </p>
                </>
              )}
              {section === '选择' && (
                <>
                  <p>
                    <span>框选</span>
                    <kbd>选择模式左键拖动</kbd>
                  </p>
                  <p>
                    <span>增减选择</span>
                    <kbd>Shift + 点击</kbd>
                  </p>
                </>
              )}
            </section>
          ))}
          <section>
            <strong>视图</strong>
            <p>
              <span>平移</span>
              <kbd>抓手 / 空格 / 中键拖动</kbd>
            </p>
            <p>
              <span>平移</span>
              <kbd>滚轮</kbd>
            </p>
            <p>
              <span>缩放</span>
              <kbd>{modifier} + 滚轮</kbd>
            </p>
            <p>
              <span>移动时关闭吸附</span>
              <kbd>Alt + 拖动</kbd>
            </p>
          </section>
          <small>
            仅画布编辑区域生效；输入框保留文字操作。撤销不会取消生成任务。
          </small>
        </div>
      </details>
    </div>
  )
}
