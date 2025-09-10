import { Card } from '../cards';

export default function PassedCardsDisplay({ cards, type, playerName }) {
  if (!cards || cards.length === 0) return null;

  return (
    <div className="absolute -top-36 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in">
      <div className="bg-zinc-900/95 backdrop-blur-sm rounded-lg p-5 shadow-xl border border-zinc-600/50 min-w-fit">
        <div className="text-xs text-zinc-300 mb-1 text-center font-medium">
          {type === 'deck' ? `Received ${cards.length} cards` : 'Received card'}
        </div>
        <div className="flex justify-center">
          {type === 'deck' ? (
            // Show all passed cards in a fanned arrangement
            <div className="relative flex justify-center items-center" style={{ 
              width: `${Math.min(cards.length * 20 + 60, 350)}px`,
              height: '80px'
            }}>
              {cards.map((card, index) => {
                const totalCards = cards.length;
                const maxRotation = Math.min(totalCards * 6, 45); // Max 45 degrees rotation
                const rotation = totalCards > 1 ? 
                  (index - (totalCards - 1) / 2) * (maxRotation / (totalCards - 1)) : 0;
                const offsetX = totalCards > 1 ? 
                  (index - (totalCards - 1) / 2) * 20 : 0; // 20px horizontal offset
                
                return (
                  <div
                    key={`${card.suit}-${card.rank}-${index}`}
                    className="absolute transform transition-all duration-200 hover:scale-110 hover:z-50"
                    style={{
                      transform: `translateX(${offsetX}px) rotate(${rotation}deg)`,
                      zIndex: index + 1,
                      left: '50%',
                      marginLeft: '-19px', // Half of card width (38px/2)
                      filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                    }}
                    title={`${card.rank} of ${card.suit}`}
                  >
                    <Card suit={card.suit} rank={card.rank} size="sm-xs" />
                  </div>
                );
              })}
            </div>
          ) : (
            // Show single card
            <Card suit={cards[0].suit} rank={cards[0].rank} size="sm" />
          )}
        </div>
      </div>
    </div>
  );
}
