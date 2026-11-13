import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

  // Cards as big as the free room allows, never overlapping: measure the room left under the rest
  // of the sheet and pick the row count (1-3) that gives the biggest cards that fully fit.
  const cardsRef = useRef(null);
  const [fit, setFit] = useState({ w: 44, cols: 6 });
  const count = sets.find((s) => `${s.suit}-${s.type}` === setKey)?.missing.length || 0;
  useLayoutEffect(() => {
    if (!open || !count) return;
    const measure = () => {
      const cards = cardsRef.current, dock = cards?.closest(".club-dock-area"), modal = cards?.closest(".club-modal--docked");
      if (!cards || !dock || !modal) return;
      const ds = getComputedStyle(dock);
      const room = dock.clientHeight - parseFloat(ds.paddingTop) - parseFloat(ds.paddingBottom);
      // the rest of the sheet's height, measured with the cards shrunk away (a capped sheet would mislead)
      const prevW = cards.style.getPropertyValue("--w");
      cards.style.setProperty("--w", "0px");
      const rest = modal.offsetHeight - cards.offsetHeight;
      cards.style.setProperty("--w", prevW);
      const freeH = room - rest - 2;
      const W = cards.clientWidth, gap = 4, pad = 6, edge = 6;   // edge: the card's bottom edge/shadow
      let best = { w: 0, cols: count };
      for (let rows = 1; rows <= 3; rows++) {
        const cols = Math.ceil(count / rows);
        const w = Math.min((W - (cols - 1) * gap) / cols - pad, ((freeH - (rows - 1) * gap) / rows - pad - edge) * 0.727, 120);
        if (w > best.w + 0.5) best = { w, cols };
      }
      const next = { w: Math.max(20, Math.floor(best.w)), cols: best.cols };
      setFit((f) => (f.w === next.w && f.cols === next.cols ? f : next));
    };
    measure();
    const dock = cardsRef.current?.closest(".club-dock-area");
    const ro = new ResizeObserver(measure);
    if (dock) ro.observe(dock);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [open, count, setKey]);

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
              <div className="ask-sheet__cards" ref={cardsRef} style={{ "--w": `${fit.w}px`, display: "grid", gridTemplateColumns: `repeat(${fit.cols}, auto)`, justifyContent: "center", gap: 4 }}>
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
