export default function ConfirmUnassignModal({
  open,
  playerName,
  onConfirm,
  onClose
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 rounded-2xl shadow-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-lg font-semibold text-white">
            Remove Player from Team
          </div>
          <button className="text-zinc-300 hover:text-white" onClick={onClose}>✕</button>
        </div>

        <div className="space-y-3">
          <div className="text-sm text-zinc-300">
            Are you sure you want to remove <strong className="text-white">{playerName}</strong> from their team?
          </div>
          <div className="text-xs text-zinc-400">
            They will be unassigned from their current team and seat, and can rejoin any team.
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button 
            className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-white transition-colors" 
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white transition-colors"
            onClick={onConfirm}
          >
            Remove from Team
          </button>
        </div>
      </div>
    </div>
  );
}
