import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "../store";
import Card from "./Card";

/**
 * Seat-anchored message bubbles.
 * Props:
 *  - seatEls: ref map -> seatEls.current[playerId] = DOM element
 *  - seatVersion: number increasing whenever a seat ref attaches/changes
 */
export default function MessageBubbles({ seatEls, seatVersion }) {
  const { messages } = useStore();
  const [positions, setPositions] = useState({}); // {msgId: {top,left,below}}
  const retryTimer = useRef(null);

  const list = Array.isArray(messages) ? messages : [];

  const computePositions = () => {
    const pos = {};
    const guard = 84; // px from top: flip bubbles below if too close
    for (const m of list) {
      const el = seatEls.current?.[m.player_id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const aboveTop = r.top - 10;
      const below = aboveTop < guard;
      pos[m.id] = {
        left: r.left + r.width / 2,
        top: below ? r.bottom + 10 : aboveTop,
        below,
      };
    }
    setPositions(pos);
  };

  useLayoutEffect(() => {
    computePositions();
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(() => {
      computePositions();
      retryTimer.current = setTimeout(() => {
        computePositions();
        retryTimer.current = null;
      }, 120);
    }, 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatVersion, messages]);

  useEffect(() => {
    const onResize = () => computePositions();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const color = (v) =>
    v === "ask" ? "bg-indigo-600" : v === "yes" ? "bg-emerald-600" : "bg-zinc-800";

  return (
    <>
      {list.map((m) => {
        const p = positions[m.id];
        if (!p) return null;
        return (
          <div
            key={m.id}
            className="fixed z-[80] pointer-events-none"
            style={{
              left: p.left,
              top: p.top,
              transform: p.below ? "translate(-50%, 0%)" : "translate(-50%, -100%)",
            }}
          >
            <div className={`relative pointer-events-auto rounded-[18px] px-3 py-2 card-shadow text-sm flex items-center gap-2 ${color(m.variant)} text-white`}>
              <div className="font-medium">{m.text}</div>
              {m.card && (
                <div className="ml-2 shrink-0">
                  <Card suit={m.card.suit} rank={m.card.rank} size="sm" />
                </div>
              )}
              {/* Tail */}
              <span
                className={`absolute left-1/2 -translate-x-1/2 w-0 h-0 ${
                  p.below
                    ? "top-0 -translate-y-full border-b-[10px]"
                    : "bottom-0 translate-y-full border-t-[10px]"
                } border-x-[10px] border-x-transparent ${
                  p.below ? "border-b-current" : "border-t-current"
                }`}
                style={{ color: "inherit" }}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}
