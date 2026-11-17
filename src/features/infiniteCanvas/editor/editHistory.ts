// Ported from NiegeIP editor.
/** Apply only the fields changed by an edit, preserving unrelated asynchronous updates. */
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b)
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const identified = (
  value: unknown,
): value is Array<Record<string, unknown> & { id: string }> =>
  Array.isArray(value) &&
  value.every((item) => object(item) && typeof item.id === 'string')

const runningTask = (value: Record<string, unknown>) =>
  value.status === 'generating'
const taskFields = new Set([
  'taskId', 'pendingTask', 'status', 'error', 'inputSignature', 'materialId', 'mediaUrl',
  'mimeType', 'mediaWidth', 'mediaHeight', 'mediaDimensionsSource',
  'mediaResultId', 'mediaResultTaskId', 'durationMs',
  'upscaleInputMaterialId', 'upscaleRequestKey', 'upscaleRequestInputMaterialId',
  'upscaleRequestResolution', 'upscaleRequestScale', 'upscaleRequestTargetFps',
  'upscaleRequestMock',
])

export function replayEdit(
  current: unknown,
  from: unknown,
  to: unknown,
): unknown {
  if (equal(from, to)) return current
  if (identified(from) && identified(to) && identified(current)) {
    const before = new Map(from.map((item) => [item.id, item]))
    const after = new Map(to.map((item) => [item.id, item]))
    const result = current.flatMap((item) => {
      const previous = before.get(item.id)
      const next = after.get(item.id)
      if (!previous) return [item]
      // Never undo creation of a node that has since started a generation task.
      if (!next)
        return item.taskId !== previous.taskId || item.mediaUrl !== previous.mediaUrl ||
          runningTask(item) ||
          (typeof item.content === 'string' && item.content.trim() !== '' && item.content !== previous.content)
          ? [item]
          : []
      return [replayEdit(item, previous, next) as typeof item]
    })
    for (const item of to) {
      if (before.has(item.id) || result.some((entry) => entry.id === item.id))
        continue
      const nextId = to
        .slice(to.indexOf(item) + 1)
        .find((entry) => result.some((value) => value.id === entry.id))?.id
      const index = result.findIndex((entry) => entry.id === nextId)
      result.splice(index < 0 ? result.length : index, 0, item)
    }
    return result
  }
  if (object(from) && object(to) && object(current)) {
    const result = { ...current }
    // Grouped edits can span asynchronous task submission/polling. These
    // fields belong to the live task, even when they match the edit snapshot.
    const canvasNode = typeof current.id === 'string' && ['image', 'video', 'text', 'audio'].includes(String(current.type))
    const preserveTask = canvasNode &&
      (runningTask(current) || current.taskId !== undefined)
    for (const key of new Set([...Object.keys(from), ...Object.keys(to)])) {
      if (equal(from[key], to[key]) || (preserveTask && taskFields.has(key))) continue
      const value = replayEdit(current[key], from[key], to[key])
      if (value === undefined) delete result[key]
      else result[key] = value
    }
    return result
  }
  return equal(current, from) ? to : current
}

export interface EditEntry<T> {
  before: T
  after: T
  group?: string
}
export interface EditState<T> {
  value: T
  past: EditEntry<T>[]
  future: EditEntry<T>[]
}
export type EditAction<T> =
  | { type: 'system' | 'edit'; update: T | ((current: T) => T); group?: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset' }
export function reduceEdits<T>(
  state: EditState<T>,
  action: EditAction<T>,
): EditState<T> {
  if (action.type === 'reset') return { ...state, past: [], future: [] }
  if (action.type === 'undo' || action.type === 'redo') {
    const undo = action.type === 'undo'
    const stack = undo ? state.past : state.future
    const entry = stack.at(-1)
    if (!entry) return state
    const value = replayEdit(
      state.value,
      undo ? entry.after : entry.before,
      undo ? entry.before : entry.after,
    ) as T
    // Store the effective change, so redo cannot erase newly arrived server data.
    const effective = undo
      ? { before: value, after: state.value }
      : { before: state.value, after: value }
    return {
      value,
      past: undo ? state.past.slice(0, -1) : [...state.past, effective],
      future: undo ? [...state.future, effective] : state.future.slice(0, -1),
    }
  }
  const value =
    typeof action.update === 'function'
      ? (action.update as (current: T) => T)(state.value)
      : action.update
  if (value === state.value || equal(value, state.value)) return state
  if (action.type === 'system') return { ...state, value }
  const previous = state.past.at(-1)
  const merged =
    action.group && previous?.group === action.group && !state.future.length
  const entry = {
    before: merged && previous ? previous.before : state.value,
    // A grouped drag may span a system result. Merge only the user's delta,
    // otherwise undo would accidentally include that asynchronous result.
    after: merged && previous ? replayEdit(previous.after, state.value, value) as T : value,
    group: action.group,
  }
  return {
    value,
    past: [
      ...(merged ? state.past.slice(0, -1) : state.past).slice(-99),
      entry,
    ],
    future: [],
  }
}
