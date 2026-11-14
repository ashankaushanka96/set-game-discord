import { Card } from './';
import { RANKS_LOWER, RANKS_UPPER } from '../../lib/deck';

export default function FannedCards({ cards, size = "sm", maxCards = 7, reserveFanSpace = false }) {
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
  const [cardWidth, cardHeight] = ({ xs: [32, 44], 'sm-xs': [38, 52], bubble: [50, 68], sm: [44, 60], md: [64, 88], lg: [96, 132] })[size] || [64, 88];
  const fanAngle = displayCards.length > 1 ? Math.min(displayCards.length * 3, 20) / 2 * Math.PI / 180 : 0;
  // Rotated cards extend beyond their unrotated height. Reserve their full
  // bounds plus shadow clearance when content follows beneath the fan.
  const fanHeight = Math.ceil(cardHeight * Math.cos(fanAngle) + cardWidth * Math.sin(fanAngle)) + 16;

  return (
    <div className="relative flex justify-center items-center" style={{ 
      width: `${Math.min(displayCards.length * 16 + 40, 250)}px`,
      height: reserveFanSpace ? `${fanHeight}px` : '70px'
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
                      marginLeft: `${-cardWidth / 2}px`, // half of the card's real width, so the fan is centred
                      filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
                      transformOrigin: 'center center'
                    }}
                    title={`${card.rank} of ${card.suit}`}
                  >
                    {/* Card with overlay wrapper */}
                    <div className="relative">
                      <Card suit={card.suit} rank={card.rank} size={size} />
                      {/* Color-coded overlay */}
                      {card.overlayStyle && (
                        <div style={card.overlayStyle}></div>
                      )}
                    </div>
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
