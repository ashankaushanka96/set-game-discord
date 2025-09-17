import { Card } from './';
import { RANKS_LOWER, RANKS_UPPER } from '../../lib/deck';

export default function FannedCards({ cards, size = "sm", maxCards = 6 }) {
  if (!cards || cards.length === 0) return null;

  // Sort cards by rank (lower set: 2-7, upper set: 8-A)
  const sortedCards = [...cards].sort((a, b) => {
    const allRanks = [...RANKS_LOWER, ...RANKS_UPPER];
    const rankA = allRanks.indexOf(a.rank);
    const rankB = allRanks.indexOf(b.rank);
    return rankA - rankB;
  });

  // Limit the number of cards to display
  const displayCards = sortedCards.slice(0, maxCards);
  const hasMore = cards.length > maxCards;

  return (
    <div className="relative flex justify-center items-center" style={{ 
      width: `${Math.min(displayCards.length * 16 + 40, 250)}px`,
      height: '70px'
    }}>
      {displayCards.map((card, index) => {
        const totalCards = displayCards.length;
        const maxRotation = Math.min(totalCards * 3, 20);
        const rotation = totalCards > 1 ? 
          (index - (totalCards - 1) / 2) * (maxRotation / (totalCards - 1)) : 0;
        const offsetX = totalCards > 1 ? 
          (index - (totalCards - 1) / 2) * 16 : 0;
        
        return (
          <div
            key={`${card.suit}-${card.rank}-${index}`}
            className="absolute transform"
            style={{
              transform: `translateX(${offsetX}px) rotate(${rotation}deg)`,
              zIndex: index + 1,
              left: '50%',
              marginLeft: size === 'sm' ? '-22px' : '-19px', // Half of card width
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
              transformOrigin: 'center center'
            }}
            title={`${card.rank} of ${card.suit}`}
          >
            <Card suit={card.suit} rank={card.rank} size={size} />
          </div>
        );
      })}
      {hasMore && (
        <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
          <div className="bg-zinc-800/90 rounded text-xs px-1 py-0.5 text-zinc-300 font-bold">
            +{cards.length - maxCards}
          </div>
        </div>
      )}
    </div>
  );
}
