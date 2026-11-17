// Ported from NiegeIP editor.
import { useCallback, useReducer, useRef } from 'react'
import { reduceEdits, type EditState } from './editHistory.ts'
export function useEditHistory<T>(initial: () => T) {
  const [state, dispatch] = useReducer(
    reduceEdits<T>,
    undefined,
    (): EditState<T> => ({ value: initial(), past: [], future: [] }),
  )
  const group = useRef<string | undefined>(undefined)
  const set = useCallback(
    (update: T | ((current: T) => T)) => dispatch({ type: 'system', update }),
    [],
  )
  const sequence = useRef(0)
  const edit = useCallback((update: T | ((current: T) => T)) => {
    if (!group.current) {
      const key = `event:${++sequence.current}`
      group.current = key
      queueMicrotask(() => {
        if (group.current === key) group.current = undefined
      })
    }
    dispatch({ type: 'edit', update, group: group.current })
  }, [])
  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [])
  const reset = useCallback(() => dispatch({ type: 'reset' }), [])
  const beginGroup = useCallback((key: string) => {
    group.current = `${key}:${++sequence.current}`
  }, [])
  const endGroup = useCallback(() => {
    group.current = undefined
  }, [])
  return {
    value: state.value,
    set,
    edit,
    undo,
    redo,
    reset,
    beginGroup,
    endGroup,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }
}
