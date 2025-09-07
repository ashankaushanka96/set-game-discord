import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { send } from '../ws';
import Seat from './Seat';
import PlayerHand from './PlayerHand';
import AskSetModal from './AskSetModal';
import AskRankModal from './AskRankModal';
import ConfirmPassModal from './ConfirmPassModal';
import LaydownModal from './LaydownModal';
import TurnBanner from './TurnBanner';
import MessageBubbles from './MessageBubbles';
import Celebration from './Celebration';
import MessageBox from './MessageBox';
import Card from './Card';
import { RANKS_LOWER, RANKS_UPPER, SUITS } from '../lib/deck';

const TEAM_RING = {
  A: 'ring-blue-500/70',
  B: 'ring-rose-500/70',
  unknown: 'ring-zinc-600/60',
};

export default function Table() {
  const { state, me, ws, pendingAsk, handoffFor, setWS } = useStore();
  const [selectingTarget, setSelectingTarget] = useState(false);
  const [targetPlayer, setTargetPlayer] = useState(null);
  const [setPickerOpen, setSetPickerOpen] = useState(false);
  const [rankPickerOpen, setRankPickerOpen] = useState(false);
  const [layOpen, setLayOpen] = useState(false);
  const [selectedSet, setSelectedSet] = useState({ suit: null, setType: null });

  const [anim, setAnim] = useState(null);
  const [lays, setLays] = useState([]);
  const tableCenterRef = useRef(null);

  const seatEls = useRef({});
  const [seatVersion, setSeatVersion] = useState(0);
  const lastSeatEl = useRef({});

  if (!state) return null;

  const players = state.players || {};
  const seats = state.seats || {};
  const my = players[me.id];
  const isMyTurn = state.turn_player === me.id;

  const AREA_W = 900, AREA_H = 640, TABLE_SIZE = 420, RADIUS = 280;
  const mySeatIndex = typeof my?.seat === 'number' ? my.seat : 0;
  const seatPositions = useMemo(() => {
    const cx = AREA_W / 2, cy = AREA_H / 2, pos = {};
    for (let i = 0; i < 6; i++) {
      const angle = (90 + (i - mySeatIndex) * 60) * (Math.PI / 180);
      pos[i] = { left: `${cx + RADIUS * Math.cos(angle) - 56}px`, top: `${cy + RADIUS * Math.sin(angle) - 56}px` };
    }
    return pos;
  }, [mySeatIndex]);

  const eligibleSets = useMemo(() => {
    if (!my) return [];
    const res = [];
    const hasIn = (s, t) => {
      const ranks = t==='lower'?RANKS_LOWER:RANKS_UPPER;
      return my.hand?.some(c => c.suit===s && ranks.includes(c.rank));
    };
    for (const s of SUITS) {
      if (hasIn(s,'lower')) res.push({ suit:s, type:'lower' });
      if (hasIn(s,'upper')) res.push({ suit:s, type:'upper' });
    }
    return res;
  }, [my]);

  const askableRanks = useMemo(() => {
    if (!selectedSet.suit || !selectedSet.setType || !my) return [];
    const ranks = selectedSet.setType==='lower'?RANKS_LOWER:RANKS_UPPER;
    const mine = new Set(my.hand.filter(c=>c.suit===selectedSet.suit).map(c=>c.rank));
    return ranks.filter(r=>!mine.has(r));
  }, [selectedSet, my]);

  const opponents = useMemo(
    () => Object.values(players).filter(p => p.team && p.team !== my?.team),
    [players, my?.team]
  );

  const startAskFlow = () => { if (isMyTurn) { setSelectingTarget(true); setTargetPlayer(null); } };
  const onSelectOpponent = (p) => {
    if (!selectingTarget || !opponents.find(o=>o.id===p.id)) return;
    setSelectingTarget(false);
    setTargetPlayer(p);
    setSelectedSet({ suit:null, setType:null });
    setSetPickerOpen(true);
  };
  const onPickSet = ({ suit, setType }) => { setSelectedSet({ suit, setType }); setSetPickerOpen(false); setRankPickerOpen(true); };
  const onPickRank = (rank) => {
    send(ws, 'ask', { asker_id: my.id, target_id: targetPlayer.id, suit: selectedSet.suit, set_type: selectedSet.setType, ranks: [rank] });
    setRankPickerOpen(false);
    setTargetPlayer(null);
    setSelectedSet({ suit:null, setType:null });
  };

  const confirmPass = () => {
    if (!pendingAsk) return;
    send(ws,'confirm_pass',{ asker_id: pendingAsk.asker_id, target_id: pendingAsk.target_id, cards: pendingAsk.pending_cards });
  };

  useEffect(() => {
    function onAnim(e) {
      const { asker_id, target_id, card } = e.detail || {};
      if (!asker_id || !target_id || !card) return;
      const fromEl = seatEls.current[target_id];
      const toEl   = seatEls.current[asker_id];
      if (!fromEl || !toEl) return;
      const from = fromEl.getBoundingClientRect();
      const to   = toEl.getBoundingClientRect();
      setAnim({
        suit: card.suit, rank: card.rank,
        from: { x: from.left + from.width/2, y: from.top + from.height/2 },
        to:   { x: to.left   + to.width/2,   y: to.top  + to.height/2 },
        go: false,
      });
      requestAnimationFrame(() => requestAnimationFrame(() => setAnim(a=>a?{...a,go:true}:a)));
      setTimeout(()=>setAnim(null), 900);
    }
    window.addEventListener('pass_anim', onAnim);
    return () => window.removeEventListener('pass_anim', onAnim);
  }, []);

  useEffect(() => {
    function onLayAnim(e) {
      const { contributors } = e.detail || {};
      if (!Array.isArray(contributors) || !contributors.length) return;
      const center = tableCenterRef.current?.getBoundingClientRect();
      if (!center) return;
      const cx = center.left + center.width/2;
      const cy = center.top + center.height/2;

      const items = [];
      contributors.forEach(contrib => {
        const el = seatEls.current[contrib.player_id];
        if (!el) return;
        const r = el.getBoundingClientRect();
        const fx = r.left + r.width/2, fy = r.top + r.height/2;
        const card = (contrib.cards && contrib.cards[0]) || null;
        if (!card) return;
        items.push({ suit: card.suit, rank: card.rank, from: {x:fx,y:fy}, to: {x:cx,y:cy}, go:false });
      });
      setLays(items);
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        setLays(its => its.map(it => ({...it, go:true})));
      }));
      setTimeout(()=>setLays([]), 1000);
    }
    window.addEventListener('lay_anim', onLayAnim);
    return () => window.removeEventListener('lay_anim', onLayAnim);
  }, []);

  const handCount = (pid) => (players[pid]?.hand?.length ?? 0);

  const setSeatRef = (playerId) => (el) => {
    if (!playerId || !el) return;
    if (lastSeatEl.current[playerId] !== el) {
      lastSeatEl.current[playerId] = el;
      seatEls.current[playerId] = el;
      setSeatVersion((v) => v + 1);
    }
  };

  const setsA = (state.table_sets || []).filter(ts => ts.owner_team === 'A');
  const setsB = (state.table_sets || []).filter(ts => ts.owner_team === 'B');

  const doHandoff = (toId) => {
    send(ws, 'handoff_after_laydown', { who_id: me.id, to_id: toId });
  };

  return (
    <div className="p-6 relative min-h-screen flex flex-col">
      <Celebration />
      <TurnBanner state={state} />

      {/* Handoff prompt */}
      {handoffFor && handoffFor.who_id === me.id && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[95] bg-zinc-900/90 backdrop-blur px-4 py-2 rounded-xl card-shadow flex items-center gap-2">
          <span className="text-sm opacity-80">Pass turn to teammate:</span>
          {handoffFor.eligible.map(pid => (
            <button key={pid} className="text-sm bg-emerald-700/70 hover:bg-emerald-700 px-3 py-1 rounded"
              onClick={() => doHandoff(pid)}>
              {players[pid]?.avatar} {players[pid]?.name}
            </button>
          ))}
        </div>
      )}

      {/* HUD (top-left) */}
      <div className="fixed top-3 left-3 bg-zinc-800/80 backdrop-blur px-4 py-2 rounded-xl card-shadow text-sm z-[95]">
        <div className="font-semibold">{my?.name ?? 'Me'}</div>
        <div className="opacity-80">Seat {typeof my?.seat === 'number' ? my.seat+1 : '-'}</div>
        <div className={`mt-1 inline-flex items-center gap-2 px-2 py-[2px] rounded-full text-[12px] ${my?.team==='A'?'bg-blue-600/30 text-blue-300':'bg-rose-600/30 text-rose-300'}`}>
          <span className={`inline-block h-2 w-2 rounded-full ${my?.team==='A'?'bg-blue-400':'bg-rose-400'}`} />
          {my?.team ? `Team ${my.team}` : 'No team'}
        </div>
      </div>

      <MessageBubbles seatEls={seatEls} seatVersion={seatVersion} />
      <div className="mt-16" />

      {/* TABLE AREA */}
      <div className="relative mx-auto bg-zinc-900/30 rounded-3xl card-shadow" style={{ width: `900px`, height: `640px` }}>
        <div ref={tableCenterRef} className="absolute rounded-full border-4 border-zinc-700 bg-zinc-800/40"
             style={{ width: `420px`, height: `420px`, left: `calc(50% - 210px)`, top: `calc(50% - 210px)` }} />

        {Object.keys(seats).map((k) => {
          const i = Number(k);
          const pid = seats[i];
          const p = pid ? players[pid] : null;
          const selectable = selectingTarget && !!p && p.team !== my.team;
          const ringClass = p?.team === 'A' ? TEAM_RING.A : p?.team === 'B' ? TEAM_RING.B : TEAM_RING.unknown;
          const isMe = p && p.id === me.id;
          return (
            <div key={`seatwrap-${i}-${pid || 'empty'}`} className="absolute" style={seatPositions[i]} ref={p ? setSeatRef(p.id) : undefined}>
              <div className={[
                  'rounded-full',
                  selectable ? 'ring-2 ring-yellow-300/80' : '',
                  ringClass,
                  isMe ? 'ring-4 ring-cyan-400 shadow-[0_0_0_6px_rgba(34,211,238,0.25)]' : 'ring-2',
                ].join(' ')}
              >
                <Seat seatIndex={i} player={p} highlight={p?.id === state.turn_player} selectable={selectable}
                      onSelect={onSelectOpponent} team={p?.team} isMe={isMe} />
              </div>
              {p && p.id !== my.id && <div className="mt-1 text-center text-xs opacity-70">{(players[pid]?.hand?.length ?? 0)} cards</div>}
            </div>
          );
        })}

        {/* pass animation */}
        {anim && (
          <div className="fixed z-[90] pointer-events-none" style={{ left: anim.from.x, top: anim.from.y, transform: 'translate(-50%,-50%)' }}>
            <div style={{ position: 'relative', left: anim.go ? (anim.to.x - anim.from.x) : 0, top: anim.go ? (anim.to.y - anim.from.y) : 0,
                          transition: 'left 0.8s cubic-bezier(.2,.8,.2,1), top 0.8s cubic-bezier(.2,.8,.2,1)' }}>
              <Card suit={anim.suit} rank={anim.rank} size="sm" />
            </div>
          </div>
        )}

        {/* laydown animation */}
        {lays.map((a, idx)=>(
          <div key={`lay-${idx}`} className="fixed z-[88] pointer-events-none" style={{ left: a.from.x, top: a.from.y, transform: 'translate(-50%,-50%)' }}>
            <div style={{ position:'relative', left: a.go ? (a.to.x - a.from.x) : 0, top: a.go ? (a.to.y - a.from.y) : 0,
                          transition:'left .9s cubic-bezier(.2,.8,.2,1), top .9s cubic-bezier(.2,.8,.2,1)' }}>
              <Card suit={a.suit} rank={a.rank} size="sm" />
            </div>
          </div>
        ))}
      </div>

      {/* HAND + actions */}
      <div className="mt-6 flex flex-col items-center">
        <PlayerHand cards={my?.hand || []} />
      </div>
      <div className="mt-4 flex items-center justify-center gap-3">
        {my?.seat === 0 && state.phase === 'playing' && (
          <button className="bg-amber-600 px-4 py-2 rounded" onClick={() => send(ws, 'shuffle_deal', {})}>Shuffle & Deal</button>
        )}
        <button disabled={!isMyTurn} className="bg-indigo-600 px-4 py-2 rounded disabled:opacity-40" onClick={startAskFlow}>Ask</button>
        <button disabled={!isMyTurn} className="bg-emerald-600 px-4 py-2 rounded disabled:opacity-40" onClick={()=>setLayOpen(true)}>Laydown</button>
      </div>

      {/* Single game message */}
      <MessageBox />

      {/* Modals */}
      <AskSetModal open={setPickerOpen} eligibleSets={eligibleSets.map(({ suit, type }) => ({ suit, type }))} onPick={onPickSet}
                   onClose={() => { setSetPickerOpen(false); setTargetPlayer(null); }} />
      <AskRankModal open={rankPickerOpen} suit={selectedSet.suit} setType={selectedSet.setType} askableRanks={askableRanks}
                    onPick={onPickRank} onClose={() => { setRankPickerOpen(false); setTargetPlayer(null); }} />
      {layOpen && <LaydownModal onClose={() => setLayOpen(false)} />}
      {pendingAsk && pendingAsk.target_id === my.id && (
        <ConfirmPassModal open asker={players[pendingAsk.asker_id]} target={players[pendingAsk.target_id]}
                          cards={pendingAsk.pending_cards} onConfirm={confirmPass} onClose={()=>{}} />
      )}
    </div>
  );
}
