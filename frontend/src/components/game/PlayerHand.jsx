import React, { useMemo, useState, useRef, useEffect } from "react";
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
  const [scrollStates, setScrollStates] = useState({
    desktop: { canScrollLeft: false, canScrollRight: false },
    mobileRow1: { canScrollLeft: false, canScrollRight: false },
    mobileRow2: { canScrollLeft: false, canScrollRight: false },
    mobileRow3: { canScrollLeft: false, canScrollRight: false }
  });
  const scrollRefs = useRef({
    desktop: null,
    mobileRow1: null,
    mobileRow2: null,
    mobileRow3: null
  });
  
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

  // Check scroll state for a given container
  const checkScrollState = (container, key) => {
    if (!container) return;
    
    const canScrollLeft = container.scrollLeft > 0;
    const canScrollRight = container.scrollLeft < (container.scrollWidth - container.clientWidth);
    
    setScrollStates(prev => ({
      ...prev,
      [key]: { canScrollLeft, canScrollRight }
    }));
  };

  // Handle scroll events
  const handleScroll = (key) => (e) => {
    checkScrollState(e.target, key);
  };

  // Check scroll state when cards change
  useEffect(() => {
    const checkAllScrollStates = () => {
      if (scrollRefs.current.desktop) {
        checkScrollState(scrollRefs.current.desktop, 'desktop');
      }
      if (scrollRefs.current.mobileRow1) {
        checkScrollState(scrollRefs.current.mobileRow1, 'mobileRow1');
      }
      if (scrollRefs.current.mobileRow2) {
        checkScrollState(scrollRefs.current.mobileRow2, 'mobileRow2');
      }
      if (scrollRefs.current.mobileRow3) {
        checkScrollState(scrollRefs.current.mobileRow3, 'mobileRow3');
      }
    };

    // Check after a short delay to ensure DOM is updated
    const timeoutId = setTimeout(checkAllScrollStates, 100);
    return () => clearTimeout(timeoutId);
  }, [cards]);

  // Build ordered arrays with suit separators for 3 rows
  const { row1Items, row2Items, row3Items } = useMemo(() => {
    const row1Groups = {};
    const row2Groups = {};
    const row3Groups = {};
    for (const s of SUITS) {
      row1Groups[s] = [];
      row2Groups[s] = [];
      row3Groups[s] = [];
    }

    // Split cards into 3 groups: 2-4, 5-7, 8-A
    for (const c of cards) {
      if (["2", "3", "4"].includes(c.rank)) row1Groups[c.suit].push(c);
      else if (["5", "6", "7"].includes(c.rank)) row2Groups[c.suit].push(c);
      else if (["8", "9", "10", "J", "Q", "K", "A"].includes(c.rank)) row3Groups[c.suit].push(c);
    }

    // sort within each suit
    const sortCards = (cards) => {
      const rankOrder = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
      return cards.sort((a, b) => rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank));
    };

    for (const s of SUITS) {
      row1Groups[s] = sortCards(row1Groups[s]);
      row2Groups[s] = sortCards(row2Groups[s]);
      row3Groups[s] = sortCards(row3Groups[s]);
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
      row1Items: toItems(row1Groups, "row1"),
      row2Items: toItems(row2Groups, "row2"),
      row3Items: toItems(row3Groups, "row3"),
    };
  }, [cards]);

  // Keep the old structure for desktop compatibility
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
        <div className="text-sm opacity-50">
          Dealing cards...
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center">

      {/* Desktop: One single row, horizontally scrollable */}
      <div className="hidden md:block w-full relative">
        {/* Left scroll indicator */}
        {scrollStates.desktop.canScrollLeft && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
            <div className="w-10 h-10 bg-gradient-to-r from-zinc-900 to-transparent flex items-center justify-center">
              <svg className="w-6 h-6 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
                <path d="M19.41 7.41L18 6l-6 6 6 6 1.41-1.41L14.83 12z"/>
              </svg>
            </div>
          </div>
        )}
        
        {/* Right scroll indicator */}
        {scrollStates.desktop.canScrollRight && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
            <div className="w-10 h-10 bg-gradient-to-l from-zinc-900 to-transparent flex items-center justify-center">
              <svg className="w-6 h-6 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/>
                <path d="M4.59 16.59L6 18l6-6-6-6-1.41 1.41L9.17 12z"/>
              </svg>
            </div>
          </div>
        )}
        
        <div 
          ref={el => scrollRefs.current.desktop = el}
          className="flex items-center justify-center gap-2 overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-600 scrollbar-track-transparent pb-2"
          onScroll={handleScroll('desktop')}
        >
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

      {/* Mobile: Three rows, horizontally scrollable */}
      <div className="md:hidden w-full">
        <div className="flex flex-col gap-1">
          {/* ROW 1: 2-4 */}
          {row1Items.length > 0 && (
            <div className="relative">
              {/* Left scroll indicator for row 1 */}
              {scrollStates.mobileRow1.canScrollLeft && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
                  <div className="w-6 h-6 bg-gradient-to-r from-zinc-900 to-transparent flex items-center justify-center">
                    <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
                    </svg>
                  </div>
                </div>
              )}
              
              {/* Right scroll indicator for row 1 */}
              {scrollStates.mobileRow1.canScrollRight && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
                  <div className="w-6 h-6 bg-gradient-to-l from-zinc-900 to-transparent flex items-center justify-center">
                    <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/>
                    </svg>
                  </div>
                </div>
              )}
              
              <div 
                ref={el => scrollRefs.current.mobileRow1 = el}
                className="flex items-center justify-center gap-1 overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-600 scrollbar-track-transparent pb-1"
                onScroll={handleScroll('mobileRow1')}
              >
                {row1Items.map((it) =>
                  it.__sep ? (
                    <span key={it.__sep} className="inline-block w-1 flex-shrink-0" />
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
          )}

          {/* ROW 2: 5-7 */}
          {row2Items.length > 0 && (
            <div className="relative">
              {/* Left scroll indicator for row 2 */}
              {scrollStates.mobileRow2.canScrollLeft && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
                  <div className="w-6 h-6 bg-gradient-to-r from-zinc-900 to-transparent flex items-center justify-center">
                    <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
                    </svg>
                  </div>
                </div>
              )}
              
              {/* Right scroll indicator for row 2 */}
              {scrollStates.mobileRow2.canScrollRight && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
                  <div className="w-6 h-6 bg-gradient-to-l from-zinc-900 to-transparent flex items-center justify-center">
                    <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/>
                    </svg>
                  </div>
                </div>
              )}
              
              <div 
                ref={el => scrollRefs.current.mobileRow2 = el}
                className="flex items-center justify-center gap-1 overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-600 scrollbar-track-transparent pb-1"
                onScroll={handleScroll('mobileRow2')}
              >
                {row2Items.map((it) =>
                  it.__sep ? (
                    <span key={it.__sep} className="inline-block w-1 flex-shrink-0" />
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
          )}

          {/* ROW 3: 8-A */}
          {row3Items.length > 0 && (
            <div className="relative">
              {/* Left scroll indicator for row 3 */}
              {scrollStates.mobileRow3.canScrollLeft && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
                  <div className="w-6 h-6 bg-gradient-to-r from-zinc-900 to-transparent flex items-center justify-center">
                    <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
                    </svg>
                  </div>
                </div>
              )}
              
              {/* Right scroll indicator for row 3 */}
              {scrollStates.mobileRow3.canScrollRight && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
                  <div className="w-6 h-6 bg-gradient-to-l from-zinc-900 to-transparent flex items-center justify-center">
                    <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/>
                    </svg>
                  </div>
                </div>
              )}
              
              <div 
                ref={el => scrollRefs.current.mobileRow3 = el}
                className="flex items-center justify-center gap-1 overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-600 scrollbar-track-transparent pb-1"
                onScroll={handleScroll('mobileRow3')}
              >
                {row3Items.map((it) =>
                  it.__sep ? (
                    <span key={it.__sep} className="inline-block w-1 flex-shrink-0" />
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
          )}
        </div>
      </div>
    </div>
  );
}
