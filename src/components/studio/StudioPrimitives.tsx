import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type HTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

type ClassValue = string | false | null | undefined;

export function cx(...values: ClassValue[]) {
  return values.filter(Boolean).join(' ');
}

function resolveDocumentThemeMode(): 'light' | 'dark' {
  if (typeof document === 'undefined') {
    return 'dark';
  }

  return document.body.classList.contains('theme-light') || document.documentElement.classList.contains('theme-light')
    ? 'light'
    : 'dark';
}

type StudioPageProps = {
  children: ReactNode;
  className?: string;
};

export function StudioPage({ children, className }: StudioPageProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
      className={cx('studio-page', className)}
    >
      {children}
    </motion.div>
  );
}

type StudioPageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function StudioPageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: StudioPageHeaderProps) {
  return (
    <div className={cx('studio-page-header', className)}>
      <div className="max-w-4xl">
        {eyebrow ? <p className="studio-eyebrow">{eyebrow}</p> : null}
        <h1 className="studio-page-title">{title}</h1>
        {description ? <div className="studio-page-description">{description}</div> : null}
      </div>
      {actions ? <div className="flex items-start gap-3 flex-wrap">{actions}</div> : null}
    </div>
  );
}

type StudioPanelProps = HTMLAttributes<HTMLDivElement> & {
  tone?: 'default' | 'soft' | 'contrast';
};

