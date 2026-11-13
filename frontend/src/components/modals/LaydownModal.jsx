import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../../store";
import { send } from "../../ws";
import { Card } from "../cards";
import { RANKS_LOWER, RANKS_UPPER, SUIT_SYMBOL } from "../../lib/deck";

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

// Laying down happens at the table. Started from the hand (a card of a set selected, then Lay),
// the table sees the same three bubbles as a bot's laydown:
//   "Going to Laydown" -> the chosen set (after confirming it) -> my cards of it (after confirming the laydown).
// Then the player taps each missing card and the teammate at the table who holds it.
export default function LaydownModal({ onClose, initialPick, restore = false }) {
  const { state, me, ws } = useStore();
  const players = state?.players || {};
  const my = players[me.id];
  const pick = initialPick;
  // game paused for a player who dropped out: the laydown waits (the server would refuse it)
  const paused = state?.phase === "playing" && Object.values(players).some((p) => p.team && p.seat != null && !p.is_spectator &&
    !String(p.id).startsWith("ai_") && p.connected === false);

  const draft = useRef(restore ? loadLaydownDraft(state?.room_id, me?.id) : null).current;
  const setRanks = SETS[pick.setType] || [];
  const myRanks = useMemo(
    () => (my?.hand || []).filter((c) => c.suit === pick.suit && setRanks.includes(c.rank)).map((c) => c.rank),
    [my?.hand, pick.suit, setRanks]
  );

  // 1 confirm (set, then laydown), 2 teammates on the table
  const [step, setStep] = useState(draft?.step === 2 ? 2 : 1);
  const [setConfirmed, setSetConfirmed] = useState(!!draft?.setConfirmed);
  // teammates named for missing cards: { player_id -> Set<rank> }
  const [collabRanks, setCollabRanks] = useState(() =>
    Object.fromEntries(Object.entries(draft?.collabRanks || {}).map(([pid, ranks]) => [pid, new Set(ranks)])));

  // "Going to Laydown" as soon as Lay is tapped (a restored laydown keeps the bubbles it already had)
  useEffect(() => {
    if (me?.id && !draft) send(ws, "bubble_message", { player_id: me.id, variant: "laydown_start" });
  }, [me?.id, ws]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    saveLaydownDraft(state?.room_id, me?.id, {
      step, pick, setConfirmed,
      collabRanks: Object.fromEntries(Object.entries(collabRanks).map(([pid, set]) => [pid, [...set]])),
    });
  }, [step, pick, setConfirmed, collabRanks, state?.room_id, me?.id]);

  const handleClose = () => {
    if (me?.id) {
      send(ws, "clear_bubble_messages", { player_id: me.id });
      Object.keys(collabRanks).forEach((pid) => send(ws, "clear_bubble_messages", { player_id: pid }));
    }
    clearLaydownDraft(state?.room_id, me?.id);
    onClose?.();
  };

  function confirmSet() {
    send(ws, "bubble_message", { player_id: me.id, variant: "laydown_set", suit: pick.suit, set_type: pick.setType });
    setSetConfirmed(true);
  }
  function confirmStart() {
    send(ws, "bubble_message", { player_id: me.id, variant: "laydown_cards", cards: myRanks.map((rank) => ({ suit: pick.suit, rank })) });
    setStep(2);
  }

  function addRankFor(pid, rank) {
    setCollabRanks((prev) => {
      const next = { ...prev };
      const set = new Set(next[pid] || []);
      if (set.has(rank)) set.delete(rank); else set.add(rank);
      next[pid] = set;
      // the teammate's bubble shows the cards named for them
      if (set.size > 0) {
        send(ws, "bubble_message", { player_id: pid, variant: "laydown_teammate", teammate_name: players[pid]?.name,
          cards: [...set].map((r) => ({ suit: pick.suit, rank: r })) });
      } else {
        send(ws, "clear_bubble_messages", { player_id: pid });
      }
      return next;
    });
  }

  function submitLaydown() {
    const collaborators = Object.entries(collabRanks)
      .filter(([, set]) => set && set.size)
      .map(([player_id, set]) => ({ player_id, ranks: Array.from(set) }));
    send(ws, "laydown", { who_id: me.id, suit: pick.suit, set_type: pick.setType, collaborators });
    handleClose();
  }

  // ---------- Step 2: name teammates at the table ----------
  const myTeamMates = useMemo(
    () => Object.values(players).filter((p) => p.id !== me.id && p.team === my?.team),
    [players, me?.id, my?.team]
  );
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

  if (step === 1) {
    const [title, text, yes, onYes] = setConfirmed
      ? [<>Lay down <span className="capitalize">{pick.suit}</span> {pick.setType}?</>,
         "Your cards of this set will be shown to the table. After that you must finish the laydown.", "Yes, lay down", confirmStart]
      : [<>Is the set <span className="capitalize">{pick.suit}</span> {pick.setType}?</>,
         "The table will see which set you are laying down.", "Yes, this set", confirmSet];
    return (
      <div className="laydown-tablepick" role="dialog" aria-label={setConfirmed ? "Confirm laydown" : "Confirm the set"}>
        <div className="laydown-tablepick__head laydown-tablepick__head--plain">
          <strong>{title}</strong>
          <span>{text}</span>
        </div>
        <div className="laydown-tablepick__foot">
          <button type="button" className="club-secondary laydown-tablepick__no" onClick={handleClose}>Cancel</button>
          <button type="button" className="club-primary" onClick={onYes} disabled={paused}>{yes}</button>
        </div>
      </div>
    );
  }

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
        <button type="button" className={`club-primary ${left ? "is-risky" : ""}`} onClick={submitLaydown} disabled={paused}>{left ? "Lay down anyway" : "Confirm laydown"}</button>
      </div>
    </div>
  );
}
