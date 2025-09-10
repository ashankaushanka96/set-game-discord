import { useEffect, useMemo, useState } from "react";

// lightweight confetti colors
const COLORS = ["#f43f5e", "#fb923c", "#f59e0b", "#10b981", "#22c55e", "#06b6d4", "#3b82f6", "#a855f7", "#ec4899"];

export default function Celebration(){
  const [mode, setMode] = useState(null); // 'celebrate' | 'cry' | null
  const [seed, setSeed] = useState(0);

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
    const N = 80;
    return Array.from({ length: N }, (_, i) => ({
      id: i,
      x: 50 + (Math.random() * 40 - 20),   // start near center
      y: 40 + (Math.random() * 20 - 10),
      rot: Math.random() * 360,
      dur: 800 + Math.random() * 600,
      size: 6 + Math.random() * 7,
      color: COLORS[i % COLORS.length],
      drift: (Math.random() * 40 - 20)
    }));
  }, [mode, seed]);

  const tears = useMemo(() => {
    if (mode !== 'cry') return [];
    const N = 30;
    return Array.from({ length: N }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      dur: 900 + Math.random() * 700,
      delay: Math.random() * 200,
      scale: .8 + Math.random() * .8
    }));
  }, [mode, seed]);

  if(!mode) return null;

  return (
    <div className={`pointer-events-none fixed inset-0 z-[120] ${mode==='cry' ? 'animate-[shake_0.2s_ease-in-out_0s_4]' : ''}`}>
      {/* subtle wash for cry */}
      {mode==='cry' && <div className="absolute inset-0 bg-black/25 backdrop-blur-[1px] saturate-50" />}

      {/* Confetti burst */}
      {mode==='celebrate' && confetti.map((c)=>(
        <span
          key={c.id}
          className="absolute"
          style={{
            left: `calc(50% + ${c.drift}px)`,
            top: `50%`,
            width: c.size,
            height: c.size*0.5,
            background: c.color,
            transform: `translate(-50%, -50%) rotate(${c.rot}deg)`,
            borderRadius: 2,
            animation: `confFall ${c.dur}ms ease-out forwards`
          }}
        />
      ))}

      {/* Big center emoji for both modes */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none"
           style={{ fontSize: mode==='celebrate' ? '72px' : '80px', filter: mode==='cry' ? 'grayscale(40%)' : 'none' }}>
        {mode==='celebrate' ? '🎉' : '☹️'}
      </div>

      {/* Tears */}
      {mode==='cry' && tears.map(t=>(
        <span
          key={t.id}
          className="absolute select-none"
          style={{
            left: `${t.x}%`,
            top: `-5%`,
            fontSize: `${18 * t.scale}px`,
            animation: `tear ${t.dur}ms linear ${t.delay}ms forwards`
          }}
        >
          💧
        </span>
      ))}

      <style>{`
        @keyframes confFall {
          0%   { transform: translate(-50%, -50%) rotate(0deg); opacity: 1; }
          100% { transform: translate(-50%, 120vh) rotate(540deg); opacity: 0; }
        }
        @keyframes tear {
          0%   { transform: translateY(-5vh); opacity: .9; }
          90%  { opacity: .9; }
          100% { transform: translateY(110vh); opacity: 0; }
        }
        @keyframes shake {
          0%, 100% { transform: translate(0,0); }
          25% { transform: translate(2px, 0); }
          50% { transform: translate(-2px, 0); }
          75% { transform: translate(2px, 0); }
        }
      `}</style>
    </div>
  );
}
