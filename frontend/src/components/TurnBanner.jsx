export default function TurnBanner({ state }){
    const pid = state?.turn_player;
    const p = pid ? state.players[pid] : null;
    return (
      <div className="fixed top-4 right-4 bg-zinc-800 px-4 py-2 rounded-xl card-shadow">
        {p ? (<span>Turn: {p.avatar} <b>{p.name}</b></span>) : 'Waiting...'}
      </div>
    );
  }
  