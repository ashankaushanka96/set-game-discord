import { useEffect, useRef, useState } from 'react';
import { createGameTable3D } from './tableScene';

// The 3D room behind everything on the game screen. It fills the screen; `arenaRef` is the
// part of the page where the players must fit, and `onLayout` receives where each seat sits
// inside it so the page can put the players on their chairs.
// `ids`, `counts`, `teams` are arrays by position relative to the player (0 = the player).
export default function GameTable3D({ arenaRef, ids, counts, teams, sets, dealing, dealerRel, onLayout, onFail }) {
  const host = useRef(null);
  const table = useRef(null);
  const [portrait, setPortrait] = useState(null);
  const data = useRef({});
  data.current = { ids, counts, teams, sets, dealing, dealerRel };

  const area = () => {
    const a = arenaRef.current?.getBoundingClientRect(), h = host.current?.getBoundingClientRect();
    return a && h ? { left: a.left - h.left, top: a.top - h.top, width: a.width, height: a.height } : null;
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
    const relayout = () => { const l = t.layout(area()); if (l) onLayout?.(l); };
    const d = data.current;
    t.update({ counts: d.counts, teams: d.teams, sets: d.sets });
    relayout();
    if (d.dealing) t.startDeal(d.dealerRel);
    const ro = new ResizeObserver(relayout);
    ro.observe(host.current); ro.observe(arenaRef.current);
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
    return () => {
      ro.disconnect(); window.removeEventListener('resize', relayout);
      window.removeEventListener('pass_anim', onPass); window.removeEventListener('dismiss_passed_cards', onDismiss);
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

  return <div ref={host} className="table3d-host" aria-hidden="true" />;
}
