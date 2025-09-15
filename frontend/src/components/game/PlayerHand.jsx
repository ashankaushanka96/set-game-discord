import React, { useMemo } from "react";
import { useStore } from "../../store";
import { Card } from "../cards";
import { RANKS_LOWER, RANKS_UPPER, SUITS } from "../../lib/deck";

/**
 * One-line hand view:
 *  [Lower set grouped by suit] | [Upper set grouped by suit]
 * - Lower: 2–7, Upper: 8–A
 * - Within each half, cards are grouped by suit (♥ ♦ ♣ ♠) and sorted by rank
 * - Single row, centered, no scrolling (fits in viewport width)
 */
export default function PlayerHand({ cards = [], selectedCards = [], onCardSelect, selectable = false }) {
  const { dealingAnimation } = useStore();
  
  const idxLower = (r) => {
    const i = RANKS_LOWER.indexOf(r);
    return i === -1 ? 999 : i;
  };
  const idxUpper = (r) => {
    const i = RANKS_UPPER.indexOf(r);
    return i === -1 ? 999 : i;
  };

  const isCardSelected = (card) => {
    return selectedCards.some(c => c.suit === card.suit && c.rank === card.rank);
  };

  const handleCardClick = (card) => {
    if (selectable && onCardSelect) {
      onCardSelect(card);
    }
  };

  // Build ordered arrays with suit separators for lower/upper
  const { lowerItems, upperItems } = useMemo(() => {
    const lowerGroups = {};
    const upperGroups = {};
    for (const s of SUITS) {
      lowerGroups[s] = [];
      upperGroups[s] = [];
    }

    for (const c of cards) {
      if (RANKS_LOWER.includes(c.rank)) lowerGroups[c.suit].push(c);
      else if (RANKS_UPPER.includes(c.rank)) upperGroups[c.suit].push(c);
    }

    // sort within each suit
    for (const s of SUITS) {
      lowerGroups[s].sort((a, b) => idxLower(a.rank) - idxLower(b.rank));
      upperGroups[s].sort((a, b) => idxUpper(a.rank) - idxUpper(b.rank));
    }

    // flatten with suit separators
    const toItems = (groups, prefix) => {
      const items = [];
      SUITS.forEach((suit, si) => {
        const arr = groups[suit];
        if (!arr.length) return;
        if (items.length) items.push({ __sep: `${prefix}-sep-${si}` }); // gap between suits
        arr.forEach((c, i) =>
          items.push({ ...c, __key: `${prefix}-${suit}-${c.rank}-${i}` })
        );
      });
      return items;
    };

    return {
      lowerItems: toItems(lowerGroups, "low"),
      upperItems: toItems(upperGroups, "up"),
    };
  }, [cards]);

  // Hide player hand during dealing animation
  if (dealingAnimation) {
    return (
      <div className="w-full flex flex-col items-center">
        <div className="uppercase tracking-wide text-[11px] opacity-60 mb-2">
          Your Hand
        </div>
        <div className="text-sm opacity-50">
          Dealing cards...
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center">
      <div className="uppercase tracking-wide text-[11px] opacity-60 mb-2">
        Your Hand
      </div>

      {/* Desktop: One single row, horizontally scrollable */}
      <div className="hidden md:block w-full">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-600 scrollbar-track-transparent pb-2">
          {/* LOWER */}
          {lowerItems.map((it) =>
            it.__sep ? (
              <span key={it.__sep} className="inline-block w-4 flex-shrink-0" />
            ) : (
              <span 
                key={it.__key} 
                className={`inline-block flex-shrink-0 ${selectable ? 'cursor-pointer' : ''} ${isCardSelected(it) ? 'ring-2 ring-yellow-400 rounded-lg' : ''}`}
                onClick={() => handleCardClick(it)}
              >
                <Card suit={it.suit} rank={it.rank} />
              </span>
            )
          )}

          {/* Divider between lower and upper (only if both exist) */}
          {lowerItems.length > 0 && upperItems.length > 0 && (
            <span className="inline-block mx-4 h-10 w-px bg-white/20 align-middle flex-shrink-0" />
          )}

          {/* UPPER */}
          {upperItems.map((it) =>
            it.__sep ? (
              <span key={it.__sep} className="inline-block w-4 flex-shrink-0" />
            ) : (
              <span 
                key={it.__key} 
                className={`inline-block flex-shrink-0 ${selectable ? 'cursor-pointer' : ''} ${isCardSelected(it) ? 'ring-2 ring-yellow-400 rounded-lg' : ''}`}
                onClick={() => handleCardClick(it)}
              >
                <Card suit={it.suit} rank={it.rank} />
              </span>
            )
          )}
        </div>
      </div>

      {/* Mobile: Two rows, horizontally scrollable */}
      <div className="md:hidden w-full">
        <div className="flex flex-col gap-2">
          {/* LOWER ROW */}
          {lowerItems.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-600 scrollbar-track-transparent pb-1">
              {lowerItems.map((it) =>
                it.__sep ? (
                  <span key={it.__sep} className="inline-block w-2 flex-shrink-0" />
                ) : (
                  <span 
                    key={it.__key} 
                    className={`inline-block flex-shrink-0 ${selectable ? 'cursor-pointer' : ''} ${isCardSelected(it) ? 'ring-2 ring-yellow-400 rounded-lg' : ''}`}
                    onClick={() => handleCardClick(it)}
                  >
                    <Card suit={it.suit} rank={it.rank} />
                  </span>
                )
              )}
            </div>
          )}

          {/* UPPER ROW */}
          {upperItems.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-600 scrollbar-track-transparent pb-1">
              {upperItems.map((it) =>
                it.__sep ? (
                  <span key={it.__sep} className="inline-block w-2 flex-shrink-0" />
                ) : (
                  <span 
                    key={it.__key} 
                    className={`inline-block flex-shrink-0 ${selectable ? 'cursor-pointer' : ''} ${isCardSelected(it) ? 'ring-2 ring-yellow-400 rounded-lg' : ''}`}
                    onClick={() => handleCardClick(it)}
                  >
                    <Card suit={it.suit} rank={it.rank} />
                  </span>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
