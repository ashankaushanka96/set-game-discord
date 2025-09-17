import { useEffect, useState, useRef, useCallback } from 'react';


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


      trail: false
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


      trail: false,
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
  // Additional richer effects to enhance emoji feel
  const [extraEffects, setExtraEffects] = useState([]);
  const seatRefs = useRef({});


  const playerSeatRef = useRef({});
  const overlayRef = useRef(null);


  const rafRef = useRef(null);


  const lastTsRef = useRef(0);


  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;





  const refreshSeatPositions = useCallback(() => {


    if (typeof document === 'undefined') return;


    const seats = document.querySelectorAll('[data-seat]');


    const map = {};


    const rootRect = overlayRef.current ? overlayRef.current.getBoundingClientRect() : { left: 0, top: 0 };


    seats.forEach(seat => {


      const seatNumber = seat.getAttribute('data-seat');


      if (!seatNumber) return;


      const rect = seat.getBoundingClientRect();


      seatRefs.current[seatNumber] = {


        x: rect.left - rootRect.left + rect.width / 2,


        y: rect.top - rootRect.top + rect.height / 2


      };


      const pid = seat.getAttribute('data-player-id');


      if (pid) map[pid] = seatNumber;


    });


    playerSeatRef.current = map;


  }, []);


  // Update seat positions


  useEffect(() => {


    refreshSeatPositions();


    window.addEventListener('resize', refreshSeatPositions, { passive: true });


    window.addEventListener('scroll', refreshSeatPositions, { passive: true });


    window.addEventListener('orientationchange', refreshSeatPositions);


    document.addEventListener('visibilitychange', refreshSeatPositions);


    return () => {


      window.removeEventListener('resize', refreshSeatPositions);


      window.removeEventListener('scroll', refreshSeatPositions);


      window.removeEventListener('orientationchange', refreshSeatPositions);


      document.removeEventListener('visibilitychange', refreshSeatPositions);


    };


  }, [refreshSeatPositions]);





  // Handle emoji animations


  useEffect(() => {


    if (!emojiAnimations || emojiAnimations.length === 0) {


      setFlyingEmojis([]);


      return;


    }





    refreshSeatPositions();


    const ensureSeatMap = () => {


      if (!playerSeatRef.current || Object.keys(playerSeatRef.current).length === 0) {


        refreshSeatPositions();


      }


    };





    ensureSeatMap();





    emojiAnimations.forEach((animation) => {


      const { from_player_id, to_player_id, emoji, emoji_name, category } = animation;


      


      // Find seat positions


      let fromSeat = playerSeatRef.current[from_player_id];


      let toSeat = playerSeatRef.current[to_player_id];


      


      if (!fromSeat || !toSeat) {


        refreshSeatPositions();


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


  }, [emojiAnimations, prefersReducedMotion, refreshSeatPositions]);





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
          let posX = currentX;
          let posY = arcY;
          if (emoji.emoji_name === 'Lightning') {
            posX += Math.sin(progress * 30) * 10;
          }
          if (emoji.emoji_name === 'Bomb') {
            posY = currentY - (Math.sin(progress * Math.PI) * arcHeight * 1.4);
          }



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
            // Extra, emoji-specific flavor effects
            const impactPos = { x: emoji.toPos.x, y: emoji.toPos.y };
            const now = Date.now();
            const add = (e) => setExtraEffects(prev => [...prev, e]);
            if (emoji.emoji_name === 'Bomb') {
              add({ id: `${emoji.id}-ring`, type: 'ring', position: impactPos, startTime: now, ttl: 600, data: { color: 'rgba(255,180,0,0.4)' } });
              add({ id: `${emoji.id}-expl`, type: 'explosion', position: impactPos, startTime: now, ttl: 900 });
              add({ id: `${emoji.id}-shake`, type: 'shake', position: impactPos, startTime: now, ttl: 300 });
            }
            if (emoji.emoji_name === 'Tomato') {
              add({ id: `${emoji.id}-splat`, type: 'splatDecal', position: impactPos, startTime: now, ttl: 1500 });
            }
            if (emoji.emoji_name === 'Lightning') {
              add({ id: `${emoji.id}-flash`, type: 'electricFlash', position: impactPos, startTime: now, ttl: 200 });
            }
            if (emoji.emoji_name === 'Clap') {
              add({ id: `${emoji.id}-burst`, type: 'burstLines', position: impactPos, startTime: now, ttl: 700 });
            }
            if (emoji.emoji_name === 'Red Heart') {
              add({ id: `${emoji.id}-hearts`, type: 'heartsRise', position: impactPos, startTime: now, ttl: 1200 });
            }
            if (emoji.emoji_name === 'Hammer') {
              add({ id: `${emoji.id}-ring2`, type: 'ring', position: impactPos, startTime: now, ttl: 500, data: { color: 'rgba(255,255,255,0.35)' } });
            }
          }



          // Minimal ember-like trail for fire/trail-enabled emojis
          const nextTrail = (emoji.trail || []).slice(-10);
          if (!prefersReducedMotion && config.physics.trail && emoji.emoji_name !== 'Hammer' && emoji.emoji_name !== 'Fire') {
            if ((Date.now() % 30) < 16) nextTrail.push({ x: currentX, y: arcY, ts: Date.now() });
          }

          return {
            ...emoji,
            currentX: posX,
            currentY: posY,
            rotation,
            scale,
            opacity,
            progress,
            trail: nextTrail
          };
        }));





        // Clean up effects
        setImpactEffects(prev => prev.filter(effect => Date.now() - effect.startTime < 1000));
        setExtraEffects(prev => prev.filter(effect => Date.now() - effect.startTime < (effect.ttl || 1000)));
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





  if (flyingEmojis.length === 0 && impactEffects.length === 0 && extraEffects.length === 0) return null;



  const visibleEmojis = flyingEmojis.slice(0, prefersReducedMotion ? 4 : 8);





  const shaking = extraEffects.some(e => e.type === 'shake');

  return (
    <div ref={overlayRef} className="fixed inset-0 pointer-events-none z-[110]" style={shaking ? { transform: `translate(${(Math.random()-0.5)*6}px, ${(Math.random()-0.5)*6}px)` } : undefined}>
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
            {/* Trail points for fiery/fast emojis */}
            {(!prefersReducedMotion && Array.isArray(emoji.trail)) && emoji.trail.map((t, i) => (
              <div
                key={`${emoji.id}-trail-${i}`}
                className="absolute rounded-full"
                style={{
                  left: 0,
                  top: 0,
                  width: 6,
                  height: 6,
                  background: 'radial-gradient(circle, rgba(255,200,100,0.5) 0%, rgba(255,140,0,0.2) 60%, transparent 70%)',
                  transform: `translate(${t.x - emoji.currentX}px, ${t.y - emoji.currentY}px)`
                }}
              />
            ))}
            {emoji.emoji}
          </div>
        );


      })}





      {/* Impact Effects */}
      {impactEffects.map((effect) => (
        <ImpactEffect key={effect.id} effect={effect} />
      ))}

      {/* Extra Effects Layer */}
      {extraEffects.map((effect) => (
        <ExtraEffect key={effect.id} effect={effect} />
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

// Extra effects with richer visuals
function ExtraEffect({ effect }) {
  const { type, position, startTime, ttl = 1000, data } = effect;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 16);
    return () => clearInterval(id);
  }, []);

  const elapsed = now - startTime;
  const progress = Math.min(Math.max(elapsed / ttl, 0), 1);
  const fade = 1 - progress;

  if (type === 'ring') {
    const size = 20 + 120 * progress;
    return (
      <div className="absolute" style={{ left: position.x, top: position.y, transform: 'translate(-50%, -50%)' }}>
        <div className="rounded-full" style={{ width: size, height: size, border: `3px solid ${data?.color || 'rgba(255,255,255,0.5)'}`, borderRadius: '9999px', opacity: fade }} />
      </div>
    );
  }

  if (type === 'explosion') {
    const parts = 18;
    return (
      <div className="absolute" style={{ left: position.x, top: position.y, transform: 'translate(-50%, -50%)' }}>
        {Array.from({ length: parts }).map((_, i) => {
          const angle = (i / parts) * Math.PI * 2;
          const dist = 60 * progress;
          return (
            <div key={i} className="absolute rounded-full"
                 style={{ left: Math.cos(angle) * dist, top: Math.sin(angle) * dist, width: 4 + 6 * (1 - progress), height: 4 + 6 * (1 - progress), background: 'orange', boxShadow: '0 0 10px rgba(255,140,0,0.6)', opacity: fade, transform: 'translate(-50%, -50%)' }} />
          );
        })}
      </div>
    );
  }

  if (type === 'splatDecal') {
    const blobs = 8;
    return (
      <div className="absolute" style={{ left: position.x, top: position.y, transform: 'translate(-50%, -50%)', opacity: 0.9 * fade }}>
        {Array.from({ length: blobs }).map((_, i) => {
          const angle = (i / blobs) * Math.PI * 2;
          const dist = 8 + (i % 3) * 6;
          return (
            <div key={i} className="absolute bg-red-600/90 rounded-full" style={{ left: Math.cos(angle) * dist, top: Math.sin(angle) * dist, width: 10 + (i % 3) * 6, height: 10 + (i % 3) * 6, transform: 'translate(-50%, -50%)' }} />
          );
        })}
        <div className="absolute bg-red-500/90 rounded-full" style={{ width: 14, height: 14, transform: 'translate(-50%, -50%)' }} />
      </div>
    );
  }

  if (type === 'electricFlash') {
    const sz = 50 + 100 * (1 - progress);
    return (
      <div className="absolute" style={{ left: position.x, top: position.y, transform: 'translate(-50%, -50%)', opacity: 0.6 * fade }}>
        <div className="rounded" style={{ width: sz, height: sz * 0.4, background: 'rgba(120,200,255,0.6)', filter: 'blur(6px)' }} />
      </div>
    );
  }

  if (type === 'burstLines') {
    const lines = 10;
    return (
      <div className="absolute" style={{ left: position.x, top: position.y, transform: 'translate(-50%, -50%)' }}>
        {Array.from({ length: lines }).map((_, i) => {
          const angle = (i / lines) * Math.PI * 2;
          const len = 18 + 14 * progress;
          return (
            <div key={i} className="absolute bg-white/80" style={{ width: 2, height: len, left: 0, top: 0, transform: `translate(-1px, -${len/2}px) rotate(${(angle*180/Math.PI).toFixed(2)}deg)`, opacity: fade }} />
          );
        })}
      </div>
    );
  }

  if (type === 'heartsRise') {
    const hearts = 6;
    return (
      <div className="absolute" style={{ left: position.x, top: position.y, transform: 'translate(-50%, -50%)' }}>
        {Array.from({ length: hearts }).map((_, i) => {
          const t = (progress + i * 0.12) % 1;
          const x = (Math.sin((i + 1) * 5 + t * 6.28) * 10) * (1 - t);
          const y = -40 * t;
          return (
            <div key={i} className="absolute" style={{ left: x, top: y, opacity: Math.max(0, 1 - t), transform: 'translate(-50%, -50%)' }}>❤️</div>
          );
        })}
      </div>
    );
  }

  // 'shake' handled at container level
  return null;
}








