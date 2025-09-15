import { useEffect, useState, useRef } from 'react';
import { useStore } from '../../store';

export default function EmojiAnimation() {
  const { emojiAnimations } = useStore();
  const [flyingEmojis, setFlyingEmojis] = useState([]);
  const seatRefs = useRef({});

  // Update seat positions
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
    window.addEventListener('scroll', updateSeatPositions);
    return () => {
      window.removeEventListener('resize', updateSeatPositions);
      window.removeEventListener('scroll', updateSeatPositions);
    };
  }, []);

  // Handle emoji animations
  useEffect(() => {
    if (!emojiAnimations || emojiAnimations.length === 0) {
      setFlyingEmojis([]);
      return;
    }

    emojiAnimations.forEach((animation) => {
      const { from_player_id, to_player_id, emoji, emoji_name, category } = animation;
      
      // Find seat positions
      const fromSeat = Object.keys(seatRefs.current).find(seatNum => {
        const seatElement = document.querySelector(`[data-seat="${seatNum}"]`);
        return seatElement && seatElement.getAttribute('data-player-id') === from_player_id;
      });
      
      const toSeat = Object.keys(seatRefs.current).find(seatNum => {
        const seatElement = document.querySelector(`[data-seat="${seatNum}"]`);
        return seatElement && seatElement.getAttribute('data-player-id') === to_player_id;
      });

      if (fromSeat && toSeat && seatRefs.current[fromSeat] && seatRefs.current[toSeat]) {
        const fromPos = seatRefs.current[fromSeat];
        const toPos = seatRefs.current[toSeat];
        
        const emojiId = `${from_player_id}-${to_player_id}-${Date.now()}`;
        
        // Add flying emoji
        setFlyingEmojis(prev => [...prev, {
          id: emojiId,
          emoji,
          emoji_name,
          category,
          fromPos,
          toPos,
          startTime: Date.now()
        }]);

        // Remove after animation completes
        setTimeout(() => {
          setFlyingEmojis(prev => prev.filter(e => e.id !== emojiId));
        }, 2000);
      }
    });
  }, [emojiAnimations]);

  // Animate flying emojis
  useEffect(() => {
    if (flyingEmojis.length === 0) return;

    const animate = () => {
      setFlyingEmojis(prev => prev.map(emoji => {
        const elapsed = Date.now() - emoji.startTime;
        const progress = Math.min(elapsed / 1200, 1); // 1.2 second animation
        
        // Smooth easing function (ease-out cubic)
        const easeOutCubic = (t) => {
          return 1 - Math.pow(1 - t, 3);
        };

        const easedProgress = easeOutCubic(progress);
        
        // Calculate current position
        const currentX = emoji.fromPos.x + (emoji.toPos.x - emoji.fromPos.x) * easedProgress;
        const currentY = emoji.fromPos.y + (emoji.toPos.y - emoji.fromPos.y) * easedProgress;
        
        // Add smooth arc to the trajectory
        const arcHeight = 60;
        const arcY = currentY - (Math.sin(progress * Math.PI) * arcHeight);
        
        // Size animation: start small (0.3), grow to large (1.5) at target
        const sizeScale = 0.3 + (progress * 1.2); // 0.3 to 1.5
        
        return {
          ...emoji,
          currentX,
          currentY: arcY,
          opacity: progress < 0.8 ? 1 : (1 - progress) / 0.2, // Fade out in last 20%
          scale: sizeScale
        };
      }));
    };

    const interval = setInterval(animate, 8); // ~120fps for smoother animation
    return () => clearInterval(interval);
  }, [flyingEmojis.length]);

  if (flyingEmojis.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {flyingEmojis.map((emoji) => (
        <div
          key={emoji.id}
          className="absolute text-3xl transition-all duration-100"
          style={{
            left: emoji.currentX,
            top: emoji.currentY,
            transform: `translate(-50%, -50%) scale(${emoji.scale})`,
            opacity: emoji.opacity,
            filter: emoji.category === 'attack' ? 'drop-shadow(0 0 8px rgba(255, 0, 0, 0.5))' : 
                   emoji.category === 'celebration' ? 'drop-shadow(0 0 8px rgba(255, 215, 0, 0.5))' :
                   'drop-shadow(0 0 4px rgba(255, 255, 255, 0.3))'
          }}
        >
          {emoji.emoji}
        </div>
      ))}
    </div>
  );
}
