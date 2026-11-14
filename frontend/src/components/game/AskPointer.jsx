import { useEffect, useId, useRef, useState } from 'react';
import { useStore } from '../../store';

// Turn Play: while an ask is waiting, a solid golden arrow swoops from the asker's seat to
// the player being asked. It starts as a thin tail, widens into a bold head, floats above
// the table (soft shadow underneath), shoots out once, then keeps nudging at the target.
const N = 26;          // samples along the body
const HEAD_LEN = 30;   // px
const HEAD_HALF = 17;  // px, half width of the arrowhead
const BODY_HALF = 7;   // px, half width of the body where it meets the head
const SHOOT_MS = 520;

const point = (g, t) => {
  const u = 1 - t;
  return [u * u * g.sx + 2 * u * t * g.qx + t * t * g.ex, u * u * g.sy + 2 * u * t * g.qy + t * t * g.ey];
};
const normal = (g, t) => {
  const dx = 2 * (1 - t) * (g.qx - g.sx) + 2 * t * (g.ex - g.qx);
  const dy = 2 * (1 - t) * (g.qy - g.sy) + 2 * t * (g.ey - g.qy);
  const l = Math.hypot(dx, dy) || 1;
  return [-dy / l, dx / l];
};

// Outline of the arrow covering the first `p` (0..1) of the curve.
function arrowPath(g, p) {
  const headT = Math.min(.45, HEAD_LEN / (g.len * p || 1)) * p; // head length in curve units
  const neck = p - headT;
  const left = [], right = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N, t = s * neck;
    const [x, y] = point(g, t), [nx, ny] = normal(g, t);
    const w = 1 + (BODY_HALF - 1) * Math.pow(s, .75);
    left.push(`${(x + nx * w).toFixed(1)} ${(y + ny * w).toFixed(1)}`);
    right.push(`${(x - nx * w).toFixed(1)} ${(y - ny * w).toFixed(1)}`);
  }
  // Barbs sit a little behind the neck so the head looks swept back.
  const bt = Math.max(0, neck - headT * .18);
  const [bx, by] = point(g, bt), [bnx, bny] = normal(g, bt);
  const [tx, ty] = point(g, p);
  return `M ${left.join(' L ')} L ${(bx + bnx * HEAD_HALF).toFixed(1)} ${(by + bny * HEAD_HALF).toFixed(1)}`
    + ` L ${tx.toFixed(1)} ${ty.toFixed(1)}`
    + ` L ${(bx - bnx * HEAD_HALF).toFixed(1)} ${(by - bny * HEAD_HALF).toFixed(1)} L ${right.reverse().join(' L ')} Z`;
}

// Arrow colours by meaning: gold = asking for a card, green = cards going into a laydown,
// purple = the turn passing to another player (blue and red are the team colours).
const TONES = {
  ask: { from: '#f5a623', mid: '#ffd34d', tip: '#fff2b8', edge: '#6b3f00', glow: 'rgba(255,196,70,.65)', ring: '#ffd34d' },
  lay: { from: '#22c55e', mid: '#6ee7a8', tip: '#dcfce7', edge: '#064e2a', glow: 'rgba(110,231,168,.6)', ring: '#6ee7a8' },
  turn: { from: '#9b6cf5', mid: '#b98cff', tip: '#efe4ff', edge: '#2f1a5c', glow: 'rgba(185,140,255,.65)', ring: '#b98cff' },
};

export default function AskPointer({ seatEls, seatVersion, ask }) {
  return <SeatArrow seatEls={seatEls} seatVersion={seatVersion} fromId={ask?.asker_id} toId={ask?.target_id} tone="ask" />;
}

// Laydown and turn arrows queued by the store: who is putting cards into a declaration,
// and who the turn passes to afterwards. Each one removes itself when its time is up.
export function FlowArrows({ seatEls, seatVersion, skipTones = [] }) {
  const arrows = useStore((s) => s.flowArrows);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!arrows?.length) return;
    const id = setInterval(() => {
      const now = Date.now();
      if (useStore.getState().flowArrows.some((a) => a.until <= now)) {
        useStore.setState((s) => ({ flowArrows: s.flowArrows.filter((a) => a.until > now) }));
      }
      setTick((t) => t + 1); // also lets delayed arrows appear
    }, 300);
    return () => clearInterval(id);
  }, [arrows]);
  const now = Date.now();
  return (arrows || []).filter((a) => a.from !== a.to && !skipTones.includes(a.tone) && (a.start || 0) <= now && a.until > now).map((a) =>
    <SeatArrow key={a.id} seatEls={seatEls} seatVersion={seatVersion} fromId={a.from} toId={a.to} tone={a.tone} label={a.label} />);
}

