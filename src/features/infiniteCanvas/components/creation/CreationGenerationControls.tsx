// Ported from NiegeIP production studio; Tapdance adapters only.
import { Check, Sparkles, WandSparkles } from 'lucide-react'
import { CreationParameterPanel } from './CreationParameterPanel.tsx'
import { CreationDropdown, type CreationDropdownOption } from './CreationDropdown.tsx'

export interface CreationGenerationControlsProps {
  draftAvailable?: boolean
  draft?: boolean
  onDraftChange?: (value: boolean) => void
  presentation?: 'compact' | 'studio-home'
  imageQualityPrices?: Record<string, number>
  imageQuality?: string
  onImageQualityChange?: (value: string) => void
  className?: string
  mode: 'image' | 'video'
  modelOptions: readonly CreationDropdownOption[]
  modelValue: string
  modelPlaceholder?: string
  onModelChange: (value: string) => void
  resolutionOptions: readonly CreationDropdownOption[]
  resolutionValue: string
  onResolutionChange: (value: string) => void
  ratioOptions: readonly CreationDropdownOption[]
  ratioValue: string
  onRatioChange: (value: string) => void
  countOptions?: readonly CreationDropdownOption[]
  countValue?: string
  onCountChange?: (value: string) => void
  durationOptions?: readonly CreationDropdownOption[]
  durationValue?: string
  onDurationChange?: (value: string) => void
  outputFormatOptions?: readonly CreationDropdownOption[]
  outputFormatValue?: string
  onOutputFormatChange?: (value: string) => void
  generateAudio?: boolean
  supportsGenerateAudio?: boolean
  onGenerateAudioChange?: (value: boolean) => void
  onOptimizePrompt?: () => void
}

export function CreationGenerationControls({
  draftAvailable = false, draft = false, onDraftChange,
  presentation = 'compact',
  imageQualityPrices, imageQuality = 'medium', onImageQualityChange,
  className = '',
  mode,
  modelOptions,
  modelValue,
  modelPlaceholder,
  onModelChange,
  resolutionOptions,
  resolutionValue,
  onResolutionChange,
  ratioOptions,
  ratioValue,
  onRatioChange,
  countOptions = [],
  countValue = '1',
  onCountChange,
  durationOptions = [],
  durationValue = '',
  onDurationChange,
  outputFormatOptions = [],
  outputFormatValue = '',
  onOutputFormatChange,
  generateAudio = false,
  supportsGenerateAudio = true,
  onGenerateAudioChange,
  onOptimizePrompt,
}: CreationGenerationControlsProps) {
  const parameterPanel = <CreationParameterPanel
      mode={mode} ratioOptions={ratioOptions} ratioValue={ratioValue} onRatioChange={onRatioChange}
      resolutionOptions={resolutionOptions} resolutionValue={resolutionValue} onResolutionChange={onResolutionChange}
      durationOptions={durationOptions} durationValue={durationValue} onDurationChange={onDurationChange}
      countOptions={countOptions} countValue={countValue} onCountChange={onCountChange}
      outputFormatOptions={outputFormatOptions} outputFormatValue={outputFormatValue} onOutputFormatChange={onOutputFormatChange}
      generateAudio={generateAudio} supportsGenerateAudio={supportsGenerateAudio} onGenerateAudioChange={onGenerateAudioChange}
    />
  return <div className={`creation-director__toolbar creation-generation-controls ${className}`.trim()}>
    {onOptimizePrompt && <button aria-label="优化提示词" onClick={onOptimizePrompt} type="button"><WandSparkles />{presentation === 'studio-home' && <span className="studio-control-label">提示词优化</span>}</button>}
    <CreationDropdown ariaLabel="选择生成模型" className="creation-param-select--model" icon={<Sparkles />} onChange={onModelChange} options={modelOptions} placeholder={modelPlaceholder} value={modelValue} />
    {mode === 'image' && imageQualityPrices && onImageQualityChange && <CreationDropdown ariaLabel="选择图片画质" value={imageQuality} onChange={onImageQualityChange} options={Object.keys(imageQualityPrices).map((value) => ({ value, label: value === 'high' ? '精细' : '标准' }))} />}
    {presentation === 'studio-home' && mode === 'image' && <div className="studio-expanded-parameters">
      <CreationDropdown ariaLabel="选择图片比例" options={ratioOptions} value={ratioValue} onChange={onRatioChange} />
      <CreationDropdown ariaLabel="选择图片清晰度" options={resolutionOptions} value={resolutionValue} onChange={onResolutionChange} />
      {onCountChange && <CreationDropdown ariaLabel="选择生成数量" options={countOptions} value={countValue} onChange={onCountChange} />}
    </div>}
    {mode === 'video' && draftAvailable && <button className="video-draft-toggle" type="button" aria-pressed={draft} title="低成本快速预览效果，满意后可继续生成高清视频" onClick={() => onDraftChange?.(!draft)}>{draft && <Check size={14} />}样片速览</button>}
    {presentation === 'studio-home' && mode === 'image' ? <div className="studio-compact-parameters">{parameterPanel}</div> : parameterPanel}
  </div>
}
