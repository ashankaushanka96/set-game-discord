import { useEffect, useState, useRef, useCallback } from 'react';

// Lazy sound loader with caching to avoid repeated dynamic imports
let _playKeyCached = null;
async function playSfxKeyOnce(key) {
  try {
    if (!_playKeyCached) {
      const mod = await import('../../utils/sounds');
      _playKeyCached = mod.playKey || (mod.default && mod.default.playKey && ((k)=>mod.default.playKey(k)));
    }
    if (typeof _playKeyCached === 'function') _playKeyCached(key);
  } catch (_) {}
}
import { useStore } from '../../store';
import { Card, CardBack } from '../cards';

const CARD_FLIGHT_DURATION = 800;
const FULL_DEAL_DURATION = 27000;
const FULL_DEAL_CARD_COUNT = 52;
const TABLE_CENTER_KEY = 'table-center';

const getTableCenterPosition = () => {
  if (typeof window === 'undefined') {
    return { x: 0, y: 0 };
  }
  const centerEl = document.querySelector('[data-table-center]');
  if (centerEl) {
    const rect = centerEl.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
};

const DealingAnimation = () => {
  const { dealingAnimation, me } = useStore();
  const [phase, setPhase] = useState('idle'); // 'idle', 'dealing', 'complete'
  const [flyingCards, setFlyingCards] = useState([]);
  const [handCards, setHandCards] = useState({}); // Track cards appearing in hands
  const [cardPositions, setCardPositions] = useState({}); // Track current positions of flying cards
  const seatRefs = useRef({});
  const animationRefs = useRef({});

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
      seatRefs.current[TABLE_CENTER_KEY] = getTableCenterPosition();
    };

    updateSeatPositions();
    window.addEventListener('resize', updateSeatPositions);
    window.addEventListener('scroll', updateSeatPositions);
    return () => {
      window.removeEventListener('resize', updateSeatPositions);
      window.removeEventListener('scroll', updateSeatPositions);
    };
  }, []);

  // Get dealer position for shuffle animation
  const getDealerPosition = () => {
    if (!dealingAnimation) return { x: '50%', y: '50%' };
    const dealerSeat = dealingAnimation.dealerSeat;
    const dealerPos = seatRefs.current[dealerSeat];
    if (dealerPos) {
      return { x: dealerPos.x, y: dealerPos.y };
    }
    return { x: '50%', y: '50%' };
  };

  // Animate card from start to target position
  const animateCard = useCallback((cardKey, fromPos, targetPos, duration = CARD_FLIGHT_DURATION) => {
    const startTime = performance.now();
    
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function (ease-out)
      const easeOut = 1 - Math.pow(1 - progress, 3);
      
      // Calculate current position
      const currentX = fromPos.x + (targetPos.x - fromPos.x) * easeOut;
      const currentY = fromPos.y + (targetPos.y - fromPos.y) * easeOut;
      
      // Update position
      setCardPositions(prev => ({
        ...prev,
        [cardKey]: { x: currentX, y: currentY }
      }));
      
      if (progress < 1) {
        animationRefs.current[cardKey] = requestAnimationFrame(animate);
      } else {
        // Animation complete
        delete animationRefs.current[cardKey];
      }
    };
    
    animationRefs.current[cardKey] = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    if (!dealingAnimation) {
      setPhase('idle');
      setFlyingCards([]);
      setHandCards({});
      return;
    }

    // Update seat positions when dealing animation starts
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
      seatRefs.current[TABLE_CENTER_KEY] = getTableCenterPosition();
    };
    
    // Small delay to ensure DOM is ready
    setTimeout(updateSeatPositions, 100);

    const { dealerSeat, players, seats, dealingSequence } = dealingAnimation;
    
    // Use the dealing sequence from backend if available, otherwise create default order
    let dealingOrder = [];
    if (dealingSequence && dealingSequence.length > 0) {
      // Use the real dealing sequence from backend
      dealingOrder = dealingSequence;
    } else {
      // Fallback to creating dealing order starting from dealer
      for (let i = 0; i < 6; i++) {
        const seat = (dealerSeat + i) % 6;
        const playerId = seats[seat];
        if (playerId && players[playerId]) {
          dealingOrder.push({ seat, playerId, player: players[playerId] });
        }
      }
    }

    // No visual shuffle; just proceed to dealing

    // Skip shuffle animation, go directly to dealing
    // Add a small delay to ensure seat positions are updated
    setTimeout(() => {
      setPhase('dealing');
      setFlyingCards([]);
      setHandCards({});
      playSfxKeyOnce('deal');
      
      // Create dealing sequence - one card at a time
      const baseSequence = [];
      let cardIndex = 0;
      
      if (dealingSequence && dealingSequence.length > 0) {
        // Use real dealing sequence from backend
        dealingSequence.forEach((dealData, index) => {
          baseSequence.push({
            id: `deal-${index}`,
            seat: dealData.seat,
            playerId: dealData.player_id,
            round: dealData.round,
            card: dealData.card,
            fromSeat: dealData.from_seat !== undefined && dealData.from_seat !== null ? dealData.from_seat : TABLE_CENTER_KEY // Use the from_seat for animation origin
          });
        });
      } else {
        // Fallback to creating sequence without real cards
        for (let round = 0; round < 8; round++) {
          for (const { seat, playerId } of dealingOrder) {
            baseSequence.push({
              id: `deal-${cardIndex}`,
              seat,
              playerId,
              round,
              fromSeat: TABLE_CENTER_KEY
            });
            cardIndex++;
          }
        }
      }
      
      let fillerCycle = baseSequence.map(card => ({
        seat: card.seat,
        playerId: card.playerId,
        fromSeat: card.fromSeat !== undefined && card.fromSeat !== null ? card.fromSeat : TABLE_CENTER_KEY
      }));
      
      if (fillerCycle.length === 0) {
        fillerCycle = dealingOrder
          .filter(target => target.seat !== undefined && target.seat !== null)
          .map(({ seat, playerId }) => ({
            seat,
            playerId,
            fromSeat: TABLE_CENTER_KEY
          }));
      }
      
      if (fillerCycle.length === 0) {
        fillerCycle = [{
          seat: dealingAnimation.dealerSeat,
          playerId: null,
          fromSeat: TABLE_CENTER_KEY
        }];
      }
      
      const cycleSize = Math.max(1, fillerCycle.length);
      let fillerIndex = 0;
      while (baseSequence.length < FULL_DEAL_CARD_COUNT) {
        const cycleTarget = fillerCycle[fillerIndex % cycleSize] || fillerCycle[0];
        const targetSeat = cycleTarget && cycleTarget.seat !== undefined && cycleTarget.seat !== null ? cycleTarget.seat : dealingAnimation.dealerSeat;
        const targetFromSeat = cycleTarget && cycleTarget.fromSeat !== undefined && cycleTarget.fromSeat !== null ? cycleTarget.fromSeat : dealingAnimation.dealerSeat;
        const targetPlayerId = cycleTarget ? cycleTarget.playerId ?? null : null;
        baseSequence.push({
          id: `deal-filler-${baseSequence.length}`,
          seat: targetSeat,
          playerId: targetPlayerId,
          round: Math.floor(baseSequence.length / cycleSize),
          fromSeat: targetFromSeat,
          phantom: true
        });
        fillerIndex++;
      }
      
      const sequenceLength = baseSequence.length || 1;
      const spreadDuration = Math.max(FULL_DEAL_DURATION - CARD_FLIGHT_DURATION, 0);
      const interval = sequenceLength > 1 ? spreadDuration / (sequenceLength - 1) : spreadDuration;
      const dealSequence = baseSequence.map((cardData, index) => ({
        ...cardData,
        delay: Math.round(index * interval)
      }));

      // Process each card in sequence
      dealSequence.forEach((cardData) => {
        setTimeout(() => {
          const cardKey = `${cardData.id}-${Date.now()}`;

          // Add flying card
          setFlyingCards(prev => [...prev, {
            ...cardData,
            key: cardKey
          }]);

          // Start animation
          const seatPos = seatRefs.current[cardData.seat];
          const originSeat = cardData.fromSeat !== undefined && cardData.fromSeat !== null ? cardData.fromSeat : TABLE_CENTER_KEY;
          const fromPos = seatRefs.current[originSeat] || seatRefs.current[TABLE_CENTER_KEY];

          if (seatPos && fromPos) {
            animateCard(cardKey, fromPos, seatPos, CARD_FLIGHT_DURATION);
          }

          // Remove flying card after animation and add to hand
          setTimeout(() => {
            setFlyingCards(prev => prev.filter(c => c.key !== cardKey));
            setCardPositions(prev => {
              const newPositions = { ...prev };
              delete newPositions[cardKey];
              return newPositions;
            });
            
            if (cardData.playerId !== undefined && cardData.playerId !== null) {
              // Add card to player's hand overlay
              setHandCards(prev => ({
                ...prev,
                [cardData.playerId]: [
                  ...(prev[cardData.playerId] || []),
                  {
                    id: cardData.id,
                    seat: cardData.seat,
                    round: cardData.round,
                    phantom: cardData.phantom || false
                  }
                ]
              }));
            }
          }, CARD_FLIGHT_DURATION); // Card flight duration

        }, cardData.delay);
      });

      // Complete animation after all cards are dealt
      const totalDealingTime = FULL_DEAL_DURATION;
      setTimeout(() => {
        setPhase('complete');
        setTimeout(() => {
          setPhase('idle');
          setFlyingCards([]);
          setHandCards({});
        }, 500);
      }, totalDealingTime);

    }, 200); // Small delay to ensure seat positions are updated

    return () => {
      // Cleanup animations
      Object.values(animationRefs.current).forEach(animationId => {
        cancelAnimationFrame(animationId);
      });
      animationRefs.current = {};
    };
  }, [dealingAnimation]);

  if (!dealingAnimation || phase === 'idle') {
    return null;
  }

  return (
    <div className="fixed inset-0 pointer-events-none z-50">

      {/* Flying Cards */}
      {flyingCards.map((card) => {
        const seatPos = seatRefs.current[card.seat];
        // Use fromSeat if available, otherwise fall back to dealer position
        const originSeat = card.fromSeat !== undefined && card.fromSeat !== null ? card.fromSeat : TABLE_CENTER_KEY;
        const fromPos = seatRefs.current[originSeat] || seatRefs.current[TABLE_CENTER_KEY];
        if (!seatPos || !fromPos) return null;

        // Only show real cards for the current player, card backs for others
        const isMyCard = card.playerId === me?.id;
        const showRealCard = isMyCard && card.card;

        // Get current position from state, fallback to fromPos
        const currentPos = cardPositions[card.key] || fromPos;

        return (
          <div
            key={card.key}
            className="fixed"
            style={{
              left: `${currentPos.x}px`,
              top: `${currentPos.y}px`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {showRealCard ? (
              <Card suit={card.card.suit} rank={card.card.rank} size="sm" />
            ) : (
              <CardBack size="sm" />
            )}
          </div>
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
                  className="absolute"
                  style={{
                    left: `${seatPos.x + cardOffset}px`,
                    top: `${seatPos.y}px`,
                    transform: 'translate(-50%, -50%)',
                    animation: 'cardAppear 0.3s ease-out forwards',
                    animationFillMode: 'forwards',
                  }}
                >
                  {isMyHand && actualCard ? (
                    <Card suit={actualCard.suit} rank={actualCard.rank} size="sm" />
                  ) : (
                    <CardBack size="sm" />
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      
      <style>{`

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
