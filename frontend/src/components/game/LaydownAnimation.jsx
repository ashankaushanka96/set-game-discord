import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Card from '../cards/Card';
import { RANKS_LOWER, RANKS_UPPER } from '../../lib/deck';

const FLY_IN = 1300; // cards gather and settle; then they stay until the player continues
const BUTTON_AFTER = FLY_IN + 3000;
const AUTO_CLEAR = 30000;
const SUIT_SYMBOL = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function GatheringCard({ item, success }) {
  const ref = useRef(null);
  useEffect(() => {
    const { from, to, angle, index, count } = item;
    const lift = `translate(${from.x}px,${from.y - 18}px) rotate(-8deg) scale(.9)`;
    const landed = `translate(${to.x}px,${to.y}px) rotate(${angle}deg) scale(1)`;
    let frames;
    if (success) {
      // Land in a readable fan, pop once, and stay.
      const at = (scale) => `translate(${to.x}px,${to.y}px) rotate(${angle}deg) scale(${scale})`;
      frames = [
        { transform: `translate(${from.x}px,${from.y}px) scale(.6)`, opacity: 0 },
        { transform: lift, opacity: 1, offset: .08 },
        { transform: landed, opacity: 1, offset: .6 },
        { transform: at(1.1), offset: .75 },
        { transform: at(1), opacity: 1 },
      ];
    } else {
      // Land, shake, and stay (lightly greyed but readable).
      const shake = dx => ({ transform: `translate(${to.x + dx}px,${to.y}px) rotate(${angle + dx / 2}deg)` });
      frames = [
        { transform: `translate(${from.x}px,${from.y}px) scale(.6)`, opacity: 0 },
        { transform: lift, opacity: 1, offset: .08 },
        { transform: landed, opacity: 1, offset: .55 },
        { ...shake(-9), offset: .63 }, { ...shake(9), offset: .71 }, { ...shake(-7), offset: .79 }, { ...shake(6), offset: .87 },
        { transform: landed, opacity: 1 },
      ];
    }
    const animation = ref.current.animate(frames, { duration: FLY_IN - item.count * 35, delay: index * 35, easing: 'cubic-bezier(.25,.7,.25,1)', fill: 'both' });
    return () => animation.cancel();
  }, [item, success]);
  return <div ref={ref} className="laydown-flight"><div><Card suit={item.suit} rank={item.rank} size="md" /></div></div>;
}

// 3D table: the points won pop up over the table in the team's colour, then fly into that team's
// score pill at the top, which gives a little pulse as they land.
function PointsToScore({ scene }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const pill = document.querySelector(`[data-score-team="${scene.team}"]`);
    const reduced = reducedMotion();
    const pop = el.animate([
      { opacity: 0, transform: 'translate(-50%,-30%) scale(.7)' },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1.1)', offset: .5 },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' },
    ], { duration: reduced ? 1 : 420, delay: reduced ? 0 : 1100, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'both' });
    let fly, pulse;
    pop.onfinish = () => {
      if (!pill) { fly = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, delay: 1400, fill: 'both' }); return; }
      const r = pill.getBoundingClientRect();
      const dx = r.left + r.width / 2 - scene.x, dy = r.top + r.height / 2 - scene.y;
      fly = el.animate([
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx * .35}px), calc(-50% + ${dy * .2 - 40}px)) scale(.8)`, opacity: 1, offset: .35 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.3)`, opacity: .2 },
      ], { duration: reduced ? 1 : 750, delay: reduced ? 600 : 1000, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'both' });
      fly.onfinish = () => {
        el.style.visibility = 'hidden';
        if (!reduced) pulse = pill.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.15)', offset: .35 }, { transform: 'scale(1)' }], { duration: 450, easing: 'ease-out' });
      };
    };
    return () => { pop.cancel(); fly?.cancel(); pulse?.cancel(); };
  }, [scene]);
  return <div ref={ref} className={`laydown-points3d laydown-points3d--${(scene.team || 'a').toLowerCase()}`}
    style={{ left: scene.x, top: scene.y }} role="status">+{scene.points} <span>Team {scene.team}</span></div>;
}

