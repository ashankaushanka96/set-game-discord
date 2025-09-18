import { useEffect, useMemo, useRef, useState } from 'react';
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
import ChatBubble from './ChatBubble';
import EmojiPassAnimation from './EmojiPassAnimation';
import EmojiSettings from './EmojiSettings';
import { 
  LaydownModal, 
  GameOverModal, 
  NewGameVotingModal, 
  NewGameModal, 
  VotingResultModal, 
  CompletedSetsModal,
  BackToLobbyModal,
  SpectatorRequestsModal
} from '../modals';
import { 
  Toast, 
  Celebration, 
  MessageBox
} from '../ui';
import { 
  Card, 
  FannedCards 
} from '../cards';
import { RANKS_LOWER, RANKS_UPPER, SUITS } from '../../lib/deck';

const TEAM_RING = {
  A: 'ring-blue-500/70',
  B: 'ring-rose-500/70',
  unknown: 'ring-zinc-600/60',
};

function SetChip({ suit, set_type, owner, expandable=false, cards=[] }) {
  const label = set_type === 'lower' ? 'Lower' : 'Upper';
  
  // Create the full set of cards for this suit and type
  const fullSet = set_type === 'lower' 
    ? RANKS_LOWER.map(rank => ({ suit, rank }))
    : RANKS_UPPER.map(rank => ({ suit, rank }));
  
  return (
    <div className="bg-dark-card/70 backdrop-blur-sm rounded-xl p-3 flex items-center gap-2 text-sm border border-accent-purple/20 shadow-glow-purple/20">
      <div className="shrink-0">
        <FannedCards 
          cards={fullSet} 
          size="xs" 
          maxCards={7}
        />
      </div>
      <div className="capitalize text-text-primary">
        {suit} <span className="text-text-secondary">{label}</span>
        <span className="ml-2 text-[11px] text-text-muted">— Team {owner}</span>
      </div>
    </div>
  );
}

