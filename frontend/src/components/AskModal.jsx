import { useState, useMemo } from 'react';
import { useStore } from '../store';
import { send } from '../ws';
import { RANKS_LOWER, RANKS_UPPER, SUITS } from '../lib/deck';

export default function AskModal({ onClose }){
  const { state, me, ws } = useStore();
  const [target, setTarget] = useState('');
  const [suit, setSuit] = useState('hearts');
  const [setType, setSetType] = useState('lower');
  const [rank, setRank] = useState('');

  const my = state.players[me.id];

  const eligibleSets = useMemo(() => {
    const res = [];
    for (const s of SUITS) {
      const hasLower = my.hand.some(c => c.suit === s && RANKS_LOWER.includes(c.rank));
      const hasUpper = my.hand.some(c => c.suit === s && RANKS_UPPER.includes(c.rank));
      if (hasLower) res.push({ suit: s, type: 'lower' });
      if (hasUpper) res.push({ suit: s, type: 'upper' });
    }
    return res;
  }, [my]);

  const ranksForSet = setType === 'lower' ? RANKS_LOWER : RANKS_UPPER;

  // Filter out ranks I already hold (rule: cannot ask for what you already have)
  const askableRanks = useMemo(() => {
    const mine = new Set(my.hand.filter(c => c.suit === suit).map(c => c.rank));
    return ranksForSet.filter(r => !mine.has(r));
  }, [my, suit, ranksForSet]);

  const opponents = useMemo(
    () => Object.values(state.players).filter(p => p.team !== my.team),
    [state.players, my.team]
  );

  function handleSend(){
    if(!target || !rank) return;
    send(ws,'ask',{ asker_id: me.id, target_id: target, suit, set_type: setType, ranks: [rank] });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
      <div className="bg-zinc-900 p-6 rounded-xl space-y-3 w-96">
        <h2 className="text-lg font-bold">Ask Card</h2>

        <select className="w-full bg-zinc-800 px-2 py-1 rounded" value={target} onChange={e=>setTarget(e.target.value)}>
          <option value="">Select Opponent</option>
          {opponents.map(p => (
            <option key={p.id} value={p.id}>{p.avatar} {p.name}</option>
          ))}
        </select>

        <select
          className="w-full bg-zinc-800 px-2 py-1 rounded"
          value={`${suit}-${setType}`}
          onChange={e => { const [s,t] = e.target.value.split('-'); setSuit(s); setSetType(t); setRank(''); }}
        >
          {eligibleSets.map(es => (
            <option key={`${es.suit}-${es.type}`} value={`${es.suit}-${es.type}`}>
              {es.suit} {es.type}
            </option>
          ))}
        </select>

        <select className="w-full bg-zinc-800 px-2 py-1 rounded" value={rank} onChange={e=>setRank(e.target.value)}>
          <option value="">Select Rank</option>
          {askableRanks.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 bg-zinc-700 rounded">Cancel</button>
          <button onClick={handleSend} className="px-3 py-1 bg-emerald-600 rounded" disabled={!target || !rank}>
            Ask
          </button>
        </div>
      </div>
    </div>
  );
}
