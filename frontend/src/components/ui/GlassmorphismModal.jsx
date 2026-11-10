import { useEffect, useRef } from 'react';

const SIZES = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl', '2xl': 'max-w-2xl', '3xl': 'max-w-3xl', '4xl': 'max-w-4xl', full: 'max-w-full' };
export default function GlassmorphismModal({ isOpen, onClose, children, className = '', overlayClassName = '', onClickOutside = true, size = 'md' }) {
  const modalRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const panel = modalRef.current;
    const focusable = () => [...panel.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')].filter(el => el.getClientRects().length);
    panel.focus({ preventScroll:true });
    const resetScroll = requestAnimationFrame(() => {
      const content = panel.querySelector('.club-modal__content');
      if (content) content.scrollTop = 0;
    });
    const keydown = event => {
      if (event.key === 'Escape') closeRef.current?.();
      if (event.key === 'Tab') {
        const items = focusable();
        if (!items.length) { event.preventDefault(); panel.focus(); return; }
        if (event.shiftKey && (document.activeElement === items[0] || document.activeElement === panel)) { event.preventDefault(); items.at(-1).focus(); }
        else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { cancelAnimationFrame(resetScroll); document.removeEventListener('keydown', keydown); document.body.style.overflow = previousOverflow; previousFocus?.focus?.({ preventScroll:true }); };
  }, [isOpen]);
  if (!isOpen) return null;
  return <div className={`club-modal-backdrop fixed inset-0 z-[100] flex items-center justify-center p-4 ${overlayClassName}`} onClick={() => onClickOutside && onClose?.()}>
    <div ref={modalRef} role="dialog" aria-modal="true" aria-label="Game dialog" tabIndex={-1}
      className={`club-modal relative w-full ${SIZES[size] || SIZES.md} ${className}`} onClick={event => event.stopPropagation()}>
      <div className="club-modal__content">{children}</div>
    </div>
  </div>;
}
