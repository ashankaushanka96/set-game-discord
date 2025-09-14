export default function TurnBanner({ state }){
    const pid = state?.turn_player;
    const p = pid ? state.players[pid] : null;
    return (
      <div className={`fixed top-4 right-4 px-4 py-2 rounded-xl card-shadow ${
        p ? 'bg-emerald-600/90 border-2 border-emerald-400' : 'bg-zinc-800'
      }`}>
        {p ? (
          <div className="flex items-center gap-2 text-white font-semibold">
            <span>🎯 Turn:</span>
            {typeof p.avatar === "string" && p.avatar.startsWith("http") ? (
              <img 
                src={p.avatar} 
                alt={p.name || 'Player'} 
                className="h-6 w-6 rounded-full border border-white/30" 
                referrerPolicy="no-referrer"
              />
            ) : (
              <span>{p.avatar}</span>
            )}
            <b>{p.name}</b>
          </div>
        ) : (
          <span className="text-zinc-300">Waiting...</span>
        )}
      </div>
    );
  }
  