export function SeatArrow({ seatEls, seatVersion, fromId, toId, tone = 'ask', label = null }) {
  const [geo, setGeo] = useState(null);
  const body = useRef(null), shadow = useRef(null), gloss = useRef(null);
  const askerId = fromId, targetId = toId;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const C = TONES[tone] || TONES.ask;

  useEffect(() => {
    if (!askerId || !targetId) { setGeo(null); return; }
    const compute = () => {
      const a = seatEls.current?.[askerId], t = seatEls.current?.[targetId];
      if (!a || !t) { setGeo(null); return; }
      const ra = a.getBoundingClientRect(), rt = t.getBoundingClientRect();
      const ax = ra.left + ra.width / 2, ay = ra.top + ra.height / 2;
      const tx = rt.left + rt.width / 2, ty = rt.top + rt.height / 2;
      const d = Math.hypot(tx - ax, ty - ay) || 1;
      const ux = (tx - ax) / d, uy = (ty - ay) / d;
      const pad = (r) => Math.min(r.width, r.height) * 0.5;
      const sx = ax + ux * pad(ra), sy = ay + uy * pad(ra);
      const ex = tx - ux * (pad(rt) + 6), ey = ty - uy * (pad(rt) + 6);
      const span = Math.hypot(ex - sx, ey - sy);
      // Bow the arrow toward the middle of the table so it never runs over the seats between.
      const mx = (sx + ex) / 2, my = (sy + ey) / 2;
      const cx = window.innerWidth / 2, cy = window.innerHeight * .42;
      let nx = -uy, ny = ux;
      if ((cx - mx) * nx + (cy - my) * ny < 0) { nx = -nx; ny = -ny; }
      const bow = Math.min(70, span * .28);
      const g = { sx, sy, ex, ey, qx: mx + nx * bow, qy: my + ny * bow, tx, ty, r: Math.max(rt.width, rt.height) / 2 + 5 };
      let len = 0, prev = [sx, sy];
      for (let i = 1; i <= 20; i++) { const q = point(g, i / 20); len += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; }
      const next = { ...g, len };
      // Only update when something actually moved, so the shoot-out animation isn't restarted.
      setGeo((prev) => (prev && ['sx', 'sy', 'ex', 'ey', 'tx', 'ty', 'r'].every((key) => Math.abs(prev[key] - next[key]) < 0.5) ? prev : next));
    };
    compute();
    // Seats shift when the layout around the table changes (for example the bar under the
    // table changing height), which fires no resize event. Keep following them.
    const follow = setInterval(compute, 250);
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, { passive: true, capture: true });
    return () => { clearInterval(follow); window.removeEventListener('resize', compute); window.removeEventListener('scroll', compute, true); };
  }, [askerId, targetId, seatEls, seatVersion]);

  // Shoot out from the asker, overshoot slightly, then keep nudging toward the target.
  useEffect(() => {
    if (!geo) return;
    const draw = (p) => {
      const d = arrowPath(geo, p);
      body.current?.setAttribute('d', d);
      shadow.current?.setAttribute('d', d);
      gloss.current?.setAttribute('d', d);
    };
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { draw(1); return; }
    let raf; const start = performance.now();
    const tick = (now) => {
      const el = now - start;
      let p;
      if (el < SHOOT_MS) {
        const t = el / SHOOT_MS, c1 = 1.70158, c3 = c1 + 1;
        p = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); // ease-out-back
        p = Math.max(.12, Math.min(1.0, p * .97 + (t > .7 ? .03 : 0)));
      } else {
        draw(1); return;   // then it holds still (a looping nudge kept the page redrawing)
      }
      draw(p);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [geo]);

  if (!geo) return null;
  const d0 = arrowPath(geo, 1);
  const mid = point(geo, .5);
  return <svg className="ask-arrow" aria-hidden="true" key={`${askerId}-${targetId}`}>
    <defs>
      <linearGradient id={`af-${uid}`} gradientUnits="userSpaceOnUse" x1={geo.sx} y1={geo.sy} x2={geo.ex} y2={geo.ey}>
        <stop offset="0" stopColor={C.from} stopOpacity=".15" />
        <stop offset=".35" stopColor={C.from} />
        <stop offset=".8" stopColor={C.mid} />
        <stop offset="1" stopColor={C.tip} />
      </linearGradient>
      <linearGradient id={`ag-${uid}`} gradientUnits="userSpaceOnUse" x1={geo.sx} y1={geo.sy} x2={geo.ex} y2={geo.ey}>
        <stop offset="0" stopColor="#fff" stopOpacity="0" />
        <stop offset=".5" stopColor="#fff" stopOpacity=".75" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
        <animateTransform attributeName="gradientTransform" type="translate" dur="1.8s" repeatCount="indefinite"
          from={`${geo.sx - geo.ex} ${geo.sy - geo.ey}`} to={`${geo.ex - geo.sx} ${geo.ey - geo.sy}`} />
      </linearGradient>
    </defs>
    <circle className="ask-arrow__ring" cx={geo.tx} cy={geo.ty} r={geo.r} style={{ stroke: C.ring }} />
    <path ref={shadow} className="ask-arrow__shadow" d={d0} />
    <path ref={body} className="ask-arrow__body" d={d0} fill={`url(#af-${uid})`} style={{ stroke: C.edge, filter: `drop-shadow(0 0 5px ${C.glow})` }} />
    <path ref={gloss} className="ask-arrow__gloss" d={d0} fill={`url(#ag-${uid})`} />
    {label && <g transform={`translate(${mid[0]} ${mid[1]})`}>
      <rect className="ask-arrow__tag" x={-label.length * 3.6 - 8} y="-10" width={label.length * 7.2 + 16} height="20" rx="10" style={{ stroke: C.ring }} />
      <text className="ask-arrow__tag-text" textAnchor="middle" dominantBaseline="central" style={{ fill: C.tip }}>{label}</text>
    </g>}
  </svg>;
}
