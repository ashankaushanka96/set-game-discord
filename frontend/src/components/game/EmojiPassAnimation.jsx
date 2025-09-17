import { useEffect, useState, useRef } from 'react';
import { useStore } from '../../store';

// Emoji-specific animation configurations
const EMOJI_CONFIGS = {
  '\u{1F528}': {
    name: 'Hammer',
    category: 'attack',
    physics: {
      spinSpeed: 2.5,
      arcHeight: 80,
      impactScale: 1.8,
      bounceBack: 0.3,
      trail: true
    },
    sound: 'bonk',
    impactEffect: 'shake'
  },
  '\u{1F345}': {
    name: 'Tomato',
    category: 'attack',
    physics: {
      spinSpeed: 1.8,
      arcHeight: 60,
      impactScale: 2.2,
      splat: true,
      decal: 'tomato-splat'
    },
    sound: 'splat',
    impactEffect: 'splat'
  },
  '\u{1F4A3}': {
    name: 'Bomb',
    category: 'attack',
    physics: {
      spinSpeed: 0.8,
      arcHeight: 50,
      impactScale: 2.5,
      explosion: true
    },
    sound: 'explosion',
    impactEffect: 'explosion'
  },
  '\u{26A1}': {
    name: 'Lightning',
    category: 'attack',
    physics: {
      spinSpeed: 0,
      arcHeight: 0,
      impactScale: 1.5,
      zigzag: true,
      speed: 0.6
    },
    sound: 'zap',
    impactEffect: 'electric'
  },
  '\u{1F525}': {
    name: 'Fire',
    category: 'attack',
    physics: {
      spinSpeed: 1.0,
      arcHeight: 40,
      impactScale: 1.8,
      trail: true,
      flicker: true
    },
    sound: 'whoosh',
    impactEffect: 'burn'
  },
  '\u{1F389}': {
    name: 'Party',
    category: 'celebration',
    physics: {
      spinSpeed: 1.5,
      arcHeight: 90,
      impactScale: 2.0,
      confetti: true
    },
    sound: 'party',
    impactEffect: 'confetti'
  },
  '\u{1F3C6}': {
    name: 'Trophy',
    category: 'celebration',
    physics: {
      spinSpeed: 0.8,
      arcHeight: 60,
      impactScale: 1.7,
      sparkles: true
    },
    sound: 'victory',
    impactEffect: 'sparkles'
  },
  '\u{1F451}': {
    name: 'Crown',
    category: 'celebration',
    physics: {
      spinSpeed: 0.6,
      arcHeight: 50,
      impactScale: 1.6,
      sparkles: true
    },
    sound: 'royal',
    impactEffect: 'sparkles'
  },
  '\u{1F602}': {
    name: 'Laughing',
    category: 'reaction',
    physics: {
      spinSpeed: 1.0,
      arcHeight: 50,
      impactScale: 1.5,
      bounce: true
    },
    sound: 'laugh',
    impactEffect: 'bounce'
  },
  '\u{1F44F}': {
    name: 'Clap',
    category: 'gesture',
    physics: {
      spinSpeed: 0.5,
      arcHeight: 40,
      impactScale: 1.4,
      burst: true
    },
    sound: 'clap',
    impactEffect: 'burst'
  },
  '\u2764\uFE0F': {
    name: 'Red Heart',
    category: 'heart',
    physics: {
      spinSpeed: 0.8,
      arcHeight: 60,
      impactScale: 1.6,
      hearts: true
    },
    sound: 'heart',
    impactEffect: 'hearts'
  },
  '\u{1F44D}': {
    name: 'Thumbs Up',
    category: 'gesture',
    physics: {
      spinSpeed: 0.6,
      arcHeight: 45,
      impactScale: 1.4,
      bounce: true
    },
    sound: 'gentle',
    impactEffect: 'bounce'
  }
};

