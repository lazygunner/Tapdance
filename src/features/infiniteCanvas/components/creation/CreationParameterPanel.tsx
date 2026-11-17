// Ported from NiegeIP production studio; Tapdance adapters only.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, RectangleHorizontal, X } from 'lucide-react'
import type { CreationGenerationControlsProps } from './CreationGenerationControls.tsx'
import type { CreationDropdownOption } from './CreationDropdown.tsx'

type Props = Omit<CreationGenerationControlsProps, 'className' | 'modelOptions' | 'modelValue' | 'modelPlaceholder' | 'onModelChange' | 'onOptimizePrompt'>

function Choices({ title, options, value, onChange, ratios = false }: { title: string; options: readonly CreationDropdownOption[]; value: string; onChange: (value: string) => void; ratios?: boolean }) {
  if (!options.length) return null
  return <fieldset className={ratios ? 'creation-parameter-panel__ratios' : undefined}>
    <legend>{title}</legend>
    <div className="creation-parameter-panel__choices">
      {options.map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
        {ratios && <span className="creation-parameter-panel__ratio-icon">{option.icon ?? <RectangleHorizontal size={15} />}</span>}
        <span>{option.label}</span>
      </button>)}
    </div>
  </fieldset>
}

export function CreationParameterPanel(props: Props) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 8, bottom: 8, maxHeight: 400 })
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const id = useId()
  const { mode, ratioOptions, ratioValue, onRatioChange, resolutionOptions, resolutionValue, onResolutionChange, durationOptions = [], durationValue = '', countOptions = [], countValue = '1', outputFormatOptions = [], outputFormatValue = '' } = props
  const label = (options: readonly CreationDropdownOption[], value: string) => options.find((option) => option.value === value)?.label
  const summary = [label(ratioOptions, ratioValue), label(resolutionOptions, resolutionValue), mode === 'video' ? label(durationOptions, durationValue) : label(countOptions, countValue), mode === 'video' ? label(outputFormatOptions, outputFormatValue) : undefined].filter(Boolean).join(' · ')
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }) }

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(344, window.innerWidth - 16)
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), bottom: window.innerHeight - rect.top + 8, maxHeight: Math.max(100, rect.top - 16) })
    }
    place()
    const onScroll = (event: Event) => { if (!panel.current?.contains(event.target as Node)) place() }
    window.addEventListener('resize', place)
    document.addEventListener('scroll', onScroll, true)
    return () => { window.removeEventListener('resize', place); document.removeEventListener('scroll', onScroll, true) }
  }, [open])

  useEffect(() => {
    if (!open) return
    panel.current?.focus({ preventScroll: true })
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  return <>
    <button className="creation-parameter-summary" type="button" ref={trigger} aria-label="生成参数" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} title={summary} onClick={() => setOpen(!open)}>
      <RectangleHorizontal size={16} /><span>{summary || '设置参数'}</span><ChevronDown size={14} className={open ? 'is-open' : undefined} />
    </button>
    {open && createPortal(<div className={document.querySelector('.app-shell')?.classList.contains('theme-light') ? 'theme-light' : 'theme-dark'}><div id={id} ref={panel} className="creation-parameter-panel" role="dialog" aria-label="生成参数" tabIndex={-1} style={position} onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); close() }
      if (event.key === 'Tab') {
        const items = Array.from<HTMLElement>(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? [])
        const first = items[0], last = items[items.length - 1]
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first?.focus() }
      }
    }}>
      <header><span>生成参数</span><button type="button" aria-label="关闭生成参数" onClick={close}><X size={16} /></button></header>
      <Choices title="比例" ratios options={ratioOptions} value={ratioValue} onChange={onRatioChange} />
      <Choices title="清晰度" options={resolutionOptions} value={resolutionValue} onChange={onResolutionChange} />
      {mode === 'video' && durationOptions.length > 0 && <fieldset><legend>视频时长</legend><div className="creation-parameter-panel__duration">
        <input aria-label="视频时长" type="range" min={0} max={durationOptions.length - 1} step={1} value={Math.max(0, durationOptions.findIndex((option) => option.value === durationValue))} onChange={(event) => { const option = durationOptions[Number(event.target.value)]; if (option) props.onDurationChange?.(option.value) }} />
        <output>{label(durationOptions, durationValue)}</output>
      </div></fieldset>}
      {mode === 'image' && <Choices title="生成数量" options={countOptions} value={countValue} onChange={(value) => props.onCountChange?.(value)} />}
      {mode === 'video' && <Choices title="输出格式" options={outputFormatOptions} value={outputFormatValue} onChange={(value) => props.onOutputFormatChange?.(value)} />}
      {mode === 'video' && props.supportsGenerateAudio !== false && <label className="creation-parameter-panel__audio"><span>生成音频</span><input type="checkbox" checked={props.generateAudio ?? false} onChange={(event) => props.onGenerateAudioChange?.(event.target.checked)} /></label>}
    </div></div>, document.body)}
  </>
}
