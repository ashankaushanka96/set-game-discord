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
          <div className="text-[10px] sm:text-xs mt-1 opacity-90 line-clamp-1 bg-black/50 px-1 rounded backdrop-blur-sm">
            {player?.name || 'Empty'}
          </div>
          <div className="text-[8px] sm:text-[10px] opacity-60 bg-black/50 px-1 rounded backdrop-blur-sm">
            {player ? `Seat ${player.seat+1}` : `Seat ${seatIndex+1}`}
          </div>
          {selectable && (
            <div className="text-[8px] sm:text-[10px] text-amber-300 font-bold bg-amber-500/20 px-1 rounded backdrop-blur-sm animate-pulse">
              CLICK TO PASS
            </div>
          )}
        </div>
        {isMe && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[10px] bg-cyan-600/90 px-2 py-[2px] rounded-full">
            You
          </div>
        )}
        {isDealer && (
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 text-[10px] bg-purple-600/90 px-2 py-[2px] rounded-full">
            Dealer
          </div>
        )}
        {isLaydownPlayer && (
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 text-[10px] bg-amber-500/90 px-2 py-[2px] rounded-full font-semibold animate-pulse">
            LAYDOWN
          </div>
        )}
        {highlight && !isLaydownPlayer && (
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 text-[10px] bg-emerald-500/90 px-2 py-[2px] rounded-full font-semibold">
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
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] bg-red-600/95 px-2 py-1 rounded-full font-bold text-white shadow-lg">
            OFFLINE
          </div>
        )}
      </button>
    );
  }
  
