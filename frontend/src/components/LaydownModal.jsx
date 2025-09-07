import { useMemo, useState } from "react";
import { useStore } from "../store";
import { send } from "../ws";
import Card from "./Card";
import { SUITS, RANKS_LOWER, RANKS_UPPER } from "../lib/deck";

export default function LaydownModal({ onClose }) {
  const { state, me, ws } = useStore();
  const players = state?.players || {};
  const my = players[me.id];

  const teammates = useMemo(
    () => Object.values(players).filter(p => p.team && my?.team && p.team === my.team && p.id !== my.id),
    [players, my?.team, my?.id]
  );

  const [step, setStep] = useState(1);
  const [suit, setSuit] = useState(null);
  const [setType, setSetType] = useState(null); // 'lower' | 'upper'
  const [mine, setMine] = useState([]); // ranks I've selected
  const [collabs, setCollabs] = useState([]); // [{player_id, ranks:[]}, ...]

  const ranksForSet = useMemo(() => setType === 'lower' ? RANKS_LOWER : setType === 'upper' ? RANKS_UPPER : [], [setType]);

  // compute missing ranks after choosing my cards + collaborators
  const missingRanks = useMemo(() => {
    const chosen = new Set(mine);
    collabs.forEach(c => (c.ranks||[]).forEach(r => chosen.add(r)));
    return ranksForSet.filter(r => !chosen.has(r));
  }, [mine, collabs, ranksForSet]);

  const myRanksAvailable = useMemo(() => {
    if (!suit || !setType) return [];
    const rs = ranksForSet;
    const mineInSuit = new Set((my?.hand||[]).filter(c=>c.suit===suit).map(c=>c.rank));
    return rs.filter(r=>mineInSuit.has(r));
  }, [my, suit, setType, ranksForSet]);

  const teammateRanksAvailable = (pid) => {
    const p = players[pid];
    if (!p || !suit || !setType) return [];
    const rs = ranksForSet;
    const have = new Set((p.hand||[]).filter(c=>c.suit===suit).map(c=>c.rank));
    return rs.filter(r=>have.has(r));
  };

  const toggleMine = (r) => {
    setMine((arr)=> arr.includes(r) ? arr.filter(x=>x!==r) : [...arr, r]);
  };
  const addCollaborator = (pid) => {
    if (!pid) return;
    if (collabs.find(c=>c.player_id===pid)) return;
    setCollabs([...collabs, { player_id: pid, ranks: [] }]);
  };
  const toggleCollabRank = (pid, r) => {
    setCollabs(collabs.map(c=>{
      if (c.player_id!==pid) return c;
      const exists = c.ranks.includes(r);
      return { ...c, ranks: exists ? c.ranks.filter(x=>x!==r) : [...c.ranks, r] };
    }));
  };

  const canConfirm = useMemo(() => {
    return suit && setType && missingRanks.length === 0 && mine.length + collabs.reduce((s,c)=>s+(c.ranks?.length||0),0) === ranksForSet.length;
  }, [suit, setType, mine, collabs, missingRanks, ranksForSet.length]);

  const sendLaydown = () => {
    const collaborators = collabs
      .filter(c=>c.ranks?.length)
      .map(c=>({
        player_id: c.player_id,
        cards: c.ranks.map(r=>({ suit, rank:r }))
      }));
    send(ws, 'laydown', {
      who_id: my.id,
      suit,
      set_type: setType,
      collaborators
    });
    onClose?.();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center p-4">
      <div className="w-[720px] max-w-[95vw] bg-zinc-900 rounded-2xl p-5 card-shadow">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">Lay Down a Set</div>
          <button className="text-zinc-300 hover:text-white" onClick={onClose}>✕</button>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-3 text-xs mb-4 opacity-80">
          <StepDot active={step===1}>Select Set</StepDot>
          <span>›</span>
          <StepDot active={step===2}>Choose Your Cards</StepDot>
          <span>›</span>
          <StepDot active={step===3}>Add Teammates (Optional)</StepDot>
          <span>›</span>
          <StepDot active={step===4}>Confirm</StepDot>
        </div>

        {step===1 && (
          <div>
            <div className="mb-3">Choose the suit and set type.</div>
            <div className="grid grid-cols-4 gap-3">
              {SUITS.map(s=>(
                <button
                  key={s}
                  onClick={()=>setSuit(s)}
                  className={`rounded-xl px-3 py-2 bg-zinc-800 text-left ${suit===s?'ring-2 ring-cyan-500':''}`}
                >
                  <div className="font-medium capitalize">{s}</div>
                </button>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button className={`px-3 py-2 rounded bg-zinc-800 ${setType==='lower'?'ring-2 ring-cyan-500':''}`} onClick={()=>setSetType('lower')}>Lower (2–7)</button>
              <button className={`px-3 py-2 rounded bg-zinc-800 ${setType==='upper'?'ring-2 ring-cyan-500':''}`} onClick={()=>setSetType('upper')}>Upper (8–A)</button>
            </div>
            <div className="mt-5 flex justify-end">
              <button disabled={!suit||!setType} className="px-4 py-2 rounded bg-indigo-600 disabled:opacity-40" onClick={()=>setStep(2)}>Next</button>
            </div>
          </div>
        )}

        {step===2 && (
          <div>
            <div className="mb-2 opacity-80 text-sm">Pick your cards in this set:</div>
            <div className="flex flex-wrap gap-2">
              {ranksForSet.map(r=>{
                const have = myRanksAvailable.includes(r);
                const on = mine.includes(r);
                return (
                  <button
                    key={`mine-${r}`}
                    disabled={!have}
                    onClick={()=>toggleMine(r)}
                    className={`rounded-xl px-2 py-2 bg-zinc-800 disabled:opacity-30 ${on?'ring-2 ring-emerald-500':''}`}
                  >
                    <Card suit={suit} rank={r} />
                  </button>
                );
              })}
            </div>
            <div className="mt-5 flex justify-between">
              <button className="px-4 py-2 rounded bg-zinc-700" onClick={()=>setStep(1)}>Back</button>
              <div className="flex gap-2">
                <button className="px-4 py-2 rounded bg-emerald-700" onClick={()=>{ /* if I already have full set */ if(missingRanks.length===0) { sendLaydown(); } }} disabled={missingRanks.length!==0}>Lay down now</button>
                <button className="px-4 py-2 rounded bg-indigo-600" onClick={()=>setStep(3)}>Next</button>
              </div>
            </div>
          </div>
        )}

        {step===3 && (
          <div>
            <div className="mb-2 text-sm opacity-80">Add teammates and select the remaining cards.</div>
            <div className="mb-3">
              <select className="bg-zinc-800 rounded px-3 py-2" defaultValue="" onChange={(e)=>{ const pid=e.target.value; if(pid) addCollaborator(pid); e.target.value=""; }}>
                <option value="" disabled>Select teammate…</option>
                {teammates.map(t=>(
                  <option key={t.id} value={t.id}>{t.avatar} {t.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-4 max-h-[40vh] overflow-auto pr-1">
              {collabs.map(c=>{
                const avail = teammateRanksAvailable(c.player_id);
                return (
                  <div key={c.player_id} className="bg-zinc-800 rounded-xl p-3">
                    <div className="mb-2 font-medium">{players[c.player_id]?.name}</div>
                    <div className="flex flex-wrap gap-2">
                      {ranksForSet.map(r=>{
                        const can = avail.includes(r);
                        const on = c.ranks.includes(r);
                        const alreadyMine = mine.includes(r);
                        return (
                          <button
                            key={`${c.player_id}-${r}`}
                            disabled={!can || alreadyMine}
                            onClick={()=>toggleCollabRank(c.player_id, r)}
                            className={`rounded-xl px-2 py-2 bg-zinc-900 disabled:opacity-30 ${on?'ring-2 ring-emerald-500':''}`}
                          >
                            <Card suit={suit} rank={r} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex justify-between">
              <button className="px-4 py-2 rounded bg-zinc-700" onClick={()=>setStep(2)}>Back</button>
              <button className="px-4 py-2 rounded bg-indigo-600" onClick={()=>setStep(4)}>Next</button>
            </div>
          </div>
        )}

        {step===4 && (
          <div>
            <div className="mb-3">Review selection</div>
            <div className="text-sm mb-2 opacity-80">Set: <b className="capitalize">{suit}</b> — <b>{setType==='lower'?'Lower (2–7)':'Upper (8–A)'}</b></div>
            <div className="mb-2 text-sm">Missing ranks: {missingRanks.length ? missingRanks.join(", ") : "None"}</div>
            <div className="mb-4 text-sm opacity-80">Contributors:</div>
            <ul className="text-sm list-disc list-inside mb-4">
              <li><b>You:</b> {mine.length ? mine.join(", ") : "—"}</li>
              {collabs.map(c=>(
                <li key={`rev-${c.player_id}`}><b>{players[c.player_id]?.name}:</b> {c.ranks.length? c.ranks.join(", "): "—"}</li>
              ))}
            </ul>
            <div className="flex justify-between">
              <button className="px-4 py-2 rounded bg-zinc-700" onClick={()=>setStep(3)}>Back</button>
              <button className="px-4 py-2 rounded bg-emerald-600 disabled:opacity-40" onClick={sendLaydown} disabled={!canConfirm}>Confirm & Lay Down</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StepDot({ active, children }) {
  return (
    <div className={`px-2 py-[2px] rounded-full ${active?'bg-white/15 text-white':'bg-white/5 text-white/70'}`}>{children}</div>
  );
}
