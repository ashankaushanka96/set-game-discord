import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store';
import Card from '../cards/Card';
import { createPortal } from 'react-dom';
import useCardDrag from './useCardDrag';

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const cardKey = card => `${card.suit}-${card.rank}`;

// `hint3d`: the cards are drawn by the 3D table, so only the heading and its hint are used here.
export default function PlayerHand({ cards = [], selectedCards = [], onCardSelect, selectable = false, resolveDropTarget, onDragStart, onDragHover, onDragEnd, onCardsDrop, label = "Your hand", tapSelect = false, hint3d = false }) {
  const dealing = useStore(state => state.dealingAnimation);
  const previous = useRef(new Set());
  const [arrivals, setArrivals] = useState(new Set());
  const selected = new Set(selectedCards.map(cardKey));
  const drag = useCardDrag({ enabled:selectable && !dealing, cards, selectedCards, resolveTarget:resolveDropTarget, onStart:onDragStart, onHover:onDragHover, onEnd:onDragEnd, onDrop:onCardsDrop });
  const ordered = useMemo(() => [...cards].sort((a,b) =>
    SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank)), [cards]);

  useEffect(() => {
    const next = new Set(cards.map(cardKey));
    const added = new Set([...next].filter(key => !previous.current.has(key)));
    previous.current = next;
    setArrivals(added);
    const timer = setTimeout(() => setArrivals(new Set()), 2400);
    return () => clearTimeout(timer);
  }, [cards]);

  // Phones: overlap the cards just enough for the whole hand to fit, centred, and lift the
  // card under the finger while it slides along the hand.
  const scrollRef = useRef(null);
  const [compact, setCompact] = useState(false);
  const [overlap, setOverlap] = useState(0);
  const [peek, setPeek] = useState(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => {
      setCompact(media.matches);
      if (!media.matches) return;
      const styles = getComputedStyle(el);
      const width = el.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);
      const n = ordered.length;
      // 52px cards with a 4px gap when they fit; otherwise overlap evenly
      setOverlap(n > 1 ? Math.min(4, (width - n * 52) / (n - 1)) : 0);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    media.addEventListener('change', update);
    return () => { observer.disconnect(); media.removeEventListener('change', update); };
  }, [ordered.length, dealing]);
  const peekAt = (x, y) => setPeek(document.elementFromPoint(x, y)?.closest('.hand-card')?.dataset.cardKey || null);
  const peekHandlers = compact ? {
    onPointerDownCapture: event => { if (event.pointerType !== 'mouse') peekAt(event.clientX, event.clientY); },
    onPointerMoveCapture: event => { if (event.pointerType !== 'mouse' && event.buttons) peekAt(event.clientX, event.clientY); },
    onPointerUpCapture: () => setPeek(null),
    onPointerCancelCapture: () => setPeek(null),
  } : {};

  // When cards can't be dragged to pass (Turn Play), dragging the hand sideways browses it:
  // touch uses native panning (CSS), the mouse is handled here.
  const browse = useRef(null);
  const browseHandlers = selectable ? {} : {
    onPointerDown: event => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      browse.current = { x: event.clientX, left: event.currentTarget.scrollLeft, moved: false };
    },
    onPointerMove: event => {
      const b = browse.current;
      if (!b) return;
      const dx = event.clientX - b.x;
      if (Math.abs(dx) > 3) b.moved = true;
      event.currentTarget.scrollLeft = b.left - dx;
    },
    onPointerUp: () => { browse.current = null; },
    onPointerLeave: () => { browse.current = null; },
  };

  if (dealing) return <div className="hand-status" role="status">Dealing cards…</div>;
  return <div className={`player-hand ${selectable ? '' : 'player-hand--browse'} ${compact ? 'player-hand--compact' : ''}`}>
    <div className="player-hand__heading">
      <span>{label} <span className="player-hand__count">{cards.length}</span></span>
      <span aria-live="polite">{tapSelect && !selectable ? (selected.size ? `${selected.size} selected · tap Lay to lay down` : 'Select your cards of a set, then Lay') : selected.size ? `${selected.size} selected · drag to an opponent, or Lay` : hint3d ? (selectable ? 'Slide along to select · drag up to pass' : 'Slide along to select') : compact ? (selectable ? 'Slide to look · drag up to pass' : 'Slide along your cards to look') : selectable ? 'Drag up to pass · swipe unselected cards to browse' : 'Sorted by suit · swipe to browse'}</span>
    </div>
    <div className="player-hand__scroll" tabIndex={0} aria-label={`${label}, scroll to see more`} ref={scrollRef} {...browseHandlers} {...peekHandlers}>
      <div className="player-hand__cards" style={compact ? { '--hand-overlap': `${overlap}px` } : undefined}>
        {ordered.map((card, index) => {
          const key = cardKey(card);
          return <button key={key} type="button" {...drag.bind(card)}
            data-card-key={key}
            className={`hand-card ${peek === key ? 'hand-card--peek' : ''} ${selected.has(key) ? 'hand-card--selected' : ''} ${arrivals.has(key) ? 'hand-card--new' : ''} ${drag.preview?.cards.some(c => cardKey(c) === key) ? 'hand-card--dragging' : ''}`}
            style={{ '--deal-delay': `${Math.min(index, 12) * 35}ms`, '--fan-angle': `${(index-(ordered.length-1)/2)*Math.min(2.2,20/Math.max(1,ordered.length-1))}deg`, '--fan-y': `${Math.min(9,Math.abs(index-(ordered.length-1)/2)*1.4)}px` }}
            disabled={!(selectable || tapSelect)} aria-pressed={selectable || tapSelect ? selected.has(key) : undefined}
            aria-label={`${card.rank} of ${card.suit}${selected.has(key) ? ', selected' : ''}`}
            onClick={event => { event.stopPropagation(); if (!drag.shouldIgnoreClick(event)) onCardSelect?.(card); }}>
            <Card suit={card.suit} rank={card.rank} />
            {selected.has(key) && <span className="hand-card__check" aria-hidden="true">✓</span>}
          </button>;
        })}
      </div>
    </div>
    {drag.preview && createPortal(<div ref={drag.previewRef} className={`card-drag-preview ${drag.preview.target ? 'card-drag-preview--valid' : ''}`} style={{left:0,top:0,transform:`translate3d(${drag.preview.x}px, ${drag.preview.y}px, 0) translate(-50%, -85%)`}} aria-hidden="true">
      <div className="card-drag-preview__fan">{drag.preview.cards.slice(0,3).map((card,i)=><div key={cardKey(card)} style={{transform:`translateX(${i*12}px) rotate(${i*5-5}deg)`}}><Card {...card} size="sm"/></div>)}</div>
      <span>{drag.preview.target ? `Release to pass to ${drag.preview.target.name}` : `Drag ${drag.preview.cards.length} ${drag.preview.cards.length === 1 ? 'card' : 'cards'} to an opponent`}</span>
    </div>,document.body)}
    {!cards.length && <p className="hand-status">No cards in this hand.</p>}
  </div>;
}
