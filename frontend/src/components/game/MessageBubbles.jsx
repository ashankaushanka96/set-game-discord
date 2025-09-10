import { useEffect, useMemo, useState } from "react";
import { useStore } from "../../store";
import { Card, FannedCards } from "../cards";

/**
 * Seat bubbles with auto-flip:
 *  - If seat is near top, render bubble BELOW the seat (so it doesn't get cut).
 *  - Otherwise render ABOVE the seat.
 * Also clamps X so bubbles never go off-screen.
 *
 * Variants: "ask", "yes", "no"
 *   - ask: "{TargetName}, do you have [Card]?"
 *   - yes: "{PlayerName}: Yes, I have." + card
 *   - no : "{PlayerName}: No." + card
 */
export default function MessageBubbles({ seatEls, seatVersion, hideLaydownBubbles = false }) {
  const { messages, state, me } = useStore();
  const players = state?.players || {};

  const [pos, setPos] = useState({}); // id -> {x,y,place:"above"|"below"}

  // recompute positions on seatVersion or messages change or window resize/scroll
  useEffect(() => {
    const compute = () => {
      const next = {};
      const viewportW = window.innerWidth;
      (messages || []).forEach((m) => {
        const el = seatEls.current?.[m.player_id];
        if (!el) return;
        const r = el.getBoundingClientRect();
        // Decide placement
        const place = r.top < 120 ? "below" : "above";
        // Position base point
        let x = r.left + r.width / 2;
        let y = place === "above" ? r.top - 8 : r.bottom + 8;
        // Clamp X so the bubble never leaves viewport
        const pad = 16;
        if (x < pad) x = pad;
        if (x > viewportW - pad) x = viewportW - pad;
        next[m.id] = { x, y, place };
      });
      setPos(next);
    };
    compute();
    const onResize = () => compute();
    const onScroll = () => compute();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
    };
  }, [messages, seatVersion, seatEls]);

  const items = useMemo(() => {
    const allMessages = messages || [];
    // Filter out messages from the current player (they don't need to see their own bubble messages)
    // EXCEPT for laydown-related messages where the player needs to see their own selections
    let filtered = allMessages.filter(m => {
      if (m.player_id !== me?.id) return true; // Show other players' messages
      // Show current player's own laydown-related messages
      return m.variant && m.variant.startsWith('laydown_');
    });
    
    // If hideLaydownBubbles is true, filter out all laydown-related bubbles
    if (hideLaydownBubbles) {
      filtered = filtered.filter(m => !m.variant || !m.variant.startsWith('laydown_'));
    }
    
    return filtered;
  }, [messages, me?.id, hideLaydownBubbles]);

  if (!items.length) return null;

  return (
    <>
      {items.map((m) => {
        const asker = players[m.player_id];
        const target = players[m.target_id];
        const xy = pos[m.id];
        if (!xy) return null;

        let content = null;
        if (m.variant === "ask") {
          content = (
            <div className="text-sm">
              <span className="font-semibold">{target?.name || "Player"}</span>
              <span className="opacity-80">, do you have</span>{" "}
              {m.card ? (
                <span className="inline-flex items-center gap-1 align-middle">
                  <Card suit={m.card.suit} rank={m.card.rank} size="xs" />
                  <span className="text-xs opacity-80">
                    ({m.card.rank} of {m.card.suit})
                  </span>
                </span>
              ) : null}
              <span className="opacity-80">?</span>
            </div>
          );
        } else if (m.variant === "yes") {
          content = (
            <div className="text-sm">
              <span className="font-semibold">{asker?.name || "Player"}</span>
              <span className="opacity-80">: Yes, I have.</span>{" "}
              {m.card ? (
                <span className="inline-flex items-center gap-1 align-middle">
                  <Card suit={m.card.suit} rank={m.card.rank} size="xs" />
                  <span className="text-xs opacity-80">
                    ({m.card.rank} of {m.card.suit})
                  </span>
                </span>
              ) : null}
            </div>
          );
        } else if (m.variant === "no") {
          content = (
            <div className="text-sm">
              <span className="font-semibold">{asker?.name || "Player"}</span>
              <span className="opacity-80">: No.</span>{" "}
              {m.card ? (
                <span className="inline-flex items-center gap-1 align-middle">
                  <Card suit={m.card.suit} rank={m.card.rank} size="xs" />
                  <span className="text-xs opacity-80">
                    ({m.card.rank} of {m.card.suit})
                  </span>
                </span>
              ) : null}
            </div>
          );
        } else if (m.variant === "laydown_start") {
          content = (
            <div className="text-sm">
              <span className="font-semibold">{asker?.name || "Player"}</span>
              <span className="opacity-80">: Going to Laydown</span>
            </div>
          );
        } else if (m.variant === "laydown_set") {
          content = (
            <div className="text-sm">
              <span className="font-semibold">{asker?.name || "Player"}</span>
              <span className="opacity-80">: Selected</span>{" "}
              <span className="capitalize font-medium">{m.suit} {m.set_type}</span>
            </div>
          );
        } else if (m.variant === "laydown_cards") {
          content = (
            <div className="flex justify-center">
              <FannedCards 
                cards={m.cards || []} 
                size="xs" 
                maxCards={6}
              />
            </div>
          );
        } else if (m.variant === "laydown_teammate") {
          content = (
            <div className="flex justify-center">
              <FannedCards 
                cards={m.cards || []} 
                size="xs" 
                maxCards={6}
              />
            </div>
          );
        } else {
          content = (
            <div className="text-sm">
              <span className="font-semibold">{asker?.name || "Player"}</span>
              <span className="opacity-80">: {m.text}</span>
            </div>
          );
        }

        const theme =
          m.variant === "ask" ? "bg-sky-600/90 border-sky-500" :
          m.variant === "yes" ? "bg-emerald-600/90 border-emerald-500" :
          m.variant === "no"  ? "bg-rose-600/90 border-rose-500" :
          m.variant === "laydown_start" ? "bg-purple-600/90 border-purple-500" :
          m.variant === "laydown_set" ? "bg-indigo-600/90 border-indigo-500" :
          m.variant === "laydown_cards" ? "bg-blue-600/90 border-blue-500" :
          m.variant === "laydown_teammate" ? "bg-cyan-600/90 border-cyan-500" :
          "bg-zinc-700/90 border-zinc-600";

        // Tail color
        const tailColor =
          m.variant === "ask" ? "rgb(2 132 199 / 0.9)" :
          m.variant === "yes" ? "rgb(5 150 105 / 0.9)" :
          m.variant === "no"  ? "rgb(225 29 72 / 0.9)" :
          m.variant === "laydown_start" ? "rgb(147 51 234 / 0.9)" :
          m.variant === "laydown_set" ? "rgb(79 70 229 / 0.9)" :
          m.variant === "laydown_cards" ? "rgb(37 99 235 / 0.9)" :
          m.variant === "laydown_teammate" ? "rgb(8 145 178 / 0.9)" :
          "rgb(63 63 70 / 0.9)";

        const translate = xy.place === "above" ? "translate(-50%,-100%)" : "translate(-50%,0)";

        return (
          <div
            key={m.id}
            className={`fixed z-[120] pointer-events-none rounded-xl border ${theme} text-white px-3 py-2 shadow-lg`}
            style={{
              left: xy.x,
              top: xy.y,
              transform: translate,
              whiteSpace: "nowrap",
            }}
          >
            <div className="relative">
              {/* bubble tail */}
              {xy.place === "above" ? (
                <div
                  className="absolute left-1/2 top-full -translate-x-1/2"
                  style={{
                    width: 0, height: 0,
                    borderLeft: "8px solid transparent",
                    borderRight: "8px solid transparent",
                    borderTop: `10px solid ${tailColor}`,
                  }}
                />
              ) : (
                <div
                  className="absolute left-1/2 bottom-full -translate-x-1/2"
                  style={{
                    width: 0, height: 0,
                    borderLeft: "8px solid transparent",
                    borderRight: "8px solid transparent",
                    borderBottom: `10px solid ${tailColor}`,
                  }}
                />
              )}
              {content}
            </div>
          </div>
        );
      })}
    </>
  );
}
