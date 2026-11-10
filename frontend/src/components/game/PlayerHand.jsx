import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store';
import Card from '../cards/Card';
import { createPortal } from 'react-dom';
import useCardDrag from './useCardDrag';

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const cardKey = card => `${card.suit}-${card.rank}`;

export default function PlayerHand({ cards = [], selectedCards = [], onCardSelect, selectable = false, resolveDropTarget, onDragStart, onDragHover, onDragEnd, onCardsDrop }) {
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

  if (dealing) return <div className="hand-status" role="status">Dealing your hand…</div>;
  return <div className="player-hand">
    <div className="player-hand__heading">
      <span>Your hand <span className="player-hand__count">{cards.length}</span></span>
      <span aria-live="polite">{selected.size ? `${selected.size} selected · drag to an opponent` : selectable ? 'Drag up to pass · swipe sideways to browse' : 'Sorted by suit'}</span>
    </div>
    <div className="player-hand__scroll" tabIndex={0} aria-label="Your cards, scroll to see more">
      <div className="player-hand__cards">
        {ordered.map((card, index) => {
          const key = cardKey(card);
          return <button key={key} type="button" {...drag.bind(card)}
            className={`hand-card ${selected.has(key) ? 'hand-card--selected' : ''} ${arrivals.has(key) ? 'hand-card--new' : ''} ${drag.preview?.cards.some(c => cardKey(c) === key) ? 'hand-card--dragging' : ''}`}
            style={{ '--deal-delay': `${Math.min(index, 12) * 35}ms` }}
            disabled={!selectable} aria-pressed={selectable ? selected.has(key) : undefined}
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
    {!cards.length && <p className="hand-status">Your next hand will appear here.</p>}
  </div>;
}
