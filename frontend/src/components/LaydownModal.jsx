import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { send } from "../ws";
import Card from "./Card";
import { SUITS, RANKS_LOWER, RANKS_UPPER } from "../lib/deck";

const SETS = { lower: RANKS_LOWER, upper: RANKS_UPPER };

export default function LaydownModal({ onClose }) {
  const { state, me, ws } = useStore();
  const players = state?.players || {};
  const my = players[me.id];

  // Send initial bubble message when modal opens
  useEffect(() => {
    if (me?.id) {
      send(ws, "bubble_message", {
        player_id: me.id,
        variant: "laydown_start"
      });
    }
  }, [me?.id, ws]);

  // Clear bubble messages when modal closes
  const handleClose = () => {
    if (me?.id) {
      // Clear bubble messages for the laydown player
      send(ws, "clear_bubble_messages", {
        player_id: me.id
      });
      
      // Clear bubble messages for all selected teammates
      Object.keys(collabRanks).forEach(teammateId => {
        send(ws, "clear_bubble_messages", {
          player_id: teammateId
        });
      });
    }
    onClose?.();
  };

  const [step, setStep] = useState(0); // 0 select set, 1 choose my cards, 2 teammates, 3 confirm
  const [pick, setPick] = useState({ suit: null, setType: null });

  // ranks I (declarer) contribute
  const [myRanks, setMyRanks] = useState([]);
  // collaborators (blind): { player_id -> Set<rank> }
  const [collabRanks, setCollabRanks] = useState({});

  // ---------- Derived helpers ----------
  const myTeamMates = useMemo(
    () => Object.values(players).filter((p) => p.id !== me.id && p.team === my?.team),
    [players, me?.id, my?.team]
  );

  // Eligible sets = only those where I hold at least one card in that suit & set
  const eligibleSets = useMemo(() => {
    if (!my) return [];
    const res = [];
    for (const s of SUITS) {
      const hasLower = (my.hand || []).some((c) => c.suit === s && RANKS_LOWER.includes(c.rank));
      const hasUpper = (my.hand || []).some((c) => c.suit === s && RANKS_UPPER.includes(c.rank));
      if (hasLower) res.push({ suit: s, type: "lower" });
      if (hasUpper) res.push({ suit: s, type: "upper" });
    }
    return res;
  }, [my]);

  // When hand changes, make sure current pick is still eligible
  useEffect(() => {
    if (!pick.suit || !pick.setType) return;
    const ok = eligibleSets.some((e) => e.suit === pick.suit && e.type === pick.setType);
    if (!ok) {
      setPick({ suit: null, setType: null });
      setStep(0);
      setMyRanks([]);
      setCollabRanks({});
    }
  }, [eligibleSets]); // eslint-disable-line react-hooks/exhaustive-deps

  const setRanks = useMemo(
    () => (pick.setType ? SETS[pick.setType] : []),
    [pick.setType]
  );

  const mySetRanks = useMemo(() => {
    if (!pick.suit || !pick.setType) return [];
    const neededSet = new Set(setRanks);
    const mine = (my?.hand || []).filter((c) => c.suit === pick.suit && neededSet.has(c.rank));
    const order = new Map(setRanks.map((r, i) => [r, i]));
    return mine.sort((a, b) => (order.get(a.rank) ?? 0) - (order.get(b.rank) ?? 0));
  }, [pick.suit, pick.setType, my?.hand, setRanks]);

  const remainingNeeded = useMemo(() => {
    const taken = new Set(myRanks);
    Object.values(collabRanks).forEach((rset) => rset.forEach((r) => taken.add(r)));
    return setRanks.filter((r) => !taken.has(r));
  }, [setRanks, myRanks, collabRanks]);

  // Auto-select all available cards when set is picked
  useEffect(() => {
    if (pick.suit && pick.setType && step === 0) {
      const availableRanks = mySetRanks.map(c => c.rank);
      setMyRanks(availableRanks);
    }
  }, [pick.suit, pick.setType, mySetRanks, step]);

  // ---------- Mutators ----------
  function toggleMyRank(rank) {
    setMyRanks((prev) => (prev.includes(rank) ? prev.filter((r) => r !== rank) : [...prev, rank]));
  }
  function addRankFor(pid, rank) {
    setCollabRanks((prev) => {
      const next = { ...prev };
      const set = new Set(next[pid] || []);
      if (set.has(rank)) set.delete(rank);
      else set.add(rank);
      next[pid] = set;
      
      // Send bubble message for teammate selection (always send updated cards)
      const teammate = players[pid];
      const teammateCards = Array.from(set).map(r => ({ suit: pick.suit, rank: r }));
      
      if (set.size > 0) {
        // Send bubble with assigned cards
        send(ws, "bubble_message", {
          player_id: pid, // Send from the teammate's perspective
          variant: "laydown_teammate",
          teammate_name: teammate?.name,
          cards: teammateCards
        });
      } else {
        // Clear bubble if no cards assigned
        send(ws, "clear_bubble_messages", {
          player_id: pid
        });
      }
      
      return next;
    });
  }
  function resetCollab(pid) {
    setCollabRanks((prev) => {
      const n = { ...prev };
      delete n[pid];
      
      // Clear bubble when teammate assignments are reset
      send(ws, "clear_bubble_messages", {
        player_id: pid
      });
      
      return n;
    });
  }

  function nextStep() {
    if (step === 0 && (!pick.suit || !pick.setType)) return;
    
    // Send bubble message when moving to step 1 (showing cards)
    if (step === 0) {
      const myCards = mySetRanks.filter(c => myRanks.includes(c.rank));
      send(ws, "bubble_message", {
        player_id: me.id,
        variant: "laydown_cards",
        cards: myCards
      });
    }
    
    // Skip step 1 validation since cards are auto-selected
    setStep((s) => s + 1);
  }
  function prevStep() {
    setStep((s) => Math.max(0, s - 1));
  }

  function sendBubbleMessage(variant, data = {}) {
    send(ws, "bubble_message", {
      player_id: me.id,
      variant,
      ...data
    });
  }

  function submitLaydown() {
    const collaborators = Object.entries(collabRanks)
      .filter(([_, set]) => set && set.size)
      .map(([player_id, set]) => ({ player_id, ranks: Array.from(set) }));

    send(ws, "laydown", {
      who_id: me.id,
      suit: pick.suit,
      set_type: pick.setType,
      collaborators,
    });
    
    // Clear all laydown bubble messages for laydown player and teammates
    send(ws, "clear_bubble_messages", {
      player_id: me.id
    });
    
    // Clear bubble messages for all selected teammates
    Object.keys(collabRanks).forEach(teammateId => {
      send(ws, "clear_bubble_messages", {
        player_id: teammateId
      });
    });
    
    handleClose();
  }

  const stepTitle =
    step === 0 ? "Select Set" :
    step === 1 ? "Your Cards" :
    step === 2 ? "Add Teammates (Optional)" :
    "Confirm";

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-zinc-900 rounded-2xl shadow-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-lg font-semibold">Lay Down a Set</div>
          <button className="text-zinc-300 hover:text-white" onClick={handleClose}>✕</button>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-2 text-xs mb-4">
          <StepDot active={step >= 0} label="Select Set" /><span>›</span>
          <StepDot active={step >= 1} label="Your Cards" /><span>›</span>
          <StepDot active={step >= 2} label="Add Teammates (Optional)" /><span>›</span>
          <StepDot active={step >= 3} label="Confirm" />
        </div>

        <div className="mb-3 font-medium">{stepTitle}</div>

        {/* STEP 0: pick set (ONLY ELIGIBLE) */}
        {step === 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {eligibleSets.length === 0 && (
              <div className="col-span-full text-sm opacity-70">
                You don’t currently hold any cards that can start a set.
              </div>
            )}
            {eligibleSets.map(({ suit, type }) => (
              <button
                key={`${suit}-${type}`}
                className={`p-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-left ${
                  pick.suit === suit && pick.setType === type ? "ring-2 ring-emerald-500" : ""
                }`}
                onClick={() => {
                  setPick({ suit, setType: type });
                  setMyRanks([]);        // reset selection when switching sets
                  setCollabRanks({});
                  
                  // Send bubble message for set selection
                  send(ws, "bubble_message", {
                    player_id: me.id,
                    variant: "laydown_set",
                    suit,
                    set_type: type
                  });
                }}
              >
                <div className="flex items-center gap-2">
                  <Card suit={suit} rank={type === "lower" ? "2" : "8"} size="xs" />
                  <div className="text-sm capitalize">
                    {suit} <span className="opacity-70">{type}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* STEP 1: show my cards (auto-selected) */}
        {step === 1 && (
          <div>
            <div className="text-xs opacity-70 mb-2">
              Your cards for this set (auto-selected):
            </div>
            <div className="flex flex-wrap gap-2">
              {mySetRanks.map((c) => {
                const selected = myRanks.includes(c.rank);
                return (
                  <div
                    key={`${c.suit}-${c.rank}`}
                    className={`rounded-xl p-1 ${
                      selected ? "ring-2 ring-emerald-500 bg-emerald-500/10" : "bg-zinc-800"
                    }`}
                  >
                    <Card suit={c.suit} rank={c.rank} size="md" />
                  </div>
                );
              })}
              {!mySetRanks.length && (
                <div className="text-xs opacity-60">You don't hold any cards from this set.</div>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: teammates (blind, with real card visuals for ranks) */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="text-xs opacity-70">
              Assign remaining ranks to teammates <span className="italic">(you won’t see their cards)</span>.
            </div>

            {/* Remaining ranks as cards */}
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="text-xs opacity-80">Remaining:</span>
              {remainingNeeded.map((r) => (
                <div key={`rem-${r}`} className="rounded-lg bg-zinc-800 p-1">
                  <Card suit={pick.suit} rank={r} size="xs" />
                </div>
              ))}
              {!remainingNeeded.length && (
                <span className="text-xs opacity-60">None — you already have a full set.</span>
              )}
            </div>

            {/* Teammate rows */}
            {myTeamMates.length ? (
              myTeamMates.map((tm) => {
                const assigned = new Set(collabRanks[tm.id] || []);
                const takenByOthers = new Set(myRanks);
                Object.entries(collabRanks).forEach(([pid, set]) => {
                  if (pid !== tm.id) Array.from(set || []).forEach((rr) => takenByOthers.add(rr));
                });
                const available = setRanks.filter((r) => !takenByOthers.has(r));

                return (
                  <div key={tm.id} className={`rounded-xl p-3 ${
                    assigned.size > 0 ? "bg-emerald-500/20 ring-2 ring-emerald-500" : "bg-zinc-850/40"
                  }`}>
                    <div className="mb-2 text-sm">{tm.avatar} {tm.name}</div>
                    {available.length ? (
                      <div className="flex flex-wrap gap-2">
                        {available.map((r) => {
                          const on = assigned.has(r);
                          return (
                            <button
                              key={`pick-${tm.id}-${r}`}
                              onClick={() => addRankFor(tm.id, r)}
                              className={`rounded-lg p-1 ${
                                on ? "ring-2 ring-emerald-500 bg-emerald-500/10" : "bg-zinc-800 hover:bg-zinc-700"
                              }`}
                              title={on ? "Selected" : "Select"}
                            >
                              <Card suit={pick.suit} rank={r} size="sm" />
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-xs opacity-60">No ranks left to assign.</div>
                    )}

                    {assigned.size > 0 && (
                      <div className="mt-2 text-xs opacity-80 flex items-center gap-2 flex-wrap">
                        <span>Selected:</span>
                        {Array.from(assigned).map((r) => (
                          <span key={`sel-${tm.id}-${r}`} className="inline-block rounded bg-emerald-500/10 p-1">
                            <Card suit={pick.suit} rank={r} size="xs" />
                          </span>
                        ))}
                        <button className="ml-2 text-rose-300 hover:underline" onClick={() => resetCollab(tm.id)}>
                          clear
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-xs opacity-60">No teammates on your team.</div>
            )}
          </div>
        )}

        {/* STEP 3: confirm */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="text-sm">Review your declaration:</div>
            <div className="text-xs opacity-80">
              Set: <span className="capitalize">{pick.suit}</span> {pick.setType}
            </div>
            <div className="text-xs">
              <span className="opacity-70 mr-1">You:</span>
              {myRanks.length ? (
                <div className="inline-flex gap-1 align-middle">
                  {myRanks.map((r) => (
                    <span key={`me-${r}`} className="inline-block rounded bg-zinc-800 p-1">
                      <Card suit={pick.suit} rank={r} size="xs" />
                    </span>
                  ))}
                </div>
              ) : (
                "—"
              )}
            </div>
            <div className="text-xs space-y-2">
              {Object.entries(collabRanks).map(([pid, set]) => (
                <div key={pid} className="flex items-center gap-2">
                  <span className="opacity-70">{players[pid]?.name}:</span>
                  <div className="inline-flex gap-1">
                    {Array.from(set || []).map((r) => (
                      <span key={`c-${pid}-${r}`} className="inline-block rounded bg-zinc-800 p-1">
                        <Card suit={pick.suit} rank={r} size="xs" />
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {!Object.keys(collabRanks).length && (
                <div className="opacity-60 text-xs">No teammates assigned.</div>
              )}
            </div>
            <div className="text-xs opacity-70">
              If any assigned rank is wrong or missing, the set will be awarded to the opposing team and the turn passes counter-clockwise.
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-5 flex items-center justify-between">
          <button className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700" onClick={step === 0 ? handleClose : prevStep}>
            {step === 0 ? "Close" : "Back"}
          </button>
          <div className="flex items-center gap-2">
            {step < 3 && (
              <button
                className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40"
                disabled={
                  step === 0 ? !(pick.suit && pick.setType) : false
                }
                onClick={nextStep}
              >
                Next
              </button>
            )}
            {step === 3 && (
              <button className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500" onClick={submitLaydown}>
                Confirm Laydown
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepDot({ active, label }) {
  return (
    <div className={`px-2 py-1 rounded-full ${active ? "bg-zinc-700" : "bg-zinc-800"} text-zinc-200`}>
      {label}
    </div>
  );
}
