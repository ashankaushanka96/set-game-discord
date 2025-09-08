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

  // seat bubbles
  messages: [],

  // single game feed (bottom box)
  gameMessage: null,
  gameMessageTimer: null,

  setMe: (me) => { setMeInSession(me); set({ me }); },
  setWS: (ws) => set({ ws }),
  setRoom: (roomId) => set({ roomId }),

  // --- seat bubbles helpers ---
  addMessage: (m) => {
    const withId = { ...m, id: mid() };
    set((state) => {
      const next = [...(state.messages || []), withId];
      return { messages: next.slice(Math.max(0, next.length - 12)) };
    });
    // auto-remove only if not sticky
    if (!m.sticky) {
      setTimeout(() => {
        set((state) => ({
          messages: (state.messages || []).filter((x) => x.id !== withId.id),
        }));
      }, 4000);
    }
    return withId.id;
  },
  removeMessageByTag: (tag) => {
    set((state) => ({
      messages: (state.messages || []).filter((m) => m.tag !== tag),
    }));
  },

  // --- bottom message box ---
  setGameMessage: (title, lines) => {
    const text = Array.isArray(lines) ? lines.join("\n") : lines;
    const { gameMessageTimer } = get();
    if (gameMessageTimer) clearTimeout(gameMessageTimer);
    const timer = setTimeout(() => set({ gameMessage: null, gameMessageTimer: null }), 30000);
    set({ gameMessage: { id: mid(), title, text, ts: Date.now() }, gameMessageTimer: timer });
  },

  applyServer: (msg) => {
    if (msg.type === "state" || msg.type === "dealt") {
      set({ state: msg.payload, phase: msg.payload.phase });
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
        try { window.dispatchEvent(new CustomEvent("pass_anim", { detail })); } catch {}
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

    // LAYDOWN result (animate & celebrate / cry)
    if (msg.type === "laydown_result") {
      const s = msg.payload.state;
      set({ state: s, phase: s.phase, pendingLay: null });

      if (Array.isArray(msg.payload.contributors) && msg.payload.contributors.length) {
        try {
          window.dispatchEvent(new CustomEvent("lay_anim", {
            detail: { contributors: msg.payload.contributors, suit: msg.payload.suit, set_type: msg.payload.set_type }
          }));
        } catch {}
      }

      const players = s.players || {};
      const whoName = players[msg.payload.who_id]?.name || "Unknown";
      const pts = msg.payload.set_type === "lower" ? 20 : 30;
      const setName = `${msg.payload.suit} ${setLabel(msg.payload.set_type)}`;

      if (msg.payload.success) {
        try { window.dispatchEvent(new CustomEvent("celebrate", { detail: { who_id: msg.payload.who_id } })); } catch {}
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
  },
}));
