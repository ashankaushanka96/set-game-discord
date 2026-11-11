import { useEffect, useRef, useState } from 'react';

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

export default function AskPointer({ seatEls, seatVersion, ask }) {
  const [geo, setGeo] = useState(null);
  const body = useRef(null), shadow = useRef(null), gloss = useRef(null);
  const askerId = ask?.asker_id, targetId = ask?.target_id;

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
      setGeo({ ...g, len });
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, { passive: true, capture: true });
    return () => { window.removeEventListener('resize', compute); window.removeEventListener('scroll', compute, true); };
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
        p = .955 + .045 * (0.5 + 0.5 * Math.cos((el - SHOOT_MS) / 1100 * 2 * Math.PI)); // nudge
      }
      draw(p);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [geo]);

  if (!geo) return null;
  const d0 = arrowPath(geo, 1);
  return <svg className="ask-arrow" aria-hidden="true" key={`${askerId}-${targetId}`}>
    <defs>
      <linearGradient id="ask-arrow-fill" gradientUnits="userSpaceOnUse" x1={geo.sx} y1={geo.sy} x2={geo.ex} y2={geo.ey}>
        <stop offset="0" stopColor="#f5a623" stopOpacity=".15" />
        <stop offset=".35" stopColor="#f5a623" />
        <stop offset=".8" stopColor="#ffd34d" />
        <stop offset="1" stopColor="#fff2b8" />
      </linearGradient>
      <linearGradient id="ask-arrow-gloss" gradientUnits="userSpaceOnUse" x1={geo.sx} y1={geo.sy} x2={geo.ex} y2={geo.ey}>
        <stop offset="0" stopColor="#fff" stopOpacity="0" />
        <stop offset=".5" stopColor="#fff" stopOpacity=".75" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
        <animateTransform attributeName="gradientTransform" type="translate" dur="1.8s" repeatCount="indefinite"
          from={`${geo.sx - geo.ex} ${geo.sy - geo.ey}`} to={`${geo.ex - geo.sx} ${geo.ey - geo.sy}`} />
      </linearGradient>
    </defs>
    <circle className="ask-arrow__ring" cx={geo.tx} cy={geo.ty} r={geo.r} />
    <path ref={shadow} className="ask-arrow__shadow" d={d0} />
    <path ref={body} className="ask-arrow__body" d={d0} fill="url(#ask-arrow-fill)" />
    <path ref={gloss} className="ask-arrow__gloss" d={d0} fill="url(#ask-arrow-gloss)" />
  </svg>;
}
