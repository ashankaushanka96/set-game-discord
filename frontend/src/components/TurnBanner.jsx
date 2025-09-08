export default function TurnBanner({ state }){
    const pid = state?.turn_player;
    const p = pid ? state.players[pid] : null;
    return (
      <div className={`fixed top-4 right-4 px-4 py-2 rounded-xl card-shadow ${
        p ? 'bg-emerald-600/90 border-2 border-emerald-400' : 'bg-zinc-800'
      }`}>
        {p ? (
          <span className="text-white font-semibold">
            🎯 Turn: {p.avatar} <b>{p.name}</b>
          </span>
        ) : (
          <span className="text-zinc-300">Waiting...</span>
        )}
      </div>
    );
  }
  