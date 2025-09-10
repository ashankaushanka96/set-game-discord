import { useState } from 'react';
import { Card } from '../cards';

function SetChip({ suit, set_type, owner, expandable=false, cards=[] }) {
  const label = set_type === 'lower' ? 'Lower' : 'Upper';
  const firstRank = set_type === 'lower' ? '2' : '8';
  const [open, setOpen] = useState(false);
  
  return (
    <div className="bg-zinc-800/70 rounded-xl p-2 flex items-center gap-2 text-sm">
      <div className="shrink-0">
        <Card suit={suit} rank={firstRank} size="xs" />
      </div>
      <div className="capitalize">
        {suit} <span className="opacity-70">{label}</span>
        <span className="ml-2 text-[11px] opacity-60">— Team {owner}</span>
      </div>
      {expandable && (
        <button
          className="ml-auto text-[12px] px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600"
          onClick={() => setOpen(v=>!v)}
        >
          {open ? 'Collapse' : 'Expand'}
        </button>
      )}
      {expandable && open && (
        <div className="w-full mt-2 flex flex-wrap gap-1">
          {cards.map((c,i)=>(
            <div key={`${c.suit}-${c.rank}-${i}`} className="rounded bg-zinc-700 p-[2px]">
              <Card suit={c.suit} rank={c.rank} size="xs" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CompletedSetsModal({ open, onClose, tableSets = [] }) {
  if (!open) return null;

  const setsA = tableSets.filter(ts => ts.owner_team === 'A');
  const setsB = tableSets.filter(ts => ts.owner_team === 'B');

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 rounded-xl max-w-md w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-700">
          <h2 className="text-lg font-semibold">Completed Sets</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
          {/* Team A Sets */}
          <div>
            <div className="text-sm font-semibold text-blue-300 mb-2 flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />
              Team A — Collected ({setsA.length})
            </div>
            {setsA.length === 0 ? (
              <div className="text-xs opacity-60 text-center py-4">No sets yet.</div>
            ) : (
              <div className="space-y-2">
                {setsA.map((ts, idx) => (
                  <SetChip 
                    key={`A-${idx}`} 
                    suit={ts.suit} 
                    set_type={ts.set_type} 
                    owner="A" 
                    expandable 
                    cards={ts.cards}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Team B Sets */}
          <div>
            <div className="text-sm font-semibold text-rose-300 mb-2 flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-rose-400" />
              Team B — Collected ({setsB.length})
            </div>
            {setsB.length === 0 ? (
              <div className="text-xs opacity-60 text-center py-4">No sets yet.</div>
            ) : (
              <div className="space-y-2">
                {setsB.map((ts, idx) => (
                  <SetChip 
                    key={`B-${idx}`} 
                    suit={ts.suit} 
                    set_type={ts.set_type} 
                    owner="B" 
                    expandable 
                    cards={ts.cards}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-700">
          <button
            onClick={onClose}
            className="w-full bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