export function StudioPanel({ children, className, tone = 'default', ...props }: StudioPanelProps) {
  return (
    <div
      className={cx(
        'studio-panel',
        tone === 'soft' && 'studio-panel-soft',
        tone === 'contrast' && 'studio-panel-contrast',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

type StudioModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  closeOnOverlayClick?: boolean;
  themeMode?: 'light' | 'dark';
};

export function StudioModal({
  open,
  onClose,
  children,
  className,
  closeOnOverlayClick = true,
  themeMode,
}: StudioModalProps) {
  const resolvedThemeMode = themeMode ?? resolveDocumentThemeMode();

  useEffect(() => {
    if (!open || typeof document === 'undefined') {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open || typeof window === 'undefined') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className={`theme-${resolvedThemeMode}`}>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="studio-modal-overlay"
            onClick={() => {
              if (closeOnOverlayClick) {
                onClose();
              }
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className={cx('studio-modal-panel', className)}
              onClick={(event) => event.stopPropagation()}
            >
              {children}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

type StudioSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  children: ReactNode;
  displayValue?: ReactNode;
};

type ParsedSelectOption = {
  value: string;
  label: ReactNode;
  disabled: boolean;
  key: string;
};

function extractSelectOptions(children: ReactNode) {
  const options: ParsedSelectOption[] = [];
  let index = 0;

  const visit = (nodes: ReactNode) => {
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child)) {
        return;
      }

      if (child.type === Fragment) {
        visit(child.props.children);
        return;
      }

      if (child.type === 'option') {
        const props = child.props as { value?: string | number; disabled?: boolean; children?: ReactNode };
        const fallbackValue = typeof props.children === 'string' ? props.children : `${index}`;
        const value = props.value !== undefined ? String(props.value) : fallbackValue;
        options.push({
          value,
          label: props.children ?? value,
          disabled: Boolean(props.disabled),
          key: `${value}-${index}`,
        });
        index += 1;
        return;
      }

      if ('props' in child && child.props?.children) {
        visit(child.props.children);
      }
    });
  };

  visit(children);
  return options;
}

export function StudioSelect({
  children,
  className,
  value,
  defaultValue,
  onChange,
  disabled,
  name,
  id,
  required,
  title,
  autoFocus,
  displayValue,
}: StudioSelectProps) {
  const options = useMemo(() => extractSelectOptions(children), [children]);
  const isControlled = value !== undefined;
  const fallbackValue = options.find((option) => !option.disabled)?.value || options[0]?.value || '';
  const [internalValue, setInternalValue] = useState(() => {
    if (defaultValue !== undefined) {
      return String(defaultValue);
    }
    return fallbackValue;
  });
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 0,
  });
  const [portalThemeMode, setPortalThemeMode] = useState<'light' | 'dark'>('dark');
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const selectedValue = isControlled ? String(value ?? '') : internalValue;
  const selectedOption = options.find((option) => option.value === selectedValue) || options[0];

  const resolvePortalThemeMode = () => {
    if (buttonRef.current?.closest('.theme-light')) {
      return 'light';
    }
    if (buttonRef.current?.closest('.theme-dark')) {
      return 'dark';
    }
    return resolveDocumentThemeMode();
  };

  useEffect(() => {
    if (isControlled) {
      return;
    }

    if (!options.some((option) => option.value === internalValue)) {
      setInternalValue(defaultValue !== undefined ? String(defaultValue) : fallbackValue);
    }
  }, [defaultValue, fallbackValue, internalValue, isControlled, options]);

  useLayoutEffect(() => {
    if (!open || typeof window === 'undefined') {
      return;
    }

    const updatePosition = () => {
      const buttonRect = buttonRef.current?.getBoundingClientRect();
      const panelHeight = panelRef.current?.offsetHeight || 0;
      if (!buttonRect) {
        return;
      }

      const viewportPadding = 12;
      const width = Math.min(buttonRect.width, window.innerWidth - viewportPadding * 2);
      let left = Math.min(buttonRect.left, window.innerWidth - width - viewportPadding);
      left = Math.max(viewportPadding, left);
      let top = buttonRect.bottom + 8;
      if (panelHeight > 0 && top + panelHeight > window.innerHeight - viewportPadding) {
        const nextTop = buttonRect.top - panelHeight - 8;
        top = nextTop > viewportPadding ? nextTop : Math.max(viewportPadding, window.innerHeight - panelHeight - viewportPadding);
      }

      setPanelStyle({ top, left, width });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, options.length]);

  useLayoutEffect(() => {
    const nextThemeMode = resolvePortalThemeMode();
    setPortalThemeMode((prev) => (prev === nextThemeMode ? prev : nextThemeMode));
  });

  useEffect(() => {
    if (!open || typeof window === 'undefined') {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleSelect = (nextValue: string) => {
    if (!isControlled) {
      setInternalValue(nextValue);
    }
    setOpen(false);
    onChange?.({
      target: { value: nextValue, name } as EventTarget & HTMLSelectElement,
      currentTarget: { value: nextValue, name } as EventTarget & HTMLSelectElement,
    } as ChangeEvent<HTMLSelectElement>);
  };

  return (
    <>
      <button
        ref={buttonRef}
        id={id}
        title={title}
        autoFocus={autoFocus}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-open={open}
        className={cx('studio-select-trigger', className)}
        onClick={() => {
          if (!disabled) {
            setPortalThemeMode(resolvePortalThemeMode());
            setOpen((prev) => !prev);
          }
        }}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {displayValue ?? (selectedOption?.label || '\u00A0')}
        </span>
        <ChevronDown className="studio-select-caret h-4 w-4 shrink-0" />
      </button>
      {name ? <input type="hidden" name={name} value={selectedValue} required={required} /> : null}
      {typeof document !== 'undefined'
        ? createPortal(
          <div className={`theme-${portalThemeMode}`}>
            <AnimatePresence>
              {open ? (
                <motion.div
                  ref={panelRef}
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                  className="studio-select-panel"
                  style={{
                    position: 'fixed',
                    top: panelStyle.top,
                    left: panelStyle.left,
                    width: panelStyle.width,
                  }}
                >
                  <div className="studio-select-list" role="listbox" aria-labelledby={id}>
                    {options.map((option) => {
                      const isSelected = option.value === selectedValue;
                      return (
                        <button
                          key={option.key}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          disabled={option.disabled}
                          data-selected={isSelected}
                          className={cx('studio-select-option', isSelected && 'studio-select-option-selected')}
                          onClick={() => {
                            if (!option.disabled) {
                              handleSelect(option.value);
                            }
                          }}
                        >
                          <span className="min-w-0 flex-1 truncate text-left">{option.label}</span>
                          <Check className={cx('h-4 w-4 shrink-0 opacity-0 transition-opacity', isSelected && 'opacity-100')} />
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>,
          document.body,
        )
        : null}
    </>
  );
}

type StudioMetricCardProps = {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  className?: string;
  compact?: boolean;
};

export function StudioMetricCard({ label, value, detail, className, compact = false }: StudioMetricCardProps) {
  return (
    <StudioPanel className={cx(compact ? 'min-w-[9rem] px-4 py-3' : 'min-w-[10rem] px-4 py-4', className)} tone="soft">
      <div className={cx('uppercase tracking-[0.24em] text-[var(--studio-muted)]', compact ? 'text-[10px]' : 'text-[11px]')}>
        {label}
      </div>
      <div className={cx('font-semibold text-[var(--studio-text)]', compact ? 'mt-2 text-xl leading-none' : 'mt-3 text-2xl')}>
        {value}
      </div>
      {detail ? (
        <div className={cx('text-[var(--studio-dim)]', compact ? 'mt-1.5 text-[11px] leading-5' : 'mt-2 text-xs')}>
          {detail}
        </div>
      ) : null}
    </StudioPanel>
  );
}
