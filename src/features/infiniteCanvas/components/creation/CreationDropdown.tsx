import type { ReactNode } from 'react';
import { StudioSelect } from '../../../../components/studio/StudioPrimitives.tsx';
export type CreationDropdownOption = { value: string; label: string; icon?: ReactNode };
/** Preserve NiegeIP's control contract while using Tapdance's canonical select. */
export function CreationDropdown({ ariaLabel, className = '', icon, onChange, options, placeholder, value }: {
  ariaLabel: string; className?: string; icon?: ReactNode; onChange: (value: string) => void;
  options: readonly CreationDropdownOption[]; placeholder?: string; value: string;
}) {
  return <span className={`creation-param-select ${className}`}>
    {icon && <span className="creation-param-select__icon">{icon}</span>}
    <StudioSelect aria-label={ariaLabel} className="creation-param-select__trigger" value={value} disabled={!options.length} onChange={(event) => onChange(event.target.value)}>
      {!options.length && <option value="">{placeholder || '暂无可用模型'}</option>}
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </StudioSelect>
  </span>;
}
