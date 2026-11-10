import { useEffect, useRef, useState } from 'react';
import { nearestPlayerAt } from './cardDropTarget';
import { cardGestureMode } from './cardGesture';

export default function useCardDrag({ enabled, cards, selectedCards, resolveTarget, onStart, onHover, onEnd, onDrop }) {
  const gesture = useRef(null);
  const previewRef = useRef(null);
  const frame = useRef(null);
  const latestPoint = useRef(null);
  const hovered = useRef(null);
  const suppressClickUntil = useRef(0);
  const [preview, setPreview] = useState(null);
  const release = current => {
    if (current?.element.hasPointerCapture(current.pointerId)) current.element.releasePointerCapture(current.pointerId);
  };
  const finish = (event, cancelled = false) => {
    const current = gesture.current;
    if (!current || (event?.pointerId != null && event.pointerId !== current.pointerId)) return;
    gesture.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = null;
    hovered.current = null;
    release(current);
    if (current.scrolling) suppressClickUntil.current = Date.now() + 500;
    if (!current.active) return;
    suppressClickUntil.current = Date.now() + 500;
    setPreview(null);
    onEnd?.();
    if (!cancelled) {
      const target = findTarget(event.clientX, event.clientY);
      if (target) onDrop?.(current.cards, target.id);
    }
  };
  const findTarget = (x, y) => {
    const seats = [...document.querySelectorAll('[data-player-id]')].map(wrapper => ({
      id: wrapper.getAttribute('data-player-id'),
      rect: (wrapper.querySelector('.game-seat') || wrapper).getBoundingClientRect(),
    }));
    const id = nearestPlayerAt(x,y,seats);
    return id ? resolveTarget?.(id) : null;
  };
  useEffect(() => {
    if (!preview) return;
    const cancel = () => finish(null,true);
    const escape = event => { if (event.key === 'Escape') cancel(); };
    const hidden = () => { if (document.hidden) cancel(); };
    window.addEventListener('keydown',escape);
    window.addEventListener('blur',cancel);
    document.addEventListener('visibilitychange',hidden);
    return () => { window.removeEventListener('keydown',escape); window.removeEventListener('blur',cancel); document.removeEventListener('visibilitychange',hidden); };
  }, [Boolean(preview)]);
  useEffect(() => {
    const current = gesture.current;
    if (current?.active && (!enabled || current.cards.some(card => !cards.some(c => c.suit === card.suit && c.rank === card.rank)))) finish(null,true);
  }, [enabled,cards]);
  useEffect(() => () => { cancelAnimationFrame(frame.current); release(gesture.current); }, []);

  return {
    preview,
    previewRef,
    shouldIgnoreClick: event => event.detail !== 0 && Date.now() < suppressClickUntil.current,
    bind: card => ({
      onPointerDown: event => {
        if (!enabled || !resolveTarget || !event.isPrimary || event.button !== 0) return;
        const isSelected = selectedCards.some(c => c.suit === card.suit && c.rank === card.rank);
        const payload = (isSelected ? selectedCards : [card]).map(({suit,rank}) => ({suit,rank}));
        const scrollElement = event.currentTarget.closest('.player-hand__scroll');
        gesture.current = { pointerId:event.pointerId, element:event.currentTarget, x:event.clientX, y:event.clientY, pointerType:event.pointerType, cards:payload, isSelected, scrollElement, scrollLeft:scrollElement?.scrollLeft || 0, active:false, scrolling:false };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove: event => {
        const current = gesture.current;
        if (!current || event.pointerId !== current.pointerId) return;
        if (!current.active && !current.scrolling) {
          const mode = cardGestureMode(event.clientX-current.x,event.clientY-current.y,current.pointerType,current.isSelected);
          if (mode === 'pending') return;
          if (mode === 'scroll') current.scrolling = true;
          else {
            current.active = true;
            onStart?.(current.cards);
          }
        }
        event.preventDefault();
        if (current.scrolling) {
          if (current.scrollElement) current.scrollElement.scrollLeft = current.scrollLeft - (event.clientX-current.x);
          return;
        }
        latestPoint.current = { x:event.clientX,y:event.clientY };
        if (frame.current !== null) return;
        frame.current = requestAnimationFrame(() => {
          frame.current = null;
          if (!gesture.current?.active) return;
          const { x,y } = latestPoint.current;
          const target = findTarget(x,y);
          if (hovered.current !== (target?.id || null)) {
            hovered.current = target?.id || null;
            onHover?.(hovered.current);
          }
          // Move the preview on the compositor; do not rerender the whole hand
          // for every pointer event. React only updates when the target changes.
          if (previewRef.current) previewRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -85%)`;
          setPreview(prev => prev && prev.target?.id === target?.id ? prev : { cards:current.cards,x,y,target });
        });
      },
      onPointerUp: event => finish(event),
      onPointerCancel: event => finish(event,true),
      onLostPointerCapture: event => finish(event,true),
      onDragStart: event => event.preventDefault(),
      onContextMenu: event => { if (gesture.current) event.preventDefault(); },
    }),
  };
}
