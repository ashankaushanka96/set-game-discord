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
    
    let borderColor = 'rgba(255, 255, 255, 0.2)';
    let shadowColor = 'transparent';
    let isCorrect = false;
    let isWrong = false;
    
    // Since we only show claimed cards, we need to check if they were actually held
    if (wasClaimed && wasActual) {
      // Card was claimed AND actually held - correct (green)
      borderColor = 'rgb(74, 222, 128)'; // green-400
      shadowColor = 'rgba(74, 222, 128, 0.5)';
      isCorrect = true;
    } else if (wasClaimed && !wasActual) {
      // Card was claimed but NOT actually held - wrong (red)
      borderColor = 'rgb(248, 113, 113)'; // red-400
      shadowColor = 'rgba(248, 113, 113, 0.5)';
      isWrong = true;
    }
    
    return {
      ...card,
      isCorrect,
      isWrong,
      borderStyle: {
        border: `1px solid ${borderColor}`,
        borderRadius: `${borderRadius}px`,
        boxShadow: shadowColor !== 'transparent' ? `0 0 0 1px ${shadowColor}` : 'none'
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
        <div className="mt-3">
          <div className="flex gap-4 text-xs text-white/70 justify-center mb-2">
            {correctCount > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 border border-green-400 rounded bg-green-400/20"></div>
                <span>Correct ({correctCount})</span>
              </div>
            )}
            {wrongCount > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 border border-red-400 rounded bg-red-400/20"></div>
                <span>Wrong ({wrongCount})</span>
              </div>
            )}
          </div>
          
          {/* Show card details */}
          <div className="text-xs text-white/60 text-center">
            {correctCount > 0 && (
              <div className="mb-1">
                <span className="text-green-400">✓ Correct: </span>
                {colorCodedCards.filter(c => c.isCorrect).map(c => `${c.rank}${c.suit === 'hearts' ? '♥' : c.suit === 'diamonds' ? '♦' : c.suit === 'clubs' ? '♣' : '♠'}`).join(', ')}
              </div>
            )}
            {wrongCount > 0 && (
              <div>
                <span className="text-red-400">✗ Missing: </span>
                {colorCodedCards.filter(c => c.isWrong).map(c => `${c.rank}${c.suit === 'hearts' ? '♥' : c.suit === 'diamonds' ? '♦' : c.suit === 'clubs' ? '♣' : '♠'}`).join(', ')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
