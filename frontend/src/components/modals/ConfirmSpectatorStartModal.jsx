import GlassmorphismModal from '../ui/GlassmorphismModal';

// Asks the admin what to do when some players still have no seat: seat them (bots fill the rest),
// or start without them; they then wait until the table returns to the lobby.
// (Watching a game is only on the browser spectator page now, not inside Discord.)
export default function ConfirmSpectatorStartModal({ open, players = [], onSeat, onConfirm, onClose }) {
  if (!open) return null;
  const several = players.length > 1;

  return (
    <GlassmorphismModal isOpen={open} onClose={onClose} size="md">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="text-lg font-semibold text-white">
            {several ? `${players.length} players haven't picked a seat` : "A player hasn't picked a seat"}
          </div>
          <button className="text-zinc-300 hover:text-white" onClick={onClose}>✕</button>
        </div>

        <div className="space-y-3">
          <ul className="space-y-1">
            {players.map((p) => (
              <li key={p.id} className="text-sm text-white font-medium">• {p.name}</li>
            ))}
          </ul>
          <div className="text-sm text-zinc-300">
            Seat them now and start, or start without them? If you start without them,
            they wait until the table returns to the lobby.
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-white transition-colors"
            onClick={onClose}
          >
            Wait
          </button>
          <button
            className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-white transition-colors"
            onClick={onConfirm}
          >
            Start without them
          </button>
          <button
            className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
            onClick={onSeat}
          >
            Seat them &amp; start
          </button>
        </div>
      </div>
    </GlassmorphismModal>
  );
}
