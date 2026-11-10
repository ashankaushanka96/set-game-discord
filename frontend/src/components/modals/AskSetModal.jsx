import GlassmorphismModal from '../ui/GlassmorphismModal';
import { Card } from '../cards';
import { firstCardOfSet } from '../../lib/deck';

export default function AskSetModal({ open, eligibleSets, onPick, onClose }) {
  if (!open) return null;
  return (
    <GlassmorphismModal isOpen={open} onClose={onClose} size="2xl">
      <div>
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
    </GlassmorphismModal>
  );
}
