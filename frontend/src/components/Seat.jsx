export default function Seat({ seatIndex, player, highlight }) {
    return (
      <div
        className={`w-28 h-28 rounded-full flex items-center justify-center border ${
          highlight ? 'border-emerald-400' : 'border-zinc-700'
        } bg-zinc-800 card-shadow`}
      >
        {player ? (
          <div className="text-center text-sm">
            <div className="text-2xl">{player.avatar}</div>
            <div className="truncate w-20">{player.name}</div>
            <div className="opacity-60">Seat {seatIndex + 1}</div>
          </div>
        ) : (
          <div className="opacity-40">Empty {seatIndex + 1}</div>
        )}
      </div>
    );
  }
  