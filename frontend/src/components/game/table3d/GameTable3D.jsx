import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createGameTable3D } from './tableScene';

// Things on the page that must keep their own taps and drags; anywhere else turns the table.
const UI = 'button, a, input, textarea, select, [role="dialog"], .club-modal, .table-chat, .laydown-tablepick, .hand-selection-actions, .reaction-aim, .bot-wait';

// The 3D room behind everything on the game screen. It fills the screen; `arenaRef` is the
// part of the page where the players must fit, and `onLayout` receives where each seat sits
// inside it so the page can put the players on their chairs.
// `ids`, `counts`, `teams` are arrays by position relative to the player (0 = the player).
// `hand` is the player's own cards, drawn as a fan at the front; tapping one calls `onCardTap`.
export default function GameTable3D({ arenaRef, ids, counts, teams, sets, dealing, dealerRel, mySeatIndex = 0,
  hand = [], selectedKeys = [], handTappable = false, onCardTap, onLayout, onFail }) {
  const host = useRef(null);
  const table = useRef(null);
  const [portrait, setPortrait] = useState(null);
  const [turned, setTurned] = useState(false);
  const [roomEl, setRoomEl] = useState(null);
  useEffect(() => { setRoomEl(host.current?.closest('.card-room') || null); }, []);
  const data = useRef({});
  data.current = { ids, counts, teams, sets, dealing, dealerRel, mySeatIndex, hand, selectedKeys, handTappable, onCardTap, onLayout };

  const rectIn = (el) => {
    const a = el?.getBoundingClientRect(), h = host.current?.getBoundingClientRect();
    return a && h && a.width ? { left: a.left - h.left, top: a.top - h.top, width: a.width, height: a.height } : null;
  };
  const room = () => host.current?.closest('.card-room');
  const handRect = () => rectIn(room()?.querySelector('.player-hand__scroll'));
  const pushHand = () => { const d = data.current; table.current?.setHand(d.dealing ? [] : d.hand, d.selectedKeys, handRect()); };

  // Move the players straight on the page while the table is being turned (no re-render per frame).
  const moveSeats = (l) => {
    const arena = arenaRef.current;
    if (!l || !arena) return;
    arena.querySelectorAll(':scope > .table-seat-position').forEach((el) => {
      const s = l.seats[(Number(el.dataset.seat) - data.current.mySeatIndex + 6) % 6];
      el.style.left = `${s.x}px`; el.style.top = `${s.y}px`;
    });
    const centre = arena.querySelector(':scope > [data-table-center]');
    if (centre) { centre.style.left = `${l.center.x}px`; centre.style.top = `${l.center.y}px`; }
  };

  // The table's shape follows the space the players have (squarish or tall: it runs away
  // from the player). If that flips, the scene is rebuilt.
  useEffect(() => {
    const el = arenaRef.current;
    if (!el) return;
    const measure = () => { if (el.clientWidth && el.clientHeight) setPortrait(el.clientWidth < el.clientHeight * 1.25); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [arenaRef]);

  useEffect(() => {
    if (portrait === null) return;
    let t;
    try {
      t = createGameTable3D(host.current, { portrait });
    } catch (error) {
      console.warn('[3D table] could not start, falling back to the flat table', error);
      onFail?.();
      return;
    }
    table.current = t;
    const report = (l) => { if (l) { setTurned(!!l.turned); data.current.onLayout?.(l); } };
    const relayout = () => { report(t.layout(rectIn(arenaRef.current))); pushHand(); };
    const d = data.current;
    t.update({ counts: d.counts, teams: d.teams, sets: d.sets });
    relayout();
    if (d.dealing) t.startDeal(d.dealerRel);
    const ro = new ResizeObserver(relayout);
    ro.observe(host.current); ro.observe(arenaRef.current);
    const dock = room()?.querySelector('.game-hand-dock');
    if (dock) ro.observe(dock);
    window.addEventListener('resize', relayout);

    // Cards changing hands: fly face up to the receiver and rest there for a moment.
    const relOf = (pid) => data.current.ids.indexOf(pid);
    const onPass = (event) => {
      const { from_player, to_player, cards } = event.detail || {};
      const from = relOf(from_player), to = relOf(to_player);
      if (from >= 0 && to >= 0) t.pass(from, to, cards);
    };
    const onDismiss = () => t.clearRest();
    window.addEventListener('pass_anim', onPass);
    window.addEventListener('dismiss_passed_cards', onDismiss);

    // Drag to turn the table, pinch or scroll to zoom, tap a card in the fan to select it.
    const el = room();
    const pointers = new Map();
    let moved = false, pinch = 0, last = null;
    const local = (e) => { const r = host.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const down = (e) => {
      if (e.target.closest?.(UI) || (e.pointerType === 'mouse' && e.button !== 0)) return;
      // a seat is a button too (matched above); everything else starts a turn or a tap
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
      moved = pointers.size > 1; pinch = 0;
    };
    const move = (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) last = t.orbit(0, 0, pinch / dist);
        pinch = dist; moved = true;
      } else if (pointers.size === 1) {
        if (!moved && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 8) return;
        moved = true;
        last = t.orbit(-dx * 0.006, -dy * 0.004);
      }
      moveSeats(last);
    };
    const up = (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      pointers.delete(e.pointerId); pinch = 0;
      if (!moved) {
        const { x, y } = local(e);
        const card = t.pickHand(x, y);
        if (card && data.current.handTappable) data.current.onCardTap?.(card);
      } else if (!pointers.size) { report(last); last = null; }
    };
    const wheel = (e) => {
      if (e.target.closest?.(UI)) return;
      const l = t.orbit(0, 0, e.deltaY > 0 ? 1.06 : 0.94);
      moveSeats(l); report(l);
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: true });

    return () => {
      ro.disconnect(); window.removeEventListener('resize', relayout);
      window.removeEventListener('pass_anim', onPass); window.removeEventListener('dismiss_passed_cards', onDismiss);
      el.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      table.current = null; t.dispose();
    };
  }, [portrait]); // eslint-disable-line react-hooks/exhaustive-deps

  const key = JSON.stringify([counts, teams, sets.map((s) => [s.suit, s.set_type, s.owner_team])]);
  useEffect(() => { table.current?.update({ counts, teams, sets }); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // The deal: cards fly out from the deck in the middle, in step with the deal sounds.
  useEffect(() => {
    const t = table.current;
    if (!t) return;
    if (dealing) t.startDeal(dealerRel); else t.stopDeal();
  }, [dealing]); // eslint-disable-line react-hooks/exhaustive-deps

  const handKey = JSON.stringify([hand.map((c) => `${c.suit}-${c.rank}`), selectedKeys, dealing]);
  useEffect(() => { pushHand(); }, [handKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return <>
    <div ref={host} className="table3d-host" aria-hidden="true" />
    {turned && roomEl && createPortal(
      <button type="button" className="table3d-reset" onClick={() => { const l = table.current?.resetView(); moveSeats(l); if (l) { setTurned(false); onLayout?.(l); } }}>⟲ Reset view</button>,
      roomEl)}
  </>;
}
