import { useState } from 'react';
import { useStore } from '../store';
import { send } from '../ws';
import { RANKS_LOWER, RANKS_UPPER, SUITS } from '../lib/deck';

export default function LaydownModal({ onClose }){
  const { state, me, ws } = useStore();
  const [suit, setSuit] = useState('hearts');
  const [setType, setSetType] = useState('lower');
  const [collab, setCollab] = useState({});

  const my = state.players[me.id];

  function handleLaydown(){
    send(ws,'laydown',{ who_id: me.id, suit, set_type: setType, collaborators: collab });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
      <div className="bg-zinc-900 p-6 rounded-xl space-y-3 w-96">
        <h2 className="text-lg font-bold">Lay Down Set</h2>
        <select className="w-full bg-zinc-800 px-2 py-1 rounded" value={`${suit}-${setType}`} onChange={e=>{
          const [s,t] = e.target.value.split('-'); setSuit(s); setSetType(t);
        }}>
          {SUITS.flatMap(s=>['lower','upper'].map(t=>
            <option key={`${s}-${t}`} value={`${s}-${t}`}>{s} {t}</option>
          ))}
        </select>
        <div className="text-sm text-gray-400">If collaborating, you must correctly declare teammates' cards.</div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 bg-zinc-700 rounded">Cancel</button>
          <button onClick={handleLaydown} className="px-3 py-1 bg-indigo-600 rounded">Lay Down</button>
        </div>
      </div>
    </div>
  );
}
