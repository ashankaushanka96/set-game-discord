import { useEffect, useState, useRef } from 'react';
import { useStore } from '../store';

const DealingAnimation = () => {
  const { dealingAnimation, me } = useStore();
  const [phase, setPhase] = useState('idle'); // 'idle', 'shuffling', 'dealing', 'complete'
  const [flyingCards, setFlyingCards] = useState([]);
  const [handCards, setHandCards] = useState({}); // Track cards appearing in hands
  const seatRefs = useRef({});

  // Get seat positions from the actual table
  useEffect(() => {
    const updateSeatPositions = () => {
      const seats = document.querySelectorAll('[data-seat]');
      seats.forEach(seat => {
        const seatNumber = seat.getAttribute('data-seat');
        const rect = seat.getBoundingClientRect();
        seatRefs.current[seatNumber] = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
      });
    };

    updateSeatPositions();
    window.addEventListener('resize', updateSeatPositions);
    return () => window.removeEventListener('resize', updateSeatPositions);
  }, []);

  useEffect(() => {
    if (!dealingAnimation) {
      setPhase('idle');
      setFlyingCards([]);
      setHandCards({});
      return;
    }

    const { dealerSeat, players, seats } = dealingAnimation;
    
    // Create dealing order starting from dealer
    const dealingOrder = [];
    for (let i = 0; i < 6; i++) {
      const seat = (dealerSeat + i) % 6;
      const playerId = seats[seat];
      if (playerId && players[playerId]) {
        dealingOrder.push({ seat, playerId, player: players[playerId] });
      }
    }

    // Phase 1: Shuffle animation (1.5 seconds)
    setPhase('shuffling');
    setFlyingCards([]);
    setHandCards({});

    const shuffleTimer = setTimeout(() => {
      // Phase 2: Start dealing
      setPhase('dealing');
      
      // Create dealing sequence - one card at a time
      const dealSequence = [];
      let cardIndex = 0;
      
      for (let round = 0; round < 8; round++) {
        for (const { seat, playerId } of dealingOrder) {
          dealSequence.push({
            id: `deal-${cardIndex}`,
            seat,
            playerId,
            round,
            delay: cardIndex * 200, // 200ms between each card for realistic pace
          });
          cardIndex++;
        }
      }

      // Process each card in sequence
      dealSequence.forEach((cardData, index) => {
        setTimeout(() => {
          // Add flying card
          setFlyingCards(prev => [...prev, {
            ...cardData,
            key: `${cardData.id}-${Date.now()}`
          }]);

          // Remove flying card after animation and add to hand
          setTimeout(() => {
            setFlyingCards(prev => prev.filter(c => c.key !== cardData.key));
            
            // Add card to player's hand
            setHandCards(prev => ({
              ...prev,
              [cardData.playerId]: [
                ...(prev[cardData.playerId] || []),
                {
                  id: cardData.id,
                  seat: cardData.seat,
                  round: cardData.round
                }
              ]
            }));
          }, 800); // Card flight duration

        }, cardData.delay);
      });

      // Complete animation after all cards are dealt
      const totalDealingTime = dealSequence.length * 200 + 1000;
      setTimeout(() => {
        setPhase('complete');
        setTimeout(() => {
          setPhase('idle');
          setFlyingCards([]);
          setHandCards({});
        }, 500);
      }, totalDealingTime);

    }, 1500); // Shuffle duration

    return () => {
      clearTimeout(shuffleTimer);
    };
  }, [dealingAnimation]);

  if (!dealingAnimation || phase === 'idle') {
    return null;
  }

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {/* Shuffle Animation */}
      {phase === 'shuffling' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative">
            {/* Shuffling cards effect */}
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="absolute w-12 h-16 bg-gradient-to-b from-blue-600 to-blue-800 rounded border-2 border-blue-400 shadow-lg"
                style={{
                  left: `${50 + (i - 4) * 2}%`,
                  top: `${50 + (i - 4) * 1}%`,
                  transform: `translate(-50%, -50%) rotate(${(i - 4) * 5}deg)`,
                  animation: `shuffleCard 1.5s ease-in-out infinite`,
                  animationDelay: `${i * 50}ms`,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Flying Cards */}
      {flyingCards.map((card) => {
        const seatPos = seatRefs.current[card.seat];
        if (!seatPos) return null;

        return (
          <div
            key={card.key}
            className="absolute w-10 h-14 bg-gradient-to-b from-blue-600 to-blue-800 rounded border-2 border-blue-400 shadow-lg"
            style={{
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              animation: `dealCardToSeat${card.seat} 0.8s ease-out forwards`,
              animationFillMode: 'forwards',
              '--target-x': `${seatPos.x}px`,
              '--target-y': `${seatPos.y}px`,
            }}
          />
        );
      })}

      {/* Cards appearing in hands */}
      {Object.entries(handCards).map(([playerId, cards]) => {
        const player = dealingAnimation.players[playerId];
        const playerHand = player?.hand || [];
        
        return (
          <div key={playerId}>
            {cards.map((card, index) => {
              const seatPos = seatRefs.current[card.seat];
              if (!seatPos) return null;

              const isMyHand = playerId === me?.id;
              const cardOffset = (index - 3.5) * 15; // Spread cards horizontally
              const actualCard = playerHand[index]; // Get the actual card from player's hand

              return (
                <div
                  key={card.id}
                  className={`absolute w-8 h-12 rounded border shadow-md ${
                    isMyHand 
                      ? 'bg-white border-gray-300' // Revealed card for my hand
                      : 'bg-gradient-to-b from-blue-600 to-blue-800 border-blue-400' // Face down for others
                  }`}
                  style={{
                    left: `${seatPos.x + cardOffset}px`,
                    top: `${seatPos.y}px`,
                    transform: 'translate(-50%, -50%)',
                    animation: 'cardAppear 0.3s ease-out forwards',
                    animationFillMode: 'forwards',
                  }}
                >
                  {/* Show actual card content for my hand */}
                  {isMyHand && actualCard && (
                    <div className="w-full h-full flex flex-col items-center justify-center text-xs">
                      <div className="font-bold text-gray-800">{actualCard.rank}</div>
                      <div className="text-gray-600">{actualCard.suit}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      
      <style jsx>{`
        @keyframes shuffleCard {
          0%, 100% { transform: translate(-50%, -50%) rotate(0deg) scale(1); }
          25% { transform: translate(-50%, -50%) rotate(5deg) scale(1.05); }
          50% { transform: translate(-50%, -50%) rotate(-3deg) scale(0.95); }
          75% { transform: translate(-50%, -50%) rotate(3deg) scale(1.02); }
        }

        @keyframes cardAppear {
          0% { 
            opacity: 0; 
            transform: translate(-50%, -50%) scale(0.5) rotate(180deg);
          }
          100% { 
            opacity: 1; 
            transform: translate(-50%, -50%) scale(1) rotate(0deg);
          }
        }

        @keyframes dealCardToSeat0 {
          to {
            left: var(--target-x);
            top: var(--target-y);
            transform: translate(-50%, -50%) rotate(0deg);
          }
        }
        @keyframes dealCardToSeat1 {
          to {
            left: var(--target-x);
            top: var(--target-y);
            transform: translate(-50%, -50%) rotate(0deg);
          }
        }
        @keyframes dealCardToSeat2 {
          to {
            left: var(--target-x);
            top: var(--target-y);
            transform: translate(-50%, -50%) rotate(0deg);
          }
        }
        @keyframes dealCardToSeat3 {
          to {
            left: var(--target-x);
            top: var(--target-y);
            transform: translate(-50%, -50%) rotate(0deg);
          }
        }
        @keyframes dealCardToSeat4 {
          to {
            left: var(--target-x);
            top: var(--target-y);
            transform: translate(-50%, -50%) rotate(0deg);
          }
        }
        @keyframes dealCardToSeat5 {
          to {
            left: var(--target-x);
            top: var(--target-y);
            transform: translate(-50%, -50%) rotate(0deg);
          }
        }
      `}</style>
    </div>
  );
};

export default DealingAnimation;
