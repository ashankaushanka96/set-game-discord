import { useEffect, useLayoutEffect, useMemo, useState, useRef } from "react";
import { useStore } from "../../store";
import { Card, FannedCards } from "../cards";

// Attach the tail to the outer border, with its tip aligned to the seat even
// when the bubble has been shifted inward to fit a narrow screen.
function SeatMessageBubble({ message, anchor, theme, ownerName, children }) {
  const bubbleRef = useRef(null);
  const [tail, setTail] = useState({ base: 0, tip: 0, left: anchor.x });
  useLayoutEffect(() => {
    const el = bubbleRef.current;
    const update = () => {
      // Layout size, not the on-screen box: the bubble may still be mid pop-in (scaled).
      // Centred over the head, nudged in only as far as needed to stay on screen.
      const w = el.offsetWidth, vw = window.innerWidth;
      const left = Math.max(8, Math.min(vw - w - 8, anchor.seatX - w / 2)), tip = anchor.seatX - left;
      setTail({ left, tip, base: Math.max(18, Math.min(w - 18, tip)) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [anchor.x, anchor.y, anchor.seatX, anchor.place, anchor.reach]);
  const above = anchor.place === 'above';
  // The tail runs all the way from the bubble to the player's head.
  const reach = Math.max(10, anchor.reach || 14);
  const edge = above ? 0 : reach;
  const tipY = above ? reach : 0;
  return <div ref={bubbleRef}
    className={`fixed z-[90] pointer-events-none rounded-2xl border ${theme} text-white px-4 py-3 shadow-lg`}
    aria-label={message.variant?.startsWith('laydown_') ? `Laydown from ${ownerName}` : undefined}
    style={{ left: Math.round(tail.left), top: anchor.y,
      transform: above ? 'translateY(-100%)' : undefined,
      whiteSpace: 'normal', width: 'max-content',
      maxWidth: 'min(280px, calc(100vw - 32px))', overflowWrap: 'anywhere',
      animation: message.sticky === false ? 'bubbleFadeOut 0.6s ease forwards' : undefined,
      animationDelay: message.sticky === false ? '5s' : undefined,
    }}>
    <svg className="seat-bubble-tail" aria-hidden="true" width="100%" height={reach}
      style={{ position: 'absolute', left: 0, overflow: 'visible', ...(above ? { top: '100%' } : { bottom: '100%' }) }}>
      <path d={`M ${tail.base - 8} ${edge} L ${tail.tip} ${tipY} L ${tail.base + 8} ${edge}`}
        fill="var(--bubble-bg, #253b30)" stroke="var(--bubble-border)" strokeWidth="1" strokeLinejoin="round" />
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
// One or several asked cards (Turn Play can ask for several of one set at once).
function AskedCards({ m }) {
  const cards = m.cards?.length && m.variant !== "laydown" ? m.cards : m.card ? [m.card] : [];
  if (!cards.length) return null;
  return <span className="inline-flex items-center gap-1 align-middle flex-wrap">
    {cards.map((c) => <Card key={`${c.suit}-${c.rank}`} suit={c.suit} rank={c.rank} size="xs" />)}
    <span className="text-xs opacity-80">({cards.map((c) => c.rank).join(", ")} of {cards[0].suit})</span>
  </span>;
}

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
        // Anchor on the avatar (the head) and keep clear of the whole badge, name tag included.
        const head = (el.querySelector('.game-seat__avatar') || el).getBoundingClientRect();
        let top = head.top, bottom = head.bottom;
        // Only the seat's fixed parts: hover tags ("Ask for a card?") come and go and must not move the bubble.
        el.querySelectorAll('.game-seat__avatar, .game-seat__name, .game-seat__badge').forEach((c) => { const b = c.getBoundingClientRect(); if (b.width && b.height) { top = Math.min(top, b.top); bottom = Math.max(bottom, b.bottom); } });
        const place = "above";   // always over the player's head
        let x = head.left + head.width / 2;
        const y = place === "above" ? top - 12 : bottom + 12;
        const reach = place === "above" ? head.top + 2 - y : y - (head.bottom - 2);
        // Clamp X so the bubble never leaves viewport
        const pad = Math.min(156, viewportW / 2);
        if (x < pad) x = pad;
        if (x > viewportW - pad) x = viewportW - pad;
        // Whole pixels only: a bubble placed on a half pixel renders its cards slightly soft.
        next[m.id] = { x: Math.round(x), y: Math.round(y), place, seatX: head.left + head.width / 2, reach: Math.round(reach) };
      });
      setPos((prev) => JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
    };
    compute();
    // Seats move when the 3D table turns or settles: follow them while any bubble is up.
    let raf = 0;
    const follow = () => { compute(); raf = requestAnimationFrame(follow); };
    if (messages?.length) raf = requestAnimationFrame(follow);
    const onResize = () => compute();
    const onScroll = () => compute();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
      cancelAnimationFrame(raf);
    };
  }, [messages, seatVersion, seatEls]);

  const items = useMemo(() => {
    // Everyone sees the same bubbles, including their own asks, answers and laydowns.
    return messages || [];
  }, [messages]);

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
        const xy = pos[m.id];
        if (!xy) return null;

        let content = null;
        if (m.variant === "ask") {
          content = (
            // Just the asked card(s) and a question mark: the tail shows who is asking.
            <div className="ask-bubble flex items-center gap-1.5">
              {(m.cards?.length ? m.cards : m.card ? [m.card] : []).map((c) => <Card key={`${c.suit}-${c.rank}`} suit={c.suit} rank={c.rank} size="xs" />)}
              <span className="ask-bubble__q">?</span>
            </div>
          );
        } else if (m.variant === "yes") {
          content = (
            <div className="text-sm">
              <span>Yes, I have.</span>{" "}
              <AskedCards m={m} />
            </div>
          );
        } else if (m.variant === "no") {
          content = (
            <div className="text-sm">
              <span>No.</span>
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
        } else if (m.variant === "penalty_set") {
          content = (
            <div className="text-sm font-medium">
              Penalty:{" "}
              <span className="capitalize font-semibold">{m.suit} {m.set_type}</span>
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
        } else if (m.variant === "event_good" || m.variant === "event_bad") {
          // Results that used to be pop-up notifications (laydown result, wrong ask)
          content = (
            <div className="text-sm">
              <span className="font-semibold">{m.title}</span>
              {m.text ? <div className="opacity-85 text-xs mt-0.5">{m.text}</div> : null}
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
              {m.text}
            </div>
          );
        }

        const tone = m.variant === 'ask' ? 'ask' : m.variant === 'no' || m.variant === 'event_bad' || m.variant === 'penalty_set' ? 'error' : m.variant === 'yes' || m.variant === 'event_good' ? 'success' : m.variant?.startsWith('laydown_') ? 'vote' : 'info';
        const theme = `club-bubble club-bubble--${tone}${m.kind === 'laydown' ? ' club-bubble--laydown' : ''}`;
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