export default function Table() {
  const navigate = useNavigate();
  const { state, me, ws, handoffFor, gameResult, abortVoting, dealingAnimation, pendingLay, votingResult, closeVotingResult, backToLobbyVoting, speakingUsers } = useStore();
  const [layOpen, setLayOpen] = useState(false);
  const [selectedSet, setSelectedSet] = useState({ suit: null, setType: null });
  const [requestAbortOpen, setRequestAbortOpen] = useState(false);
  const [selectedCardsToPass, setSelectedCardsToPass] = useState([]);
  const [completedSetsOpen, setCompletedSetsOpen] = useState(false);
  const [emojiSettingsOpen, setEmojiSettingsOpen] = useState(false);
  const [spectatorRequestsOpen, setSpectatorRequestsOpen] = useState(false);

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
  const isSpectator = my?.is_spectator || false;

   const mySeatIndex = typeof my?.seat === 'number' ? my.seat : 0;
   const seatPositions = useMemo(() => {
     // Use percentage-based positioning for responsive design
     const pos = {};
     // Use a larger radius to avoid collision with table
         const radiusPercent = 35; // Closer to table edge like sitting at the table
     for (let i = 0; i < 6; i++) {
       const angle = (90 + (i - mySeatIndex) * 60) * (Math.PI / 180);
       const x = 50 + radiusPercent * Math.cos(angle);
       const y = 50 + radiusPercent * Math.sin(angle);
       pos[i] = { left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' };
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





  // PASS anim
  useEffect(() => {
    function onAnim(e) {
      const { asker_id, target_id, card, from_player, to_player, cards } = e.detail || {};
      
      // Clear any existing animation first to prevent conflicts
      setAnim(null);
      
      // Handle new card passing (multiple cards) - animate fanned deck flying
      if (from_player && to_player && cards) {
        
        const fromEl = seatEls.current[from_player];
        const toEl = seatEls.current[to_player];
        if (!fromEl || !toEl) {
          console.warn('Card pass animation failed: missing DOM elements', { 
            from_player, 
            to_player, 
            fromEl: !!fromEl, 
            toEl: !!toEl,
            availableSeatEls: Object.keys(seatEls.current),
            availablePlayers: Object.keys(players)
          });
          return;
        }
        
        // Add small delay to ensure DOM elements are properly positioned
        setTimeout(() => {
          const from = fromEl.getBoundingClientRect();
          const to = toEl.getBoundingClientRect();
          
          
          // Create flying fanned deck animation
          const animationData = {
            cards: cards,
            from: { x: from.left + from.width/2, y: from.top + from.height/2 },
            to: { x: to.left + to.width/2, y: to.top + to.height/2 },
            go: false,
            type: 'fanned_deck'
          };
          
          setAnim(animationData);
          
          // Start animation after a brief delay
          setTimeout(() => {
            setAnim(a => a ? { ...a, go: true } : a);
          }, 100);
        }, 50);
        
        // After animation completes, keep deck on target player for 15 seconds
        setTimeout(() => {
          // Keep the animation in place but mark it as landed
          setAnim(prev => prev ? { ...prev, landed: true } : null);
          
          // Remove deck after 15 seconds
          setTimeout(() => {
            setAnim(null);
          }, 15000);
        }, 1050); // Increased to account for the 50ms + 100ms delays
        
        return;
      }
      
      // Handle single card passing (if only one card is passed)
      if (from_player && to_player && cards && cards.length === 1) {
        const fromEl = seatEls.current[from_player];
        const toEl = seatEls.current[to_player];
        if (!fromEl || !toEl) {
          console.warn('Single card pass animation failed: missing DOM elements', { from_player, to_player, fromEl: !!fromEl, toEl: !!toEl });
          return;
        }
        
        const from = fromEl.getBoundingClientRect();
        const to = toEl.getBoundingClientRect();
        
        // Create flying single card animation
        setAnim({
          suit: cards[0].suit, 
          rank: cards[0].rank,
          from: { x: from.left + from.width/2, y: from.top + from.height/2 },
          to: { x: to.left + to.width/2, y: to.top + to.height/2 },
          go: false,
          type: 'single_card'
        });
        
        // Start animation
        requestAnimationFrame(() => requestAnimationFrame(() => setAnim(a=>a?{...a,go:true}:a)));
        
        // After animation completes, keep card on target player for 15 seconds
        setTimeout(() => {
          // Keep the animation in place but mark it as landed
          setAnim(prev => prev ? { ...prev, landed: true } : null);
          
          // Remove card after 15 seconds
          setTimeout(() => {
            setAnim(null);
          }, 15000);
        }, 900);
        
        return;
      }
    }
    window.addEventListener('pass_anim', onAnim);
    return () => window.removeEventListener('pass_anim', onAnim);
  }, []);

  // LAY anim
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

  const tableSets = state.table_sets || [];
  const setsA = tableSets.filter(ts => ts.owner_team === 'A');
  const setsB = tableSets.filter(ts => ts.owner_team === 'B');
  const scoreA = state.team_scores?.A ?? 0;
  const scoreB = state.team_scores?.B ?? 0;

  const doHandoff = (toId) => {
    send(ws, 'handoff_after_laydown', { who_id: me.id, to_id: toId });
  };


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

  const handleSeatClick = (player) => {
    if (selectedCardsToPass.length === 0) return;
    
    // Can only pass to opponent team
    if (player.team === my.team) {
      // Show error or just ignore
      return;
    }
    
    send(ws, 'pass_cards', {
      from_player_id: me.id,
      to_player_id: player.id,
      cards: selectedCardsToPass
    });
    
    setSelectedCardsToPass([]);
  };


  const handleTableClick = () => {
    // Clear any landed animation when clicking on table
    if (anim && anim.landed) {
      setAnim(null);
    }
  };

  // Show spectator view if player is a spectator
  if (isSpectator) {
    return (
      <div className="h-screen w-screen overflow-hidden flex flex-col bg-gradient-vibrant">
        <div className="flex-1 overflow-y-auto">
          <SpectatorView players={players} myId={me.id} gamePhase={state.phase} />
        </div>
        
        {/* Spectator status indicator */}
        <div className="fixed top-4 left-4 z-40 bg-gradient-warm text-white px-4 py-2 rounded-lg shadow-lg border border-accent-amber/30">
          <div className="text-sm font-semibold">👁️ Spectator Mode</div>
          <div className="text-xs opacity-80">
            {my?.spectator_request_pending ? 'Waiting for admin approval' : 
             state.phase === 'lobby' ? 'Watching lobby' : 'Watching game'}
          </div>
        </div>
        
        {/* Toast Notifications */}
        <Toast />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-gradient-vibrant" onClick={handleTableClick}>
      <Celebration tableCenterRef={tableCenterRef} />
      <DealingAnimation />
      
      {/* Back to Lobby Button - Top Left */}
      <div className="fixed top-2 left-2 md:top-3 md:left-3 z-40">
          <button 
            className="group bg-gradient-primary hover:shadow-glow-blue text-white px-3 py-2 md:px-4 md:py-2 rounded-lg md:rounded-xl shadow-lg transition-all duration-200 transform hover:scale-105 active:scale-95 flex items-center gap-2 border border-accent-blue/30"
            onClick={() => send(ws, 'request_back_to_lobby', { requester_id: me.id })}
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
        <div className="fixed top-2 right-2 md:top-3 md:right-3 z-40">
          <button 
            className="group bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-3 py-2 md:px-4 md:py-2 rounded-lg md:rounded-xl shadow-lg transition-all duration-200 transform hover:scale-105 active:scale-95 flex items-center gap-2 border border-purple-500/30"
            onClick={() => setRequestAbortOpen(true)}
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
      <div className="fixed top-14 right-2 md:top-16 md:right-3 z-40">
        <button 
          className="group bg-dark-card/80 hover:bg-dark-tertiary/80 text-text-secondary hover:text-text-primary p-2 rounded-lg shadow-lg transition-all duration-200 transform hover:scale-105 active:scale-95 border border-accent-purple/20 hover:border-accent-purple/40 hover:shadow-glow-purple"
          onClick={() => setEmojiSettingsOpen(true)}
          title="Emoji Settings"
        >
          <svg className="w-4 h-4 transition-transform group-hover:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* Spectator Requests Button - Admin Only */}
      {state.admin_player_id === me.id && Object.keys(state.spectator_requests || {}).length > 0 && (
        <div className="fixed top-14 right-14 md:top-16 md:right-16 z-40">
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
      {selectedCardsToPass.length > 0 && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 bg-gradient-primary text-white px-4 py-2 rounded-lg shadow-lg border border-accent-blue/30 shadow-glow-blue">
          <div className="text-sm font-semibold">
            {selectedCardsToPass.length} card{selectedCardsToPass.length !== 1 ? 's' : ''} selected
          </div>
          <div className="text-xs opacity-80">Click on an opponent's seat to pass</div>
        </div>
      )}

      {handoffFor && handoffFor.who_id === me.id && (
        <div className="fixed top-2 md:top-4 left-1/2 -translate-x-1/2 z-[95] bg-dark-card/90 backdrop-blur px-2 md:px-4 py-1 md:py-2 rounded-xl card-shadow flex flex-col sm:flex-row items-center gap-1 md:gap-2 border border-accent-emerald/20">
          <span className="text-xs md:text-sm text-text-secondary">Pass turn to teammate:</span>
          <div className="flex flex-wrap gap-1 md:gap-2">
            {handoffFor.eligible.map(pid => (
              <button key={pid} className="text-xs md:text-sm bg-gradient-accent hover:shadow-glow-emerald px-2 md:px-3 py-1 rounded border border-accent-emerald/30"
                onClick={() => doHandoff(pid)}>
                <div className="flex items-center gap-2">
                  {typeof players[pid]?.avatar === "string" && players[pid].avatar.startsWith("http") ? (
                    <img 
                      src={players[pid].avatar} 
                      alt={players[pid]?.name || 'Player'} 
                      className="h-5 w-5 rounded-full border border-white/30" 
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span>{players[pid]?.avatar}</span>
                  )}
                  <span>{players[pid]?.name}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}


       <MessageBubbles seatEls={seatEls} seatVersion={seatVersion} hideLaydownBubbles={layOpen} />
       <ChatBubble />
       <EmojiPassAnimation />
       
       {/* Main game area - takes up most of the viewport */}
       <div className="flex-1 flex items-center justify-center p-2 md:p-4 max-h-[60vh] md:max-h-none">
         {/* left panel (Team A) - table - right panel (Team B) */}
         <div className="relative w-full max-w-7xl flex items-center justify-center gap-2 lg:gap-4">
        <div className="hidden xl:block w-[260px]">
          <div className="sticky top-4 space-y-2">
            <div className="text-sm font-semibold text-accent-blue mb-1">Team A — Collected</div>
            {setsA.length === 0 && <div className="text-xs text-text-muted">No sets yet.</div>}
            {setsA.map((ts, idx)=>(
              <SetChip key={`A-${idx}`} suit={ts.suit} set_type={ts.set_type} owner="A" expandable cards={ts.cards}/>
            ))}
          </div>
        </div>

         <div className="relative flex-1 max-w-[90vw] h-[min(60vh,500px)] lg:h-[min(70vh,600px)] flex items-center justify-center">
           <div className="relative w-full h-full">
             {/* Table Base/Legs */}
             <div className="absolute rounded-full"
                  style={{ 
                    width: 'min(55%, 380px)', 
                    height: 'min(55%, 380px)', 
                    left: '50%', 
                    top: '50%', 
                    transform: 'translate(-50%, -50%)',
                    background: 'radial-gradient(circle, rgba(101, 67, 33, 0.8) 0%, rgba(139, 69, 19, 0.6) 70%, transparent 100%)',
                    boxShadow: '0 15px 30px rgba(0, 0, 0, 0.5)'
                  }}>
             </div>
             
             {/* Main Table Surface */}
             <div ref={tableCenterRef} className="absolute rounded-full border-6 border-amber-800/90 bg-gradient-to-br from-green-900 via-green-800 to-emerald-900 flex items-center justify-center"
                  style={{ 
                    width: 'min(50%, 350px)', 
                    height: 'min(50%, 350px)', 
                    left: '50%', 
                    top: '50%', 
                    transform: 'translate(-50%, -50%)',
                    backgroundImage: `
                      radial-gradient(circle at 30% 30%, rgba(255,255,255,0.15) 0%, transparent 50%),
                      radial-gradient(circle at 70% 70%, rgba(0,0,0,0.3) 0%, transparent 50%),
                      linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.08) 50%, transparent 70%),
                      repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px)
                    `,
                    boxShadow: `
                      0 0 0 2px rgba(139, 69, 19, 0.9),
                      0 0 0 4px rgba(160, 82, 45, 0.7),
                      0 0 0 6px rgba(139, 69, 19, 0.5),
                      0 25px 50px -12px rgba(0, 0, 0, 0.8),
                      inset 0 2px 4px rgba(0, 0, 0, 0.4),
                      inset 0 -2px 4px rgba(255, 255, 255, 0.1)
                    `
                  }}>
              {/* Shuffle & Deal button - show for current dealer when game is ready, ended, or when no cards are dealt, but NOT when game is actively playing */}
              {me?.id === state.current_dealer && state.phase !== 'playing' && (state.phase === 'ready' || state.phase === 'ended' || !state.deck_count || state.deck_count === 0 || !my?.hand?.length) && (
                <button 
                  className="bg-gradient-warm hover:shadow-glow-amber text-white px-6 py-3 rounded-lg font-semibold shadow-lg transition-all duration-200 border border-accent-amber/30"
                  onClick={() => send(ws, 'shuffle_deal', {})}
                >
                  Shuffle & Deal
                </button>
              )}
              
              {/* Sets Button - show in center of table after game starts (mobile and small desktop) */}
              {state.phase === 'playing' && (
                <button
                  onClick={() => setCompletedSetsOpen(true)}
                  className="px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 bg-gradient-primary hover:shadow-glow-blue text-white shadow-lg border border-accent-blue/30 xl:hidden"
                  title="View completed sets"
                >
                  Sets
                </button>
              )}
            </div>

            {Object.keys(seats).map((k) => {
              const i = Number(k);
              const pid = seats[i];
              const p = pid ? players[pid] : null;
              const selectable = selectedCardsToPass.length > 0 && !!p && p.team !== my.team;
              const ringClass = p?.team === 'A' ? TEAM_RING.A : p?.team === 'B' ? TEAM_RING.B : TEAM_RING.unknown;
              const isMe = p && p.id === me.id;
              const isLaydownPlayer = p && pendingLay && p.id === pendingLay.who_id;
              const isSpeaking = p && speakingUsers && speakingUsers[p.id];
              
              return (
                <div key={`seatwrap-${i}-${pid || 'empty'}`} className="absolute" style={seatPositions[i]} ref={p ? setSeatRef(p.id) : undefined} data-seat={i} data-player-id={p?.id}>
                  <div className={[
                      'rounded-full relative',
                      selectable ? 'ring-2 ring-yellow-300/80' : '',
                      ringClass,
                      isMe ? 'ring-4 ring-cyan-400 shadow-[0_0_0_6px_rgba(34,211,238,0.25)]' : 'ring-2',
                      isLaydownPlayer ? 'ring-4 ring-amber-400 shadow-[0_0_0_8px_rgba(251,191,36,0.4)] animate-pulse' : '',
                    ].join(' ')}
                  >
                    {isSpeaking && (
                      <div className="pointer-events-none absolute -inset-1 rounded-full ring-4 ring-green-400 shadow-[0_0_14px_rgba(34,197,94,0.6)] z-10" />
                    )}
                    <Seat
                      seatIndex={i}
                      player={p}
                      highlight={isLaydownPlayer}
                      selectable={selectable}
                      onSelect={p ? () => handleSeatClick(p) : null}
                      team={p?.team}
                      isMe={isMe}
                      isLaydownPlayer={isLaydownPlayer}
                      isSpeaking={!!isSpeaking}
                    />
                  </div>
                  {p && p.id !== my.id && !dealingAnimation && (
                    <div className="mt-1 text-center text-xs text-text-muted">{handCount(pid)} cards</div>
                  )}
                </div>
              );
            })}

            {anim && (
              <div className="fixed z-[90] pointer-events-none" style={{ 
                left: anim.from.x, 
                top: anim.from.y, 
                transform: 'translate(-50%,-50%)' 
              }}>
                <div style={{ 
                  position: 'relative', 
                  left: anim.go ? (anim.to.x - anim.from.x) : 0, 
                  top: anim.go ? (anim.to.y - anim.from.y) : 0,
                  transition: anim.landed ? 'none' : 'left 0.8s cubic-bezier(.2,.8,.2,1), top 0.8s cubic-bezier(.2,.8,.2,1)' 
                }}>
                  {anim.type === 'fanned_deck' ? (
                    // Render fanned deck animation
                    <div className={`relative flex justify-center items-center ${anim.landed ? 'animate-pulse' : ''}`} style={{ 
                      width: `${Math.min(anim.cards.length * 20 + 60, 350)}px`,
                      height: '80px'
                    }}>
                      {anim.cards.map((card, index) => {
                        const totalCards = anim.cards.length;
                        const maxRotation = Math.min(totalCards * 6, 45);
                        const rotation = totalCards > 1 ? 
                          (index - (totalCards - 1) / 2) * (maxRotation / (totalCards - 1)) : 0;
                        const offsetX = totalCards > 1 ? 
                          (index - (totalCards - 1) / 2) * 20 : 0;
                        
                        return (
                          <div
                            key={`${card.suit}-${card.rank}-${index}`}
                            className="absolute transform"
                            style={{
                              transform: `translateX(${offsetX}px) rotate(${rotation}deg)`,
                              zIndex: index + 1,
                              left: '50%',
                              marginLeft: '-19px',
                              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                            }}
                          >
                            <Card suit={card.suit} rank={card.rank} size={anim.landed ? "sm" : "sm-xs"} />
                          </div>
                        );
                      })}
                    </div>
                  ) : anim.type === 'single_card' ? (
                    // Render single card animation with landing effects
                    <div className={`relative flex justify-center items-center ${anim.landed ? 'animate-pulse' : ''}`}>
                      <Card suit={anim.suit} rank={anim.rank} size={anim.landed ? "sm" : "sm"} />
                    </div>
                  ) : (
                    // Fallback for old single card animation (should not happen anymore)
                    <Card suit={anim.suit} rank={anim.rank} size="sm" />
                  )}
                </div>
              </div>
            )}

            {lays.map((a, idx)=>(
              <div key={`lay-${idx}`} className="fixed z-[88] pointer-events-none" style={{ left: a.from.x, top: a.from.y, transform: 'translate(-50%,-50%)' }}>
                <div style={{ position:'relative', left: a.go ? (a.to.x - a.from.x) : 0, top: a.go ? (a.to.y - a.from.y) : 0,
                              transition:'left .9s cubic-bezier(.2,.8,.2,1), top .9s cubic-bezier(.2,.8,.2,1)' }}>
                  <Card suit={a.suit} rank={a.rank} size="sm" />
                </div>
              </div>
            ))}
          </div>

        </div>

        <div className="hidden xl:block w-[260px]">
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
       <div className="flex-shrink-0 p-2 md:p-4 space-y-1 md:space-y-2 mt-2 md:-mt-4">
         {/* Scoreboard */}
         <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-30 text-xs sm:text-sm">
        <div className="px-2 sm:px-3 py-1 rounded-full bg-dark-card/70 backdrop-blur-sm border border-accent-blue/20 shadow-glow-blue">
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
        <div className="px-2 sm:px-3 py-1 rounded-full bg-dark-card/70 backdrop-blur-sm border border-accent-rose/20 shadow-glow-rose">
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

         {/* Player Hand */}
         <div className="flex flex-col items-center">
           <PlayerHand 
             cards={my?.hand || []} 
             selectedCards={selectedCardsToPass}
             onCardSelect={handleHandCardClick}
             selectable={true}
           />
           
           {/* Clear Selection Button - only show when cards are selected */}
           {selectedCardsToPass.length > 0 && (
             <div className="mt-2">
               <button 
                 className="bg-gradient-secondary hover:shadow-glow-rose text-white px-3 py-1 rounded text-sm font-medium transition-all duration-200 border border-accent-rose/30"
                 onClick={() => setSelectedCardsToPass([])}
               >
                 Clear Selection ({selectedCardsToPass.length})
               </button>
             </div>
           )}
         </div>

         {/* Game Controls */}
         <div className="flex items-center justify-center gap-3">
         {/* Debug: Show current phase */}
         <div className="text-xs text-text-muted ml-4">
           Phase: {state.phase}
         </div>
         </div>
       </div>

      {layOpen && <LaydownModal onClose={() => setLayOpen(false)} />}

      {/* Game Over Modal */}
      <GameOverModal
        open={!!gameResult}
        onClose={() => {}}
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
       {(state.phase === 'playing' || state.phase === 'ready') && (
         <div className="fixed bottom-4 right-4 z-50">
           <button
             onClick={() => setLayOpen(true)}
             className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg border border-amber-500/30"
             title="Laydown cards"
           >
             <span className="hidden sm:inline">Laydown</span>
             <span className="sm:hidden">Lay</span>
           </button>
         </div>
       )}


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
