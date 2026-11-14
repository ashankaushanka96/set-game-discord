import { useEffect, useState } from "react";
import { useStore } from "../../store";
import { Card } from "../cards";

// "Last ask" replay in its own small panel: it never touches the table, the seats or the
// bubbles, so the live game carries on underneath. Works the same in 2D and 3D.
export default function LastAskReplay({ players }) {
  const last = useStore((s) => s.lastAsk);
  const [open, setOpen] = useState(null); // the ask being replayed (a copy, so a new ask doesn't jump the panel)
  const [step, setStep] = useState(0);    // 0 asking, 1 answer

  useEffect(() => {
    if (!open) return;
    setStep(0);
    const a = setTimeout(() => setStep(1), 1400);
    const b = setTimeout(() => setOpen(null), 4800);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [open]);

  if (!last) return null;
  const name = (id) => players[id]?.name || "Player";
  const r = open;
  const cards = r ? (r.ranks.length ? r.ranks : []).map((rank) => ({ suit: r.suit, rank })) : [];
  const result = r && (r.success ? "Got it ✓" : r.reason === "target_empty" ? "No cards!" : "No ✗");

  return <>
    <div className="game-replay-control">
      <button type="button" className="game-replay-btn" onClick={() => setOpen({ ...last })}
        title="Replay the last ask">↺ Last ask</button>
    </div>
    {r && <div className="last-ask-panel" role="dialog" aria-label="Last ask replay" onClick={() => setOpen(null)}>
      <div className="last-ask-panel__row">
        <span className="last-ask-panel__who">{name(r.asker_id)}</span>
        <span className="last-ask-panel__arrow">asked</span>
        <span className="last-ask-panel__who">{name(r.target_id)}</span>
      </div>
      <div className={`last-ask-panel__cards${step && r.success ? " is-taken" : ""}`}>
        {cards.map((c) => <Card key={c.rank} suit={c.suit} rank={c.rank} size="bubble" />)}
        {!step && <span className="last-ask-panel__q">?</span>}
      </div>
      {step === 1 && <div className={`last-ask-panel__result ${r.success ? "is-yes" : "is-no"}`}>{result}</div>}
    </div>}
  </>;
}
