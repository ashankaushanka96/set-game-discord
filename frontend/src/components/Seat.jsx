export default function Seat({ seatIndex, player, highlight, selectable, onSelect, team, isMe }) {
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
        onClick={handleClick}
        className={[
          'w-28 h-28 rounded-full flex flex-col items-center justify-center',
          'bg-zinc-800/90 card-shadow relative overflow-hidden',
          teamBg,
          selectable ? 'cursor-pointer hover:scale-[1.03] transition' : 'cursor-default',
          highlight ? 'outline outline-2 outline-emerald-400/70' : '',
          isMe ? 'ring-2 ring-cyan-400/70' : '',
        ].join(' ')}
      >
        <div className="text-2xl">🔥</div>
        <div className="text-xs mt-1 opacity-90 line-clamp-1">{player?.name || 'Empty'}</div>
        <div className="text-[10px] opacity-60">{player ? `Seat ${player.seat+1}` : `Seat ${seatIndex+1}`}</div>
        {isMe && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[10px] bg-cyan-600/90 px-2 py-[2px] rounded-full">
            You
          </div>
        )}
      </button>
    );
  }
  