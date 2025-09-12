import { useEffect, useMemo, useState } from "react";

// Success colors - bright and celebratory
const SUCCESS_COLORS = [
  "#10b981", "#22c55e", "#84cc16", "#eab308", "#fbbf24",
  "#f59e0b", "#fb923c", "#f97316", "#ef4444", "#ec4899"
];

// Failure colors - darker and more dramatic
const FAILURE_COLORS = [
  "#dc2626", "#b91c1c", "#991b1b", "#7f1d1d", "#450a0a",
  "#6b7280", "#4b5563", "#374151", "#1f2937", "#111827"
];

// Success shapes - positive symbols
const SUCCESS_SHAPES = ['star', 'heart', 'diamond', 'circle'];
// Failure shapes - more angular/negative
const FAILURE_SHAPES = ['triangle', 'square', 'hexagon', 'cross'];

export default function Celebration({ tableCenterRef = null }){
  const [mode, setMode] = useState(null); // 'celebrate' | 'cry' | null
  const [seed, setSeed] = useState(0);
  const [tableCenter, setTableCenter] = useState({ x: 50, y: 50 }); // Default to screen center

  // Calculate table center position
  useEffect(() => {
    const updateTableCenter = () => {
      if (tableCenterRef?.current) {
        const rect = tableCenterRef.current.getBoundingClientRect();
        const x = ((rect.left + rect.width / 2) / window.innerWidth) * 100;
        const y = ((rect.top + rect.height / 2) / window.innerHeight) * 100;
        setTableCenter({ x, y });
      }
    };

    updateTableCenter();
    window.addEventListener('resize', updateTableCenter);
    window.addEventListener('scroll', updateTableCenter);
    
    return () => {
      window.removeEventListener('resize', updateTableCenter);
      window.removeEventListener('scroll', updateTableCenter);
    };
  }, [tableCenterRef]);

  useEffect(() => {
    const onC = () => { setSeed(Math.random()); setMode('celebrate'); setTimeout(()=>setMode(null), 1500); };
    const onS = () => { setSeed(Math.random()); setMode('cry');        setTimeout(()=>setMode(null), 1500); };
    window.addEventListener('celebrate', onC);
    window.addEventListener('cry', onS);
    return () => {
      window.removeEventListener('celebrate', onC);
      window.removeEventListener('cry', onS);
    };
  }, []);

  const confetti = useMemo(() => {
    if (mode !== 'celebrate') return [];
    const N = 150; // Even more pieces for success
    const colors = SUCCESS_COLORS;
    const shapes = SUCCESS_SHAPES;
    
    return Array.from({ length: N }, (_, i) => ({
      id: i,
      x: tableCenter.x + (Math.random() * 60 - 30),   // spread around table center
      y: tableCenter.y + (Math.random() * 30 - 15),   // spread around table center
      rot: Math.random() * 360,
      dur: 1500 + Math.random() * 1000,    // longer duration for success
      size: 6 + Math.random() * 12,        // larger pieces for success
      color: colors[i % colors.length],
      drift: (Math.random() * 100 - 50),   // more dramatic drift
      shape: shapes[Math.floor(Math.random() * shapes.length)],
      velocity: 0.3 + Math.random() * 1.2, // slower, more graceful fall
      spin: (Math.random() - 0.5) * 6,     // more spinning
      delay: Math.random() * 400,          // more staggered
      glow: true                           // add glow effect
    }));
  }, [mode, seed, tableCenter]);

  const failureParticles = useMemo(() => {
    if (mode !== 'cry') return [];
    const N = 80; // More particles for dramatic effect
    const colors = FAILURE_COLORS;
    const shapes = FAILURE_SHAPES;
    
    return Array.from({ length: N }, (_, i) => ({
      id: i,
      x: tableCenter.x + (Math.random() * 40 - 20),   // more concentrated around table center
      y: tableCenter.y + (Math.random() * 20 - 10),
      rot: Math.random() * 360,
      dur: 800 + Math.random() * 600,      // shorter, more abrupt
      size: 3 + Math.random() * 8,         // smaller, sharper pieces
      color: colors[i % colors.length],
      drift: (Math.random() * 30 - 15),    // less drift, more direct
      shape: shapes[Math.floor(Math.random() * shapes.length)],
      velocity: 1.0 + Math.random() * 2.0, // faster, more aggressive fall
      spin: (Math.random() - 0.5) * 8,     // faster, more chaotic spinning
      delay: Math.random() * 150,          // less staggered, more sudden
      glow: false                          // no glow for failure
    }));
  }, [mode, seed, tableCenter]);

  if(!mode) return null;

  return (
    <div className={`pointer-events-none fixed inset-0 z-[120] ${mode==='cry' ? 'animate-[shake_0.3s_ease-in-out_0s_6]' : ''}`}>
      {/* Success background - bright and energetic */}
      {mode==='celebrate' && <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/20 via-orange-400/20 to-red-400/20 animate-pulse" />}
      
      {/* Failure background - dark and dramatic */}
      {mode==='cry' && <div className="absolute inset-0 bg-gradient-to-br from-red-900/40 via-gray-900/40 to-black/60 backdrop-blur-[2px] saturate-75" />}

      {/* Success Confetti burst */}
      {mode==='celebrate' && confetti.map((c)=>(
        <span
          key={c.id}
          className="absolute"
          style={{
            left: `calc(${c.x}% + ${c.drift}px)`,
            top: `${c.y}%`,
            width: c.size,
            height: c.size,
            background: c.color,
            transform: `translate(-50%, -50%) rotate(${c.rot}deg)`,
            borderRadius: c.shape === 'circle' ? '50%' : c.shape === 'heart' ? '50% 50% 0 0' : '2px',
            clipPath: c.shape === 'triangle' ? 'polygon(50% 0%, 0% 100%, 100% 100%)' : 
                      c.shape === 'star' ? 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)' :
                      c.shape === 'heart' ? 'polygon(50% 85%, 15% 60%, 15% 30%, 50% 50%, 85% 30%, 85% 60%)' :
                      c.shape === 'diamond' ? 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' : 'none',
            animation: `successFall ${c.dur}ms ease-out ${c.delay}ms forwards`,
            boxShadow: c.glow ? `0 0 ${c.size}px ${c.color}80, 0 0 ${c.size*2}px ${c.color}40` : 'none',
            filter: c.glow ? 'brightness(1.2)' : 'none'
          }}
        />
      ))}

      {/* Failure particles */}
      {mode==='cry' && failureParticles.map((p)=>(
        <span
          key={p.id}
          className="absolute"
          style={{
            left: `calc(${p.x}% + ${p.drift}px)`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: p.color,
            transform: `translate(-50%, -50%) rotate(${p.rot}deg)`,
            borderRadius: p.shape === 'circle' ? '50%' : '0',
            clipPath: p.shape === 'triangle' ? 'polygon(50% 0%, 0% 100%, 100% 100%)' : 
                      p.shape === 'square' ? 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)' :
                      p.shape === 'hexagon' ? 'polygon(30% 0%, 70% 0%, 100% 50%, 70% 100%, 30% 100%, 0% 50%)' :
                      p.shape === 'cross' ? 'polygon(40% 0%, 60% 0%, 60% 40%, 100% 40%, 100% 60%, 60% 60%, 60% 100%, 40% 100%, 40% 60%, 0% 60%, 0% 40%, 40% 40%)' : 'none',
            animation: `failureFall ${p.dur}ms ease-in ${p.delay}ms forwards`,
            boxShadow: `0 0 ${p.size/3}px ${p.color}60`
          }}
        />
      ))}

      {/* Enhanced center emoji with animations - positioned at table center */}
      <div className={`absolute select-none ${
        mode==='celebrate' ? 'animate-[successBounce_0.8s_ease-in-out_0s_3]' : 
        mode==='cry' ? 'animate-[failureShake_0.4s_ease-in-out_0s_4]' : ''
      }`}
           style={{ 
             left: `${tableCenter.x}%`,
             top: `${tableCenter.y}%`,
             transform: 'translate(-50%, -50%)',
             fontSize: '90px', 
             filter: mode==='cry' ? 'grayscale(60%) brightness(0.8)' : 'none',
             textShadow: mode==='celebrate' ? '0 0 30px rgba(255,255,255,0.8), 0 0 60px rgba(255,215,0,0.6)' : 
                        mode==='cry' ? '0 0 20px rgba(220,38,38,0.8)' : 'none'
           }}>
        {mode==='celebrate' ? '✨' : '💥'}
      </div>


      <style>{`
        @keyframes successFall {
          0%   { 
            transform: translate(-50%, -50%) rotate(0deg) scale(1); 
            opacity: 1; 
          }
          30% {
            transform: translate(-50%, 40vh) rotate(120deg) scale(1.3);
            opacity: 0.9;
          }
          70% {
            transform: translate(-50%, 80vh) rotate(300deg) scale(1.1);
            opacity: 0.6;
          }
          100% { 
            transform: translate(-50%, 120vh) rotate(720deg) scale(0.3); 
            opacity: 0; 
          }
        }
        @keyframes failureFall {
          0%   { 
            transform: translate(-50%, -50%) rotate(0deg) scale(1); 
            opacity: 1; 
          }
          20% {
            transform: translate(-50%, 30vh) rotate(90deg) scale(1.1);
            opacity: 0.8;
          }
          100% { 
            transform: translate(-50%, 100vh) rotate(450deg) scale(0.2); 
            opacity: 0; 
          }
        }
        @keyframes shake {
          0%, 100% { transform: translate(0,0) rotate(0deg); }
          10% { transform: translate(-2px, -1px) rotate(-1deg); }
          20% { transform: translate(2px, 1px) rotate(1deg); }
          30% { transform: translate(-1px, 2px) rotate(-1deg); }
          40% { transform: translate(1px, -1px) rotate(1deg); }
          50% { transform: translate(-2px, 1px) rotate(-1deg); }
          60% { transform: translate(2px, -1px) rotate(1deg); }
          70% { transform: translate(-1px, -2px) rotate(-1deg); }
          80% { transform: translate(1px, 2px) rotate(1deg); }
          90% { transform: translate(-2px, -1px) rotate(-1deg); }
        }
        @keyframes successBounce {
          0%, 100% { transform: translate(-50%, -50%) scale(1) rotate(0deg); }
          25% { transform: translate(-50%, -50%) scale(1.3) rotate(5deg); }
          50% { transform: translate(-50%, -50%) scale(1.1) rotate(-3deg); }
          75% { transform: translate(-50%, -50%) scale(1.2) rotate(2deg); }
        }
        @keyframes failureShake {
          0%, 100% { transform: translate(-50%, -50%) scale(1) rotate(0deg); }
          20% { transform: translate(-50%, -50%) scale(0.9) rotate(-5deg); }
          40% { transform: translate(-50%, -50%) scale(1.1) rotate(5deg); }
          60% { transform: translate(-50%, -50%) scale(0.95) rotate(-3deg); }
          80% { transform: translate(-50%, -50%) scale(1.05) rotate(3deg); }
        }
      `}</style>
    </div>
  );
}
