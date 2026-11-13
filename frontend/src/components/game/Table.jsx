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
  AnswerAskModal,
  PassTurnModal
} from '../modals';
import { 
  Toast, 
  Celebration
} from '../ui';
import Card from '../cards/Card';
import { RANKS_LOWER, RANKS_UPPER, SUITS } from '../../lib/deck';
import { loadLaydownDraft, clearLaydownDraft } from '../modals/LaydownModal';

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

const RESULTS_PROMPT_SECONDS = 10;

export default function Table() {
  const navigate = useNavigate();
  const { state, me, ws, gameResult, abortVoting, dealingAnimation, pendingLay, votingResult, closeVotingResult, backToLobbyVoting, speakingUsers, laydownResult, clearLaydownResult } = useStore();
  const reactionAim = useStore(s => s.reactionAim);
  const throwReaction = target => {
    const aim = useStore.getState().reactionAim;
    useStore.setState({ reactionAim: null });
    if (!aim || ws?.readyState !== 1) return;
    markReactionUsed(aim.emoji);
    send(ws, 'emoji_throw', { from_player_id: me.id, to_player_id: target.id, emoji: aim.emoji, emoji_name: aim.name, category: aim.category });
  };
  // Keep in-game dialogs (ask, answer, laydown, penalty) clear of the hand: publish how much of the
  // screen bottom the hand takes as --hand-cover; the dialogs stop above it.
  useEffect(() => {
    const root = document.documentElement;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // the cards themselves: in the 3D room and on tablets they fan up past the hand's own box
        // 3D room: the scene draws the hand and marks its top (below); the flat hand's empty box doesn't count.
        const in3d = [...document.querySelectorAll('canvas[data-hand-top]')].some((c) => c.dataset.handTop);
        const els = document.querySelectorAll(in3d ? '.game-hand-wrap .hand-selection-actions' : '.game-hand-wrap, .game-hand-wrap .playing-card, .game-hand-wrap .hand-selection-actions');
        let top = window.innerHeight;
        els.forEach((e) => { const b = e.getBoundingClientRect(); if (b.width && b.height && getComputedStyle(e).visibility !== 'hidden') top = Math.min(top, b.top); });
        // 3D room: the hand is drawn by the scene, which marks its top edge on its layer
        document.querySelectorAll('canvas[data-hand-top]').forEach((c) => {
          const y = parseFloat(c.dataset.handTop);
          if (Number.isFinite(y) && c.getBoundingClientRect().height) top = Math.min(top, c.getBoundingClientRect().top + y);
        });
        // never squeeze the dialogs below a usable height: on a very short screen they cover the hand instead
        const cover = `${Math.round(Math.max(0, Math.min(window.innerHeight - top, window.innerHeight - (window.innerWidth < 600 ? 400 : 280))))}px`;
        if (root.style.getPropertyValue('--hand-cover') !== cover) root.style.setProperty('--hand-cover', cover);
      });
    };
    update();
    const observer = new ResizeObserver(update);
    const el = document.querySelector('.game-hand-wrap');
    if (el) observer.observe(el);
    window.addEventListener('resize', update);
    const poll = setInterval(update, 500);   // the hand re-fans as cards come and go
    return () => { observer.disconnect(); clearInterval(poll); window.removeEventListener('resize', update); cancelAnimationFrame(raf); root.style.removeProperty('--hand-cover'); };
  }, [state?.phase]);

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
    if (!suit || !setType) return false;   // only laydowns that had a set picked come back
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
  // Nobody opened the laydown results within 10s of the prompt showing: put it away so play can go on.
  // The prompt counts down like the bot-wait pill (a draining bar and the seconds left).
  const resultsPromptShown = !!pendingResult && resultsReady && !layAnimActive;
  const [promptLeft, setPromptLeft] = useState(RESULTS_PROMPT_SECONDS);
  const [promptRun, setPromptRun] = useState(0);   // restarts the draining bar each time the countdown starts
  useEffect(() => {
    if (!laydownResult || resultsOpen || !resultsPromptShown) return;
    const until = Date.now() + RESULTS_PROMPT_SECONDS * 1000;
    setPromptRun(n => n + 1);
    const tick = () => setPromptLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    const timer = setTimeout(() => clearLaydownResult(), RESULTS_PROMPT_SECONDS * 1000);
    return () => { clearInterval(id); clearTimeout(timer); };
  }, [laydownResult, resultsOpen, resultsPromptShown, clearLaydownResult]);
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
  // In-progress choices (who I'm asking, a penalty I'm about to confirm) are kept on this device so a
  // player who drops out comes back to the same prompt.
  const progressKey = `in_progress:${state?.room_id}:${me?.id}`;
  const savedProgress = useMemo(() => {
    try { const v = JSON.parse(localStorage.getItem(progressKey) || 'null'); return v && Date.now() - v.savedAt < 15 * 60 * 1000 ? v : null; } catch { return null; }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Only one prompt comes back: if a laydown was also saved, the one started last wins.
  const [askTarget, setAskTarget] = useState(() => {
    if (!(state?.phase === 'playing' && state.turn_player === me?.id && savedProgress?.askTargetId)) return null;
    const draft = layOpen ? loadLaydownDraft(state?.room_id, me?.id) : null;
    if (draft && (draft.savedAt || 0) > (savedProgress.savedAt || 0)) return null;
    return state.players?.[savedProgress.askTargetId] || null;
  });
  // A new game, round or deal (or back to the lobby) starts clean: nothing from before stays open.
  const resetPrompts = () => {
    setLayOpen(false); setLayPick(null); setLayRestore(false);
    setAskTarget(null); setPenaltyPick(null); setSelectedCardsToPass([]);
    clearLaydownDraft(state?.room_id, me?.id);
    try { localStorage.removeItem(progressKey); } catch {}
    useStore.setState({ laydownPick: null });
  };
  useEffect(() => {
    window.addEventListener('game_reset', resetPrompts);
    return () => window.removeEventListener('game_reset', resetPrompts);
  });
  useEffect(() => { if (state?.phase && state.phase !== 'playing') resetPrompts(); }, [state?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Asking and laying down are separate prompts: opening one closes the other (and drops its saved draft).
  useEffect(() => {
    if (!askTarget) return;
    if (layOpen) { setLayOpen(false); setLayPick(null); setLayRestore(false); }
    clearLaydownDraft(state?.room_id, me?.id);
  }, [askTarget]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // A seated player dropped out mid-round: the game pauses (the server refuses moves too) so they
  // miss nothing. Everyone can still look at their cards and talk.
  const pausedFor = state.phase === 'playing' ? Object.values(players).filter((p) => p.team && p.seat != null && !p.is_spectator &&
    !String(p.id).startsWith('ai_') && p.connected === false) : [];
  const paused = pausedFor.length > 0;
  useEffect(() => { if (paused) setSelectedCardsToPass([]); }, [paused]);
  const botWait = useStore((st) => st.botWait);
  const laydownPick = useStore((st) => st.laydownPick); // laying down: tap the teammate who holds this card
  const pendingAsk = isTurnPlay ? state.pending_ask : null;
  const pendingHandoff = isTurnPlay ? state.pending_handoff : null;
  const awaitingStart = isTurnPlay && state.phase === 'playing' && !!state.awaiting_start;
  const myTurn = isTurnPlay && state.phase === 'playing' && state.turn_player === me.id && !awaitingStart && !pendingAsk && !pendingHandoff && ws?.readyState === 1 && !paused;
  const canAsk = (player) => myTurn && !!player && player.team && player.team !== my?.team &&
    !player.is_spectator && (player.hand?.length ?? 0) > 0;
  const turnPlayer = isTurnPlay && state.phase === 'playing' ? players[state.turn_player] : null;
  const sendAsk = ({ target_id, suit, set_type, ranks }) => {
    send(ws, 'ask', { asker_id: me.id, target_id, suit, set_type, ranks });
    setAskTarget(null);
  };
  // close the ask only when the turn has really moved on (not for a pause or a reconnect)
  useEffect(() => { if (state.phase !== 'playing' || state.turn_player !== me.id || pendingAsk || pendingHandoff) setAskTarget(null); }, [state.phase, state.turn_player, me.id, pendingAsk, pendingHandoff]);
  // Turn Play: lay down only on your own turn
  const layLocked = paused || (isTurnPlay && !myTurn);
  // Laying down starts from the hand: select a card (or several) of one set, then tap Lay.
  // A laydown restored after reconnecting picks up its set (and step) from the saved draft.
  const [layPick, setLayPick] = useState(() => layOpen ? loadLaydownDraft(state?.room_id, me?.id)?.pick ?? null : null);
  const [layRestore, setLayRestore] = useState(layOpen);
  const [layHint, setLayHint] = useState(null); // 'pick' | 'mixed' | 'partial'
  const [penaltyPick, setPenaltyPick] = useState(() => {   // Voice Play: set about to be given up as a penalty
    const pp = savedProgress?.penalty;
    if (!pp || state?.phase !== 'playing' || isTurnPlay) return null;
    const ranks = pp.setType === 'lower' ? RANKS_LOWER : RANKS_UPPER;
    const onTable = (state.table_sets || []).some((t) => t.suit === pp.suit && t.set_type === pp.setType);
    const holdIt = (my?.hand || []).some((c) => c.suit === pp.suit && ranks.includes(c.rank));
    return !onTable && holdIt ? pp : null;
  });
  useEffect(() => {
    try {
      if (!askTarget && !penaltyPick) localStorage.removeItem(progressKey);
      else localStorage.setItem(progressKey, JSON.stringify({ askTargetId: askTarget?.id || null, penalty: penaltyPick, savedAt: Date.now() }));
    } catch {}
  }, [askTarget, penaltyPick, progressKey]);
  useEffect(() => { if (!layHint) return; const t = setTimeout(() => setLayHint(null), 5000); return () => clearTimeout(t); }, [layHint]);
  useEffect(() => { if (isTurnPlay && !myTurn) setSelectedCardsToPass([]); }, [isTurnPlay, myTurn]);
  // Lay is only live once the selected cards belong to exactly one set.
  const laySets = new Set(selectedCardsToPass.map((c) => `${c.suit}|${['2','3','4','5','6','7'].includes(c.rank) ? 'lower' : 'upper'}`));
  const layReady = !layLocked && !layOpen && laySets.size === 1;   // one card of a set is enough to start
  const startLaydown = () => {
    if (layLocked || layOpen) return;
    const sets = new Set(selectedCardsToPass.map((c) => `${c.suit}|${['2','3','4','5','6','7'].includes(c.rank) ? 'lower' : 'upper'}`));
    if (sets.size !== 1) { setLayHint(sets.size ? 'mixed' : 'pick'); return; }
    const [suit, setType] = [...sets][0].split('|');
    setLayHint(null);
    setLayPick({ suit, setType });
    setSelectedCardsToPass([]);
    setAskTarget(null);
    setLayOpen(true);
  };


  // While laying down, the hand shows every card of that set raised as selected (display only).
  const layShown = layOpen && layPick ? (my?.hand || []).filter((c) => c.suit === layPick.suit &&
    (['2','3','4','5','6','7'].includes(c.rank) ? 'lower' : 'upper') === layPick.setType) : null;
  const shownSelection = layShown || selectedCardsToPass;

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
          speakingIds={Object.keys(speakingUsers || {}).filter((id) => speakingUsers[id])}
          dealing={!!dealingAnimation}
          turnId={turnPlayer && !awaitingStart ? turnPlayer.id : null}
          dealId={dealingAnimation?.id}
          dealOrder={dealingAnimation?.dealingSequence?.map(d => (Number(d.seat) - mySeatIndex + 6) % 6)}
          dealerRel={(() => { if (dealingAnimation?.dealerSeat != null) return (Number(dealingAnimation.dealerSeat) - mySeatIndex + 6) % 6; const seat = Object.keys(seats).find((k) => seats[k] === state.current_dealer); return seat == null ? 0 : (Number(seat) - mySeatIndex + 6) % 6; })()}
          mySeatIndex={mySeatIndex}
          ask={pendingAsk}
          hand={handSorted}
          selectedKeys={shownSelection.map((c) => `${c.suit}-${c.rank}`)}
          handTappable={!dealingAnimation && !paused && state.phase === 'playing' && ws?.readyState === 1 && !layOpen && (isTurnPlay ? myTurn : true)}
          onCardTap={handleHandCardClick}
          dragPass={!dealingAnimation && !paused && !isTurnPlay && state.phase === 'playing' && ws?.readyState === 1 && !layOpen}
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
      {!use3d && <Celebration tableCenterRef={tableCenterRef} />}
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
        <div data-score-team="A" className="score-pill px-2 sm:px-3 py-1 rounded-full bg-dark-card/70 backdrop-blur-sm border border-accent-blue/20 shadow-glow-blue">
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
        <div data-score-team="B" className="score-pill px-2 sm:px-3 py-1 rounded-full bg-dark-card/70 backdrop-blur-sm border border-accent-rose/20 shadow-glow-rose">
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
           <div ref={arenaRef} className={`relative w-full h-full ${use3d ? 'table-3d-on' : ''} ${use3d && !layout3d ? 'table-3d-waiting' : ''}`}>
             {!use3d && <TableSceneDetails />}
             {!use3d && <div className="table-plinth" aria-hidden="true" />}
             <div ref={tableCenterRef} data-table-center="true" className="felt-table absolute rounded-full flex items-center justify-center"
               style={use3d && layout3d ? {left:`${layout3d.center.x}px`,top:`${layout3d.center.y}px`,transform:'translate(-50%, -50%)'} : {left:'50%',top:'50%',transform:'translate(-50%, -50%)'}}>
              <div className="table-hallmark" aria-hidden="true"><span>♠</span><strong>SET CLUB</strong><small>THE TABLE IS YOURS</small></div>
              {/* Shuffle & Deal button - show for current dealer when game is ready, ended, or when no cards are dealt, but NOT when game is actively playing */}
              {!state.match_finished && me?.id === state.current_dealer && state.phase !== 'playing' && state.phase !== 'ended' && !gameResult && (state.phase === 'ready' || !state.deck_count || state.deck_count === 0 || !my?.hand?.length) && (
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

            {resultsPromptShown && <div className={`laydown-results-prompt ${laydownResult ? 'laydown-results-prompt--timed' : ''}`} role="status">
              {laydownResult && !resultsOpen && <span key={promptRun} className="bot-wait__bar laydown-results-prompt__bar" style={{ animationDuration: `${RESULTS_PROMPT_SECONDS}s` }} aria-hidden="true" />}
              <span>{laydownResult ? (laydownResult.success ? 'Set complete' : 'Declaration checked') : 'Round complete'}</span>
              <button type="button" className="club-primary" onClick={event => {event.stopPropagation();setResultsOpen(true);}}>View results</button>
              {laydownResult && !resultsOpen && <small className="laydown-results-prompt__left">Closes in {promptLeft}s</small>}
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
              const isSpeaking = !use3d && p && speakingUsers && speakingUsers[p.id];   // the 3D table shows talking on the figure
              
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
             selectedCards={shownSelection}
             onCardSelect={handleHandCardClick}
             selectable={!paused && !isTurnPlay && state.phase === 'playing' && ws?.readyState === 1}
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
                   onClick={() => { const [suit, setType] = [...laySets][0].split('|'); setPenaltyPick({ suit, setType }); send(ws, 'bubble_message', { player_id: me.id, variant: 'penalty_set', suit, set_type: setType }); }}>
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
            <button type="button" className="club-secondary laydown-tablepick__no" onClick={() => { setPenaltyPick(null); send(ws, 'clear_bubble_messages', { player_id: me.id }); }}>Cancel</button>
            <button type="button" className="club-primary is-risky" onClick={() => {
              send(ws, 'penalty_laydown', { suit: penaltyPick.suit, set_type: penaltyPick.setType });
              send(ws, 'clear_bubble_messages', { player_id: me.id });
              setPenaltyPick(null); setSelectedCardsToPass([]);
            }} disabled={paused}>Yes, penalty laydown</button>
          </div>
        </div>
      )}
      {layOpen && layPick && <LaydownModal initialPick={layPick} restore={layRestore} onClose={() => { setLayOpen(false); setLayPick(null); setLayRestore(false); }} />}

      {paused && (
        <div className="game-paused" role="status" aria-live="polite">
          <strong>Game paused</strong>
          <span>Waiting for {pausedFor.map((p) => p.name || 'a player').join(', ')} to reconnect. You can look at your cards and talk.</span>
        </div>
      )}

      {/* Turn Play: ask an opponent, or answer an ask */}
      <AskCardModal open={!!askTarget && myTurn} target={askTarget} tableSets={state.table_sets || []} onAsk={sendAsk} onClose={() => setAskTarget(null)} />
      <AnswerAskModal
        ask={pendingAsk && pendingAsk.target_id === me.id && !paused ? pendingAsk : null}
        asker={pendingAsk ? players[pendingAsk.asker_id] : null}
        onAnswer={() => send(ws, 'answer_ask', {})}
      />
      <PassTurnModal
        options={pendingHandoff && pendingHandoff.who_id === me.id && state.phase === 'playing' && !paused ? pendingHandoff.options : []}
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
           <span>{layHint === 'mixed' ? 'Select cards from one set only, then tap Lay.' : layHint === 'partial' ? 'Select all of your cards of that set, then tap Lay.' : 'Select a card of the set you want to lay down, then tap Lay.'}</span>
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
