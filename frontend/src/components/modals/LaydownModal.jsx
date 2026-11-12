import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../../store";
import { send } from "../../ws";
import { Card, FannedCards } from "../cards";
import { SUITS, RANKS_LOWER, RANKS_UPPER, SUIT_SYMBOL } from "../../lib/deck";
import GlassmorphismModal from "../ui/GlassmorphismModal";

const SETS = { lower: RANKS_LOWER, upper: RANKS_UPPER };

// An unfinished laydown is saved on this device so a player who drops out (app closed,
// connection lost) comes back to the same step. Old drafts are ignored.
const DRAFT_MAX_AGE_MS = 15 * 60 * 1000;
const draftKey = (roomId, playerId) => `laydown_draft:${roomId}:${playerId}`;
export function loadLaydownDraft(roomId, playerId) {
  try {
    const draft = JSON.parse(localStorage.getItem(draftKey(roomId, playerId)) || "null");
    if (!draft || Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS) return null;
    return draft;
  } catch { return null; }
}
function saveLaydownDraft(roomId, playerId, draft) {
  try { localStorage.setItem(draftKey(roomId, playerId), JSON.stringify({ ...draft, savedAt: Date.now() })); } catch {}
}
function clearLaydownDraft(roomId, playerId) {
  try { localStorage.removeItem(draftKey(roomId, playerId)); } catch {}
}

