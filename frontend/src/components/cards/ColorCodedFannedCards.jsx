import { FannedCards } from './';

export default function ColorCodedFannedCards({ 
  claimedCards = [], 
  actualCards = [], 
  size = "sm", 
  maxCards = 10,
  className = ""
}) {
  // Get border radius based on card size
  const getBorderRadius = (size) => {
    const sizes = {
      xs: 6,
      'sm-xs': 7,
      sm: 8,
      md: 10,
      lg: 12,
    };
    return sizes[size] || sizes.md;
  };

  const borderRadius = getBorderRadius(size);
  // Create a combined set of all claimed cards (what was needed for the set)
  // For failed laydowns, we want to show all claimed cards, with some marked as missing
  const uniqueCards = [];
  const seenCards = new Set();
  
  // Add all claimed cards first (these are what players said they had)
  claimedCards.forEach(card => {
    const key = `${card.suit}-${card.rank}`;
    if (!seenCards.has(key)) {
      seenCards.add(key);
      uniqueCards.push(card);
    }
  });

  // Create cards with color coding information
  const colorCodedCards = uniqueCards.map(card => {
    const wasClaimed = claimedCards.some(c => c.suit === card.suit && c.rank === card.rank);
    const wasActual = actualCards.some(c => c.suit === card.suit && c.rank === card.rank);
    
    let overlayColor = 'transparent';
    let isCorrect = false;
    let isWrong = false;
    
    // Since we only show claimed cards, we need to check if they were actually held
    if (wasClaimed && wasActual) {
      // Card was claimed AND actually held - correct (green overlay)
      overlayColor = 'rgba(74, 222, 128, 0.3)'; // green-400 with transparency
      isCorrect = true;
    } else if (wasClaimed && !wasActual) {
      // Card was claimed but NOT actually held - wrong (red overlay)
      overlayColor = 'rgba(248, 113, 113, 0.3)'; // red-400 with transparency
      isWrong = true;
    }
    
    return {
      ...card,
      isCorrect,
      isWrong,
      overlayStyle: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: overlayColor,
        borderRadius: `${borderRadius}px`,
        pointerEvents: 'none',
        zIndex: 10
      }
    };
  });

  const correctCount = colorCodedCards.filter(c => c.isCorrect).length;
  const wrongCount = colorCodedCards.filter(c => c.isWrong).length;

  return (
    <div className={`relative ${className}`}>
      <FannedCards 
        cards={colorCodedCards} 
        size={size} 
        maxCards={maxCards}
      />
      
      {/* Legend for color coding */}
      {(correctCount > 0 || wrongCount > 0) && (
        <div className="flex gap-4 mt-2 text-xs text-white/70 justify-center">
          {correctCount > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 border-2 border-green-400 rounded bg-green-400/20"></div>
              <span>Correct ({correctCount})</span>
            </div>
          )}
          {wrongCount > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 border-2 border-red-400 rounded bg-red-400/20"></div>
              <span>Wrong ({wrongCount})</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
