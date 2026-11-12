import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store';
import { send } from '../../ws';
import { 
  Seat, 
  PlayerHand, 
  DealingAnimation, 
  MessageBubbles 
} from '../';
import SpectatorView from './SpectatorView';
import TableSceneDetails, { SeatCardStack } from './TableSceneDetails';
import PassedCardsAnimation from './PassedCardsAnimation';
import LaydownAnimation from './LaydownAnimation';
import ChatBubble from './ChatBubble';
import { markReactionUsed } from './ReactionTray';
import EmojiPassAnimation from './EmojiPassAnimation';
import AskPointer, { FlowArrows } from './AskPointer';
import BotWaitPill from './BotWaitPill';
import EmojiSettings from './EmojiSettings';
import { 
  LaydownModal, 
  LaydownResultModal,
  GameOverModal, 
  NewGameVotingModal, 
  NewGameModal, 
  VotingResultModal, 
  CompletedSetsModal,
  BackToLobbyModal,
  SpectatorRequestsModal,
  AskCardModal,
  PenaltyLaydownModal,
  AnswerAskModal,
  PassTurnModal
} from '../modals';
import { 
  Toast, 
  Celebration
} from '../ui';
import Card from '../cards/Card';
import { RANKS_LOWER, RANKS_UPPER, SUITS } from '../../lib/deck';
import { loadLaydownDraft } from '../modals/LaydownModal';

// The 3D table (three.js) is a separate download, fetched only when it is switched on.
const GameTable3D = lazy(() => import('./table3d/GameTable3D.jsx'));
const SUIT_GLYPH = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const TEAM_RING = {
  A: 'ring-blue-500/70',
  B: 'ring-rose-500/70',
  unknown: 'ring-zinc-600/60',
};

function SetChip({ suit, set_type, owner }) {
  const label = set_type === 'lower' ? 'Lower' : 'Upper';
  return <div className="collected-set-tile">
    <div className="collected-set-tile__stack"><Card suit={suit} rank={set_type === 'lower' ? '2' : '8'} size="xs" /></div>
    <div className="collected-set-tile__label"><strong>{suit}</strong><span>{label} set · {set_type === 'lower' ? '2–7' : '8–A'}</span><small>Team {owner}</small></div>
  </div>;
}