export default function LaydownModal({ onClose, onPenalty, initialPick = null }) {
  const { state, me, ws } = useStore();
  const players = state?.players || {};
  const my = players[me.id];

  // Started from the hand (cards selected, then Lay): the set is already chosen, so this goes
  // straight to naming teammates at the table. A saved draft is only used when reopening.
  const draft = useRef(initialPick ? null : loadLaydownDraft(state?.room_id, me?.id)).current;
  const startRanks = useRef(initialPick
    ? (my?.hand || []).filter((c) => c.suit === initialPick.suit && SETS[initialPick.setType].includes(c.rank)).map((c) => c.rank)
    : null).current;

  // Send initial bubble message when modal opens (a restored laydown keeps the bubbles it already had)
  useEffect(() => {
    if (me?.id && !draft) {
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
    clearLaydownDraft(state?.room_id, me?.id);
    onClose?.();
  };

  const [step, setStep] = useState(initialPick ? 1 : Math.min(draft?.step ?? 0, 2)); // 0 select set, 1 my cards, 2 teammates on the table + confirm
  const [pick, setPick] = useState(initialPick ?? draft?.pick ?? { suit: null, setType: null });

  // ranks I (declarer) contribute
  const [myRanks, setMyRanks] = useState(startRanks ?? draft?.myRanks ?? []);
  // collaborators (blind): { player_id -> Set<rank> }
  const [collabRanks, setCollabRanks] = useState(() =>
    Object.fromEntries(Object.entries(draft?.collabRanks || {}).map(([pid, ranks]) => [pid, new Set(ranks)])));

  // Keep the draft up to date while the dialog is open
  useEffect(() => {
    saveLaydownDraft(state?.room_id, me?.id, {
      step, pick, myRanks,
      collabRanks: Object.fromEntries(Object.entries(collabRanks).map(([pid, set]) => [pid, [...set]])),
    });
  }, [step, pick, myRanks, collabRanks, state?.room_id, me?.id]);

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

  // Started from the Lay button: nothing is shown to the table until the player confirms.
  function confirmStart() {
    send(ws, "bubble_message", {
      player_id: me.id,
      variant: "laydown_cards",
      cards: myRanks.map((rank) => ({ suit: pick.suit, rank })),
    });
    setStep(2);
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

  // ---------- Step 2 happens on the table ----------
  // The dialog shrinks to a strip of the cards still needed. The player taps a card, then
  // taps the teammate's seat at the table who holds it.
  const neededRanks = useMemo(() => setRanks.filter((r) => !myRanks.includes(r)), [setRanks, myRanks]);
  const ownerOf = (r) => Object.entries(collabRanks).find(([, set]) => set?.has?.(r))?.[0];
  const [activeRank, setActiveRank] = useState(null);
  useEffect(() => {
    if (step !== 2) return;
    if (!activeRank || !neededRanks.includes(activeRank)) setActiveRank(neededRanks.find((r) => !ownerOf(r)) || neededRanks[0] || null);
  }, [step, neededRanks]); // eslint-disable-line react-hooks/exhaustive-deps
  const mateIds = useMemo(() => myTeamMates.filter((tm) => (tm.hand?.length ?? 1) > 0).map((tm) => tm.id), [myTeamMates]);
  useEffect(() => {
    if (step !== 2 || !activeRank || !pick.suit) { useStore.setState({ laydownPick: null }); return; }
    useStore.setState({ laydownPick: { suit: pick.suit, rank: activeRank, mates: mateIds } });
    return () => useStore.setState({ laydownPick: null });
  }, [step, activeRank, pick.suit, mateIds]);
  useEffect(() => {
    if (step !== 2) return;
    const onSeat = (event) => {
      const pid = event.detail?.pid;
      if (!pid || !activeRank || !mateIds.includes(pid)) return;
      const current = ownerOf(activeRank);
      if (current) addRankFor(current, activeRank);
      if (current !== pid) {
        addRankFor(pid, activeRank);
        // move on to the next card nobody has been named for yet
        const next = neededRanks.find((r) => r !== activeRank && !ownerOf(r));
        if (next) setActiveRank(next);
      }
    };
    window.addEventListener("laydown_seat_pick", onSeat);
    return () => window.removeEventListener("laydown_seat_pick", onSeat);
  }, [step, activeRank, mateIds, neededRanks, collabRanks]); // eslint-disable-line react-hooks/exhaustive-deps

  if (step === 1 && initialPick) {
    return (
      <div className="laydown-tablepick" role="dialog" aria-label="Confirm laydown">
        <div className="laydown-tablepick__head laydown-tablepick__head--plain">
          <strong>Lay down <span className="capitalize">{pick.suit}</span> {pick.setType}?</strong>
          <span>Your cards of this set will be shown to the table. After that you must finish the laydown.</span>
        </div>
        <div className="laydown-tablepick__foot">
          <button type="button" className="club-secondary laydown-tablepick__no" onClick={handleClose}>Cancel</button>
          <button type="button" className="club-primary" onClick={confirmStart}>Yes, lay down</button>
        </div>
      </div>
    );
  }

  if (step === 2) {
    const left = neededRanks.filter((r) => !ownerOf(r)).length;
    return (
      <div className="laydown-tablepick" role="dialog" aria-label="Choose who holds each card">
        <div className="laydown-tablepick__head">
          <strong><span className="capitalize">{pick.suit}</span> {pick.setType}: who holds each card?</strong>
          <span>{!neededRanks.length ? "You hold the whole set." : !mateIds.length ? "No teammate has cards." : "Tap a card, then tap your teammate at the table."}</span>
        </div>
        {neededRanks.length > 0 && <div className="laydown-tablepick__cards">
          {neededRanks.map((r) => {
            const owner = players[ownerOf(r)];
            return <button key={r} type="button" aria-pressed={activeRank === r} className={owner ? "is-set" : ""}
              onClick={() => setActiveRank(r)} title={`${r}${SUIT_SYMBOL[pick.suit]}${owner ? ` — ${owner.name}` : ""}`}>
              <Card suit={pick.suit} rank={r} size="sm-xs" />
              <small>{owner ? (owner.name || "").split(" ")[0].slice(0, 7) : "?"}</small>
            </button>;
          })}
        </div>}
        <div className="laydown-tablepick__foot">
          <span className={left ? "is-warning" : ""}>{neededRanks.length ? (left ? `${left} card${left > 1 ? "s" : ""} not assigned: the set would go to the other team` : "All cards assigned ✓") : "Ready"}</span>
          <button type="button" className={`club-primary ${left ? "is-risky" : ""}`} onClick={submitLaydown}>{left ? "Lay down anyway" : "Confirm laydown"}</button>
        </div>
      </div>
    );
  }

  const stepTitle =
    step === 0 ? "Select Set" :
    step === 1 ? "Your Cards" :
    step === 2 ? "Add Teammates (Optional)" :
    "Confirm";

  return (
    <GlassmorphismModal 
      isOpen={true} 
      onClose={step === 0 ? handleClose : undefined}
      size="3xl"
      className="laydown-workflow-dialog"
      onClickOutside={step === 0}
      docked
      peekLabel="Continue laying down"
    >
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xl font-semibold text-white">Lay Down a Set</div>
          <button 
            className={`transition-colors ${
              step > 0 
                ? 'text-gray-500 cursor-not-allowed' 
                : 'text-white/70 hover:text-white'
            }`}
            onClick={step === 0 ? handleClose : undefined}
            disabled={step > 0}
            title={step > 0 ? "Complete laydown process to close" : "Close"}
          >
            ✕
          </button>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-1 sm:gap-2 text-xs mb-4 overflow-x-auto">
          <StepDot active={step >= 0} label="Select Set" />
          <span className="hidden sm:inline">›</span>
          <StepDot active={step >= 1} label="Your Cards" />
          <span className="hidden sm:inline">›</span>
          <StepDot active={step >= 2} label="Teammates at the table" />
        </div>

        <div key={step} className="laydown-step-title mb-3 font-medium text-white">{stepTitle}</div>
        
        {/* Warning message when set is selected */}
        {step > 0 && (
          <div className="mb-4 p-3 bg-yellow-500/10 backdrop-blur-sm border border-yellow-500/30 rounded-xl">
            <div className="flex items-center gap-2 text-yellow-400 text-sm">
              <span>⚠️</span>
              <span>Set selected! Complete the laydown process to finish.</span>
            </div>
          </div>
        )}

        {/* Scrollable content area */}
        <div className="laydown-scroll-content min-h-0">
          {/* Voice Play: own up to a wrong ask from here instead of a separate button */}
        {step === 0 && onPenalty && (
          <button type="button" className="laydown-penalty-link" onClick={() => { handleClose(); onPenalty(); }}>
            <span>Made a wrong ask?</span> <strong>Penalty laydown →</strong>
          </button>
        )}
          {/* STEP 0: pick set (ONLY ELIGIBLE) */}
        {step === 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {eligibleSets.length === 0 && (
              <div className="col-span-full text-sm text-white/70">
                You don't currently hold any cards that can start a set.
              </div>
            )}
            {eligibleSets.map(({ suit, type }) => (
              <button
                key={`${suit}-${type}`}
                className="laydown-set-option p-3 rounded-xl text-left transition-all duration-200 border"
                aria-pressed={pick.suit === suit && pick.setType === type}
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
                {pick.suit === suit && pick.setType === type && <span className="laydown-set-option__check" aria-hidden="true">✓</span>}
                <div className="flex flex-col items-center gap-3">
                  <div className="p-3">
                    <FannedCards 
                      cards={SETS[type].map(rank => ({ suit, rank }))} 
                      size="xs" 
                      maxCards={7}
                    />
                  </div>
                  <div className="text-sm capitalize text-white">
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
            <div className="text-xs text-white/70 mb-2">
              Your cards for this set (auto-selected):
            </div>
            <div className="flex justify-center">
              {mySetRanks.length > 0 ? (
                <div className="bg-accent-emerald/10 rounded-xl p-4 border-2 border-accent-emerald shadow-glow-emerald">
                  <FannedCards 
                    cards={mySetRanks} 
                    size="sm" 
                    maxCards={7}
                  />
                </div>
              ) : (
                <div className="text-xs text-white/60">You don't hold any cards from this set.</div>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: teammates (blind, with real card visuals for ranks) */}
        {step === 2 && (
          <div className="space-y-3">
            <div className="text-xs text-white/70">
              Tap the teammate who holds each card <span className="italic">(you won't see their cards)</span>.
            </div>

            {/* One column per card still needed; tap a teammate under it to say who holds it. */}
            {(() => {
              const needed = setRanks.filter((r) => !myRanks.includes(r));
              const ownerOf = (r) => Object.entries(collabRanks).find(([, set]) => set?.has?.(r))?.[0];
              const assign = (r, pid) => {
                const current = ownerOf(r);
                if (current) addRankFor(current, r);
                if (current !== pid) addRankFor(pid, r);
              };
              if (!myTeamMates.length) return <div className="text-xs text-white/60">No teammates on your team.</div>;
              if (!needed.length) return <div className="text-xs text-white/60">None needed — you already have a full set.</div>;
              return <>
                <div className="laydown-assign">
                  {needed.map((r) => {
                    const owner = ownerOf(r);
                    return <div key={r} className={`laydown-assign__col ${owner ? 'is-set' : ''}`}>
                      <Card suit={pick.suit} rank={r} size="sm-xs" />
                      {myTeamMates.map((tm) => (
                        <button key={tm.id} type="button" aria-pressed={owner === tm.id}
                          title={`${tm.name} has ${r}`} onClick={() => assign(r, tm.id)}>
                          {typeof tm.avatar === "string" && tm.avatar.startsWith("http")
                            ? <img src={tm.avatar} alt="" referrerPolicy="no-referrer" />
                            : <span aria-hidden="true">{tm.avatar}</span>}
                          <small>{(tm.name || '').split(' ')[0].slice(0, 6)}</small>
                        </button>
                      ))}
                    </div>;
                  })}
                </div>
                <div className="text-xs text-white/60">
                  {remainingNeeded.length ? `${remainingNeeded.length} card${remainingNeeded.length > 1 ? 's' : ''} not assigned yet` : 'All cards assigned ✓'}
                </div>
              </>;
            })()}
          </div>
        )}

        {/* STEP 3: confirm */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="text-sm text-white">Review your declaration:</div>
            <div className="text-xs text-white/80">
              Set: <span className="capitalize">{pick.suit}</span> {pick.setType}
            </div>
            <div className="text-xs text-white">
              <span className="text-white/70 mr-1">You:</span>
              {myRanks.length ? (
                <div className="inline-block p-2">
                  <FannedCards 
                    cards={myRanks.map(rank => ({ suit: pick.suit, rank }))} 
                    size="xs" 
                    maxCards={7}
                  />
                </div>
              ) : (
                "—"
              )}
            </div>
            <div className="text-xs space-y-2">
              {Object.entries(collabRanks).map(([pid, set]) => (
                <div key={pid} className="flex items-center gap-2">
                  <span className="text-white/70">{players[pid]?.name}:</span>
                  <div className="p-2">
                    <FannedCards 
                      cards={Array.from(set || []).map(rank => ({ suit: pick.suit, rank }))} 
                      size="xs" 
                      maxCards={7}
                    />
                  </div>
                </div>
              ))}
              {!Object.keys(collabRanks).length && (
                <div className="text-white/60 text-xs">No teammates assigned.</div>
              )}
            </div>
            <div className="text-xs text-white/70">
              If any assigned rank is wrong or missing, the set will be awarded to the opposing team and the turn passes counter-clockwise.
            </div>
          </div>
        )}
        </div>

        {/* Footer */}
        <div className="mt-5 flex items-center justify-between">
          <button 
            className={`px-4 py-2 rounded-xl transition-all duration-200 border ${
              step === 0
                ? 'bg-white/10 hover:bg-white/20 text-white border-white/20 hover:border-accent-purple/40'
                : step === 3
                ? 'bg-white/10 hover:bg-white/20 text-white border-white/20 hover:border-accent-purple/40'
                : 'bg-gray-500 cursor-not-allowed text-gray-300 border-gray-400/30'
            }`}
            onClick={step === 0 ? handleClose : (step === 3 ? prevStep : undefined)}
            disabled={step > 0 && step < 3}
            title={step === 0 ? "Close" : (step === 3 ? "Back" : "Cannot go back from this step")}
          >
            {step === 0 ? "Close" : "Back"}
          </button>
          <div className="flex items-center gap-2">
            {step < 3 && (
              <button
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-accent-blue to-accent-purple hover:shadow-glow-blue text-white disabled:opacity-40 transition-all duration-200 border border-accent-blue/30"
                disabled={
                  step === 0 ? !(pick.suit && pick.setType) : false
                }
                onClick={nextStep}
              >
                Next
              </button>
            )}
            {step === 3 && (
              <button className="px-4 py-2 rounded-xl bg-gradient-to-r from-accent-emerald to-accent-cyan hover:shadow-glow-cyan text-white transition-all duration-200 border border-accent-cyan/30" onClick={submitLaydown}>
                Confirm Laydown
              </button>
            )}
          </div>
        </div>
      </div>
    </GlassmorphismModal>
  );
}

function StepDot({ active, label }) {
  return (
    <div className={`px-2 py-1 rounded-full ${active ? "bg-accent-purple/20 border border-accent-purple/40" : "bg-white/10 border border-white/20"} text-white whitespace-nowrap text-xs transition-all duration-200`}>
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{{'Select Set':'Set','Your Cards':'Cards','Teammates at the table':'Team'}[label] || label}</span>
    </div>
  );
}
