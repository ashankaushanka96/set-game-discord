import { useEffect, useRef } from 'react';

// 2D table: the same moving lights as the 3D table, as glowing rings around the seats.
// Purple follows whose turn it is and glides around the table when the turn passes.
// Gold flies straight from the asker to the player being asked and stays there while they answer.
const GLIDE_MS = 750;

function seatCircle(seatEls, id) {
  const el = seatEls.current?.[id];
  if (!el) return null;
  const r = (el.querySelector('.game-seat__avatar') || el).getBoundingClientRect();
  if (!r.width) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, d: Math.max(r.width, r.height) };
}

// Straight across the table from one seat to the other.
function arc(a, b, k) {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, d: a.d + (b.d - a.d) * k };
}
const ease = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function SeatRing({ seatEls, seatVersion, at, from, tone }) {
  const ref = useRef(null);
  const now = useRef(null);      // where the ring is drawn right now
  const anim = useRef(null);     // { a, toId, t0 } while gliding

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!at) { el.style.opacity = '0'; now.current = null; anim.current = null; return; }
    // Start from where the ring already is, or from the asker for a new ask.
    // The very first turn ring of a round grows out of the middle of the table.
    const start = now.current || (from && from !== at ? seatCircle(seatEls, from) : null)
      || (tone === 'turn' ? { x: window.innerWidth / 2, y: window.innerHeight * .42, d: 0 } : null);
    anim.current = start && !reduce ? { a: start, t0: performance.now() } : null;
    let raf;
    const place = (p, glow) => {
      now.current = p;
      el.style.transform = `translate(${p.x - p.d / 2}px, ${p.y - p.d / 2}px)`;
      el.style.width = el.style.height = `${p.d}px`;
      // Only shown in flight: once it arrives, the seat's own ring (drawn under the card count,
      // name and badges) takes over.
      el.style.opacity = glow ? '1' : '0';
      el.classList.toggle('is-moving', !!glow);
    };
    const frame = () => {
      const b = seatCircle(seatEls, at);
      if (b) {
        const g = anim.current;
        if (g) {
          const t = Math.min(1, (performance.now() - g.t0) / GLIDE_MS);
          place(arc(g.a, b, ease(t)), t < 1);
          if (t >= 1) anim.current = null;
        } else {
          place(b, false);
        }
      }
      // Glide at full rate; once settled, just follow the seat a few times a second.
      raf = anim.current ? requestAnimationFrame(frame) : setTimeout(() => { raf = requestAnimationFrame(frame); }, 250);
    };
    frame();
    return () => { cancelAnimationFrame(raf); clearTimeout(raf); };
  }, [at, from, tone, seatEls, seatVersion]);

  return <div ref={ref} className={`seat-ring seat-ring--${tone}`} aria-hidden="true" style={{ opacity: 0 }} />;
}

export default function SeatRings({ seatEls, seatVersion, turnId, ask }) {
  return <>
    <SeatRing seatEls={seatEls} seatVersion={seatVersion} at={turnId} tone="turn" />
    <SeatRing seatEls={seatEls} seatVersion={seatVersion} at={ask?.target_id} from={ask?.asker_id} tone="ask" />
  </>;
}
