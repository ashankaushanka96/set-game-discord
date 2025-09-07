import { create } from "zustand";

function getMe() {
  try { return JSON.parse(sessionStorage.getItem("me") || "null"); }
  catch { return null; }
}
function setMeInSession(me) { sessionStorage.setItem("me", JSON.stringify(me)); }

let uid = 0;
const mid = () => `${Date.now()}-${uid++}`;

function cardTxt(c){ return c ? `${c.rank} of ${c.suit}` : ""; }
function setTxt(set_type){ return set_type === "lower" ? "Lower (2–7)" : "Upper (8–A)"; }

export const useStore = create((set, get) => ({
  me: getMe(),
  roomId: "",
  ws: null,
  state: null,
  phase: "lobby",

  // ask/laydown transient states
  pendingAsk: null,
  pendingLay: null,
  handoffFor: null,

  // speech bubbles (short) & toasts (if any)
  messages: [],

  // single game message (shows under buttons), auto-clears after 30s
  gameMessage: null,
  gameMessageTimer: null,

  setMe: (me) => { setMeInSession(me); set({ me }); },
  setWS: (ws) => set({ ws }),
  setRoom: (roomId) => set({ roomId }),

  // older small seat bubbles
  addMessage: (m) => {
    const withId = { ...m, id: mid() };
    set((state) => {
      const next = [...(state.messages || []), withId];
      return { messages: next.slice(Math.max(0, next.length - 8)) };
    });
    setTimeout(() => {
      set((state) => ({
        messages: (state.messages || []).filter((x) => x.id !== withId.id),
      }));
    }, 4000);
  },

  // NEW: single 30s game message
  setGameMessage: (text) => {
    const { gameMessageTimer } = get();
    if (gameMessageTimer) clearTimeout(gameMessageTimer);
    const timer = setTimeout(() => set({ gameMessage: null, gameMessageTimer: null }), 30000);
    set({ gameMessage: { id: mid(), text, ts: Date.now() }, gameMessageTimer: timer });
  },

  applyServer: (msg) => {
    // keep state in sync
    if (msg.type === "state" || msg.type === "dealt") {
      set({ state: msg.payload, phase: msg.payload.phase });
    }

    // --- ASK FLOW ---
    if (msg.type === "ask_started") {
      const s = msg.payload.state;
      set({ state: s });
      const rank = msg.payload.ranks?.[0];
      const suit = msg.payload.suit;
      const players = s.players || {};
      const asker = players[msg.payload.asker_id]?.name || "Unknown";
      const target = players[msg.payload.target_id]?.name || "Unknown";

      get().addMessage({ player_id: msg.payload.asker_id, variant: "ask", text: "Do you have this card?", card: { suit, rank } });
      get().setGameMessage(`🂠 ${asker} asks ${target}: ${rank} of ${suit}?`);
    }

    if (msg.type === "ask_pending") {
      set({ state: msg.payload.state, pendingAsk: msg.payload });
    }

    if (msg.type === "event" && msg.payload?.kind === "ask_no_card") {
      const s = msg.payload.state;
      set({ state: s, pendingAsk: null });
      const rank = msg.payload.ranks?.[0];
      const suit = msg.payload.suit;
      const players = s.players || {};
      const asker = players[msg.payload.asker_id]?.name || "Unknown";
      const target = players[msg.payload.target_id]?.name || "Unknown";

      get().addMessage({ player_id: msg.payload.target_id, variant: "no", text: "No.", card: { suit, rank } });
      get().setGameMessage(`🙅 ${target} does NOT have ${rank} of ${suit}. Turn passes to ${target}.`);
    }

    if (msg.type === "ask_result") {
      const s = msg.payload.state;
      set({ state: s, phase: s.phase, pendingAsk: null });

      const players = s.players || {};
      const asker = players[msg.payload.asker_id]?.name || "Unknown";
      const target = players[msg.payload.target_id]?.name || "Unknown";

      if (msg.payload.success) {
        const first = msg.payload.cards?.[0];
        const detail = { asker_id: msg.payload.asker_id, target_id: msg.payload.target_id, card: first ? { suit: first.suit, rank: first.rank } : null };
        get().addMessage({ player_id: msg.payload.target_id, variant: "yes", text: "Yes, I have.", card: first ? { suit: first.suit, rank: first.rank } : undefined });
        get().setGameMessage(`🔁 ${target} passes ${cardTxt(first)} to ${asker}. ${asker} continues.`);
        try { window.dispatchEvent(new CustomEvent("pass_anim", { detail })); } catch {}
      } else {
        // shouldn't hit because failure handled as no-card event, but keep text safe
        get().setGameMessage(`🙅 Pass failed. Turn changes.`);
      }
    }

    // --- LAYDOWN FLOW ---
    if (msg.type === "laydown_started") {
      const s = msg.payload.state;
      set({ state: s, pendingLay: msg.payload });
    }

    if (msg.type === "laydown_result") {
      const s = msg.payload.state;
      set({ state: s, phase: s.phase, pendingLay: null });

      // animation from contributors → table (success or fail)
      if (Array.isArray(msg.payload.contributors) && msg.payload.contributors.length) {
        try {
          window.dispatchEvent(new CustomEvent("lay_anim", {
            detail: {
              contributors: msg.payload.contributors,
              suit: msg.payload.suit,
              set_type: msg.payload.set_type
            }
          }));
        } catch {}
      }

      const players = s.players || {};
      const whoName = players[msg.payload.who_id]?.name || "Unknown";
      const pts = msg.payload.set_type === "lower" ? 20 : 30;
      const setName = `${msg.payload.suit} ${setTxt(msg.payload.set_type)}`;

      if (msg.payload.success) {
        // celebration overlay for everyone
        try { window.dispatchEvent(new CustomEvent("celebrate", { detail: { who_id: msg.payload.who_id } })); } catch {}
        get().setGameMessage(`🥳 ${whoName} laid down ${setName}! +${pts} to Team ${msg.payload.owner_team}. (Declaring player may hand off.)`);

        // show handoff chooser only to declaimer
        if (msg.payload?.who_id === get().me?.id && (msg.payload.handoff_eligible || []).length) {
          set({ handoffFor: { who_id: msg.payload.who_id, eligible: msg.payload.handoff_eligible } });
        } else {
          set({ handoffFor: null });
        }
      } else {
        // sad overlay for everyone
        try { window.dispatchEvent(new CustomEvent("cry", { detail: { who_id: msg.payload.who_id } })); } catch {}
        const nextId = s.turn_player;
        const nextName = players[nextId]?.name || "next player";
        get().setGameMessage(`😢 Wrong declaration by ${whoName}. ${setName} awarded to Team ${msg.payload.owner_team} (+${pts}). Turn → ${nextName}.`);
        set({ handoffFor: null });
      }
    }

    // --- HANDOFF after success ---
    if (msg.type === "handoff_result") {
      const s = msg.payload.state;
      set({ state: s, handoffFor: null });
      const players = s.players || {};
      const toName = players[msg.payload.turn_player]?.name || "teammate";
      get().setGameMessage(`🎯 Turn handed off to ${toName}.`);
    }
  },
}));
