import { useEffect, useMemo, useState } from "react";
import GlassmorphismModal from "../ui/GlassmorphismModal";
import { SUITS, SUIT_SYMBOL, RANKS_LOWER, RANKS_UPPER } from "../../lib/deck";
import { FannedCards } from "../cards";

// Voice Play: the player who made a wrong ask (out loud) gives that set to the other team.
export default function PenaltyLaydownModal({ open, tableSets = [], myTeam, onConfirm, onClose }) {
  const sets = useMemo(() => SUITS.flatMap((suit) => ["lower", "upper"]
    .filter((type) => !tableSets.some((t) => t.suit === suit && t.set_type === type))
    .map((type) => ({ suit, type }))), [tableSets]);
  const [key, setKey] = useState(null);
  useEffect(() => { if (open) setKey(null); }, [open]);
  if (!open) return null;
  const chosen = sets.find((s) => `${s.suit}-${s.type}` === key);
  const other = myTeam === "A" ? "B" : "A";
  return (
    <GlassmorphismModal isOpen={open} onClose={onClose} size="md" docked peekLabel="Penalty laydown">
      <div className="ask-sheet">
        <div>
          <h2>Penalty laydown</h2>
          <p>Made a wrong ask? Pick the set — every card of it goes to Team {other}.</p>
        </div>
        {sets.length === 0 ? <p>Every set is already on the table.</p> : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {sets.map((s) => {
              const k = `${s.suit}-${s.type}`;
              return (
                <button key={k} type="button" aria-pressed={k === key} onClick={() => setKey(k)}
                  className="laydown-set-option p-2 rounded-xl text-left transition-all duration-200 border">
                  {k === key && <span className="laydown-set-option__check" aria-hidden="true">✓</span>}
                  <div className="flex flex-col items-center gap-1">
                    <div className="p-2">
                      <FannedCards cards={(s.type === "lower" ? RANKS_LOWER : RANKS_UPPER).map((rank) => ({ suit: s.suit, rank }))} size="xs" maxCards={7} />
                    </div>
                    <div className="text-sm capitalize text-white">{s.suit} <span className="opacity-70">{s.type}</span></div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <div className="ask-sheet__actions">
          <button type="button" className="ask-sheet__secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="club-primary penalty-confirm" disabled={!chosen}
            onClick={() => onConfirm({ suit: chosen.suit, set_type: chosen.type })}>
            {chosen ? `Give ${SUIT_SYMBOL[chosen.suit]} ${chosen.suit} ${chosen.type} to Team ${other}` : "Pick a set"}
          </button>
        </div>
      </div>
    </GlassmorphismModal>
  );
}
