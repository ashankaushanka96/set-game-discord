import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createGameTable3D } from './tableScene';
import Card from '../../cards/Card';
import { nearestPlayerAt } from '../cardDropTarget';
import { useStore } from '../../../store';

// Things on the page that must keep their own taps and drags; anywhere else turns the table.
const UI = 'button, a, input, textarea, select, [role="dialog"], .club-modal, .table-chat, .laydown-tablepick, .hand-selection-actions, .reaction-aim, .bot-wait';

// The 3D room behind everything on the game screen. It fills the screen; `arenaRef` is the
// part of the page where the players must fit, and `onLayout` receives where each seat sits
// inside it so the page can put the players on their chairs.
// `ids`, `counts`, `teams` are arrays by position relative to the player (0 = the player).
// `hand` is the player's own cards, held at the edge of the table. Tap a card to select it,
// slide along the fan to select several, or drag cards up onto an opponent to pass them
// (`dragPass`; the drag callbacks match PlayerHand's).
export default function GameTable3D({ arenaRef, ids, counts, teams, sets, dealing, dealerRel, dealOrder, dealId, mySeatIndex = 0,
  hand = [], selectedKeys = [], handTappable = false, onCardTap, onLayout, onFail,
  dragPass = false, resolveDropTarget, onDragStart, onDragHover, onDragEnd, onCardsDrop, ask = null, turnId = null }) {
  const host = useRef(null);
  // Turn Play pointers drawn in 3D (the asked card gliding over): the waiting ask, plus the store's laydown and turn arrows
  // while their time window is open (delayed ones appear when their start comes).
  const flowArrows = useStore((s) => s.flowArrows);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (!flowArrows?.length) return;
    const id = setInterval(() => setClock(Date.now()), 300);
    return () => clearInterval(id);
  }, [flowArrows]);
  const relOf = (pid) => (pid ? ids.indexOf(pid) : -1);
  const pointers = [
    ...(ask?.asker_id && ask?.target_id ? [{ key: 'ask', from: relOf(ask.asker_id), to: relOf(ask.target_id), tone: 'ask',
      cards: ask.suit && ask.ranks?.length ? ask.ranks.map((rank) => ({ suit: ask.suit, rank })) : undefined }] : []),
    ...(flowArrows || []).filter((a) => (a.start || 0) <= clock && a.until > clock)
      .map((a) => ({ key: a.id, from: relOf(a.from), to: relOf(a.to), tone: a.tone, label: a.label })),
  ].filter((p) => p.from >= 0 && p.to >= 0 && p.from !== p.to);
  const pointerKey = JSON.stringify(pointers);
  const turnRel = turnId && ids.indexOf(turnId) >= 0 ? ids.indexOf(turnId) : null;
  const table = useRef(null);
  const [portrait, setPortrait] = useState(null);
  const [turned, setTurned] = useState(false);
  const [setPositions, setSetPositions] = useState([]);
  const [inspected, setInspected] = useState(null);
  const [pinned, setPinned] = useState(false);
  const [roomEl, setRoomEl] = useState(null);
  useEffect(() => { setRoomEl(host.current?.closest('.card-room') || null); }, []);
  const data = useRef({});
  data.current = { ids, counts, teams, sets, dealing, dealerRel, dealOrder, dealId, mySeatIndex, hand, selectedKeys, handTappable, onCardTap, onLayout,
    dragPass, resolveDropTarget, onDragStart, onDragHover, onDragEnd, onCardsDrop, pointers, turnRel };

  const rectIn = (el) => {
    const a = el?.getBoundingClientRect(), h = host.current?.getBoundingClientRect();
    return a && h && a.width ? { left: a.left - h.left, top: a.top - h.top, width: a.width, height: a.height } : null;
  };
  const room = () => host.current?.closest('.card-room');
  // The hand's layer goes in the players' area, after the seats, and lines up with the full 3D view.
  const placeHandLayer = () => {
    const layer = table.current?.handLayer, arena = arenaRef.current;
    if (!layer || !arena || !host.current) return;
    if (layer.parentNode !== arena) arena.appendChild(layer);
    const a = arena.getBoundingClientRect(), h = host.current.getBoundingClientRect();
    Object.assign(layer.style, { left: `${h.left - a.left}px`, top: `${h.top - a.top}px`, width: `${h.width}px`, height: `${h.height}px`, zIndex: 6 });
  };
  const pushHand = () => { const d = data.current; table.current?.setHand(d.hand, d.selectedKeys); };
  // The opponent under the pointer while cards are dragged (same forgiving area as the flat hand).
  const dropTargetAt = (x, y) => {
    const seats = [...document.querySelectorAll('[data-player-id]')].map((w) => ({ id: w.getAttribute('data-player-id'), rect: (w.querySelector('.game-seat') || w).getBoundingClientRect() }));
    const id = nearestPlayerAt(x, y, seats);
    return id && data.current.resolveDropTarget?.(id) ? id : null;
  };

  // Move the players straight on the page while the table is being turned (no re-render per frame).
  const moveSeats = (l) => {
    const arena = arenaRef.current;
    if (!l || !arena) return;
    room()?.querySelectorAll('[data-collected-key]').forEach(el => {
      const pos = l.collected?.find(s => s.key === el.dataset.collectedKey);
      if (pos) { el.style.left = `${pos.x}px`; el.style.top = `${pos.y}px`; }
    });
    arena.querySelectorAll(':scope > .table-seat-position').forEach((el) => {
      const s = l.seats[(Number(el.dataset.seat) - data.current.mySeatIndex + 6) % 6];
      el.style.left = `${s.x}px`; el.style.top = `${s.y}px`;
    });
    placeHandLayer();
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
    const report = (l) => { if (l) { setTurned(!!l.turned); setSetPositions(l.collected || []); data.current.onLayout?.(l); requestAnimationFrame(() => { if (table.current === t) moveSeats(l); }); } };
    const relayout = () => { report(t.layout(rectIn(arenaRef.current))); pushHand(); };
    const d = data.current;
    t.update({ counts: d.counts, teams: d.teams, sets: d.sets });
    t.setPointers(d.pointers);
    t.setTurn(d.turnRel);
    relayout();
    if (d.dealing) t.startDeal(d.dealerRel, d.dealOrder);
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
    // A set laid down: its cards fly in from whoever held them.
    const onLay = (event) => {
      const { contributors = [], suit, set_type } = event.detail || {};
      const list = contributors.map((c) => ({ rel: relOf(c.player_id), cards: c.cards })).filter((c) => c.rel >= 0);
      if (list.length) t.lay({ contributors: list, suit, setType: set_type });
    };
    window.addEventListener('pass_anim', onPass);
    window.addEventListener('dismiss_passed_cards', onDismiss);
    window.addEventListener('lay_anim', onLay);

    // Drag to turn the table, pinch or scroll to zoom. On the hand: tap a card to select it,
    // slide along the fan to select several, drag up to carry cards to an opponent.
    const el = room();
    const pointers = new Map();
    let moved = false, pinch = 0, last = null, grip = null;
    const local = (e) => { const r = host.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const isSelected = (card) => data.current.selectedKeys.includes(`${card.suit}-${card.rank}`);
    const keyOf = (c) => `${c.suit}-${c.rank}`;
    const down = (e) => {
      if (e.target.closest?.(UI) || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if (!pointers.size && data.current.handTappable) {
        const { x, y } = local(e);
        const card = t.pickHand(x, y);
        if (card) { t.hoverHand(card); grip = { id: e.pointerId, card, lastCard: card, sx: e.clientX, sy: e.clientY, mode: 'pending', was: isSelected(card), touched: new Set([keyOf(card)]) }; return; }
      }
      grip = null;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
      moved = pointers.size > 1; pinch = 0;
    };
    const handMove = (e) => {
      const d = data.current, { x, y } = local(e);
      if (grip.mode === 'pending') {
        const dx = e.clientX - grip.sx, dy = e.clientY - grip.sy;
        if (Math.hypot(dx, dy) < 9) return;
        if (d.dragPass && (e.pointerType === 'mouse' || grip.was || (dy < 0 && -dy > Math.abs(dx) * 0.5))) {   // heading up out of the hand (even toward a side seat)
          // carry the selected cards if this one is selected, otherwise just this card
          const cards = (grip.was ? d.hand.filter(isSelected) : [grip.card]).map(({ suit, rank }) => ({ suit, rank }));
          grip.mode = 'drag'; grip.cards = cards; grip.hover = null;
          d.onDragStart?.(cards);
        } else {
          grip.mode = 'sweep';
        }
      }
      if (grip.mode === 'sweep') {
        const card = t.pickHand(x, y);
        if (card) {
          grip.lastCard = card;
          grip.touched.add(keyOf(card));
          t.hoverHand(card);
        }
      } else if (grip.mode === 'drag') {
        t.dragHand(grip.cards.map(keyOf), x, y);
        const id = dropTargetAt(e.clientX, e.clientY);
        if (id !== grip.hover) { grip.hover = id; d.onDragHover?.(id); }
      }
    };
    const move = (e) => {
      if (grip && e.pointerId === grip.id) { e.preventDefault?.(); handMove(e); return; }
      const p = pointers.get(e.pointerId);
      if (!p) {
        if (!grip && e.pointerType === 'mouse') {
          const { x, y } = local(e);
          t.hoverHand(!e.target.closest?.(UI) && data.current.handTappable ? t.pickHand(x, y) : null);
        }
        return;
      }
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
      if (grip && e.pointerId === grip.id) {
        const g = grip, d = data.current; grip = null;
        t.hoverHand(null);
        if (g.mode === 'pending' && e.type !== 'pointercancel') d.onCardTap?.(g.card);
        else if (g.mode === 'sweep' && e.type !== 'pointercancel') {
          if (g.lastCard && !isSelected(g.lastCard)) d.onCardTap?.(g.lastCard);
        } else if (g.mode === 'drag') {
          const id = e.type === 'pointercancel' ? null : dropTargetAt(e.clientX, e.clientY);
          t.endDragHand(!!id);
          d.onDragEnd?.();
          if (id) d.onCardsDrop?.(g.cards, id);
          else if (e.type !== 'pointercancel') g.cards.forEach(card => { if (!isSelected(card)) d.onCardTap?.(card); });
        }
        return;
      }
      const p = pointers.get(e.pointerId);
      if (!p) return;
      pointers.delete(e.pointerId); pinch = 0;
      if (moved && !pointers.size) { report(last); last = null; }
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
      window.removeEventListener('pass_anim', onPass); window.removeEventListener('dismiss_passed_cards', onDismiss); window.removeEventListener('lay_anim', onLay);
      el.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      table.current = null; t.dispose();
    };
  }, [portrait]); // eslint-disable-line react-hooks/exhaustive-deps

  const key = JSON.stringify([counts, teams, sets.map((s) => [s.suit, s.set_type, s.owner_team])]);
  useEffect(() => {
    const t = table.current;
    if (!t) return;
    t.update({ counts, teams, sets });
    const l = t.getLayout();
    if (l) setSetPositions(l.collected || []);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // The deal: cards fly out from the deck in the middle, in step with the deal sounds.
  useEffect(() => {
    const t = table.current;
    if (!t) return;
    if (dealing) { pushHand(); t.startDeal(dealerRel, dealOrder); } else t.stopDeal();
  }, [dealing, dealId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { table.current?.setPointers(pointers); }, [pointerKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { table.current?.setTurn(turnRel); }, [turnRel]);

  const handKey = JSON.stringify([hand.map((c) => `${c.suit}-${c.rank}`), selectedKeys, dealing]);
  useEffect(() => { pushHand(); }, [handKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const close = e => { if (e.key === 'Escape') { setInspected(null); setPinned(false); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  const inspectedSet = sets.find(s => `${s.suit}|${s.set_type}` === inspected);
  return <>
    <div ref={host} className="table3d-host" aria-hidden="true" />
    {roomEl && createPortal(<>
      {setPositions.map(pos => {
        const set = sets.find(s => `${s.suit}|${s.set_type}` === pos.key);
        if (!set) return null;
        const lower = ['low', 'lower'].includes(set.set_type);
        return <button key={pos.key} type="button" className="collected-set-hit" data-collected-key={pos.key}
          style={{ left: pos.x, top: pos.y }} aria-label={`Inspect ${set.suit} ${lower ? '2 to 7' : '8 to ace'}, Team ${set.owner_team}`}
          onPointerEnter={e => { if (e.pointerType !== 'touch' && !pinned) setInspected(pos.key); }}
          onPointerLeave={() => { if (!pinned) setInspected(null); }}
          onFocus={() => { if (!pinned) setInspected(pos.key); }} onBlur={() => { if (!pinned) setInspected(null); }}
          onClick={e => { e.stopPropagation(); setInspected(pos.key); setPinned(true); }} />;
      })}
      {inspectedSet && <section className="collected-set-inspector" aria-label="Collected set details" onClick={e => e.stopPropagation()}>
        <div><strong>{inspectedSet.suit} · {['low', 'lower'].includes(inspectedSet.set_type) ? '2–7' : '8–A'}</strong><span>Team {inspectedSet.owner_team}</span>
          <button type="button" aria-label="Close set details" onClick={() => { setInspected(null); setPinned(false); }}>×</button></div>
        <div className="collected-set-inspector__cards">{[...(inspectedSet.cards || [])].sort((a,b) => ['2','3','4','5','6','7','8','9','10','J','Q','K','A'].indexOf(a.rank) - ['2','3','4','5','6','7','8','9','10','J','Q','K','A'].indexOf(b.rank)).map(c => <Card key={`${c.suit}-${c.rank}`} {...c} size="sm" />)}</div>
      </section>}
    </>, roomEl)}
    {turned && roomEl && createPortal(
      <button type="button" className="table3d-reset" onClick={() => { const l = table.current?.resetView(); moveSeats(l); if (l) { setTurned(false); onLayout?.(l); } }}>⟲ Reset view</button>,
      roomEl)}
  </>;
}
