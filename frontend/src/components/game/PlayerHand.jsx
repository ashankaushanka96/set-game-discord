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
  const [newCards, setNewCards] = useState(new Set());
  const [previousCards, setPreviousCards] = useState([]);
  const scrollRefs = useRef({
    desktop: null,
    mobileRow1: null,
    mobileRow2: null,
    mobileRow3: null
  });
  

  const isCardSelected = (card) => {
    return selectedCards.some(c => c.suit === card.suit && c.rank === card.rank);
  };

  const isNewCard = (card) => {
    return newCards.has(`${card.suit}-${card.rank}`);
  };

  const handleCardClick = (card, event) => {
    event.stopPropagation(); // Prevent clearing highlights when clicking cards
    if (selectable && onCardSelect) {
      onCardSelect(card);
    }
  };

  const clearHighlights = () => {
    setNewCards(new Set());
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

  // Detect new cards and highlight them
  useEffect(() => {
    if (previousCards.length > 0) {
      const currentCardKeys = new Set(cards.map(c => `${c.suit}-${c.rank}`));
      const previousCardKeys = new Set(previousCards.map(c => `${c.suit}-${c.rank}`));
      
      // Find new cards
      const newlyAdded = new Set();
      currentCardKeys.forEach(key => {
        if (!previousCardKeys.has(key)) {
          newlyAdded.add(key);
        }
      });

      if (newlyAdded.size > 0) {
        // Clear any existing highlights and set new ones
        setNewCards(new Set());
        
        // Small delay to ensure state update, then highlight new cards
        setTimeout(() => {
          setNewCards(newlyAdded);
          
          // Remove highlight after 10 seconds
          setTimeout(() => {
            setNewCards(new Set());
          }, 10000);
        }, 50);
      }
    }
    
    setPreviousCards(cards);
  }, [cards, previousCards]);

  // Build ordered arrays for 3 rows - simple sequential distribution
  const { row1Items, row2Items, row3Items } = useMemo(() => {
    // Sort all cards first
    const sortedCards = [...cards].sort((a, b) => {
      const suitOrder = ["hearts", "diamonds", "clubs", "spades"];
      const rankOrder = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
      
      const suitDiff = suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
      if (suitDiff !== 0) return suitDiff;
      
      return rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank);
    });

    // Distribute cards sequentially across 3 rows (dynamic cards per row)
    const totalCards = sortedCards.length;
    
    // Try 6 cards per row first, fall back to 5 if needed
    let cardsPerRow = 6;
    if (totalCards > 15) { // If more than 15 cards, use 5 per row to fit in 3 rows
      cardsPerRow = 5;
    }
    
    const row1 = [];
    const row2 = [];
    const row3 = [];

    sortedCards.forEach((card, index) => {
      if (index < cardsPerRow) {
        row1.push({ ...card, __key: `row1-${index}` });
      } else if (index < cardsPerRow * 2) {
        row2.push({ ...card, __key: `row2-${index}` });
      } else {
        row3.push({ ...card, __key: `row3-${index}` });
      }
    });

    return {
      row1Items: row1,
      row2Items: row2,
      row3Items: row3,
    };
  }, [cards]);

  // Desktop: Simple sorted single row
  const desktopItems = useMemo(() => {
    // Sort all cards the same way as mobile
    const sortedCards = [...cards].sort((a, b) => {
      const suitOrder = ["hearts", "diamonds", "clubs", "spades"];
      const rankOrder = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
      
      const suitDiff = suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
      if (suitDiff !== 0) return suitDiff;
      
      return rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank);
    });

    return sortedCards.map((card, index) => ({
      ...card,
      __key: `desktop-${index}`
    }));
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
    <div className="w-full flex flex-col items-center" onClick={clearHighlights}>

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
          className="flex items-center justify-center gap-2 overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-600 scrollbar-track-transparent py-2 px-1"
          onScroll={handleScroll('desktop')}
          style={{ 
            scrollbarWidth: 'none', 
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          {desktopItems.map((it) => (
            <span 
              key={it.__key} 
              className={`inline-block flex-shrink-0 transition-all duration-300 ${selectable ? 'cursor-pointer' : ''} ${isCardSelected(it) ? 'ring-2 ring-yellow-400 rounded-lg' : ''} ${isNewCard(it) ? 'ring-2 ring-green-400 rounded-lg shadow-lg shadow-green-400/50 animate-pulse' : ''}`}
              onClick={(e) => handleCardClick(it, e)}
            >
              <Card suit={it.suit} rank={it.rank} />
            </span>
          ))}
        </div>
      </div>

      {/* Mobile: Three rows, horizontally scrollable */}
      <div className="md:hidden w-full">
        <div className="flex flex-col gap-1">
          {/* ROW 1 */}
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
                className="flex items-center justify-center gap-1 overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-600 scrollbar-track-transparent py-1 px-0.5"
                onScroll={handleScroll('mobileRow1')}
                style={{ 
                  scrollbarWidth: 'none', 
                  msOverflowStyle: 'none',
                  WebkitOverflowScrolling: 'touch'
                }}
              >
                {row1Items.map((it) => (
                  <span 
                    key={it.__key} 
                    className={`inline-block flex-shrink-0 transition-all duration-300 ${selectable ? 'cursor-pointer' : ''} ${isCardSelected(it) ? 'ring-2 ring-yellow-400 rounded-lg' : ''} ${isNewCard(it) ? 'ring-2 ring-green-400 rounded-lg shadow-lg shadow-green-400/50 animate-pulse' : ''}`}
                    onClick={(e) => handleCardClick(it, e)}
                  >
                    <Card suit={it.suit} rank={it.rank} />
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ROW 2 */}
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
                className="flex items-center justify-center gap-1 overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-600 scrollbar-track-transparent py-1 px-0.5"
                onScroll={handleScroll('mobileRow2')}
                style={{ 
                  scrollbarWidth: 'none', 
                  msOverflowStyle: 'none',
                  WebkitOverflowScrolling: 'touch'
                }}
              >
                {row2Items.map((it) => (
                  <span 
                    key={it.__key} 
                    className={`inline-block flex-shrink-0 transition-all duration-300 ${selectable ? 'cursor-pointer' : ''} ${isCardSelected(it) ? 'ring-2 ring-yellow-400 rounded-lg' : ''} ${isNewCard(it) ? 'ring-2 ring-green-400 rounded-lg shadow-lg shadow-green-400/50 animate-pulse' : ''}`}
                    onClick={(e) => handleCardClick(it, e)}
                  >
                    <Card suit={it.suit} rank={it.rank} />
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ROW 3 */}
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
                className="flex items-center justify-center gap-1 overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-600 scrollbar-track-transparent py-1 px-0.5"
                onScroll={handleScroll('mobileRow3')}
                style={{ 
                  scrollbarWidth: 'none', 
                  msOverflowStyle: 'none',
                  WebkitOverflowScrolling: 'touch'
                }}
              >
                {row3Items.map((it) => (
                  <span 
                    key={it.__key} 
                    className={`inline-block flex-shrink-0 transition-all duration-300 ${selectable ? 'cursor-pointer' : ''} ${isCardSelected(it) ? 'ring-2 ring-yellow-400 rounded-lg' : ''} ${isNewCard(it) ? 'ring-2 ring-green-400 rounded-lg shadow-lg shadow-green-400/50 animate-pulse' : ''}`}
                    onClick={(e) => handleCardClick(it, e)}
                  >
                    <Card suit={it.suit} rank={it.rank} />
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
