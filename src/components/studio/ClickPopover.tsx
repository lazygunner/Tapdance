import { useEffect, useRef, useState, type ReactNode } from 'react';

type ClickPopoverProps = {
  trigger: ReactNode;
  content: ReactNode;
  ariaLabel: string;
  align?: 'left' | 'right';
  className?: string;
  buttonClassName?: string;
  panelClassName?: string;
};

export function ClickPopover({
  trigger,
  content,
  ariaLabel,
  align = 'right',
  className,
  buttonClassName,
  panelClassName,
}: ClickPopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || typeof window === 'undefined') {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (rootRef.current?.contains(target)) {
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

  return (
    <div ref={rootRef} className={['relative inline-block', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
        className={buttonClassName}
      >
        {trigger}
      </button>
      {open ? (
        <div
          className={[
            'absolute top-[calc(100%+8px)] z-30',
            align === 'left' ? 'left-0' : 'right-0',
            panelClassName,
          ].filter(Boolean).join(' ')}
        >
          {content}
        </div>
      ) : null}
    </div>
  );
}