// With `cardsIn3d` the 3D table flies the cards itself; this only adds the glow, caption and button.
export default function LaydownAnimation({ seatEls, tableCenterRef, onViewResult, onActiveChange, cardsIn3d = false }) {
  const [scene, setScene] = useState(null);
  const [buttonReady, setButtonReady] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef(null);
  const buttonTimer = useRef(null);
  useEffect(() => { onActiveChange?.(!!scene); }, [scene, onActiveChange]);
  const dismiss = (openResult) => {
    clearTimeout(timer.current); clearTimeout(buttonTimer.current);
    if (openResult) onViewResult?.();
    setLeaving(true);
    timer.current = setTimeout(() => { setScene(null); setLeaving(false); setButtonReady(false); }, 280);
  };
  useEffect(() => {
    const reveal = event => {
      const { contributors = [], success, suit, set_type, points, team, penalty } = event.detail || {};
      const center = tableCenterRef.current?.getBoundingClientRect();
      if (!center) return;
      const cards = [];
      for (const contributor of contributors) {
        const wrapper = seatEls.current[contributor.player_id];
        const seat = wrapper?.querySelector('.game-seat') || wrapper;
        if (!seat) continue;
        const r = seat.getBoundingClientRect();
        for (const card of contributor.cards || []) cards.push({ ...card, from: { x: r.left + r.width / 2, y: r.top + r.height / 2 } });
      }
      if (!cards.length) return;
      const order = [...RANKS_LOWER, ...RANKS_UPPER];
      cards.sort((a, b) => order.indexOf(a.rank) - order.indexOf(b.rank)); // 2→7 or 8→A, whoever held them
      const cx = center.left + center.width / 2, cy = center.top + center.height / 2;
      const spread = Math.min(30, (Math.min(window.innerWidth, 520) - 120) / Math.max(1, cards.length));
      const items = cards.map((card, index) => ({ ...card, index, count: cards.length, angle: (index - (cards.length - 1) / 2) * 4,
        to: { x: cx + (index - (cards.length - 1) / 2) * spread, y: cy } }));
      clearTimeout(timer.current);
      if (cardsIn3d) {
        // 3D table: the cards fly onto the table in 3D; all that's added is the points, in the team's colour.
        setScene({ id: Date.now(), x: cx, y: cy, points, team, simple: true });
        timer.current = setTimeout(() => setScene(null), reducedMotion() ? 2500 : 4200);
        return;
      }
      const setName = suit ? `${suit[0].toUpperCase()}${suit.slice(1)} ${set_type === 'lower' ? 'Lower' : 'Upper'}` : 'The set';
      setScene({ id: Date.now(), items, success, x: cx, y: cy, suit, points, team, setName, penalty, reduced: reducedMotion(), cardsIn3d });
      setLeaving(false); setButtonReady(false);
      clearTimeout(buttonTimer.current);
      buttonTimer.current = setTimeout(() => setButtonReady(true), reducedMotion() ? 600 : BUTTON_AFTER);
      timer.current = setTimeout(() => { setScene(null); setButtonReady(false); }, AUTO_CLEAR);
    };
    window.addEventListener('lay_anim', reveal);
    return () => { window.removeEventListener('lay_anim', reveal); clearTimeout(timer.current); clearTimeout(buttonTimer.current); };
  }, [seatEls, tableCenterRef, cardsIn3d]);

  if (!scene) return null;
  if (scene.simple) return createPortal(<PointsToScore key={scene.id} scene={scene} />, document.body);
  const { success, x, y } = scene;
  const symbol = SUIT_SYMBOL[scene.suit] || '★';
  return createPortal(<div className={`laydown-reveal ${success ? 'laydown-reveal--success' : 'laydown-reveal--failed'} ${leaving ? 'laydown-reveal--leaving' : ''}`} key={scene.id}>
    <div className="laydown-reveal__glow" style={{ left: x, top: y }} />
    {!scene.reduced && !scene.cardsIn3d && scene.items.map((item, i) => <GatheringCard key={i} item={item} success={success} />)}
    {success ? <>
      <div className="laydown-reveal__ring" style={{ left: x, top: y }} />
      <div className="laydown-reveal__ring laydown-reveal__ring--late" style={{ left: x, top: y }} />
      {!scene.reduced && <div className="laydown-reveal__burst" style={{ left: x, top: y }}>
        {Array.from({ length: 18 }, (_, i) => {
          const a = (i / 18) * Math.PI * 2 + (i % 2) * .15;
          const dist = 110 + (i % 3) * 38;
          return <i key={i} style={{ '--dx': `${Math.cos(a) * dist}px`, '--dy': `${Math.sin(a) * dist * .75}px`, '--rot': `${(i * 47) % 360}deg`, '--d': `${(i % 4) * 30}ms` }}
            className={i % 3 === 0 ? 'is-gold' : ''}>{i % 3 === 0 ? '✦' : symbol}</i>;
        })}
      </div>}
      {scene.points != null && <div className="laydown-reveal__points" style={{ left: x, top: y - 70 }}>+{scene.points}</div>}
    </> : <>
      <div className="laydown-reveal__stamp" style={{ left: x, top: y - 92 }}>✕</div>
      <div className="laydown-reveal__crack" style={{ left: x, top: y }} />
    </>}
    <div className="laydown-reveal__caption" style={{ left: x, top: y + 78 }}>
      {success ? `${scene.setName} · Team ${scene.team || ''}`.trim()
        : scene.penalty ? `Wrong ask · ${scene.setName} → Team ${scene.team}` : `Failed · ${scene.setName} → Team ${scene.team || ''}`}
    </div>
    {buttonReady && !leaving && <button type="button" className="laydown-reveal__continue club-primary" style={{ left: x, top: y + 124 }}
      onClick={() => dismiss(!scene.penalty)}>{scene.penalty ? 'Continue' : 'View result'}</button>}
  </div>, document.body);
}
