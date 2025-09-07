import Card from './Card';

export default function AskRankModal({ open, suit, setType, askableRanks, onPick, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-50">
      <div className="bg-zinc-900 rounded-2xl p-5 w-[540px]">
        <div className="text-lg font-bold mb-3 capitalize">
          Select Card — {suit} {setType}
        </div>
        <div className="grid grid-cols-5 gap-3 justify-items-center">
          {askableRanks.map((r) => (
            <button
              key={r}
              onClick={() => onPick(r)}
              className="rounded-xl hover:scale-105 transition-transform"
              title={`${r} of ${suit}`}
            >
              <Card suit={suit} rank={r} size="sm" />
            </button>
          ))}
        </div>
        <div className="mt-4 text-right">
          <button className="px-3 py-1 rounded bg-zinc-700" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