export default function Table() {
  const navigate = useNavigate();
  const { state, me, ws, gameResult, abortVoting, dealingAnimation, pendingLay, votingResult, closeVotingResult, backToLobbyVoting, speakingUsers, laydownResult, clearLaydownResult } = useStore();
  const reactionAim = useStore(s => s.reactionAim);
  const [penaltyOpen, setPenaltyOpen] = useState(false);
  const throwReaction = target => {
    const aim = useStore.getState().reactionAim;
    useStore.setState({ reactionAim: null });
    if (!aim || ws?.readyState !== 1) return;
    markReactionUsed(aim.emoji);
    send(ws, 'emoji_throw', { from_player_id: me.id, to_player_id: target.id, emoji: aim.emoji, emoji_name: aim.name, category: aim.category });
  };
  useEffect(() => {
    if (!reactionAim) return;
    const esc = e => { if (e.key === 'Escape') useStore.setState({ reactionAim: null }); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [reactionAim]);
  // Reopen a laydown this player was in the middle of before they dropped out
  const [layOpen, setLayOpen] = useState(() => {
    if (state?.phase !== 'playing') return false;
    const draft = loadLaydownDraft(state?.room_id, me?.id);
    if (!draft) return false;
    const { suit, setType } = draft.pick || {};
    if (!suit) return true;
    // Only if the set is still in play and I still hold a card of it
    const ranks = setType === 'lower' ? RANKS_LOWER : RANKS_UPPER;
    const onTable = (state.table_sets || []).some(t => t.suit === suit && t.set_type === setType);
    const holdIt = (state.players?.[me?.id]?.hand || []).some(c => c.suit === suit && ranks.includes(c.rank));
    return !onTable && holdIt;
  });
  const [resultsOpen, setResultsOpen] = useState(false);
  const [layAnimActive, setLayAnimActive] = useState(false);
  const [resultsReady, setResultsReady] = useState(false);
  const pendingResult = laydownResult || gameResult;
  useEffect(() => {
    setResultsOpen(false);
    setResultsReady(false);
    if (!pendingResult) return;
    const timer = setTimeout(() => setResultsReady(true), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 150 : 1100);
    return () => clearTimeout(timer);
  }, [pendingResult]);
  // Nobody opened the laydown results within 30s: put the prompt away so play can go on.
  useEffect(() => {
    if (!laydownResult || resultsOpen) return;
    const timer = setTimeout(() => clearLaydownResult(), 30000);
    return () => clearTimeout(timer);
  }, [laydownResult, resultsOpen, clearLaydownResult]);
  useEffect(() => {
    if (state.phase === 'ready' || state.phase === 'lobby') clearLaydownResult();
  }, [state.phase, clearLaydownResult]);
  const [selectedSet, setSelectedSet] = useState({ suit: null, setType: null });
  const [requestAbortOpen, setRequestAbortOpen] = useState(false);
  const [selectedCardsToPass, setSelectedCardsToPass] = useState([]);
  const [dragTarget, setDragTarget] = useState(null);
  const [isDraggingCards, setIsDraggingCards] = useState(false);
  const [completedSetsOpen, setCompletedSetsOpen] = useState(false);
  const [emojiSettingsOpen, setEmojiSettingsOpen] = useState(false);
  const [spectatorRequestsOpen, setSpectatorRequestsOpen] = useState(false);
  const [askTarget, setAskTarget] = useState(null);

  const tableCenterRef = useRef(null);

  const seatEls = useRef({});
  const [seatVersion, setSeatVersion] = useState(0);
  const lastSeatEl = useRef({});



  const players = state.players || {};
  const seats = state.seats || {};
  const my = players[me.id];
  const isSpectator = my?.is_spectator || false;

   const mySeatIndex = typeof my?.seat === 'number' ? my.seat : 0;
   // Seats sit on an ellipse around the table. They are spaced by equal distance along that
   // ellipse (not equal angle), so neighbours are the same distance apart whatever the
   // shape of the screen. My own seat is always at the bottom.
   const arenaRef = useRef(null);
   const [arenaAspect, setArenaAspect] = useState(1);
   const [wideTable, setWideTable] = useState(false); // desktop: rounded-rectangle table
   useEffect(() => {
     const el = arenaRef.current;
     if (!el) return;
     const measure = () => {
       const r = el.getBoundingClientRect();
       if (r.width && r.height) setArenaAspect(Math.round((r.width / r.height) * 50) / 50);
       setWideTable(window.innerWidth >= 768);
     };
     measure();
     const ro = new ResizeObserver(measure);
     ro.observe(el);
     return () => ro.disconnect();
   }, []);
   useEffect(() => { setSeatVersion(v => v + 1); }, [arenaAspect, wideTable]);
   const seatPositions = useMemo(() => {
     const R = 35; // % of the arena, both ways
     const w = arenaAspect, h = 1; // relative pixel size of the arena
     const STEPS = 720, cum = [0];
     // Phones: an ellipse. Desktop: a squarer path that follows the rounded-rectangle table.
     const e = wideTable ? 2 / 3.2 : 1;
     const sq = (v) => Math.sign(v) * Math.pow(Math.abs(v), e);
     const at = (k) => { const t = Math.PI / 2 + (k / STEPS) * 2 * Math.PI; return [sq(Math.cos(t)), sq(Math.sin(t))]; };
     for (let k = 1; k <= STEPS; k++) {
       const [ax, ay] = at(k - 1), [bx, by] = at(k);
       cum.push(cum[k - 1] + Math.hypot((bx - ax) * w, (by - ay) * h));
     }
     const pos = {};
     for (let i = 0; i < 6; i++) {
       const rel = (i - mySeatIndex + 6) % 6;
       const want = (rel / 6) * cum[STEPS];
       let k = 0; while (k < STEPS && cum[k] < want) k++;
       const [cx, cy] = at(k);
       const dx = cx * w, dy = cy * h, d = Math.hypot(dx, dy) || 1; // real direction from the table centre
       const deg = Math.atan2(dy, dx) * 180 / Math.PI - 90;
       pos[i] = { left: `${50 + R * cx}%`, top: `${50 + R * cy}%`, transform: 'translate(-50%, -50%)', '--chair-angle': `${deg}deg`, '--hand-x': `${-dx / d * 80}px`, '--hand-y': `${-dy / d * 80}px`, '--hand-direction': `${deg}deg` };
     }
     return pos;
   }, [mySeatIndex, arenaAspect, wideTable]);

   // The table is 3D.
   const [use3d, setUse3d] = useState(true);   // the flat table is only a fallback for devices that can't draw 3D
   const [layout3d, setLayout3d] = useState(null);
   useEffect(() => { if (!use3d) setLayout3d(null); }, [use3d]);
   useEffect(() => { setSeatVersion(v => v + 1); }, [layout3d, use3d]);
   // In 3D the players sit where the scene says their chairs are.
   const seatPlace = useMemo(() => {
     if (!use3d || !layout3d) return seatPositions;
     const pos = {};
     for (let i = 0; i < 6; i++) {
       const s = layout3d.seats[(i - mySeatIndex + 6) % 6];
       pos[i] = { left: `${s.x}px`, top: `${s.y}px`, transform: 'translate(-50%, -50%)' };
     }
     return pos;
   }, [use3d, layout3d, seatPositions, mySeatIndex]);

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





  const handCount = (pid) => (players[pid]?.hand?.length ?? 0);

  const setSeatRef = (playerId) => (el) => {
    if (!playerId || !el) return;
    if (lastSeatEl.current[playerId] !== el) {
      lastSeatEl.current[playerId] = el;
      seatEls.current[playerId] = el;
      setSeatVersion((v) => v + 1);
    }
  };

  const tableSets = state.table_sets || [];
  const setsA = tableSets.filter(ts => ts.owner_team === 'A');
  const setsB = tableSets.filter(ts => ts.owner_team === 'B');
  const scoreA = state.team_scores?.A ?? 0;
  const scoreB = state.team_scores?.B ?? 0;

  // My cards in display order (by suit, then rank), for the 3D fan
  const handSorted = useMemo(() => {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'], ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    return [...(my?.hand || [])].sort((a, b) => suits.indexOf(a.suit) - suits.indexOf(b.suit) || ranks.indexOf(a.rank) - ranks.indexOf(b.rank));
  }, [my?.hand]);
  const handleHandCardClick = (card) => {
    setSelectedCardsToPass(prev => {
      const isSelected = prev.some(c => c.suit === card.suit && c.rank === card.rank);
      if (isSelected) {
        return prev.filter(c => !(c.suit === card.suit && c.rank === card.rank));
      } else {
        return [...prev, card];
      }
    });
  };

  const resolveDropTarget = (id) => {
    const player = players[id];
    return state.phase === 'playing' && ws?.readyState === 1 && player && player.id !== me.id &&
      player.team && player.team !== my?.team && !player.is_spectator && player.connected !== false && typeof player.seat === 'number' &&
      (player.hand?.length ?? 0) > 0 ? player : null; // a player with no cards left is out of the round
  };

  const passCards = (cards, playerId) => {
    if (!cards.length || !resolveDropTarget(playerId)) return;
    if (!cards.every(card => my?.hand?.some(c => c.suit === card.suit && c.rank === card.rank))) return;
    send(ws, 'pass_cards', { from_player_id:me.id, to_player_id:playerId, cards });
    setSelectedCardsToPass([]);
  };
  const handleSeatClick = player => passCards(selectedCardsToPass,player.id);

  // Turn Play: ask through the game instead of dragging cards across
  const isTurnPlay = state.game_mode === 'turns';
  const botWait = useStore((st) => st.botWait);
  const laydownPick = useStore((st) => st.laydownPick); // laying down: tap the teammate who holds this card
  const pendingAsk = isTurnPlay ? state.pending_ask : null;
  const pendingHandoff = isTurnPlay ? state.pending_handoff : null;
  const awaitingStart = isTurnPlay && state.phase === 'playing' && !!state.awaiting_start;
  const myTurn = isTurnPlay && state.phase === 'playing' && state.turn_player === me.id && !awaitingStart && !pendingAsk && !pendingHandoff && ws?.readyState === 1;
  const canAsk = (player) => myTurn && !!player && player.team && player.team !== my?.team &&
    !player.is_spectator && (player.hand?.length ?? 0) > 0;
  const turnPlayer = isTurnPlay && state.phase === 'playing' ? players[state.turn_player] : null;
  const sendAsk = ({ target_id, suit, set_type, ranks }) => {
    send(ws, 'ask', { asker_id: me.id, target_id, suit, set_type, ranks });
    setAskTarget(null);
  };
  useEffect(() => { if (!myTurn) setAskTarget(null); }, [myTurn]);
  // Turn Play: lay down only on your own turn
  const layLocked = isTurnPlay && !myTurn;
  // Laying down starts from the hand: select a card (or several) of one set, then tap Lay.
  const [layPick, setLayPick] = useState(null);
  const [layHint, setLayHint] = useState(null); // 'pick' | 'mixed' | 'partial'
  const [penaltyPick, setPenaltyPick] = useState(null); // Voice Play: set about to be given up as a penalty
  useEffect(() => { if (!layHint) return; const t = setTimeout(() => setLayHint(null), 5000); return () => clearTimeout(t); }, [layHint]);
  useEffect(() => { if (isTurnPlay && !myTurn) setSelectedCardsToPass([]); }, [isTurnPlay, myTurn]);
  // Lay is only live once the selected cards belong to exactly one set.
  const laySets = new Set(selectedCardsToPass.map((c) => `${c.suit}|${['2','3','4','5','6','7'].includes(c.rank) ? 'lower' : 'upper'}`));
  const layReady = !layLocked && !layOpen && laySets.size === 1 && (() => {
    // ...and every card of that set in this hand is selected
    const [suit, type] = [...laySets][0].split('|');
    const inSet = (c) => c.suit === suit && (['2','3','4','5','6','7'].includes(c.rank) ? 'lower' : 'upper') === type;
    return (my?.hand || []).filter(inSet).length === selectedCardsToPass.length;
  })();
  const startLaydown = () => {
    if (layLocked || layOpen) return;
    const sets = new Set(selectedCardsToPass.map((c) => `${c.suit}|${['2','3','4','5','6','7'].includes(c.rank) ? 'lower' : 'upper'}`));
    if (sets.size !== 1) { setLayHint(sets.size ? 'mixed' : 'pick'); return; }
    if (!layReady) { setLayHint('partial'); return; }
    const [suit, setType] = [...sets][0].split('|');
    setLayHint(null);
    setLayPick({ suit, setType });
    setSelectedCardsToPass([]);
    setLayOpen(true);
  };


  const handleTableClick = () => window.dispatchEvent(new Event('dismiss_passed_cards'));

  // Show spectator view if player is a spectator
  if (isSpectator) {
    return (
      <div className="card-room h-screen w-screen overflow-hidden flex flex-col bg-gradient-vibrant">
        <div className="flex-1 overflow-y-auto">
          <SpectatorView players={players} myId={me.id} gamePhase={state.phase} />
        </div>
        
        {/* Toast Notifications */}
        <Toast />
      </div>
    );
  }

  return (
    <div className={`card-room h-screen w-screen overflow-hidden flex flex-col bg-gradient-vibrant ${use3d ? 'room-3d' : ''}`} onClick={handleTableClick}>
      {use3d && <Suspense fallback={null}>
        <GameTable3D
          arenaRef={arenaRef}
          ids={[0,1,2,3,4,5].map((rel) => seats[(rel + mySeatIndex) % 6] || null)}
          counts={[0,1,2,3,4,5].map((rel) => { const pid = seats[(rel + mySeatIndex) % 6]; return !pid || state.phase !== 'playing' ? 0 : handCount(pid); })}
          teams={[0,1,2,3,4,5].map((rel) => players[seats[(rel + mySeatIndex) % 6]]?.team || null)}
          sets={state.table_sets || []}
          dealing={!!dealingAnimation}
          dealId={dealingAnimation?.id}
          dealOrder={dealingAnimation?.dealingSequence?.map(d => (Number(d.seat) - mySeatIndex + 6) % 6)}
          dealerRel={(() => { if (dealingAnimation?.dealerSeat != null) return (Number(dealingAnimation.dealerSeat) - mySeatIndex + 6) % 6; const seat = Object.keys(seats).find((k) => seats[k] === state.current_dealer); return seat == null ? 0 : (Number(seat) - mySeatIndex + 6) % 6; })()}
          mySeatIndex={mySeatIndex}
          hand={handSorted}
          selectedKeys={selectedCardsToPass.map((c) => `${c.suit}-${c.rank}`)}
          handTappable={!dealingAnimation && state.phase === 'playing' && ws?.readyState === 1 && !layOpen && (isTurnPlay ? myTurn : true)}
          onCardTap={handleHandCardClick}
          dragPass={!dealingAnimation && !isTurnPlay && state.phase === 'playing' && ws?.readyState === 1 && !layOpen}
          resolveDropTarget={resolveDropTarget}
          onDragStart={cards => { setSelectedCardsToPass(cards); setIsDraggingCards(true); }}
          onDragHover={setDragTarget}
          onDragEnd={() => { setIsDraggingCards(false); setDragTarget(null); }}
          onCardsDrop={passCards}
          onLayout={setLayout3d}
          onFail={() => setUse3d(false)}
        />
      </Suspense>}
      <div className="game-room-heading"><span className="club-eyebrow">SET CLUB <i className="room-live-dot" /></span><span>{state.phase === 'playing' ? 'Round in play' : state.phase === 'ready' ? 'Waiting for the deal' : 'Round complete'}</span></div>
      <Celebration tableCenterRef={tableCenterRef} />
      <DealingAnimation cardsIn3d={use3d} />
      {!use3d && <PassedCardsAnimation seatEls={seatEls} phase={state.phase} />}
      <LaydownAnimation seatEls={seatEls} tableCenterRef={tableCenterRef} cardsIn3d={use3d} onActiveChange={setLayAnimActive}
        onViewResult={() => { if (useStore.getState().laydownResult || useStore.getState().gameResult) setResultsOpen(true); }} />
      
      {/* Back to Lobby Button - Top Left */}
      <div className="game-top-control fixed top-2 left-2 md:top-3 md:left-3 z-40">
          <button 
            className={`group px-3 py-2 md:px-4 md:py-2 rounded-lg md:rounded-xl shadow-lg transition-all duration-200 transform flex items-center gap-2 border ${
              selectedCardsToPass.length > 0 
                ? 'bg-gray-500 cursor-not-allowed text-gray-300 border-gray-400/30' 
                : 'bg-gradient-primary hover:shadow-glow-blue text-white hover:scale-105 active:scale-95 border-accent-blue/30'
            }`}
            onClick={() => selectedCardsToPass.length === 0 && send(ws, 'request_back_to_lobby', { requester_id: me.id })}
            disabled={selectedCardsToPass.length > 0}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="text-sm font-medium">
              <span className="hidden sm:inline">Back to Lobby</span>
              <span className="sm:hidden">Lobby</span>
            </span>
          </button>
        </div>

      {/* New Game Button - Top Right */}
      {state.phase === 'playing' && (
        <div className="game-top-control fixed top-2 right-2 md:top-3 md:right-3 z-40">
          <button 
            className={`group px-3 py-2 md:px-4 md:py-2 rounded-lg md:rounded-xl shadow-lg transition-all duration-200 transform flex items-center gap-2 border ${
              selectedCardsToPass.length > 0 
                ? 'bg-gray-500 cursor-not-allowed text-gray-300 border-gray-400/30' 
                : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white hover:scale-105 active:scale-95 border-purple-500/30'
            }`}
            onClick={() => selectedCardsToPass.length === 0 && setRequestAbortOpen(true)}
            disabled={selectedCardsToPass.length > 0}
          >
            <svg className="w-4 h-4 transition-transform group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="text-sm font-medium">
              <span className="hidden sm:inline">New Game</span>
              <span className="sm:hidden">New</span>
            </span>
          </button>
        </div>
      )}


      {/* Emoji Settings Button - Top Right Corner */}
      <div className="game-secondary-control fixed top-14 right-2 md:top-16 md:right-3 z-40">
        <button 
          className={`group p-2 rounded-lg shadow-lg transition-all duration-200 transform border ${
            selectedCardsToPass.length > 0 
              ? 'bg-gray-500 cursor-not-allowed text-gray-300 border-gray-400/30' 
              : 'bg-dark-card/80 hover:bg-dark-tertiary/80 text-text-secondary hover:text-text-primary hover:scale-105 active:scale-95 border-accent-purple/20 hover:border-accent-purple/40 hover:shadow-glow-purple'
          }`}
          onClick={() => selectedCardsToPass.length === 0 && setEmojiSettingsOpen(true)}
          disabled={selectedCardsToPass.length > 0}
          title={selectedCardsToPass.length > 0 ? "Clear card selection first" : "Emoji Settings"}
        >
          <svg className="w-4 h-4 transition-transform group-hover:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* Spectator Requests Button - Admin Only */}
      {state.admin_player_id === me.id && Object.keys(state.spectator_requests || {}).length > 0 && (
        <div className="game-secondary-control fixed top-14 right-14 md:top-16 md:right-16 z-40">
          <button 
            className="group bg-gradient-warm hover:shadow-glow-amber text-white p-2 rounded-lg shadow-lg transition-all duration-200 transform hover:scale-105 active:scale-95 relative border border-accent-amber/30"
            onClick={() => setSpectatorRequestsOpen(true)}
            title="Spectator Requests"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            {/* Notification badge */}
            <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
              {Object.keys(state.spectator_requests || {}).length}
            </div>
          </button>
        </div>
      )}

      {/* Card Passing Indicator */}
      {selectedCardsToPass.length > 0 && !isDraggingCards && !isTurnPlay && (
        <div className="table-selection-hint">
          <div className="text-sm font-semibold">
            {selectedCardsToPass.length} card{selectedCardsToPass.length !== 1 ? 's' : ''} selected
          </div>
          <div className="text-xs opacity-80">{use3d ? "Drag up onto an opponent, or tap their seat" : "Drag onto an opponent to pass, or click their seat"}</div>
        </div>
      )}

       <AskPointer seatEls={seatEls} seatVersion={seatVersion} ask={pendingAsk} />
       <FlowArrows seatEls={seatEls} seatVersion={seatVersion} />
       <MessageBubbles seatEls={seatEls} seatVersion={seatVersion} />
       <ChatBubble selectedCardsToPass={selectedCardsToPass} />
       {reactionAim && <div className="reaction-aim" role="status">
         <span>Tap a seat to send {reactionAim.emoji}</span>
         <button type="button" onClick={() => useStore.setState({ reactionAim: null })}>Cancel</button>
       </div>}
       <EmojiPassAnimation />
       
       <div className="table-top-scores">         {/* Scoreboard */}
         <div className="game-score-strip flex items-center justify-center gap-4 text-xs sm:text-sm">
        <div className="score-pill px-2 sm:px-3 py-1 rounded-full bg-dark-card/70 backdrop-blur-sm border border-accent-blue/20 shadow-glow-blue">
          <span className="inline-flex items-center gap-1 sm:gap-2 text-accent-blue">
            <span className="inline-block h-2 w-2 rounded-full bg-accent-blue shadow-glow-blue" />
            <span className="hidden sm:inline">Team A</span>
            <span className="sm:hidden">A</span>
            <span className="text-text-secondary">—</span>
            <span className="text-text-primary font-semibold">{state.team_scores?.A ?? 0}</span>
            <span className="hidden sm:inline">pts</span>
            <span className="text-text-muted"> ({(state.table_sets||[]).filter(s=>s.owner_team==='A').length})</span>
          </span>
        </div>
        <div className="score-pill px-2 sm:px-3 py-1 rounded-full bg-dark-card/70 backdrop-blur-sm border border-accent-rose/20 shadow-glow-rose">
          <span className="inline-flex items-center gap-1 sm:gap-2 text-accent-rose">
            <span className="inline-block h-2 w-2 rounded-full bg-accent-rose shadow-glow-rose" />
            <span className="hidden sm:inline">Team B</span>
            <span className="sm:hidden">B</span>
            <span className="text-text-secondary">—</span>
            <span className="text-text-primary font-semibold">{state.team_scores?.B ?? 0}</span>
            <span className="hidden sm:inline">pts</span>
            <span className="text-text-muted"> ({(state.table_sets||[]).filter(s=>s.owner_team==='B').length})</span>
          </span>
        </div>
      </div>

         <div className="match-score-strip" aria-label="Match round wins"><span>Round {(state.completed_rounds || 0) + (state.phase === 'ended' ? 0 : 1)}</span><strong>Rounds won</strong><span>A: {state.round_wins?.A || 0}</span><span>B: {state.round_wins?.B || 0}</span>{state.tied_rounds > 0 && <span>Tied: {state.tied_rounds}</span>}</div>

       </div>
       {/* Main game area - takes up most of the viewport */}
       <div className="game-stage">
         {/* left panel (Team A) - table - right panel (Team B) */}
         <div className="game-stage__layout">
        <div className={`hidden ${use3d ? '' : 'xl:block'} w-[260px]`}>
          <div className="sticky top-4 space-y-2">
            <div className="text-sm font-semibold text-accent-blue mb-1">Team A — Collected</div>
            {setsA.length === 0 && <div className="text-xs text-text-muted">No sets yet.</div>}
            {setsA.map((ts, idx)=>(
              <SetChip key={`A-${idx}`} suit={ts.suit} set_type={ts.set_type} owner="A" expandable cards={ts.cards}/>
            ))}
          </div>
        </div>

         <div className="game-table-arena">
           <div ref={arenaRef} className={`relative w-full h-full ${use3d ? 'table-3d-on' : ''}`}>
             {!use3d && <TableSceneDetails />}
             {!use3d && <div className="table-plinth" aria-hidden="true" />}
             <div ref={tableCenterRef} data-table-center="true" className="felt-table absolute rounded-full flex items-center justify-center"
               style={use3d && layout3d ? {left:`${layout3d.center.x}px`,top:`${layout3d.center.y}px`,transform:'translate(-50%, -50%)'} : {left:'50%',top:'50%',transform:'translate(-50%, -50%)'}}>
              <div className="table-hallmark" aria-hidden="true"><span>♠</span><strong>SET CLUB</strong><small>THE TABLE IS YOURS</small></div>
              {/* Shuffle & Deal button - show for current dealer when game is ready, ended, or when no cards are dealt, but NOT when game is actively playing */}
              {!state.match_finished && me?.id === state.current_dealer && state.phase !== 'playing' && (state.phase === 'ready' || state.phase === 'ended' || !state.deck_count || state.deck_count === 0 || !my?.hand?.length) && (
                <button 
                  className="bg-gradient-warm hover:shadow-glow-amber text-white px-6 py-3 rounded-lg font-semibold shadow-lg transition-all duration-200 border border-accent-amber/30"
                  onClick={() => send(ws, 'shuffle_deal', {})}
                >
                  Shuffle & Deal
                </button>
              )}
              
              {/* Sets Button - show in center of table after game starts (mobile and small desktop) */}
              {!use3d && state.phase === 'playing' && !pendingResult && (
                <button
                  onClick={() => setCompletedSetsOpen(true)}
                  className="sets-chip px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 bg-gradient-primary hover:shadow-glow-blue text-white shadow-lg border border-accent-blue/30 xl:hidden"
                  title="View completed sets"
                >
                  Sets
                </button>
              )}
            </div>

            {pendingResult && resultsReady && !layAnimActive && <div className="laydown-results-prompt" role="status">
              <span>{laydownResult ? (laydownResult.success ? 'Set complete' : 'Declaration checked') : 'Round complete'}</span>
              <button type="button" className="club-primary" onClick={event => {event.stopPropagation();setResultsOpen(true);}}>View results</button>
            </div>}

            {Object.keys(seats).map((k) => {
              const i = Number(k);
              const pid = seats[i];
              const p = pid ? players[pid] : null;
              const selectable = laydownPick ? (!!p && laydownPick.mates.includes(p.id)) : reactionAim ? !!p : isTurnPlay ? canAsk(p) : selectedCardsToPass.length > 0 && !!p && !!resolveDropTarget(p.id);
              const ringClass = p?.team === 'A' ? TEAM_RING.A : p?.team === 'B' ? TEAM_RING.B : TEAM_RING.unknown;
              const isMe = p && p.id === me.id;
              // Out of cards: greyed, and nobody can ask them or pass to them
              const isOut = !!p && state.phase === 'playing' && !dealingAnimation && (p.hand?.length ?? 0) === 0;
              const isLaydownPlayer = p && pendingLay && p.id === pendingLay.who_id;
              const isSpeaking = p && speakingUsers && speakingUsers[p.id];
              
              return (
                <div key={`seatwrap-${i}-${pid || 'empty'}`} className="table-seat-position absolute" style={seatPlace[i]} ref={p ? setSeatRef(p.id) : undefined} data-seat={i} data-player-id={p?.id} data-team={p?.team || 'none'}>
                  <div className={[
                      'seat-frame relative',
                      isSpeaking ? 'seat-frame--speaking' : '', // talking lights the chair, not the player circle
                      selectable ? 'ring-2 ring-yellow-300/80' : '',
                      ringClass,
                      isMe ? 'ring-4 ring-cyan-400 shadow-[0_0_0_6px_rgba(34,211,238,0.25)]' : 'ring-2',
                      isLaydownPlayer ? 'ring-4 ring-amber-400 shadow-[0_0_0_8px_rgba(251,191,36,0.4)] animate-pulse' : '',
                    ].join(' ')}
                  >
                    <Seat
                      seatIndex={i}
                      player={p}
                      highlight={isLaydownPlayer}
                      selectable={selectable}
                      dropTarget={dragTarget === p?.id}
                      draggingCards={isDraggingCards}
                      onSelect={p ? () => (laydownPick ? window.dispatchEvent(new CustomEvent('laydown_seat_pick', { detail: { pid: p.id } })) : reactionAim ? throwReaction(p) : isTurnPlay ? setAskTarget(p) : handleSeatClick(p)) : null}
                      isTurn={!!turnPlayer && p?.id === turnPlayer.id}
                      askMode={isTurnPlay}
                      reactEmoji={reactionAim?.emoji}
                      pickLabel={laydownPick ? `Has the ${laydownPick.rank}${SUIT_GLYPH[laydownPick.suit] || ''}` : null}
                      team={p?.team}
                      isMe={isMe}
                      isLaydownPlayer={isLaydownPlayer}
                      isSpeaking={!!isSpeaking}
                      isDealer={p?.id === state.current_dealer}
                      isOut={isOut}
                    />
                  </div>
                  {p && p.id !== my?.id && !dealingAnimation && !use3d && <SeatCardStack count={handCount(pid)} />}
                  {p && p.id !== my?.id && !dealingAnimation && (
                    <div className="seat-count" aria-label={`${handCount(pid)} cards`} title={`${handCount(pid)} cards`}>{handCount(pid)}</div>
                  )}
                </div>
              );
            })}



          </div>

        </div>

        <div className={`hidden ${use3d ? '' : 'xl:block'} w-[260px]`}>
          <div className="sticky top-4 space-y-2">
            <div className="text-sm font-semibold text-accent-rose mb-1">Team B — Collected</div>
            {((state.table_sets||[]).filter(s=>s.owner_team==='B').length) === 0 && <div className="text-xs text-text-muted">No sets yet.</div>}
            {(state.table_sets||[]).filter(s=>s.owner_team==='B').map((ts, idx)=>(
              <SetChip key={`B-${idx}`} suit={ts.suit} set_type={ts.set_type} owner="B" expandable cards={ts.cards}/>
            ))}
          </div>
        </div>
         </div>
       </div>

       {/* Bottom section - Scoreboard, Player Hand, and Controls */}
       <div className="game-hand-dock">
         {/* While a bot is holding its move, the countdown + Continue takes the turn banner's place */}
         {awaitingStart && !dealingAnimation && (
           <div className="bot-wait start-play" role="status">
             <span className="bot-wait__text">Look at your cards{my?.team && !my?.is_spectator ? ', then start' : ' — waiting for a player to start'}</span>
             {my?.team && !my?.is_spectator && <button type="button" onClick={() => send(ws, 'begin_play', {})}>Start game</button>}
           </div>
         )}
         {turnPlayer && !awaitingStart && botWait && <BotWaitPill canContinue={!!my?.team && !my?.is_spectator} />}
         {turnPlayer && !awaitingStart && !botWait && (
        <div className={`turn-banner ${turnPlayer.id === me.id && !pendingAsk ? 'turn-banner--mine' : ''}`} role="status" aria-live="polite">
          {pendingHandoff
            ? <span>{pendingHandoff.who_id === me.id ? 'Choose a teammate to play next' : `${players[pendingHandoff.who_id]?.name || 'Declarer'} is choosing who plays next…`}</span>
            : pendingAsk
            ? <span>{pendingAsk.asker_id === me.id ? 'Waiting for' : `${players[pendingAsk.asker_id]?.name || 'Someone'} asked`} {pendingAsk.target_id === me.id ? 'you' : players[pendingAsk.target_id]?.name}…</span>
            : turnPlayer.id === me.id
              ? <span>{laydownPick ? `Tap the teammate who has the ${laydownPick.rank}${SUIT_GLYPH[laydownPick.suit] || ''}` : 'Your turn — tap an opponent to ask for a card'}</span>
              : <span>{turnPlayer.name}'s turn</span>}
        </div>
      )}

         {/* Player Hand */}
         <div className="game-hand-wrap flex flex-col items-center">
           <PlayerHand 
             cards={my?.hand || []} 
             selectedCards={selectedCardsToPass}
             onCardSelect={handleHandCardClick}
             selectable={!isTurnPlay && state.phase === 'playing' && ws?.readyState === 1}
             tapSelect={isTurnPlay && myTurn && !layOpen}
             hint3d={use3d}
             resolveDropTarget={resolveDropTarget}
             onDragStart={cards => { setSelectedCardsToPass(cards); setIsDraggingCards(true); }}
             onDragHover={setDragTarget}
             onDragEnd={() => { setIsDraggingCards(false); setDragTarget(null); }}
             onCardsDrop={passCards}
           />
           
           {/* Keep the selection action outside layout so the table never shrinks. */}
             <div className="hand-selection-actions" style={{visibility:selectedCardsToPass.length ? 'visible' : 'hidden'}} aria-hidden={!selectedCardsToPass.length}>
               <button 
                 className="bg-gradient-secondary hover:shadow-glow-rose text-white px-3 py-1 rounded text-sm font-medium transition-all duration-200 border border-accent-rose/30"
                 tabIndex={selectedCardsToPass.length ? 0 : -1}
                 onClick={() => setSelectedCardsToPass([])}
               >
                 Clear Selection ({selectedCardsToPass.length})
               </button>
               {/* Voice Play: own up to a wrong ask. Like Lay, it needs every card of the set in this hand selected. */}
               {!isTurnPlay && state.phase === 'playing' && my?.team && !my?.is_spectator && layReady && (
                 <button type="button" className="penalty-chip" tabIndex={selectedCardsToPass.length ? 0 : -1}
                   onClick={() => { const [suit, setType] = [...laySets][0].split('|'); setPenaltyPick({ suit, setType }); }}>
                   Penalty
                 </button>
               )}
             </div>
         </div>

         {/* Game Controls */}
         <div className="game-hand-status flex items-center justify-center gap-3">
         {/* Show current phase and dealer info */}
         <div className="text-xs text-text-muted">
           {state.phase === 'playing' ? 'Round in play' : state.phase === 'ready' ? 'Ready for the deal' : 'Round complete'}
           {state.phase === 'ready' && state.current_dealer && (
             <span className="ml-2 text-blue-400">
               • Dealer: {(() => {
                 const dealerSeat = Object.entries(state.seats).find(([_, playerId]) => playerId === state.current_dealer)?.[0];
                 return dealerSeat ? `Seat ${parseInt(dealerSeat) + 1}` : 'Unknown';
               })()}
             </span>
           )}
         </div>
         </div>
       </div>

      {penaltyPick && !isTurnPlay && state.phase === 'playing' && (
        <div className="laydown-tablepick laydown-tablepick--penalty" role="dialog" aria-label="Confirm penalty laydown">
          <div className="laydown-tablepick__head laydown-tablepick__head--plain">
            <strong>Penalty: give up <span className="capitalize">{penaltyPick.suit}</span> {penaltyPick.setType}?</strong>
            <span>The whole set goes to the other team. This can't be undone.</span>
          </div>
          <div className="laydown-tablepick__foot">
            <button type="button" className="club-secondary laydown-tablepick__no" onClick={() => setPenaltyPick(null)}>Cancel</button>
            <button type="button" className="club-primary is-risky" onClick={() => {
              send(ws, 'penalty_laydown', { suit: penaltyPick.suit, set_type: penaltyPick.setType });
              setPenaltyPick(null); setSelectedCardsToPass([]);
            }}>Yes, penalty laydown</button>
          </div>
        </div>
      )}
      {layOpen && <LaydownModal initialPick={layPick} onClose={() => { setLayOpen(false); setLayPick(null); }} onPenalty={!isTurnPlay && my?.team ? () => setPenaltyOpen(true) : null} />}

      {/* Turn Play: ask an opponent, or answer an ask */}
      <AskCardModal open={!!askTarget && myTurn} target={askTarget} tableSets={state.table_sets || []} onAsk={sendAsk} onClose={() => setAskTarget(null)} />
      <AnswerAskModal
        ask={pendingAsk && pendingAsk.target_id === me.id ? pendingAsk : null}
        asker={pendingAsk ? players[pendingAsk.asker_id] : null}
        onAnswer={() => send(ws, 'answer_ask', {})}
      />
      <PassTurnModal
        options={pendingHandoff && pendingHandoff.who_id === me.id && state.phase === 'playing' ? pendingHandoff.options : []}
        players={players}
        onPick={(toId) => send(ws, 'handoff_after_laydown', { who_id: me.id, to_id: toId })}
      />

      {/* Laydown Result Modal */}
      <LaydownResultModal
        open={!!laydownResult && resultsOpen}
        onClose={() => { setResultsOpen(false); clearLaydownResult(); }}
        laydownData={laydownResult}
        state={state}
      />

      {/* Game Over Modal */}
      <GameOverModal
        open={!!gameResult && !laydownResult && resultsOpen}
        onClose={() => setResultsOpen(false)}
        gameResult={gameResult}
      />

      {/* New Game Modal */}
      <NewGameModal
        open={requestAbortOpen}
        onClose={() => setRequestAbortOpen(false)}
      />

      {/* New Game Voting Modal */}
      <NewGameVotingModal
        open={!!abortVoting}
        onClose={() => {}}
        votingData={abortVoting}
        gameState={state}
      />

      {/* Completed Sets Modal - Mobile only */}
      <CompletedSetsModal
        open={completedSetsOpen}
        onClose={() => setCompletedSetsOpen(false)}
        tableSets={state.table_sets || []}
      />

      {/* Voting Result Modal */}
      <VotingResultModal
        open={!!votingResult}
        onClose={closeVotingResult}
        result={votingResult}
      />

      {/* Back to Lobby Modal */}
      <BackToLobbyModal
        open={!!backToLobbyVoting}
        onClose={() => {}}
        votingData={backToLobbyVoting}
      />


       {/* Laydown Button - Fixed in bottom right corner */}
       {(state.phase === 'playing' || state.phase === 'ready') && (<>
         {layHint && !layOpen && <div className="lay-hint" role="status">
           <span>{layHint === 'mixed' ? 'Select cards from one set only, then tap Lay.' : layHint === 'partial' ? 'Select all of your cards of that set, then tap Lay.' : 'Select all of your cards of one set, then tap Lay.'}</span>
         </div>}
         <div className="game-laydown-action">
           <button
             onClick={startLaydown}
             className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 shadow-lg border ${
               !layReady
                 ? 'bg-gray-500 cursor-not-allowed text-gray-300 border-gray-400/30'
                 : 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white border-amber-500/30'
             }`}
             disabled={layLocked}
             aria-disabled={!layReady}
             title={layLocked ? "You can lay down on your turn" : layReady ? "Lay down this set" : "Select all of your cards of one set first"}
           >
             <span className="hidden sm:inline">Laydown</span>
             <span className="sm:hidden">Lay</span>
           </button>
         </div>
       </>)}


      <PenaltyLaydownModal open={penaltyOpen && !isTurnPlay && state.phase === 'playing'} tableSets={tableSets} myTeam={my?.team}
        onClose={() => setPenaltyOpen(false)}
        onConfirm={({ suit, set_type }) => { send(ws, 'penalty_laydown', { suit, set_type }); setPenaltyOpen(false); }} />

      {/* Emoji Settings */}
      <EmojiSettings 
        isOpen={emojiSettingsOpen}
        onClose={() => setEmojiSettingsOpen(false)}
      />

      {/* Spectator Requests Modal */}
      <SpectatorRequestsModal
        open={spectatorRequestsOpen}
        onClose={() => setSpectatorRequestsOpen(false)}
      />

      {/* Toast Notifications */}
      <Toast />
    </div>
  );
}
