import { useEffect, useId, useRef, type ReactNode } from 'react';
import { StudioModal } from '../../../components/studio/StudioPrimitives.tsx';

/** Canvas variant of the canonical Studio modal: scoped focus trap and editor isolation. */
export function CanvasModal({ open, onClose, children, className, themeMode }: {
  open: boolean; onClose: () => void; children: ReactNode; className?: string; themeMode?: 'light' | 'dark';
}) {
  const content = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open || !content.current) return;
    const previous = document.activeElement;
    const dialog = content.current.closest('[role="dialog"]');
    const heading = content.current.querySelector('h2,h3');
    if (heading) { heading.id = id; dialog?.setAttribute('aria-labelledby', id); }
    else dialog?.setAttribute('aria-label', '画布设置');
    const root = document.getElementById('root');
    const wasInert = root?.inert;
    if (root) root.inert = true;
    const controls = () => Array.from<HTMLElement>(content.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"]') || []).filter((element) => element.getClientRects().length > 0);
    controls()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const list = controls();
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (event.shiftKey && (document.activeElement === first || !content.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !content.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown, true);
    return () => { document.removeEventListener('keydown', keydown, true); if (root) root.inert = Boolean(wasInert); if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, [open, id]);
  return <StudioModal open={open} onClose={onClose} className={className} themeMode={themeMode}><div ref={content}>{children}</div></StudioModal>;
}
