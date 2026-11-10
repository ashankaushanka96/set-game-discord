import GlassmorphismModal from '../ui/GlassmorphismModal';
import { Card } from '../cards';

export default function AskRankModal({ open, suit, setType, askableRanks, onPick, onClose }) {
  if (!open) return null;
  return (
    <GlassmorphismModal isOpen={open} onClose={onClose} size="lg">
      <div>
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
    </GlassmorphismModal>
  );
}
