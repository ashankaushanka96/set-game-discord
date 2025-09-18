export default function Seat({ seatIndex, player, highlight, selectable, onSelect, team, isMe, isLaydownPlayer, isSpeaking, isDealer }) {
    const handleClick = () => {
      if (selectable && player) onSelect?.(player);
    };
  
    const teamBg =
      team === 'A'
        ? 'bg-gradient-to-b from-blue-500/10 to-blue-500/0'
        : team === 'B'
        ? 'bg-gradient-to-b from-rose-500/10 to-rose-500/0'
        : 'bg-gradient-to-b from-zinc-500/10 to-zinc-500/0';
  
    return (
      <button
        data-seat={seatIndex}
        onClick={handleClick}
        className={[
          'w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full flex flex-col items-center justify-center',
          'bg-zinc-800/90 card-shadow relative overflow-hidden',
          teamBg,
          selectable ? 'cursor-pointer hover:scale-[1.05] transition-all duration-200' : 'cursor-default',
          selectable ? 'ring-4 ring-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.8)] bg-amber-500/20 animate-pulse' : '',
          highlight ? 'ring-4 ring-emerald-400 shadow-[0_0_0_6px_rgba(16,185,129,0.3)] animate-pulse' : '',
          isMe ? 'ring-2 ring-cyan-400/70' : '',
          player && !player.connected ? 'opacity-60 grayscale ring-2 ring-red-500/50' : '',
        ].join(' ')}
      >
        {/* Selectable Overlay */}
        {selectable && (
          <div className="absolute inset-0 bg-amber-500/30 rounded-full animate-pulse" />
        )}
        
        {/* Avatar Background */}
        <div className="absolute inset-0 flex items-center justify-center">
          {typeof player?.avatar === "string" && player.avatar.startsWith("http") ? (
            <img 
              src={player.avatar} 
              alt={player.name || 'Player'} 
              className="h-16 w-16 sm:h-20 sm:w-20 md:h-24 md:w-24 rounded-full opacity-60 select-none object-cover border-2 border-white/20" 
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="text-4xl sm:text-5xl md:text-6xl opacity-60 select-none">
              {player?.avatar || '🔥'}
            </div>
          )}
        </div>
        
        {/* Content Overlay */}
        <div className="relative z-10 flex flex-col items-center justify-center">
          <div className="text-[11px] sm:text-sm mt-1 font-bold line-clamp-1 transition-all duration-300 text-white" 
          style={{
            textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 8px rgba(255,255,255,0.4)',
            filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.3))'
          }}>
            {player?.name || 'Empty'}
          </div>
          <div className="text-[8px] sm:text-[10px] opacity-70 bg-black/60 px-1.5 py-0.5 rounded backdrop-blur-sm mt-0.5 font-medium">
            {player ? `Seat ${player.seat+1}` : `Seat ${seatIndex+1}`}
          </div>
          {selectable && (
            <div className="text-[8px] sm:text-[10px] font-bold text-amber-300 animate-pulse" 
                 style={{textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 8px rgba(251,191,36,0.6)'}}>
              CLICK TO PASS
            </div>
          )}
        </div>
        {isMe && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-bold bg-gradient-to-r from-cyan-600 to-blue-600 text-white px-3 py-1 rounded-full shadow-lg border border-cyan-400/50" 
               style={{textShadow: '0 1px 2px rgba(0,0,0,0.8)'}}>
            YOU
          </div>
        )}
        {isDealer && (
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 text-[10px] font-bold bg-gradient-to-r from-purple-600 to-violet-600 text-white px-3 py-1 rounded-full shadow-lg border border-purple-400/50" 
               style={{textShadow: '0 1px 2px rgba(0,0,0,0.8)'}}>
            DEALER
          </div>
        )}
        {isLaydownPlayer && (
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 text-[10px] font-bold bg-gradient-to-r from-amber-500 to-orange-500 text-white px-3 py-1 rounded-full shadow-lg border border-amber-400/50 animate-pulse" 
               style={{textShadow: '0 1px 2px rgba(0,0,0,0.8)', filter: 'drop-shadow(0 0 4px rgba(251,191,36,0.6))'}}>
            LAYDOWN
          </div>
        )}
        {highlight && !isLaydownPlayer && (
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 text-[10px] font-bold bg-gradient-to-r from-emerald-500 to-green-500 text-white px-3 py-1 rounded-full shadow-lg border border-emerald-400/50" 
               style={{textShadow: '0 1px 2px rgba(0,0,0,0.8)', filter: 'drop-shadow(0 0 4px rgba(16,185,129,0.6))'}}>
            TURN
          </div>
        )}
        {/* Online/Offline Status */}
        {player && (
          <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 ${
            player.connected 
              ? 'bg-green-500 border-green-400 shadow-[0_0_8px_rgba(34,197,94,0.6)]' 
              : 'bg-red-500 border-red-400 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
          }`}>
            {player.connected && (
              <div className="w-full h-full rounded-full bg-green-400 animate-pulse"></div>
            )}
          </div>
        )}
        {player && !player.connected && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-bold bg-gradient-to-r from-red-600 to-red-700 text-white px-3 py-1 rounded-full shadow-lg border border-red-400/50" 
               style={{textShadow: '0 1px 2px rgba(0,0,0,0.8)', filter: 'drop-shadow(0 0 4px rgba(239,68,68,0.6))'}}>
            OFFLINE
          </div>
        )}
      </button>
    );
  }
  
