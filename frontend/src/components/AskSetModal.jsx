import Card from './Card';
import { firstCardOfSet } from '../lib/deck';

export default function AskSetModal({ open, eligibleSets, onPick, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-50">
      <div className="bg-zinc-900 rounded-2xl p-5 w-[680px] max-w-[95vw]">
        <div className="text-lg font-bold mb-4">Select Set</div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {eligibleSets.map(({ suit, type }) => {
            const c = firstCardOfSet(suit, type);
            return (
              <button
                key={`${suit}-${type}`}
                onClick={() => onPick({ suit, setType: type })}
                className="bg-zinc-800 hover:bg-zinc-700 transition rounded-xl p-3 text-left flex items-center gap-3"
              >
                <div className="shrink-0">
                  <Card suit={c.suit} rank={c.rank} size="sm" />
                </div>
                <div className="capitalize">
                  <div className="font-semibold">{suit}</div>
                  <div className="text-xs opacity-70">{type} set</div>
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-4 text-right">
          <button className="px-3 py-1 rounded bg-zinc-700" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
