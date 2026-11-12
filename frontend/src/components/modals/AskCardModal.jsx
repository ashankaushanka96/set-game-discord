import { Fragment, useEffect, useMemo, useState } from "react";
import GlassmorphismModal from "../ui/GlassmorphismModal";
import Card from "../cards/Card";
import { RANKS_LOWER, RANKS_UPPER, SUITS, SUIT_SYMBOL } from "../../lib/deck";

// Turn Play: choose which card to ask an opponent for.
// Like at a real table, any card of a set still in play can be asked for. Asking for a card
// you already hold, or from a set you hold none of, forfeits that set (the server judges it).
// The set this player last asked in. The dialog reopens on it, since people usually keep
// working on the same set; if that set has been laid down since, it falls back to the first.
let lastAskedSet = null;

export default function AskCardModal({ open, target, tableSets = [], onAsk, onClose }) {
  const sets = useMemo(() => {
    const out = [];
    for (const suit of SUITS) {
      for (const [type, ranks] of [["lower", RANKS_LOWER], ["upper", RANKS_UPPER]]) {
        if (!tableSets.some((t) => t.suit === suit && t.set_type === type)) out.push({ suit, type, missing: ranks });
      }
    }
    return out;
  }, [tableSets]);

  const [setKey, setSetKey] = useState(null);
  const [picked, setPicked] = useState([]);
  const toggle = (r) => setPicked((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]));
  useEffect(() => {
    if (!open) return;
    const keys = sets.map((x) => `${x.suit}-${x.type}`);
    setSetKey(keys.includes(lastAskedSet) ? lastAskedSet : keys[0] || null);
    setPicked([]);
  }, [open, target?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !target) return null;
  const chosen = sets.find((s) => `${s.suit}-${s.type}` === setKey);

  return (
    <GlassmorphismModal isOpen={open} onClose={onClose} size="md" docked peekLabel={`Ask ${target.name} for a card`}>
      <div className="ask-sheet">
        <div>
          <h2>Ask {target.name} for a card</h2>
          <p>Pick a set, then one or more cards. They must have <em>all</em> of them, or the turn passes. Watch your own hand!</p>
        </div>

        {sets.length === 0 ? (
          <p>Every set is already on the table.</p>
        ) : (
          <>
            <div className="ask-sheet__grid" role="group" aria-label="Choose a set">
              <span /><span className="ask-sheet__colhead">Lower</span><span className="ask-sheet__colhead">Upper</span>
              {SUITS.map((suit) => <Fragment key={suit}>
                <span className={`ask-sheet__rowhead ask-sheet__rowhead--${suit}`}><i className={`suit-glyph suit-glyph--${suit}`}>{SUIT_SYMBOL[suit]}{"\uFE0E"}</i> <span>{suit}</span></span>
                {["lower", "upper"].map((type) => {
                  const key = `${suit}-${type}`;
                  const laid = tableSets.some((t) => t.suit === suit && t.set_type === type);
                  return (
                    <button key={key} type="button" disabled={laid} title={laid ? "Already laid down" : undefined}
                      className={`ask-sheet__set ${key === setKey ? "ask-sheet__set--on" : ""}`}
                      onClick={() => { setSetKey(key); setPicked([]); }}>
                      {laid ? "Laid" : <><i className={`suit-glyph suit-glyph--${suit}`}>{SUIT_SYMBOL[suit]}{"\uFE0E"}</i> {type}</>}
                    </button>
                  );
                })}
              </Fragment>)}
            </div>
            {chosen && (
              <div className="ask-sheet__cards">
                {chosen.missing.map((r) => (
                  <button key={r} type="button" aria-label={`${r} of ${chosen.suit}`}
                    aria-pressed={picked.includes(r)} className={`ask-sheet__card ${picked.includes(r) ? "ask-sheet__card--on" : ""}`} onClick={() => toggle(r)}>
                    <Card suit={chosen.suit} rank={r} size="sm" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <div className="ask-sheet__actions">
          <button type="button" className="ask-sheet__secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="club-primary" disabled={!chosen || !picked.length}
            onClick={() => { lastAskedSet = setKey; onAsk({ target_id: target.id, suit: chosen.suit, set_type: chosen.type, ranks: chosen.missing.filter((r) => picked.includes(r)) }); }}>
            Ask{picked.length && chosen ? ` for ${chosen.missing.filter((r) => picked.includes(r)).map((r) => r + SUIT_SYMBOL[chosen.suit]).join(" ")}` : ""}
          </button>
        </div>
      </div>
    </GlassmorphismModal>
  );
}
