import { useEffect, useState, useRef } from 'react';
import { useStore } from '../../store';

export default function EmojiAnimation() {
  const { emojiAnimations } = useStore();
  const [flyingEmojis, setFlyingEmojis] = useState([]);
  const seatRefs = useRef({});
  const playerSeatRef = useRef({});
  const rafRef = useRef(null);
  const lastTsRef = useRef(0);
  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Update seat positions
  useEffect(() => {
    const updateSeatPositions = () => {
      const seats = document.querySelectorAll('[data-seat]');
      const map = {};
      seats.forEach(seat => {
        const seatNumber = seat.getAttribute('data-seat');
        const rect = seat.getBoundingClientRect();
        seatRefs.current[seatNumber] = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
        const pid = seat.getAttribute('data-player-id');
        if (pid) map[pid] = seatNumber;
      });
      playerSeatRef.current = map;
    };

    updateSeatPositions();
    window.addEventListener('resize', updateSeatPositions, { passive: true });
    window.addEventListener('scroll', updateSeatPositions, { passive: true });
    window.addEventListener('orientationchange', updateSeatPositions);
    document.addEventListener('visibilitychange', updateSeatPositions);
    return () => {
      window.removeEventListener('resize', updateSeatPositions);
      window.removeEventListener('scroll', updateSeatPositions);
      window.removeEventListener('orientationchange', updateSeatPositions);
      document.removeEventListener('visibilitychange', updateSeatPositions);
    };
  }, []);

  // Handle emoji animations
  useEffect(() => {
    if (!emojiAnimations || emojiAnimations.length === 0) {
      setFlyingEmojis([]);
      return;
    }

    // Ensure seat map is fresh (important on mobile orientation changes)
    const ensureSeatMap = () => {
      if (!playerSeatRef.current || Object.keys(playerSeatRef.current).length === 0) {
        const seats = document.querySelectorAll('[data-seat]');
        const map = {};
        seats.forEach(seat => {
          const pid = seat.getAttribute('data-player-id');
          const seatNumber = seat.getAttribute('data-seat');
          if (pid) map[pid] = seatNumber;
        });
        playerSeatRef.current = map;
      }
    };

    ensureSeatMap();

    emojiAnimations.forEach((animation) => {
      const { from_player_id, to_player_id, emoji, emoji_name, category } = animation;
      
      // Find seat positions
      let fromSeat = playerSeatRef.current[from_player_id];
      let toSeat = playerSeatRef.current[to_player_id];
      // If not found, refresh once
      if (!fromSeat || !toSeat) {
        const seats = document.querySelectorAll('[data-seat]');
        const map = {};
        seats.forEach(seat => {
          const pid = seat.getAttribute('data-player-id');
          const seatNumber = seat.getAttribute('data-seat');
          if (pid) map[pid] = seatNumber;
        });
        playerSeatRef.current = map;
        fromSeat = playerSeatRef.current[from_player_id];
        toSeat = playerSeatRef.current[to_player_id];
      }

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
        const removeAfter = prefersReducedMotion ? 1500 : 2000;
        setTimeout(() => {
          setFlyingEmojis(prev => prev.filter(e => e.id !== emojiId));
        }, removeAfter);
      }
    });
  }, [emojiAnimations, prefersReducedMotion]);

  // Animate flying emojis using rAF (less CPU, synced to display)
  useEffect(() => {
    if (flyingEmojis.length === 0) return;

    // Target 60fps, and 30fps when reduced motion is requested
    const targetFps = prefersReducedMotion ? 30 : 60;
    const frameBudgetMs = 1000 / targetFps;

    const tick = (ts) => {
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = ts - lastTsRef.current;
      if (dt >= frameBudgetMs) {
        lastTsRef.current = ts;
        setFlyingEmojis(prev => prev.map(emoji => {
          const elapsed = Date.now() - emoji.startTime;
          const progress = Math.min(elapsed / 1200, 1); // 1.2s animation

          // Smooth easing function (ease-out cubic)
          const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
          const easedProgress = easeOutCubic(progress);

          // Calculate current position
          const currentX = emoji.fromPos.x + (emoji.toPos.x - emoji.fromPos.x) * easedProgress;
          const currentY = emoji.fromPos.y + (emoji.toPos.y - emoji.fromPos.y) * easedProgress;

          // Add smooth arc to the trajectory
          const arcHeight = prefersReducedMotion ? 30 : 60;
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
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = 0;
    };
  }, [flyingEmojis.length, prefersReducedMotion]);

  if (flyingEmojis.length === 0) return null;

  // Limit concurrent emojis to reduce work on mobile devices
  const visibleEmojis = flyingEmojis.slice(0, prefersReducedMotion ? 4 : 8);

  return (
    <div className="fixed inset-0 pointer-events-none z-[110]">
      {visibleEmojis.map((emoji) => (
        <div
          key={emoji.id}
          className="absolute text-3xl"
          style={{
            left: `${emoji.currentX}px`,
            top: `${emoji.currentY}px`,
            transform: `translate(-50%, -50%) scale(${emoji.scale})`,
            opacity: emoji.opacity,
            willChange: 'transform, opacity',
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
