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
import Card from './Card';
import { RANKS_LOWER, RANKS_UPPER, SUITS } from '../lib/deck';

const TEAM_RING = {
  A: 'ring-blue-500/70',
  B: 'ring-rose-500/70',
  unknown: 'ring-zinc-600/60',
};

export default function Table() {
  const { state, me, ws, pendingAsk, toast } = useStore();
  const [selectingTarget, setSelectingTarget] = useState(false);
  const [targetPlayer, setTargetPlayer] = useState(null);
  const [setPickerOpen, setSetPickerOpen] = useState(false);
  const [rankPickerOpen, setRankPickerOpen] = useState(false);
  const [layOpen, setLayOpen] = useState(false);
  const [selectedSet, setSelectedSet] = useState({ suit: null, setType: null });

  // Animations
  const [anim, setAnim] = useState(null);          // pass animation
  const [lays, setLays] = useState([]);            // laydown animations
  const tableCenterRef = useRef(null);

  // Seat refs + version for bubbles
  const seatEls = useRef({});
  const [seatVersion, setSeatVersion] = useState(0);
  const lastSeatEl = useRef({});

  if (!state) return null;

  const players = state.players || {};
  const seats = state.seats || {};
  const my = players[me.id];
  const isMyTurn = state.turn_player === me.id;

  // --- Layout numbers (wider table) ---
  const AREA_W = 900, AREA_H = 640, TABLE_SIZE = 420, RADIUS = 280;

  // Rotate so my seat appears at bottom visually
  const mySeatIndex = typeof my?.seat === 'number' ? my.seat : 0;
  const seatPositions = useMemo(() => {
    const cx = AREA_W / 2, cy = AREA_H / 2, pos = {};
    for (let i = 0; i < 6; i++) {
      const angle = (90 + (i - mySeatIndex) * 60) * (Math.PI / 180);
      pos[i] = { left: `${cx + RADIUS * Math.cos(angle) - 56}px`, top: `${cy + RADIUS * Math.sin(angle) - 56}px` };
    }
    return pos;
  }, [mySeatIndex]);

  // eligible sets for me
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

  // PASS animation
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

  // LAYDOWN animation: contributors -> table center
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

  // Safe ref setter
  const setSeatRef = (playerId) => (el) => {
    if (!playerId || !el) return;
    if (lastSeatEl.current[playerId] !== el) {
      lastSeatEl.current[playerId] = el;
      seatEls.current[playerId] = el;
      setSeatVersion((v) => v + 1);
    }
  };

  const teamLabel = my?.team ? (my.team === 'A' ? 'Team A' : 'Team B') : 'No team';

  // Group collected table sets by team
  const setsA = (state.table_sets || []).filter(ts => ts.owner_team === 'A');
  const setsB = (state.table_sets || []).filter(ts => ts.owner_team === 'B');

  return (
    <div className="p-6 relative min-h-screen flex flex-col">
      <TurnBanner state={state} />

      {/* My HUD (top-left) */}
      <div className="fixed top-3 left-3 bg-zinc-800/80 backdrop-blur px-4 py-2 rounded-xl card-shadow text-sm z-[95]">
        <div className="font-semibold">{my?.name ?? 'Me'}</div>
        <div className="opacity-80">Seat {typeof my?.seat === 'number' ? my.seat+1 : '-'}</div>
        <div className={`mt-1 inline-flex items-center gap-2 px-2 py-[2px] rounded-full text-[12px] ${my?.team==='A'?'bg-blue-600/30 text-blue-300':'bg-rose-600/30 text-rose-300'}`}>
          <span className={`inline-block h-2 w-2 rounded-full ${my?.team==='A'?'bg-blue-400':'bg-rose-400'}`} />
          {teamLabel}
        </div>
      </div>

      {/* Bubbles */}
      <MessageBubbles seatEls={seatEls} seatVersion={seatVersion} />

      <div className="mt-16" />

      {/* SIDE SET BOXES */}
      <SideBox side="left" title="Team A Sets" color="blue">
        <SetList sets={setsA} />
      </SideBox>
      <SideBox side="right" title="Team B Sets" color="rose">
        <SetList sets={setsB} />
      </SideBox>

      {/* TABLE */}
      <div
        className="relative mx-auto bg-zinc-900/30 rounded-3xl card-shadow"
        style={{ width: `${AREA_W}px`, height: `${AREA_H}px` }}
      >
        <div
          ref={tableCenterRef}
          className="absolute rounded-full border-4 border-zinc-700 bg-zinc-800/40"
          style={{ width: `${TABLE_SIZE}px`, height: `${TABLE_SIZE}px`, left: `calc(50% - ${TABLE_SIZE/2}px)`, top: `calc(50% - ${TABLE_SIZE/2}px)` }}
        />

        {Object.keys(seats).map((k) => {
          const i = Number(k);
          const pid = seats[i];
          const p = pid ? players[pid] : null;
          const selectable = selectingTarget && !!p && p.team !== my.team;
          const ringClass = p?.team === 'A' ? TEAM_RING.A : p?.team === 'B' ? TEAM_RING.B : TEAM_RING.unknown;
          const isMe = p && p.id === me.id;
          return (
            <div
              key={`seatwrap-${i}-${pid || 'empty'}`}
              className="absolute"
              style={seatPositions[i]}
              ref={p ? setSeatRef(p.id) : undefined}
            >
              <div className={[
                  'rounded-full',
                  selectable ? 'ring-2 ring-yellow-300/80' : '',
                  ringClass,
                  isMe ? 'ring-4 ring-cyan-400 shadow-[0_0_0_6px_rgba(34,211,238,0.25)]' : 'ring-2',
                ].join(' ')}
              >
                <Seat
                  seatIndex={i}
                  player={p}
                  highlight={p?.id === state.turn_player}
                  selectable={selectable}
                  onSelect={onSelectOpponent}
                  team={p?.team}
                  isMe={isMe}
                />
              </div>
              {p && p.id !== my.id && (
                <div className="mt-1 text-center text-xs opacity-70">{handCount(p.id)} cards</div>
              )}
            </div>
          );
        })}

        {/* PASS animation */}
        {anim && (
          <div className="fixed z-[90] pointer-events-none" style={{ left: anim.from.x, top: anim.from.y, transform: 'translate(-50%,-50%)' }}>
            <div
              style={{
                position: 'relative',
                left: anim.go ? (anim.to.x - anim.from.x) : 0,
                top:  anim.go ? (anim.to.y - anim.from.y) : 0,
                transition: 'left 0.8s cubic-bezier(.2,.8,.2,1), top 0.8s cubic-bezier(.2,.8,.2,1)',
              }}
            >
              <Card suit={anim.suit} rank={anim.rank} size="sm" />
            </div>
          </div>
        )}

        {/* LAYDOWN animations (contributors -> table center) */}
        {lays.map((a, idx)=>(
          <div key={`lay-${idx}`} className="fixed z-[88] pointer-events-none" style={{ left: a.from.x, top: a.from.y, transform: 'translate(-50%,-50%)' }}>
            <div style={{
              position:'relative',
              left: a.go ? (a.to.x - a.from.x) : 0,
              top:  a.go ? (a.to.y - a.from.y) : 0,
              transition:'left .9s cubic-bezier(.2,.8,.2,1), top .9s cubic-bezier(.2,.8,.2,1)'
            }}>
              <Card suit={a.suit} rank={a.rank} size="sm" />
            </div>
          </div>
        ))}
      </div>

      {/* HAND (centered) */}
      <div className="mt-6 flex flex-col items-center">
        <PlayerHand cards={my?.hand || []} />
      </div>

      {/* ACTIONS (centered) */}
      <div className="mt-4 flex items-center justify-center gap-3">
        {my?.seat === 0 && state.phase === 'playing' && (
          <button className="bg-amber-600 px-4 py-2 rounded" onClick={() => send(ws, 'shuffle_deal', {})}>
            Shuffle & Deal
          </button>
        )}
        <button disabled={!isMyTurn} className="bg-indigo-600 px-4 py-2 rounded disabled:opacity-40" onClick={startAskFlow}>
          Ask
        </button>
        <button disabled={!isMyTurn} className="bg-emerald-600 px-4 py-2 rounded disabled:opacity-40" onClick={()=>setLayOpen(true)}>
          Laydown
        </button>
      </div>

      {/* MODALS */}
      <AskSetModal
        open={setPickerOpen}
        eligibleSets={eligibleSets.map(({ suit, type }) => ({ suit, type }))}
        onPick={onPickSet}
        onClose={() => { setSetPickerOpen(false); setTargetPlayer(null); }}
      />
      <AskRankModal
        open={rankPickerOpen}
        suit={selectedSet.suit}
        setType={selectedSet.setType}
        askableRanks={askableRanks}
        onPick={onPickRank}
        onClose={() => { setRankPickerOpen(false); setTargetPlayer(null); }}
      />
      {layOpen && <LaydownModal onClose={() => setLayOpen(false)} />}

      {/* Confirm pass only for the target */}
      {pendingAsk && pendingAsk.target_id === my.id && (
        <ConfirmPassModal
          open
          asker={players[pendingAsk.asker_id]}
          target={players[pendingAsk.target_id]}
          cards={pendingAsk.pending_cards}
          onConfirm={confirmPass}
          onClose={()=>{}}
        />
      )}

      {/* Optional tiny toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-zinc-800 px-4 py-2 rounded-xl card-shadow z-50">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ---------- Side boxes + set list ---------- */

function SideBox({ side, title, color = "blue", children }) {
  const pos = side === "left" ? "left-6" : "right-6";
  const ring = color === "blue" ? "ring-blue-500/40" : "ring-rose-500/40";
  const dot = color === "blue" ? "bg-blue-400" : "bg-rose-400";

  return (
    <div
      className={`hidden xl:block fixed ${pos} top-36 z-30`}
      style={{ width: 260, maxHeight: "60vh" }}
    >
      <div className={`bg-zinc-900/60 rounded-2xl p-3 ring-1 ${ring} card-shadow h-full overflow-auto`}>
        <div className="flex items-center gap-2 mb-2 text-sm">
          <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
          <span className="font-semibold">{title}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function SetList({ sets }) {
  if (!sets.length) {
    return <div className="text-xs opacity-60">No sets yet.</div>;
  }
  return (
    <div className="space-y-2">
      {sets.map((ts, idx) => {
        const first = ts.cards?.[0];
        return (
          <div key={`side-ts-${idx}`} className="bg-zinc-800/70 rounded-xl p-2 flex items-center gap-2">
            {first && <Card suit={first.suit} rank={first.rank} size="sm" />}
            <div className="text-xs opacity-80 capitalize">
              {ts.suit} {ts.set_type}
            </div>
          </div>
        );
      })}
    </div>
  );
}
