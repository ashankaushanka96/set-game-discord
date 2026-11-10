import { useEffect, useLayoutEffect, useMemo, useState, useRef } from "react";
import { useStore } from "../../store";
import { Card, FannedCards } from "../cards";

// Attach the tail to the outer border, with its tip aligned to the seat even
// when the bubble has been shifted inward to fit a narrow screen.
function SeatMessageBubble({ message, anchor, theme, ownerName, children }) {
  const bubbleRef = useRef(null);
  const [tail, setTail] = useState({ base: 0, tip: 0 });
  useLayoutEffect(() => {
    const el = bubbleRef.current;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const tip = anchor.seatX - rect.left;
      setTail({ tip, base: Math.max(18, Math.min(rect.width - 18, tip)) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [anchor.x, anchor.y, anchor.seatX, anchor.place]);
  const above = anchor.place === 'above';
  const edge = above ? 0 : 14;
  const tipY = above ? 14 : 0;
  return <div ref={bubbleRef}
    className={`fixed z-[120] pointer-events-none rounded-2xl border ${theme} text-white px-4 py-3 shadow-lg`}
    aria-label={message.variant?.startsWith('laydown_') ? `Laydown from ${ownerName}` : undefined}
    style={{ left: anchor.x, top: anchor.y,
      transform: above ? 'translate(-50%,-100%)' : 'translate(-50%,0)',
      whiteSpace: 'normal', width: 'max-content',
      maxWidth: 'min(280px, calc(100vw - 32px))', overflowWrap: 'anywhere',
      animation: message.sticky === false ? 'bubbleFadeOut 0.6s ease forwards' : undefined,
      animationDelay: message.sticky === false ? '5s' : undefined,
    }}>
    <svg className="seat-bubble-tail" aria-hidden="true" width="100%" height="14"
      style={{ position: 'absolute', left: 0, overflow: 'visible', ...(above ? { top: '100%' } : { bottom: '100%' }) }}>
      <path d={`M ${tail.base - 8} ${edge} L ${tail.tip} ${tipY} L ${tail.base + 8} ${edge}`}
        fill="#253b30" stroke="var(--bubble-border)" strokeWidth="1" strokeLinejoin="round" />
    </svg>
    {children}
  </div>;
}

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
  const styleInjected = useRef(false);

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
        let y = place === "above" ? r.top - 16 : r.bottom + 16;
        // Clamp X so the bubble never leaves viewport
        const pad = Math.min(156, viewportW / 2);
        if (x < pad) x = pad;
        if (x > viewportW - pad) x = viewportW - pad;
        next[m.id] = { x, y, place, seatX: r.left + r.width / 2 };
      });
      setPos(next);
    };
    compute();
    const onResize = () => compute();
    const onScroll = () => compute();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [messages, seatVersion, seatEls]);

  const items = useMemo(() => {
    const allMessages = messages || [];
    // Filter out messages from the current player (they don't need to see their own bubble messages)
    // EXCEPT for laydown-related messages and chat messages where the player needs to see their own messages
    let filtered = allMessages.filter(m => {
      if (m.player_id !== me?.id) return true; // Show other players' messages
      // Show current player's own laydown-related messages and chat messages
      return (m.variant && m.variant.startsWith('laydown_')) || m.variant === 'chat';
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
      {/* One-time keyframes for auto-fade on non-sticky bubbles */}
      {!styleInjected.current && (
        <style>{`
          @keyframes bubbleFadeOut { to { opacity: 0; } }
        `}</style>
      )}
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
            <div className="text-sm font-medium">
              Going to Laydown
            </div>
          );
        } else if (m.variant === "laydown_set") {
          content = (
            <div className="text-sm font-medium">
              Selected{" "}
              <span className="capitalize font-semibold text-blue-200">{m.suit} {m.set_type}</span>
            </div>
          );
        } else if (m.variant === "laydown_cards") {
          content = (
            <div className="laydown-bubble-cards flex justify-center">
              <FannedCards 
                cards={m.cards || []} 
                size="xs" 
                maxCards={6}
              />
            </div>
          );
        } else if (m.variant === "laydown_teammate") {
          content = (
            <div className="laydown-bubble-cards flex justify-center">
              <FannedCards 
                cards={m.cards || []} 
                size="xs" 
                maxCards={6}
              />
            </div>
          );
        } else if (m.variant === "chat") {
          // Check if it's an emoji (single character or short emoji)
          const isEmoji = m.text && m.text.length <= 4 && /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(m.text);
          
          if (isEmoji) {
            content = (
              <div className="text-2xl text-center">
                {m.text}
              </div>
            );
          } else {
            content = (
              <div className="text-sm">
                {m.text}
              </div>
            );
          }
        } else {
          content = (
            <div className="text-sm">
              <span className="font-semibold">{asker?.name || "Player"}</span>
              <span className="opacity-80">: {m.text}</span>
            </div>
          );
        }

        const tone = m.variant === 'no' ? 'error' : m.variant === 'yes' ? 'success' : m.variant?.startsWith('laydown_') ? 'vote' : 'info';
        const theme = `club-bubble club-bubble--${tone}`;
        return (
          <SeatMessageBubble key={m.id} message={m} anchor={xy} theme={theme}
            ownerName={asker?.name || m.teammate_name || 'Player'}>
            {content}
          </SeatMessageBubble>
        );
      })}
    </>
  );
}
