import CardBack from './CardBack';

export default function CardDeck({ size = "sm", cardCount = 48 }) {
  const sizes = {
    sm: { w: 44, h: 60, offset: 2 },
    md: { w: 64, h: 88, offset: 3 },
    lg: { w: 96, h: 132, offset: 4 },
  };
  const S = sizes[size] || sizes.sm;
  
  // Limit the number of visible cards for performance
  const visibleCards = Math.min(cardCount, 12);
  
  return (
    <div className="relative" style={{ width: S.w + (visibleCards - 1) * S.offset, height: S.h }}>
      {Array.from({ length: visibleCards }, (_, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: i * S.offset,
            top: 0,
            transform: `rotate(${(i - visibleCards / 2) * 0.5}deg)`,
            zIndex: visibleCards - i,
          }}
        >
          <CardBack size={size} />
        </div>
      ))}
      
      {/* Deck count indicator */}
      {cardCount > visibleCards && (
        <div
          className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 bg-black/80 text-white text-xs px-2 py-1 rounded"
          style={{ fontSize: '10px' }}
        >
          {cardCount} cards
        </div>
      )}
    </div>
  );
}
