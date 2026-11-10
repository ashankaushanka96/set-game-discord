import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';

const TYPES = {
  success: { label: 'Success', icon: '✓', tone: 'success' },
  reconnect: { label: 'Back at the table', icon: '↻', tone: 'success' },
  disconnect: { label: 'Connection lost', icon: '!', tone: 'error' },
  error: { label: 'Something went wrong', icon: '!', tone: 'error' },
  vote: { label: 'Table vote', icon: '◇', tone: 'vote' },
  info: { label: 'Table update', icon: 'i', tone: 'info' },
};

export default function Toast() {
  const toast = useStore(state => state.toast);
  const [closingToast, setClosingToast] = useState(null);
  const exitTimer = useRef(null);
  const toastRef = useRef(null);
  const dismiss = useCallback(() => {
    setClosingToast(toast);
    clearTimeout(exitTimer.current);
    exitTimer.current = setTimeout(() => {
      // An outgoing notification must never clear a newer one.
      if (useStore.getState().toast === toast) useStore.getState().clearToast();
    }, 200);
  }, [toast]);

  useEffect(() => {
    if (!toast) return;
    const handleOutsidePointer = event => {
      if (toastRef.current && !event.composedPath().includes(toastRef.current)) dismiss();
    };
    // Capture also handles game controls that stop event propagation. Do not
    // prevent the event: the user's intended game action must still run.
    document.addEventListener('pointerdown', handleOutsidePointer, { capture: true, passive: true });
    return () => document.removeEventListener('pointerdown', handleOutsidePointer, true);
  }, [toast, dismiss]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setClosingToast(toast);
      exitTimer.current = setTimeout(() => {
        if (useStore.getState().toast === toast) useStore.getState().clearToast();
      }, 200);
    }, ['error', 'disconnect', 'vote'].includes(toast.type) ? 6000 : 3500);
    return () => { clearTimeout(timer); clearTimeout(exitTimer.current); };
  }, [toast]);

  if (!toast) return null;
  const variant = TYPES[toast.type] || TYPES.info;
  return <aside ref={toastRef} className={`club-toast club-toast--${variant.tone} ${closingToast === toast ? 'club-toast--closing' : ''}`}
    aria-label="Game notification">
    <div className="club-toast__body" role={variant.tone === 'error' ? 'alert' : 'status'} aria-atomic="true">
      <span className="club-toast__icon" aria-hidden="true">{variant.icon}</span>
      <div className="club-toast__copy">
        <h4>{toast.title || variant.label}</h4><p>{toast.message}</p>
      </div>
    </div>
    <button type="button" className="club-toast__close" aria-label="Dismiss notification" onClick={dismiss}>×</button>
  </aside>;
}
