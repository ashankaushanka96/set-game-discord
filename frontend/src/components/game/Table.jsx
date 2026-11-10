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
import TableSceneDetails, { SeatCardStack } from './TableSceneDetails';
import PassedCardsAnimation from './PassedCardsAnimation';
import LaydownAnimation from './LaydownAnimation';
import ChatBubble from './ChatBubble';
import EmojiPassAnimation from './EmojiPassAnimation';
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
  SpectatorRequestsModal
} from '../modals';
import { 
  Toast, 
  Celebration
} from '../ui';
import Card from '../cards/Card';
import { RANKS_LOWER, RANKS_UPPER, SUITS } from '../../lib/deck';

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
  const [layOpen, setLayOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [resultsReady, setResultsReady] = useState(false);
  const pendingResult = laydownResult || gameResult;
  useEffect(() => {
    setResultsOpen(false);
    setResultsReady(false);
    if (!pendingResult) return;
    const timer = setTimeout(() => setResultsReady(true), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 150 : 1100);
    return () => clearTimeout(timer);
  }, [pendingResult]);
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

  const tableCenterRef = useRef(null);

  const seatEls = useRef({});
  const [seatVersion, setSeatVersion] = useState(0);
  const lastSeatEl = useRef({});



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
       const relativeSeat = (i - mySeatIndex + 6) % 6;
       // Open a wider gap between the two chairs on each side of the table.
       const sideOffset = relativeSeat === 1 || relativeSeat === 5 ? 7 : relativeSeat === 2 || relativeSeat === 4 ? -7 : 0;
       const y = 50 + radiusPercent * Math.sin(angle) + sideOffset;
       pos[i] = { left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)', '--chair-angle': `${(i-mySeatIndex)*60}deg`, '--hand-x': `${-Math.cos(angle)*69}px`, '--hand-y': `${-Math.sin(angle)*69}px`, '--hand-direction': `${(i-mySeatIndex)*60}deg` };
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
      player.team && player.team !== my?.team && !player.is_spectator && player.connected !== false && typeof player.seat === 'number' ? player : null;
  };

  const passCards = (cards, playerId) => {
    if (!cards.length || !resolveDropTarget(playerId)) return;
    if (!cards.every(card => my?.hand?.some(c => c.suit === card.suit && c.rank === card.rank))) return;
    send(ws, 'pass_cards', { from_player_id:me.id, to_player_id:playerId, cards });
    setSelectedCardsToPass([]);
  };
  const handleSeatClick = player => passCards(selectedCardsToPass,player.id);


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
    <div className="card-room h-screen w-screen overflow-hidden flex flex-col bg-gradient-vibrant" onClick={handleTableClick}>
      <div className="game-room-heading"><span className="club-eyebrow">SET CLUB <i className="room-live-dot" /></span><span>{state.phase === 'playing' ? 'Round in play' : state.phase === 'ready' ? 'Waiting for the deal' : 'Round complete'}</span></div>
      <Celebration tableCenterRef={tableCenterRef} />
      <DealingAnimation />
      <PassedCardsAnimation seatEls={seatEls} phase={state.phase} />
      <LaydownAnimation seatEls={seatEls} tableCenterRef={tableCenterRef} />
      
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
      {selectedCardsToPass.length > 0 && !isDraggingCards && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 bg-gradient-primary text-white px-4 py-2 rounded-lg shadow-lg border border-accent-blue/30 shadow-glow-blue">
          <div className="text-sm font-semibold">
            {selectedCardsToPass.length} card{selectedCardsToPass.length !== 1 ? 's' : ''} selected
          </div>
          <div className="text-xs opacity-80">Drag onto an opponent to pass, or click their seat</div>
        </div>
      )}

       <MessageBubbles seatEls={seatEls} seatVersion={seatVersion} hideLaydownBubbles={layOpen} />
       <ChatBubble selectedCardsToPass={selectedCardsToPass} />
       <EmojiPassAnimation />
       
       {/* Main game area - takes up most of the viewport */}
       <div className="game-stage">
         {/* left panel (Team A) - table - right panel (Team B) */}
         <div className="game-stage__layout">
        <div className="hidden xl:block w-[260px]">
          <div className="sticky top-4 space-y-2">
            <div className="text-sm font-semibold text-accent-blue mb-1">Team A — Collected</div>
            {setsA.length === 0 && <div className="text-xs text-text-muted">No sets yet.</div>}
            {setsA.map((ts, idx)=>(
              <SetChip key={`A-${idx}`} suit={ts.suit} set_type={ts.set_type} owner="A" expandable cards={ts.cards}/>
            ))}
          </div>
        </div>

         <div className="game-table-arena">
           <div className="relative w-full h-full">
             <TableSceneDetails />
             <div className="table-plinth" aria-hidden="true" />
             <div ref={tableCenterRef} data-table-center="true" className="felt-table absolute rounded-full flex items-center justify-center"
               style={{left:'50%',top:'50%',transform:'translate(-50%, -50%)'}}>
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
              {state.phase === 'playing' && !pendingResult && (
                <button
                  onClick={() => setCompletedSetsOpen(true)}
                  className="px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 bg-gradient-primary hover:shadow-glow-blue text-white shadow-lg border border-accent-blue/30 xl:hidden"
                  title="View completed sets"
                >
                  Sets
                </button>
              )}
            </div>

            {pendingResult && resultsReady && <div className="laydown-results-prompt" role="status">
              <span>{laydownResult ? (laydownResult.success ? 'Set complete' : 'Declaration checked') : 'Round complete'}</span>
              <button type="button" className="club-primary" onClick={event => {event.stopPropagation();setResultsOpen(true);}}>View results</button>
            </div>}

            {Object.keys(seats).map((k) => {
              const i = Number(k);
              const pid = seats[i];
              const p = pid ? players[pid] : null;
              const selectable = selectedCardsToPass.length > 0 && !!p && !!resolveDropTarget(p.id);
              const ringClass = p?.team === 'A' ? TEAM_RING.A : p?.team === 'B' ? TEAM_RING.B : TEAM_RING.unknown;
              const isMe = p && p.id === me.id;
              const isLaydownPlayer = p && pendingLay && p.id === pendingLay.who_id;
              const isSpeaking = p && speakingUsers && speakingUsers[p.id];
              
              return (
                <div key={`seatwrap-${i}-${pid || 'empty'}`} className="table-seat-position absolute" style={seatPositions[i]} ref={p ? setSeatRef(p.id) : undefined} data-seat={i} data-player-id={p?.id} data-team={p?.team || 'none'}>
                  <div className={[
                      'seat-frame relative',
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
                      onSelect={p ? () => handleSeatClick(p) : null}
                      team={p?.team}
                      isMe={isMe}
                      isLaydownPlayer={isLaydownPlayer}
                      isSpeaking={!!isSpeaking}
                      isDealer={p?.id === state.current_dealer}
                    />
                  </div>
                  {p && p.id !== my?.id && !dealingAnimation && <SeatCardStack count={handCount(pid)} />}
                  {p && p.id !== my?.id && !dealingAnimation && (
                    <div className="mt-1 text-center text-xs text-text-muted">{handCount(pid)} cards</div>
                  )}
                </div>
              );
            })}



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
       <div className="game-hand-dock">
         {/* Scoreboard */}
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

         {/* Player Hand */}
         <div className="flex flex-col items-center">
           <PlayerHand 
             cards={my?.hand || []} 
             selectedCards={selectedCardsToPass}
             onCardSelect={handleHandCardClick}
             selectable={state.phase === 'playing' && ws?.readyState === 1}
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
             </div>
         </div>

         {/* Game Controls */}
         <div className="flex items-center justify-center gap-3">
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

      {layOpen && <LaydownModal onClose={() => setLayOpen(false)} />}

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
       {(state.phase === 'playing' || state.phase === 'ready') && (
         <div className="game-laydown-action">
           <button
             onClick={() => selectedCardsToPass.length === 0 && setLayOpen(true)}
             className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 shadow-lg border ${
               selectedCardsToPass.length > 0 
                 ? 'bg-gray-500 cursor-not-allowed text-gray-300 border-gray-400/30' 
                 : 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white border-amber-500/30'
             }`}
             disabled={selectedCardsToPass.length > 0}
             title={selectedCardsToPass.length > 0 ? "Clear card selection first" : "Laydown cards"}
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
