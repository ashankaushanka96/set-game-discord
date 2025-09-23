import { useState, useMemo } from 'react';
import { useStore } from '../../store';
import { send } from '../../ws';
import { RANKS_LOWER, RANKS_UPPER, SUITS } from '../../lib/deck';
import GlassmorphismModal from '../ui/GlassmorphismModal';

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
    <GlassmorphismModal isOpen={true} onClose={onClose} size="sm">
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white text-center">Ask Card</h2>

        <select 
          className="w-full bg-white/10 backdrop-blur-sm border border-white/20 px-3 py-2 rounded-xl text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-accent-blue/50 focus:border-accent-blue/50 transition-all duration-200" 
          value={target} 
          onChange={e=>setTarget(e.target.value)}
        >
          <option value="">Select Opponent</option>
          {opponents.map(p => (
            <option key={p.id} value={p.id} className="bg-dark-card text-white">{p.avatar} {p.name}</option>
          ))}
        </select>

        <select
          className="w-full bg-white/10 backdrop-blur-sm border border-white/20 px-3 py-2 rounded-xl text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-accent-blue/50 focus:border-accent-blue/50 transition-all duration-200"
          value={`${suit}-${setType}`}
          onChange={e => { const [s,t] = e.target.value.split('-'); setSuit(s); setSetType(t); setRank(''); }}
        >
          {eligibleSets.map(es => (
            <option key={`${es.suit}-${es.type}`} value={`${es.suit}-${es.type}`} className="bg-dark-card text-white">
              {es.suit} {es.type}
            </option>
          ))}
        </select>

        <select 
          className="w-full bg-white/10 backdrop-blur-sm border border-white/20 px-3 py-2 rounded-xl text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-accent-blue/50 focus:border-accent-blue/50 transition-all duration-200" 
          value={rank} 
          onChange={e=>setRank(e.target.value)}
        >
          <option value="">Select Rank</option>
          {askableRanks.map(r => <option key={r} value={r} className="bg-dark-card text-white">{r}</option>)}
        </select>

        <div className="flex justify-end gap-3 pt-2">
          <button 
            onClick={onClose} 
            className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 rounded-xl text-white transition-all duration-200 hover:shadow-lg"
          >
            Cancel
          </button>
          <button 
            onClick={handleSend} 
            className="px-4 py-2 bg-gradient-to-r from-accent-emerald to-accent-cyan hover:shadow-glow-emerald rounded-xl text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed" 
            disabled={!target || !rank}
          >
            Ask
          </button>
        </div>
      </div>
    </GlassmorphismModal>
  );
}