// Default config for unknown emojis
const DEFAULT_CONFIG = {
  name: 'Emoji',
  category: 'reaction',
  physics: {
    spinSpeed: 1.0,
    arcHeight: 50,
    impactScale: 1.5,
    bounce: true
  },
  sound: 'gentle',
  impactEffect: 'bounce'
};

export default function EmojiPassAnimation() {
  const { emojiAnimations } = useStore();
  const [flyingEmojis, setFlyingEmojis] = useState([]);
  const [impactEffects, setImpactEffects] = useState([]);
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
        const config = EMOJI_CONFIGS[emoji] || DEFAULT_CONFIG;
        
        // Add flying emoji with enhanced physics
        setFlyingEmojis(prev => [...prev, {
          id: emojiId,
          emoji,
          emoji_name,
          category,
          fromPos,
          toPos,
          startTime: Date.now(),
          config,
          rotation: 0,
          phase: 'flying' // flying, impact, effect
        }]);

        // Remove after animation completes
        const removeAfter = prefersReducedMotion ? 1500 : 2500;
        setTimeout(() => {
          setFlyingEmojis(prev => prev.filter(e => e.id !== emojiId));
        }, removeAfter);
      }
    });
  }, [emojiAnimations, prefersReducedMotion]);

  // Enhanced animation loop with physics
  useEffect(() => {
    if (flyingEmojis.length === 0) return;

    const targetFps = prefersReducedMotion ? 30 : 60;
    const frameBudgetMs = 1000 / targetFps;

    const tick = (ts) => {
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = ts - lastTsRef.current;
      
      if (dt >= frameBudgetMs) {
        lastTsRef.current = ts;
        
        setFlyingEmojis(prev => prev.map(emoji => {
          const elapsed = Date.now() - emoji.startTime;
          const config = emoji.config;
          const duration = config.physics.speed ? 1000 / config.physics.speed : 1000;
          const progress = Math.min(elapsed / duration, 1);

          // Enhanced easing based on emoji type
          let easedProgress;
          if (config.category === 'attack') {
            // Attack emojis have more aggressive easing
            easedProgress = 1 - Math.pow(1 - progress, 4);
          } else if (config.category === 'celebration') {
            // Celebration emojis have bouncy easing
            easedProgress = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
          } else {
            // Default smooth easing
            easedProgress = 1 - Math.pow(1 - progress, 3);
          }

          // Calculate position
          const currentX = emoji.fromPos.x + (emoji.toPos.x - emoji.fromPos.x) * easedProgress;
          const currentY = emoji.fromPos.y + (emoji.toPos.y - emoji.fromPos.y) * easedProgress;

          // Enhanced arc calculation
          const arcHeight = prefersReducedMotion ? config.physics.arcHeight * 0.5 : config.physics.arcHeight;
          const arcY = currentY - (Math.sin(progress * Math.PI) * arcHeight);

          // Rotation based on emoji type
          let rotation = 0;
          if (config.physics.spinSpeed > 0) {
            rotation = progress * config.physics.spinSpeed * 360;
          }

          // Scale animation with impact effect
          let scale = 0.3 + (progress * 1.2);
          if (progress > 0.8) {
            // Impact phase
            const impactProgress = (progress - 0.8) / 0.2;
            scale = 1.5 + (Math.sin(impactProgress * Math.PI * 4) * 0.3 * config.physics.impactScale);
          }

          // Opacity with fade out
          let opacity = 1;
          if (progress > 0.9) {
            opacity = (1 - progress) / 0.1;
          }

          // Special effects
          let specialEffect = null;
          if (progress > 0.8 && emoji.phase === 'flying') {
            emoji.phase = 'impact';
            // Trigger impact effect
            setImpactEffects(prev => [...prev, {
              id: `${emoji.id}-impact`,
              type: config.impactEffect,
              position: { x: emoji.toPos.x, y: emoji.toPos.y },
              startTime: Date.now()
            }]);
          }

          return {
            ...emoji,
            currentX,
            currentY: arcY,
            rotation,
            scale,
            opacity,
            progress
          };
        }));

        // Clean up impact effects
        setImpactEffects(prev => prev.filter(effect => 
          Date.now() - effect.startTime < 1000
        ));
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

  if (flyingEmojis.length === 0 && impactEffects.length === 0) return null;

  const visibleEmojis = flyingEmojis.slice(0, prefersReducedMotion ? 4 : 8);

  return (
    <div className="fixed inset-0 pointer-events-none z-[110]">
      {/* Flying Emojis */}
      {visibleEmojis.map((emoji) => {
        const config = emoji.config;
        const isAttack = config.category === 'attack';
        const isCelebration = config.category === 'celebration';
        
        return (
          <div
            key={emoji.id}
            className="absolute text-3xl"
            style={{
              left: `${emoji.currentX}px`,
              top: `${emoji.currentY}px`,
              transform: `translate(-50%, -50%) scale(${emoji.scale}) rotate(${emoji.rotation}deg)`,
              opacity: emoji.opacity,
              willChange: 'transform, opacity',
              filter: isAttack ? 'drop-shadow(0 0 12px rgba(255, 0, 0, 0.7))' : 
                     isCelebration ? 'drop-shadow(0 0 12px rgba(255, 215, 0, 0.7))' :
                     'drop-shadow(0 0 6px rgba(255, 255, 255, 0.4))'
            }}
          >
            {emoji.emoji}
          </div>
        );
      })}

      {/* Impact Effects */}
      {impactEffects.map((effect) => (
        <ImpactEffect key={effect.id} effect={effect} />
      ))}
    </div>
  );
}

// Impact Effect Component
function ImpactEffect({ effect }) {
  const { type, position, startTime } = effect;
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    if (type === 'sparkles') {
      // Create sparkle particles
      const newParticles = Array.from({ length: 8 }, (_, i) => ({
        id: i,
        angle: (i / 8) * Math.PI * 2,
        distance: 30 + Math.random() * 20,
        speed: 0.5 + Math.random() * 0.5
      }));
      setParticles(newParticles);
    } else if (type === 'confetti') {
      // Create confetti particles
      const newParticles = Array.from({ length: 12 }, (_, i) => ({
        id: i,
        angle: (i / 12) * Math.PI * 2,
        distance: 40 + Math.random() * 30,
        speed: 0.3 + Math.random() * 0.4,
        color: ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#f0932b'][Math.floor(Math.random() * 5)]
      }));
      setParticles(newParticles);
    }
  }, [type]);

  const elapsed = Date.now() - startTime;
  const progress = Math.min(elapsed / 1000, 1);

  if (type === 'sparkles') {
    return (
      <div className="absolute" style={{ left: position.x, top: position.y, transform: 'translate(-50%, -50%)' }}>
        {particles.map(particle => {
          const distance = particle.distance * progress;
          const x = Math.cos(particle.angle) * distance;
          const y = Math.sin(particle.angle) * distance;
          const opacity = 1 - progress;
          
          return (
            <div
              key={particle.id}
              className="absolute w-1 h-1 bg-yellow-300 rounded-full"
              style={{
                left: x,
                top: y,
                opacity,
                transform: 'translate(-50%, -50%)'
              }}
            />
          );
        })}
      </div>
    );
  }

  if (type === 'confetti') {
    return (
      <div className="absolute" style={{ left: position.x, top: position.y, transform: 'translate(-50%, -50%)' }}>
        {particles.map(particle => {
          const distance = particle.distance * progress;
          const x = Math.cos(particle.angle) * distance;
          const y = Math.sin(particle.angle) * distance;
          const opacity = 1 - progress;
          
          return (
            <div
              key={particle.id}
              className="absolute w-2 h-2 rounded-sm"
              style={{
                left: x,
                top: y,
                backgroundColor: particle.color,
                opacity,
                transform: 'translate(-50%, -50%)'
              }}
            />
          );
        })}
      </div>
    );
  }

  return null;
}
