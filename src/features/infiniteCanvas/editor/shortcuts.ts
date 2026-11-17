// Ported from NiegeIP editor.
export const editorShortcuts = [
  {
    id: 'undo',
    label: '撤销',
    key: 'z',
    modifier: true,
    shift: false,
    keys: 'Mod + Z',
    section: '编辑',
  },
  {
    id: 'redo',
    label: '重做',
    key: 'z',
    modifier: true,
    shift: true,
    keys: 'Mod + Shift + Z',
    section: '编辑',
  },
  {
    id: 'selectAll',
    label: '全选节点',
    key: 'a',
    modifier: true,
    shift: false,
    keys: 'Mod + A',
    section: '选择',
  },
  {
    id: 'duplicate',
    label: '创建副本',
    key: 'd',
    modifier: true,
    shift: false,
    keys: 'Mod + D',
    section: '编辑',
  },
  {
    id: 'group',
    label: '成组',
    key: 'g',
    modifier: true,
    shift: false,
    keys: 'Mod + G',
    section: '编辑',
  },
  {
    id: 'ungroup',
    label: '拆组',
    key: 'g',
    modifier: true,
    shift: true,
    keys: 'Mod + Shift + G',
    section: '编辑',
  },
  {
    id: 'delete',
    label: '删除（保留确认）',
    key: 'Delete',
    modifier: false,
    shift: false,
    keys: 'Delete / Backspace',
    section: '编辑',
  },
  {
    id: 'escape',
    label: '取消操作 / 清除选择',
    key: 'Escape',
    modifier: false,
    shift: false,
    keys: 'Esc',
    section: '选择',
  },
] as const
export function shortcutAction(
  event: Pick<
    KeyboardEvent,
    'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'
  >,
) {
  if (event.altKey) return undefined
  if (
    event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'y'
  )
    return 'redo'
  if (
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    event.key === 'Backspace'
  )
    return 'delete'
  return editorShortcuts.find(
    (item) =>
      item.key.toLowerCase() === event.key.toLowerCase() &&
      item.modifier === (event.ctrlKey || event.metaKey) &&
      item.shift === event.shiftKey,
  )?.id
}
export function editorOwnsEvent(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    !target.closest(
      'input,textarea,select,[contenteditable]:not([contenteditable="false"]),video,audio,[role="dialog"],[role="menu"],[role="listbox"]',
    ) &&
    !target.ownerDocument.querySelector('[role="dialog"][aria-modal="true"]')
  )
}
export const isMacKeyboard = () => /Mac|iPhone|iPad/.test(navigator.platform)
