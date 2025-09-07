import { useEffect, useState } from "react";

export default function Celebration(){
  const [mode, setMode] = useState(null); // 'celebrate' | 'cry' | null
  useEffect(() => {
    const onC = () => { setMode('celebrate'); setTimeout(()=>setMode(null), 1400); };
    const onS = () => { setMode('cry');        setTimeout(()=>setMode(null), 1400); };
    window.addEventListener('celebrate', onC);
    window.addEventListener('cry', onS);
    return () => {
      window.removeEventListener('celebrate', onC);
      window.removeEventListener('cry', onS);
    };
  }, []);
  if(!mode) return null;

  const items = Array.from({length: 28}).map((_,i)=>i);
  const emoji = mode==='celebrate' ? '🎉' : '😭';

  return (
    <div className="pointer-events-none fixed inset-0 z-[120] overflow-hidden">
      {items.map(i=>(
        <span
          key={i}
          className="absolute text-3xl select-none"
          style={{
            left: `${(i*37)%100}%`,
            top: '-10%',
            animation: `${mode==='celebrate'?'fallPop':'tearFall'} 1.3s ease forwards`,
            filter: mode==='cry' ? 'hue-rotate(200deg)' : 'none'
          }}
        >
          {emoji}
        </span>
      ))}
      <style>{`
        @keyframes fallPop {
          0% { transform: translateY(-10vh) rotate(0deg); opacity:.9; }
          70% { transform: translateY(60vh) rotate(180deg); opacity:1; }
          100% { transform: translateY(100vh) rotate(360deg); opacity:0; }
        }
        @keyframes tearFall {
          0% { transform: translateY(-8vh); opacity:.9; }
          80% { transform: translateY(70vh); opacity:.9; }
          100% { transform: translateY(100vh); opacity:0; }
        }
      `}</style>
    </div>
  );
}
