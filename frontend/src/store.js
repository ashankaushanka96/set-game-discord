import { create } from "zustand";

function getMe() {
  try { return JSON.parse(sessionStorage.getItem("me") || "null"); }
  catch { return null; }
}
function setMeInSession(me) { sessionStorage.setItem("me", JSON.stringify(me)); }

let uid = 0;
const mid = () => `${Date.now()}-${uid++}`;

const setLabel = (t) => (t === "lower" ? "Lower (2–7)" : "Upper (8–A)");
const cardLabel = (c) => (c ? `${c.rank} of ${c.suit}` : "card");

export const useStore = create((set, get) => ({
  me: getMe(),
  roomId: "",
  ws: null,
  state: null,
  phase: "lobby",

  pendingAsk: null,
  pendingLay: null,
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
  _speakingTimers: {},

  // emoji animations
  emojiAnimations: [],

  // single game feed (bottom box)
  gameMessage: null,
  gameMessageTimer: null,

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
    // Auto-remove after animation completes
    setTimeout(() => {
      set((state) => ({
        emojiAnimations: (state.emojiAnimations || []).filter((a) => a.id !== withId.id),
      }));
    }, 2000);
    return withId.id;
  },

  // speaking helpers
  startSpeaking: (userId, ttlMs = 2000) => {
    if (!userId) return;
    const id = String(userId);
    set((state) => ({ speakingUsers: { ...state.speakingUsers, [id]: true } }));
    // auto-clear if no stop event arrives
    try {
      const timers = { ...(get()._speakingTimers || {}) };
      if (timers[id]) clearTimeout(timers[id]);
      timers[id] = setTimeout(() => {
        const s = get();
        const next = { ...(s.speakingUsers || {}) };
        delete next[id];
        set({ speakingUsers: next });
      }, ttlMs);
      set({ _speakingTimers: timers });
    } catch {}
  },
  stopSpeaking: (userId) => {
    if (!userId) return;
    const id = String(userId);
    set((state) => {
      const next = { ...(state.speakingUsers || {}) };
      delete next[id];
      return { speakingUsers: next };
    });
    try {
      const timers = { ...(get()._speakingTimers || {}) };
      if (timers[id]) {
        clearTimeout(timers[id]);
        delete timers[id];
        set({ _speakingTimers: timers });
      }
    } catch {}
  },

  // --- bottom message box ---
  setGameMessage: (title, lines) => {
    const text = Array.isArray(lines) ? lines.join("\n") : lines;
    const { gameMessageTimer } = get();
    if (gameMessageTimer) clearTimeout(gameMessageTimer);
    const timer = setTimeout(() => set({ gameMessage: null, gameMessageTimer: null }), 30000);
    set({ gameMessage: { id: mid(), title, text, ts: Date.now() }, gameMessageTimer: timer });
    
    // Also show as toast notification
    const toastType = get().getToastTypeFromTitle(title);
    get().showToast(toastType, title, text);
  },

  closeVotingResult: () => set({ votingResult: null }),

  showToast: (type, title, message) => set({ 
    toast: { type, title, message, id: mid() } 
  }),

  clearToast: () => set({ toast: null }),

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
    if (msg.type === "state" || msg.type === "dealt") {
      set({ state: msg.payload, phase: msg.payload.phase });
      
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

    // ASK started -> add ASK bubble (sticky until pass/NO)
    if (msg.type === "ask_started") {
      const s = msg.payload.state;
      set({ state: s });
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
        sticky: true,
        tag: `ask-${askerId}`,
      });
      // game feed header
      const players = s.players || {};
      const asker = players[askerId]?.name || "Unknown";
      const target = players[targetId]?.name || "Unknown";
      get().setGameMessage("ASK", [`Who: ${asker} → ${target}`, `What: ${rank} of ${suit}`]);
    }

    // ASK pending -> also store pendingAsk (used by ConfirmPassModal)
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

      const players = s.players || {};
      const asker = players[msg.payload.asker_id]?.name || "Unknown";
      const target = players[msg.payload.target_id]?.name || "Unknown";

      if (msg.payload.success) {
        const first = msg.payload.transferred?.[0];
        const detail = { asker_id: msg.payload.asker_id, target_id: msg.payload.target_id, card: first ? { suit: first.suit, rank: first.rank } : null };
        get().addMessage({ player_id: msg.payload.target_id, variant: "yes", text: "Yes, I have.", card: first ? { suit: first.suit, rank: first.rank } : undefined });
        get().setGameMessage("REPLY", [
          `Who: ${target} → ${asker}`,
          `Answer: YES (${cardLabel(first)})`,
          `Action: Card passed to ${asker}`,
          `Next Turn: ${asker} (continues)`
        ]);
        // Note: Ask-based card passing has been removed, this should not be called anymore
        console.warn('Ask-based pass_anim event attempted - this should not happen with new card passing system');
      } else {
        if (msg.payload.reason === "no_card") {
          const rank = msg.payload.ranks?.[0];
          const suit = msg.payload.suit;
          get().addMessage({ player_id: msg.payload.target_id, variant: "no", text: "No.", card: { suit, rank } });
          get().setGameMessage("REPLY", [
            `Who: ${target} → ${asker}`,
            `Answer: NO (${rank} of ${suit})`,
            `Next Turn: ${target}`
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

    // LAYDOWN started
    if (msg.type === "laydown_started") {
      const s = msg.payload.state;
      set({ state: s, pendingLay: msg.payload });
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
            detail: { contributors: msg.payload.contributors, suit: msg.payload.suit, set_type: msg.payload.set_type }
          }));
        } catch {}
      }

      // Check for game end after animation
      if (msg.payload.game_end?.game_ended) {
        // Delay ALL state updates to allow animation to show
        setTimeout(() => {
          set({ state: s, phase: s.phase, pendingLay: null, gameResult: msg.payload.game_end });
          // Play game over sound
          if (typeof window !== 'undefined') {
            import('./utils/sounds').then((m) => {
              try {
                if (typeof m.playKey === 'function') m.playKey('game_over');
                else if (m.default && typeof m.default.playKey === 'function') m.default.playKey('game_over');
              } catch {}
            }).catch(()=>{});
            
            // Add voice announcement after game over sound
            import('./utils/tts').then((tts) => {
              try {
                tts.speakGameOver(
                  msg.payload.game_end.winner,
                  msg.payload.game_end.team_a_score,
                  msg.payload.game_end.team_b_score
                );
              } catch {}
            }).catch(()=>{});
          }
        }, 1500); // Wait for laydown animation to complete (1000ms + 500ms buffer)
        return; // Don't process other laydown logic if game ended
      }

      // Normal laydown (not game ending) - update state immediately
      set({ state: s, phase: s.phase, pendingLay: null });

      const players = s.players || {};
      const whoName = players[msg.payload.who_id]?.name || "Unknown";
      const pts = msg.payload.set_type === "lower" ? 20 : 30;
      const setName = `${msg.payload.suit} ${setLabel(msg.payload.set_type)}`;

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
        const contribNames = (msg.payload.handoff_eligible || []).map(id => players[id]?.name).filter(Boolean);
        const handoffLine = contribNames.length ? `Handoff: available to ${contribNames.join(", ")}` : "Handoff: —";
        get().setGameMessage("LAYDOWN", [`Who: ${whoName}`, `Set: ${setName}`, `Points: +${pts} to Team ${msg.payload.owner_team}`, handoffLine]);
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
        const nextId = s.turn_player;
        const nextName = players[nextId]?.name || "next player";
        get().setGameMessage("LAYDOWN — WRONG", [`Who: ${whoName}`, `Set: ${setName}`, `Points: +${pts} to Team ${msg.payload.owner_team}`, `Next Turn: ${nextName}`]);
        set({ handoffFor: null });
      }
    }

    // HANDOFF
    if (msg.type === "handoff_result") {
      const s = msg.payload.state;
      set({ state: s, handoffFor: null });
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
      ]);
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
        dealerSeat: msg.payload.original_dealer_seat || msg.payload.dealer_seat,
        dealerId: msg.payload.original_dealer_id || msg.payload.dealer_id,
        players: s.players || {},
        seats: s.seats || {},
        dealingSequence: msg.payload.dealing_sequence || []
      };
      set({ dealingAnimation: dealingData });
      
      // Clear animation after it completes
      setTimeout(() => {
        set({ dealingAnimation: null });
        get().setGameMessage("NEW GAME", [`Dealt by: ${originalDealerName}`, "Cards dealt to all players"]);
      }, 12000);
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
      get().showToast("success", "Returned to Lobby", "Game ended by majority vote");
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
      get().showToast("info", "Vote Failed", "Not enough votes to return to lobby");
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
      get().showToast("success", "Spectator Approved", `${spectatorName} can now spectate`);
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
      get().showToast("info", "Spectator Rejected", `${spectatorName} was rejected`);
    }

    // SPECTATOR PASS CARDS RESULT
    if (msg.type === "spectator_pass_cards_result") {
      const s = msg.payload.state;
      set({ state: s });
      const success = msg.payload.success;
      const fromName = msg.payload.from_name || "Unknown";
      const toName = msg.payload.to_name || "Unknown";
      const cardCount = msg.payload.cards?.length || 0;
      
      if (success) {
        get().setGameMessage("SPECTATOR CARD PASS", [
          `Spectator passed ${cardCount} card${cardCount !== 1 ? 's' : ''}`,
          `From: ${fromName} → To: ${toName}`
        ]);
        get().showToast("success", "Cards Passed", `Spectator passed ${cardCount} card${cardCount !== 1 ? 's' : ''}`);
      } else {
        get().setGameMessage("SPECTATOR PASS ERROR", [msg.payload.error || "Failed to pass cards"]);
        get().showToast("error", "Pass Failed", msg.payload.error || "Failed to pass cards");
      }
    }
  },
}));
