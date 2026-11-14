import { stopCardFoley, playCue } from './utils/sounds';
import { t as tr } from './i18n';
import { SHUFFLE_DURATION, DEAL_DURATION, DEAL_COMPLETE_BUFFER } from './components/game/dealTiming';
import { createSpeakingActions } from './utils/speaking';
import { create } from "zustand";

function getMe() {
  try { return JSON.parse(sessionStorage.getItem("me") || "null"); }
  catch { return null; }
}
function setMeInSession(me) { sessionStorage.setItem("me", JSON.stringify(me)); }

let uid = 0;
const mid = () => `${Date.now()}-${uid++}`;



const setLabel = (t) => (t === "lower" ? "Lower" : "Upper");
const cardLabel = (c) => (c ? `${c.rank} of ${c.suit}` : "card");

// Asked cards in rank order (2…A), so a multi-card ask reads Q 10 A as 10 Q A.
const RANK_ORDER = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
export const byRank = (ranks) => [...(ranks || [])].sort((a, b) => RANK_ORDER.indexOf(a) - RANK_ORDER.indexOf(b));

export const useStore = create((set, get) => ({
  me: getMe(),
  roomId: "",
  ws: null,
  state: null,
  phase: "lobby",

  pendingAsk: null,
  pendingLay: null,
  lastAsks: [], // Turn Play: the last two answered asks (newest first), for the replay panel
  flowArrows: [], // laydown contributors and turn passes drawn on the table: {id, from, to, tone, label, start, until}
  handoffFor: null,

  // game end and abort
  gameResult: null,
  abortVoting: null,
  votingResult: null,

  // dealing animation
  dealingAnimation: null,

  // seat bubbles
  messages: [],
  // internal cleaner timer id
  _messagesCleaner: null,

  // speaking users (by Discord user id)
  speakingUsers: {},

  // emoji animations
  emojiAnimations: [],

  // single game feed (bottom box)
  gameMessage: null,
  gameMessageTimer: null,
  laydownResult: null,

  // toast notifications
  toast: null,

  // back to lobby voting
  backToLobbyVoting: null,

  setMe: (me) => { setMeInSession(me); set({ me }); },
  setWS: (ws) => set({ ws }),
  setRoom: (roomId) => set({ roomId }),

  // --- seat bubbles helpers ---
  addMessage: (m) => {
    const withId = { ...m, id: mid() };
    if (!m.replay && !m.silent && m.kind !== 'laydown') {   // laydowns have their own result sound
      const v = m.variant;
      playCue(v === 'ask' ? 'ask' : v === 'yes' || v === 'event_good' ? 'yes' : v === 'no' || v === 'event_bad' || v === 'penalty_set' ? 'no'
        : v === 'chat' ? 'chat' : 'bubble');
    }
    set((state) => {
      const existing = state.messages || [];
      // Remove any existing messages from the same player to prevent stacking
      const filtered = existing.filter((msg) => msg.player_id !== m.player_id);
      const next = [...filtered, withId];
      return { messages: next.slice(Math.max(0, next.length - 12)) };
    });
    // auto-remove only if not sticky
    if (!m.sticky) {
      // set explicit expiry ts so a background cleaner can purge on mobile
      const expireAt = Date.now() + 5000;
      set((state) => ({
        messages: (state.messages || []).map((x) => (x.id === withId.id ? { ...x, expire_ts: expireAt, sticky: false } : x)),
      }));
      setTimeout(() => {
        set((state) => ({
          messages: (state.messages || []).filter((x) => x.id !== withId.id),
        }));
      }, 5000);
      // Start or ensure a lightweight cleaner interval (1s) to remove expired messages
      const cleaner = get()._messagesCleaner;
      if (!cleaner) {
        const id = setInterval(() => {
          const { messages } = get();
          if (!messages || messages.length === 0) return;
          const now = Date.now();
          const next = messages.filter((x) => !(x.sticky === false && x.expire_ts && now >= x.expire_ts));
          if (next.length !== messages.length) set({ messages: next });
        }, 1000);
        set({ _messagesCleaner: id });
      }
    }
    return withId.id;
  },
  removeMessageByTag: (tag) => {
    set((state) => ({
      messages: (state.messages || []).filter((m) => m.tag !== tag),
    }));
  },
  addEmojiAnimation: (animation) => {
    const withId = { ...animation, id: mid() };
    set((state) => {
      const existing = state.emojiAnimations || [];
      const next = [...existing, withId];
      return { emojiAnimations: next };
    });
    // Keep the impact/decal visible after the throw has landed.
    setTimeout(() => {
      set((state) => ({
        emojiAnimations: (state.emojiAnimations || []).filter((a) => a.id !== withId.id),
      }));
    }, 4200);
    return withId.id;
  },

  ...createSpeakingActions(set),

  // --- bottom message box ---
  setGameMessage: (title, lines, cards = null) => {
    const text = Array.isArray(lines) ? lines.join("\n") : lines;
    const { gameMessageTimer } = get();
    if (gameMessageTimer) clearTimeout(gameMessageTimer);
    const timer = setTimeout(() => set({ gameMessage: null, gameMessageTimer: null }), 30000);
    set({ gameMessage: { id: mid(), title, text, ts: Date.now(), cards }, gameMessageTimer: timer });
    // No pop-up here: game events are shown to everyone as seat bubbles.
    // Pop-ups are kept for players disconnecting/reconnecting and for your own refused actions.
  },

  closeVotingResult: () => set({ votingResult: null }),

  showToast: (type, title, message, cards = null) => set({ 
    toast: { type, title, message, cards, id: mid() } 
  }),

  clearToast: () => set({ toast: null }),
  
  // laydown result modal
  setLaydownResult: (data) => set({ laydownResult: data }),
  clearLaydownResult: () => set({ laydownResult: null }),

  getToastTypeFromTitle: (title) => {
    const titleLower = title?.toLowerCase() || "";
    if (titleLower.includes('disconnect')) return 'disconnect';
    if (titleLower.includes('reconnect')) return 'reconnect';
    if (titleLower.includes('error') || titleLower.includes('failed')) return 'error';
    if (titleLower.includes('started') || titleLower.includes('success')) return 'success';
    if (titleLower.includes('vote') || titleLower.includes('abort')) return 'vote';
    return 'info';
  },

  applyServer: (msg) => {
    // Votes live in the room state, so a player who (re)connects mid-vote sees the vote too,
    // and a vote that ended while they were away closes.
    {
      const st = msg.type === "state" || msg.type === "dealt" ? msg.payload : msg.payload?.state;
      if (st && st.players && !/^(abort_|back_to_lobby_|game_aborted|new_game_voting)/.test(msg.type)) syncVotes(st, get, set);
      // Seat bubbles belong to the game in progress: a new deal, round or game, the lobby, or an
      // abort clears them all; and an ask bubble goes once no ask is pending any more.
      if (/^(dealt|new_game_started|new_round_started|game_started|back_to_lobby_success|game_aborted)$/.test(msg.type) || (st && st.phase && st.phase !== "playing")) {
        if ((get().messages || []).length) set({ messages: [] });
        // A new deal or a trip to the lobby: the last round's results must not come back.
        if (/^(dealt|new_game_started|new_round_started|game_started|back_to_lobby_success|game_aborted)$/.test(msg.type)) set({ lastAsks: [], gameResult: null });
        // tell the table to drop anything in progress (laydown, ask, penalty, selection)
        if (/^(dealt|new_game_started|new_round_started|game_started|back_to_lobby_success|game_aborted)$/.test(msg.type)) {
          try { window.dispatchEvent(new CustomEvent("game_reset")); } catch {}
        }
      } else if (st && st.players && !st.pending_ask && msg.type !== "ask_started") {
        const msgs = get().messages || [];
        if (msgs.some((m) => m.variant === "ask")) set({ messages: msgs.filter((m) => m.variant !== "ask") });
      }
    }

    if (msg.type === "state" || msg.type === "dealt") {
      set({ state: msg.payload, phase: msg.payload.phase });
      if (msg.payload.phase === "ended" && msg.payload.round_result) {
        set({ gameResult: msg.payload.round_result });
      }
      
      // Auto-navigate to game room if game has started and we're not already there
      if (msg.payload.phase === "ready" || msg.payload.phase === "playing") {
        const currentPath = window.location.pathname;
        const roomId = msg.payload.room_id;
        const me = get().me;
        
        // Only navigate if we're not already in the game room AND player has a seat
        if (me && roomId && !currentPath.includes(`/room/${roomId}/${me.id}`)) {
          const currentPlayer = msg.payload.players?.[me.id];
          const hasSeat = currentPlayer && currentPlayer.seat !== null && currentPlayer.seat !== undefined;
          
          if (hasSeat) {
            console.debug("[Store] Auto-navigating to game room - player has seat:", currentPlayer.seat);
            // Dispatch navigation event to avoid WebSocket disconnection
            window.dispatchEvent(new CustomEvent('navigate-to-game', {
              detail: { roomId, playerId: me.id }
            }));
          } else {
            console.debug("[Store] Not auto-navigating - player has no seat (spectator)");
          }
        }
      }
    }

    // A bot is holding its move until someone taps Continue (or the wait runs out)
    if (msg.type === "bot_wait") {
      const { bot_id, kind, seconds = 10 } = msg.payload || {};
      set({ botWait: bot_id ? { bot_id, kind, seconds, until: Date.now() + seconds * 1000 } : null });
      return;
    }

    // ASK started -> add ASK bubble (sticky until pass/NO)
    if (msg.type === "ask_started") {
      const s = msg.payload.state;
      set({ state: s });
      // A new ask is the thing to watch now: clear cards still shown from the last pass.
      try { window.dispatchEvent(new CustomEvent("dismiss_passed_cards")); } catch {}
      const rank = msg.payload.ranks?.[0];
      const suit = msg.payload.suit;
      const askerId = msg.payload.asker_id;
      const targetId = msg.payload.target_id;
      // sticky ask bubble attached to the ASKER seat, but text shows TARGET name
      get().removeMessageByTag(`ask-${askerId}`); // clean any stale
      get().addMessage({
        player_id: askerId,       // bubble position (asker seat)
        target_id: targetId,      // for wording
        variant: "ask",
        text: "Do you have…",
        card: rank && suit ? { suit, rank } : undefined,
        cards: byRank(msg.payload.ranks).map((r) => ({ suit, rank: r })),
        sticky: true,
        tag: `ask-${askerId}`,
      });
      // game feed header
      const players = s.players || {};
      const asker = players[askerId]?.name || "Unknown";
      const target = players[targetId]?.name || "Unknown";
      get().setGameMessage("ASK", [`Who: ${asker} → ${target}`, `What: ${(msg.payload.ranks || []).join(", ")} of ${suit}`]);
    }

    // ASK pending -> also store pendingAsk
    if (msg.type === "ask_pending") {
      const s = msg.payload.state;
      set({ state: s, pendingAsk: msg.payload });
    }

    // ASK result -> remove sticky ask bubble and show reply bubble
    if (msg.type === "ask_result") {
      const s = msg.payload.state;
      set({ state: s, phase: s.phase, pendingAsk: null });

      // remove ASK bubble for this asker
      get().removeMessageByTag(`ask-${msg.payload.asker_id}`);
      {
        const p = msg.payload;
        set({ lastAsks: [{ id: Date.now(), asker_id: p.asker_id, target_id: p.target_id, suit: p.suit, ranks: p.ranks || [],
          success: !!p.success, reason: p.reason }, ...get().lastAsks].slice(0, 2) });
      }

      const players = s.players || {};
      const asker = players[msg.payload.asker_id]?.name || "Unknown";
      const target = players[msg.payload.target_id]?.name || "Unknown";

      if (msg.payload.success) {
        const first = msg.payload.transferred?.[0];
        const detail = { asker_id: msg.payload.asker_id, target_id: msg.payload.target_id, card: first ? { suit: first.suit, rank: first.rank } : null };
        // No "Yes, I have" bubble: the card flying to the asker already says it.
        get().setGameMessage("REPLY", [
          `Who: ${target} → ${asker}`,
          `Answer: YES (${cardLabel(first)})`,
          `Action: Card passed to ${asker}`,
          `Next Turn: ${asker} (continues)`
        ]);
        // Turn Play: animate the card moving from the asked player to the asker
        try {
          window.dispatchEvent(new CustomEvent("pass_anim", { detail: {
            from_player: msg.payload.target_id, to_player: msg.payload.asker_id, cards: msg.payload.transferred || []
          } }));
        } catch {}
        import('./utils/sounds').then((m) => {
          try { (m.playKey || m.default?.playKey)?.('pass'); } catch {}
        }).catch(() => {});
      } else {
        if (msg.payload.reason === "no_card") {
          const rank = msg.payload.ranks?.[0];
          const suit = msg.payload.suit;
          get().addMessage({ player_id: msg.payload.target_id, variant: "no", text: "No.", card: { suit, rank }, cards: byRank(msg.payload.ranks).map((r) => ({ suit, rank: r })) });
          const nextName = players[msg.payload.next_turn || msg.payload.target_id]?.name || target;
          get().setGameMessage("REPLY", [
            `Who: ${target} → ${asker}`,
            `Answer: NO (${(msg.payload.ranks || [rank]).join(", ")} of ${suit})`,
            `Next Turn: ${nextName}`
          ]);
        } else if (msg.payload.reason === "target_empty") {
          get().addMessage({ player_id: msg.payload.target_id, variant: "no", text: "No cards!" });
          get().setGameMessage("REPLY", [
            `Who: ${target} → ${asker}`,
            `Answer: NO (${target} has no cards)`,
            `Next Turn: ${target}`
          ]);
        } else {
          get().setGameMessage("REPLY", "Pass failed. Turn changes.");
        }
      }
    }

    // Turn Play: a wrong ask forfeits the set to the other team
    if (msg.type === "ask_penalty") {
      const pl = msg.payload;
      const s = pl.state;
      set({ state: s });
      if (s.game_mode === "turns" && s.phase === "playing" && pl.asker_id && pl.next_turn && pl.next_turn !== pl.asker_id) {
        const now = Date.now();
        set({ flowArrows: [...get().flowArrows.filter((a) => a.tone !== "turn"),
          { id: `turn-${now}`, from: pl.asker_id, to: pl.next_turn, tone: "turn", label: "Turn", start: now + 4500, until: now + 11000 }] });
      }
      if (Array.isArray(pl.contributors) && pl.contributors.length) {
        try {
          window.dispatchEvent(new CustomEvent("lay_anim", {
            detail: { contributors: pl.contributors, suit: pl.suit, set_type: pl.set_type, success: false, points: pl.points, team: pl.owner_team, penalty: true }
          }));
        } catch {}
      }
      import('./utils/sounds').then((m) => {
        try { (m.playKey || m.default?.playKey)?.('lay_unsuccess'); } catch {}
      }).catch(() => {});
      if (pl.mistake === "penalty") {
        const setName = `${tr(pl.suit)} ${tr(pl.set_type)}`;
        get().addMessage({ player_id: pl.asker_id, variant: "event_bad", title: tr("Penalty laydown"),
          text: tr("{set} goes to Team {team} (+{pts}).", { set: setName, team: pl.owner_team, pts: pl.points }) });
        if (pl.game_end?.game_ended) set({ gameResult: pl.game_end });
        return;
      }
      const players = s.players || {};
      const asker = players[pl.asker_id]?.name || "Someone";
      const target = players[pl.target_id]?.name || "an opponent";
      const symbol = { hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠" }[pl.suit] || "";
      const card = byRank(pl.ranks).map((r) => `${r}${symbol}`).join(", ");
      const setName = `${tr(pl.suit)} ${tr(pl.set_type)}`;
      const why = pl.mistake === "own_card" ? `but already had it` : `with no ${setName} card in hand`;
      const nextName = players[pl.next_turn]?.name;
      get().removeMessageByTag(`ask-${pl.asker_id}`);
      get().addMessage({ player_id: pl.asker_id, variant: "event_bad",
        title: tr("Wrong ask! {name}, the {card}?", { name: target, card }),
        text: `${pl.mistake === "own_card" ? tr("Already had it") : tr("No {set} card in hand", { set: setName })}. ${tr("{set} goes to Team {team} (+{pts}).", { set: setName, team: pl.owner_team, pts: pl.points })}` });
      get().setGameMessage("WRONG ASK", [
        `Who: ${asker} → ${target}`,
        `Asked: ${card} (${pl.mistake === "own_card" ? "already in their hand" : "no card of that set"})`,
        `Penalty: ${setName} to Team ${pl.owner_team}`,
        ...(nextName ? [`Next Turn: ${nextName}`] : []),
      ]);
      if (pl.game_end?.game_ended) set({ gameResult: pl.game_end });
    }

    // LAYDOWN started
    if (msg.type === "laydown_started") {
      const s = msg.payload.state;
      // Arrows from each teammate named in the declaration to the declarer.
      const who = msg.payload.who_id, now = Date.now();
      const helpers = (msg.payload.collaborators || []).map((c) => c?.player_id).filter((pid) => pid && pid !== who);
      set({ state: s, pendingLay: msg.payload, flowArrows: [
        ...get().flowArrows.filter((a) => a.tone !== "lay"),
        ...helpers.map((pid) => ({ id: `lay-${now}-${pid}`, from: pid, to: who, tone: "lay", until: now + 15000 })),
      ] });
    }

    // LAYDOWN error
    if (msg.type === "laydown_error") {
      const s = msg.payload.state;
      set({ state: s, pendingLay: null });
      get().setGameMessage("LAYDOWN ERROR", [msg.payload.error]);
    }

    // LAYDOWN result (animate & celebrate / cry)
    if (msg.type === "laydown_result") {
      const s = msg.payload.state;

      // Show laydown animation first, even if game ends
      if (Array.isArray(msg.payload.contributors) && msg.payload.contributors.length) {
        try {
          window.dispatchEvent(new CustomEvent("lay_anim", {
            detail: { contributors: msg.payload.contributors, suit: msg.payload.suit, set_type: msg.payload.set_type, success:msg.payload.success, points: msg.payload.set_type === "lower" ? 20 : 30, team: msg.payload.owner_team }
          }));
        } catch {}
      }

      // Keep the final declaration on the same success/failure path as every other set.
      if (msg.payload.game_end?.game_ended) {
        set({ gameResult: msg.payload.game_end });
      }

      // Every laydown, including the final set, gets its declaration result.
      set({ state: s, phase: s.phase, pendingLay: null });
      {
        // Keep the contributor arrows a little longer, then show where the turn went.
        const now = Date.now(), who = msg.payload.who_id;
        let arrows = get().flowArrows.map((a) => (a.tone === "lay" ? { ...a, until: now + 4500 } : a));
        if (!arrows.some((a) => a.tone === "lay")) {
          arrows = [...arrows, ...(msg.payload.contributors || []).map((c) => c.player_id)
            .filter((pid) => pid && pid !== who && s.players?.[pid]?.team === s.players?.[who]?.team)
            .map((pid) => ({ id: `lay-${now}-${pid}`, from: pid, to: who, tone: "lay", until: now + 4500 }))];
        }
        if ((s.game_mode === "turns" || s.voice_turns) && s.phase === "playing" && !s.pending_handoff && s.turn_player && s.turn_player !== who) {
          arrows = [...arrows.filter((a) => a.tone !== "turn"),
            { id: `turn-${now}`, from: who, to: s.turn_player, tone: "turn", label: "Turn", start: now + 4500, until: now + 11000 }];
        }
        set({ flowArrows: arrows });
      }

      const players = s.players || {};
      const whoName = players[msg.payload.who_id]?.name || "Unknown";
      const pts = msg.payload.set_type === "lower" ? 20 : 30;
      const setName = `${msg.payload.suit} ${setLabel(msg.payload.set_type)}`;

      // Prepare laydown data for display
      const contributors = msg.payload.contributors || [];
      const allCards = [];
      const cardsByPlayer = {};
      
      
      // Extract all cards and organize by player
      contributors.forEach(contributor => {
        const playerCards = contributor.cards || [];
        allCards.push(...playerCards);
        cardsByPlayer[contributor.player_id] = playerCards;
      });
      
      const laydownData = {
        success: msg.payload.success,
        suit: msg.payload.suit,
        setType: msg.payload.set_type,
        points: pts,
        team: msg.payload.owner_team,
        cards: allCards,
        contributors: contributors,
        cardsByPlayer: cardsByPlayer,
        claimedCards: msg.payload.claimed_cards || [],
        actualCards: msg.payload.actual_cards || [],
        declarationComparison: msg.payload.declaration_comparison || [],
        declaredBy: msg.payload.who_id,
        handoffEligible: msg.payload.handoff_eligible || []
      };

      if (msg.payload.success) {
        try { window.dispatchEvent(new CustomEvent("celebrate", { detail: { who_id: msg.payload.who_id } })); } catch {}
        // Success sound
        if (typeof window !== 'undefined') {
          import('./utils/sounds').then((m) => {
            try {
              if (typeof m.playKey === 'function') m.playKey('lay_success');
              else if (m.default && typeof m.default.playKey === 'function') m.default.playKey('lay_success');
            } catch {}
          }).catch(()=>{});
        }
        // Show laydown result modal with detailed information
        get().setLaydownResult(laydownData);
        
        get().addMessage({ player_id: msg.payload.who_id, kind: "laydown", variant: "event_good", title: tr("Laid down {set}!", { set: `${tr(msg.payload.suit)} ${tr(msg.payload.set_type)}` }), text: tr("+{pts} for Team {team}", { pts, team: msg.payload.owner_team }) });
        
        if (msg.payload?.who_id === get().me?.id && (msg.payload.handoff_eligible || []).length) {
          set({ handoffFor: { who_id: msg.payload.who_id, eligible: msg.payload.handoff_eligible } });
        } else {
          set({ handoffFor: null });
        }
      } else {
        try { window.dispatchEvent(new CustomEvent("cry", { detail: { who_id: msg.payload.who_id } })); } catch {}
        // Failure sound
        if (typeof window !== 'undefined') {
          import('./utils/sounds').then((m) => {
            try {
              if (typeof m.playKey === 'function') m.playKey('lay_unsuccess');
              else if (m.default && typeof m.default.playKey === 'function') m.default.playKey('lay_unsuccess');
            } catch {}
          }).catch(()=>{});
        }
        // Show laydown result modal with detailed information
        get().setLaydownResult(laydownData);
        
        get().addMessage({ player_id: msg.payload.who_id, kind: "laydown", variant: "event_bad", title: tr("Laydown failed: {set}", { set: `${tr(msg.payload.suit)} ${tr(msg.payload.set_type)}` }), text: tr("Goes to Team {team}", { team: msg.payload.owner_team }) });
        
        set({ handoffFor: null });
      }
    }

    // HANDOFF
    if (msg.type === "handoff_result") {
      const s = msg.payload.state;
      set({ state: s, handoffFor: null });
      if (msg.payload.ok !== false && msg.payload.from_id && msg.payload.turn_player && msg.payload.from_id !== msg.payload.turn_player) {
        const now = Date.now();
        set({ flowArrows: [...get().flowArrows.filter((a) => a.tone !== "turn"),
          { id: `turn-${now}`, from: msg.payload.from_id, to: msg.payload.turn_player, tone: "turn", label: "Turn", until: now + 6000 }] });
      }
      const players = s.players || {};
      const toName = players[msg.payload.turn_player]?.name || "teammate";
      const fromName = players[msg.payload.from_id || get().me?.id]?.name || "Player";
      get().setGameMessage("HANDOFF", [`From: ${fromName}`, `To: ${toName}`]);
    }


    // CARDS PASSED
    if (msg.type === "cards_passed") {
      const s = msg.payload.state;
      set({ state: s });
      
      // Check for game end first
      if (msg.payload.game_end?.game_ended) {
        set({ gameResult: msg.payload.game_end });
        return; // Don't process other card passing logic if game ended
      }
      
      const players = s.players || {};
      const fromName = players[msg.payload.from_player]?.name || "Player";
      const toName = players[msg.payload.to_player]?.name || "Player";
      const cardCount = msg.payload.cards?.length || 0;
      
      // Trigger passing animation
      try {
        const detail = { 
          from_player: msg.payload.from_player, 
          to_player: msg.payload.to_player, 
          cards: msg.payload.cards 
        };
        window.dispatchEvent(new CustomEvent("pass_anim", { detail }));
      } catch (e) {
        console.error('Failed to dispatch card pass_anim event:', e);
      }
      // Pass sound
      if (typeof window !== 'undefined') {
        import('./utils/sounds').then((m) => {
          try {
            if (typeof m.playKey === 'function') m.playKey('pass');
            else if (m.default && typeof m.default.playKey === 'function') m.default.playKey('pass');
          } catch {}
        }).catch(()=>{});
      }
      
      get().setGameMessage("CARDS PASSED", [
        `From: ${fromName}`,
        `To: ${toName}`,
        `Cards: ${cardCount}`
      ], msg.payload.cards);
    }

    // Server rejected an action (e.g. an ask in Turn Play)
    if (msg.type === "error" && msg.payload?.message) {
      get().showToast('error', 'Not allowed', msg.payload.message);
    }

    // PASS CARDS ERROR
    if (msg.type === "pass_cards_error") {
      const s = msg.payload.state;
      set({ state: s });
      get().setGameMessage("PASS CARDS ERROR", [msg.payload.error]);
    }


    // NEW GAME STARTED
    if (msg.type === "new_game_started") {
      const s = msg.payload.state;
      const players = s.players || {};
      const originalDealerName = players[msg.payload.original_dealer_id]?.name || "Unknown";
      get().setGameMessage("NEW GAME", [`Dealt by: ${originalDealerName}`, "Dealing cards..."]);
      
      // Update game state immediately
      set({ 
        state: s, 
        phase: s.phase, 
        gameResult: null
      });
      
      // Trigger dealing animation
      const dealingData = {
        id: msg.payload.animation_id,
        dealerSeat: msg.payload.original_dealer_seat ?? msg.payload.dealer_seat,
        dealerId: msg.payload.original_dealer_id || msg.payload.dealer_id,
        // who may skip the animation: the dealer, or a seated player when a bot dealt
        skipperId: msg.payload.skip_allowed_id || msg.payload.original_dealer_id || msg.payload.dealer_id,
        players: s.players || {},
        seats: s.seats || {},
        dealingSequence: msg.payload.dealing_sequence || []
      };
      set({ dealingAnimation: dealingData });
      
      // Clear animation after it completes
      setTimeout(() => {
        if (get().dealingAnimation !== dealingData) return;
        set({ dealingAnimation: null });
        get().setGameMessage("NEW GAME", [`Dealt by: ${originalDealerName}`, "Cards dealt to all players"]);
      }, SHUFFLE_DURATION + DEAL_DURATION + DEAL_COMPLETE_BUFFER);
    }

    if (msg.type === "deal_animation_skipped" && msg.payload.animation_id === get().dealingAnimation?.id) {
      stopCardFoley();
      set({ dealingAnimation: null });
    }

    // ABORT REQUESTED
    if (msg.type === "abort_requested") {
      const s = msg.payload.state;
      set({ state: s, abortVoting: msg.payload });
      const players = s.players || {};
      const requesterName = players[msg.payload.requester_id]?.name || "Unknown";
      get().setGameMessage("ABORT REQUESTED", [
        `${requesterName} wants to abort the game`,
        `Team A: ${msg.payload.team_a_yes || 0}/1, Team B: ${msg.payload.team_b_yes || 0}/1 needed`
      ]);
    }

    // ABORT VOTE CAST
    if (msg.type === "abort_vote_cast") {
      const s = msg.payload.state;
      set({ state: s, abortVoting: msg.payload });
      const players = s.players || {};
      const voterName = players[msg.payload.voter_id]?.name || "Unknown";
      const voteText = msg.payload.vote ? "YES" : "NO";
      get().setGameMessage("ABORT VOTE", [
        `${voterName} voted ${voteText}`,
        `Team A: ${msg.payload.team_a_yes || 0}/1, Team B: ${msg.payload.team_b_yes || 0}/1 needed`
      ]);
    }

    // GAME ABORTED
    if (msg.type === "game_aborted") {
      const s = msg.payload.state;
      set({ state: s, phase: s.phase, gameResult: null, abortVoting: null });
      
      // Set the voting result modal data for successful abort
      set({ 
        votingResult: {
          type: 'success',
          message: msg.payload.message || "Game aborted successfully!",
          details: ["The game has been aborted.", "Ready for a new game."],
          requester_id: msg.payload.requester_id
        }
      });
      
      get().setGameMessage("GAME ABORTED", ["Game has been aborted", "Ready for new game"]);
    }

    // VOTING FAILED
    if (msg.type === "voting_failed") {
      const s = msg.payload.state;
      set({ state: s, abortVoting: null, backToLobbyVoting: null });
      
      // Determine the type of failure for the modal
      let modalType = 'failed';
      if (msg.payload.reason === 'timeout') {
        modalType = 'timeout';
      } else if (msg.payload.reason === 'insufficient_support') {
        modalType = 'failed';
      }
      
      // Set the voting result modal data
      set({ 
        votingResult: {
          type: modalType,
          message: msg.payload.message,
          details: msg.payload.details || [],
          requester_id: msg.payload.requester_id
        }
      });
      
      get().setGameMessage("VOTING FAILED", [msg.payload.message]);
    }

    // NEW ROUND STARTED
    if (msg.type === "match_finished") {
      set({ state: msg.payload.state, gameResult: msg.payload.result });
    }

    if (msg.type === "new_round_started") {
      const s = msg.payload.state;
      set({ state: s, phase: s.phase, gameResult: null });
      const players = s.players || {};
      const dealerName = players[msg.payload.dealer_id]?.name || "Unknown";
      get().setGameMessage("NEW ROUND", [`Dealer: ${dealerName}`, "Ready for shuffle & deal"]);
    }

    // BACK TO LOBBY REQUESTED
    if (msg.type === "back_to_lobby_requested") {
      const s = msg.payload.state;
      set({ state: s, backToLobbyVoting: msg.payload });
      get().setGameMessage("BACK TO LOBBY VOTE", [
        `Voting to return to lobby`,
        `Team A: ${msg.payload.votes?.team_a_yes || 0}/1, Team B: ${msg.payload.votes?.team_b_yes || 0}/1 needed`
      ]);
    }

    // BACK TO LOBBY VOTE CAST
    if (msg.type === "back_to_lobby_vote_cast") {
      const s = msg.payload.state;
      set({ state: s, backToLobbyVoting: msg.payload });
      const players = s.players || {};
      const voterName = players[msg.payload.voter_id]?.name || "Unknown";
      const voteText = msg.payload.vote ? "YES" : "NO";
      get().setGameMessage("BACK TO LOBBY VOTE", [
        `${voterName} voted ${voteText}`,
        `Team A: ${msg.payload.votes?.team_a_yes || 0}/1, Team B: ${msg.payload.votes?.team_b_yes || 0}/1 needed`
      ]);
    }

    // BACK TO LOBBY SUCCESS
    if (msg.type === "back_to_lobby_success") {
      const s = msg.payload.state;
      set({ state: s, phase: s.phase, backToLobbyVoting: null });
      get().setGameMessage("RETURNED TO LOBBY", [
        "Game ended by majority vote",
        "All players returned to lobby"
      ]);
      
      // Show toast notification
    }

    // BACK TO LOBBY FAILED
    if (msg.type === "back_to_lobby_failed") {
      const s = msg.payload.state;
      set({ state: s, backToLobbyVoting: null });
      get().setGameMessage("BACK TO LOBBY VOTE", [
        "Voting failed",
        msg.payload.message || "Game continues"
      ]);
      
      // Show toast notification
    }

    // SHUFFLE DEAL ERROR
    if (msg.type === "shuffle_deal_error") {
      get().setGameMessage("ERROR", [msg.payload.message]);
    }

    // PLAYER UNASSIGNED
    if (msg.type === "player_unassigned") {
      const s = msg.payload.state;
      set({ state: s });
      get().setGameMessage("ADMIN ACTION", [msg.payload.message]);
    }

    // UNASSIGN FAILED
    if (msg.type === "unassign_failed") {
      get().setGameMessage("ADMIN ERROR", [msg.payload.message]);
    }

    // BUBBLE MESSAGE
    if (msg.type === "bubble_message") {
      const { player_id, variant, ...data } = msg.payload;
      
      if (variant === "chat") {
        // Chat messages are temporary and auto-expire
        const timestamp = Date.now();
        get().addMessage({
          player_id,
          variant,
          ...data,
          sticky: false,
          tag: `chat-${player_id}-${timestamp}` // Unique tag for each chat message
        });
        
        // Auto-remove chat messages after 5 seconds
        setTimeout(() => {
          get().removeMessageByTag(`chat-${player_id}-${timestamp}`);
        }, 5000);
      } else {
        // Other messages (laydown, etc.) are sticky
        get().addMessage({
          player_id,
          variant,
          ...data,
          sticky: true,
          tag: `laydown-${player_id}` // Tag for clearing
        });
      }
    }

    // RECONNECT: bring back bubbles that are still in progress (laydowns, an open ask)
    if (msg.type === "bubble_replay") {
      const { bubbles = [], pending_ask } = msg.payload || {};
      bubbles.forEach(({ player_id, variant, ...data }) => {
        get().addMessage({ player_id, variant, ...data, sticky: true, silent: true, tag: `laydown-${player_id}` });
      });
      if (pending_ask) {
        const rank = pending_ask.ranks?.[0];
        get().removeMessageByTag(`ask-${pending_ask.asker_id}`);
        get().addMessage({
          player_id: pending_ask.asker_id,
          target_id: pending_ask.target_id,
          variant: "ask",
          text: "Do you have…",
          card: rank && pending_ask.suit ? { suit: pending_ask.suit, rank } : undefined,
          cards: byRank(pending_ask.ranks).map((r) => ({ suit: pending_ask.suit, rank: r })),
          sticky: true, silent: true,
          tag: `ask-${pending_ask.asker_id}`,
        });
      }
    }

    // CLEAR BUBBLE MESSAGES
    if (msg.type === "clear_bubble_messages") {
      const { player_id } = msg.payload;
      get().removeMessageByTag(`laydown-${player_id}`);
    }

    // EMOJI ANIMATION
    if (msg.type === "emoji_animation") {
      const { from_player_id, to_player_id, emoji, emoji_name, category } = msg.payload;
      get().addEmojiAnimation({
        from_player_id,
        to_player_id,
        emoji,
        emoji_name,
        category
      });
      
      // Play sound effect (imported dynamically to avoid SSR issues)
      if (typeof window !== 'undefined') {
        import('./utils/sounds').then(({ default: emojiSoundManager }) => {
          console.log('Playing sound for emoji:', emoji);
          emojiSoundManager.playSound(emoji);
        }).catch((error) => {
          console.debug('Sound system not available:', error);
        });
      }
    }

    // PLAYER DISCONNECTED
    if (msg.type === "player_disconnected") {
      get().stopSpeaking(msg.payload.player_id);
      const s = msg.payload.state;
      set({ state: s });
      const players = s.players || {};
      const playerName = players[msg.payload.player_id]?.name || msg.payload.player_name || "Unknown";
      
      // Check if player was completely removed (lobby phase) or just marked as disconnected (game phase)
      const playerStillExists = msg.payload.player_id in players;
      
      if (playerStillExists) {
        // Player still exists but is disconnected (game phase)
        get().setGameMessage("PLAYER DISCONNECTED", [
          `${playerName} has disconnected`,
          "They can reconnect to continue playing"
        ]);
        get().showToast("disconnect", "Player Disconnected", `${playerName} has disconnected`);
      } else {
        // Player was completely removed (lobby phase)
        get().setGameMessage("PLAYER LEFT", [
          `${playerName} has left the lobby`,
          "Their seat is now available"
        ]);
        get().showToast("info", "Player Left", `${playerName} has left the lobby`);
      }
    }

    // PLAYER RECONNECTED
    if (msg.type === "player_reconnected") {
      console.debug("[Store] Received player_reconnected message:", msg.payload);
      const s = msg.payload.state;
      set({ state: s });
      const playerName = msg.payload.player_name || "Unknown";
      
      console.debug("[Store] Showing reconnection notification for:", playerName);
      get().setGameMessage("PLAYER RECONNECTED", [
        `${playerName} has reconnected`,
        "Welcome back!"
      ]);
      get().showToast("success", "Player Reconnected", `${playerName} has reconnected`);
    }

    // GAME STARTED - trigger navigation for all players
    if (msg.type === "game_started") {
      const s = msg.payload.state;
      set({ state: s, phase: s.phase });
      get().setGameMessage("GAME STARTED", ["Game has begun!", "All players joining table..."]);
      
      // Trigger navigation to game room for all players
      setTimeout(() => {
        const currentPath = window.location.pathname;
        const roomId = s.room_id;
        const me = get().me;
        
        if (me && roomId) {
          // Save player data to localStorage for persistence
          localStorage.setItem(`player_${me.id}`, JSON.stringify(me));
          
          // Navigate to game room if not already there
          if (!currentPath.includes(`/room/${roomId}/${me.id}`)) {
            // Use React Router navigation instead of window.location.href to avoid WebSocket disconnection
            // Dispatch a custom event that components can listen to for navigation
            window.dispatchEvent(new CustomEvent('navigate-to-game', {
              detail: { roomId, playerId: me.id }
            }));
          }
        }
      }, 1000);
    }

    // SPECTATOR APPROVED
    if (msg.type === "spectator_approved") {
      const s = msg.payload.state;
      set({ state: s });
      const spectatorName = msg.payload.spectator_name || "Unknown";
      get().setGameMessage("SPECTATOR APPROVED", [
        `${spectatorName} has been approved as a spectator`,
        "They can now view all player hands"
      ]);
    }

    // SPECTATOR REJECTED
    if (msg.type === "spectator_rejected") {
      const s = msg.payload.state;
      set({ state: s });
      const spectatorName = msg.payload.spectator_name || "Unknown";
      get().setGameMessage("SPECTATOR REJECTED", [
        `${spectatorName} has been rejected`,
        "They have been removed from the room"
      ]);
    }

    // SPECTATOR PASS CARDS RESULT
    if (msg.type === "spectator_pass_cards_result") {
      const s = msg.payload.state;
      if (s) set({ state: s });
      const success = msg.payload.success;
      const fromName = msg.payload.from_name || "Unknown";
      const toName = msg.payload.to_name || "Unknown";
      const cardCount = msg.payload.cards?.length || 0;
      
      if (success) {
        get().setGameMessage("SPECTATOR CARD PASS", [
          `Spectator passed ${cardCount} card${cardCount !== 1 ? 's' : ''}`,
          `From: ${fromName} → To: ${toName}`
        ]);
      } else {
        get().setGameMessage("SPECTATOR PASS ERROR", [msg.payload.error || "Failed to pass cards"]);
        get().showToast("error", "Pass Failed", msg.payload.error || "Failed to pass cards");
      }
    }
  },
}));

function teamYes(votes, players, team) {
  return Object.entries(votes || {}).filter(([pid, v]) => v && players[pid]?.team === team && !String(pid).startsWith("ai_")).length;
}
function syncVotes(st, get, set) {
  const players = st.players || {};
  const inGame = st.phase !== "lobby";
  const lobbyVotes = inGame ? st.back_to_lobby_votes || {} : {};
  const abortVotes = inGame ? st.abort_votes || {} : {};
  const { backToLobbyVoting, abortVoting } = get();
  const next = {};
  if (Object.keys(lobbyVotes).length) {
    if (!backToLobbyVoting) next.backToLobbyVoting = { votes: {
      yes: Object.values(lobbyVotes).filter(Boolean).length, total: Object.keys(players).length,
      team_a_yes: teamYes(lobbyVotes, players, "A"), team_b_yes: teamYes(lobbyVotes, players, "B") } };
  } else if (backToLobbyVoting) next.backToLobbyVoting = null;
  if (Object.keys(abortVotes).length) {
    if (!abortVoting) next.abortVoting = { abort_votes: abortVotes, requester_id: Object.keys(abortVotes)[0],
      votes_for_abort: Object.values(abortVotes).filter(Boolean).length,
      team_a_yes: teamYes(abortVotes, players, "A"), team_b_yes: teamYes(abortVotes, players, "B") };
  } else if (abortVoting) next.abortVoting = null;
  if (Object.keys(next).length) set(next);
}

// Table cues: the turn spotlight moving, your turn, an ask aimed at you, a pause.
useStore.subscribe((s, prev) => {
  const a = s.state, b = prev.state;
  if (!a || !b || a.phase !== 'playing' || b.phase !== 'playing') return;
  const me = s.me?.id;
  if (a.turn_player && b.turn_player && a.turn_player !== b.turn_player) playCue(a.turn_player === me ? 'my_turn' : 'turn');
  const ask = a.pending_ask;
  if (ask && ask.target_id === me && (!b.pending_ask || b.pending_ask.target_id !== me)) playCue('asked_me');
  if (!!a.paused_by !== !!b.paused_by) playCue(a.paused_by ? 'pause' : 'resume');
});
