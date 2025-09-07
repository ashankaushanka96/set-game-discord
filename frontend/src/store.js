import { create } from "zustand";

function getMe() {
  try { return JSON.parse(sessionStorage.getItem("me") || "null"); }
  catch { return null; }
}
function setMeInSession(me) { sessionStorage.setItem("me", JSON.stringify(me)); }

let uid = 0;
const msgId = () => `${Date.now()}-${uid++}`;

export const useStore = create((set, get) => ({
  me: getMe(),
  roomId: "",
  ws: null,
  state: null,
  phase: "lobby",

  pendingAsk: null,
  pendingLay: null,

  // handoff prompt (for declaimer)
  handoffFor: null,        // { who_id, eligible: [playerIds] }

  messages: [],
  toast: "",

  setMe: (me) => { setMeInSession(me); set({ me }); },
  setWS: (ws) => set({ ws }),
  setRoom: (roomId) => set({ roomId }),

  addMessage: (m) => {
    const withId = { ...m, id: msgId() };
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

  applyServer: (msg) => {
    if (msg.type === "state" || msg.type === "dealt") {
      set({ state: msg.payload, phase: msg.payload.phase });
    }

    if (msg.type === "ask_started") {
      const s = msg.payload.state;
      set({ state: s });
      const rank = msg.payload.ranks?.[0];
      const suit = msg.payload.suit;
      get().addMessage({ player_id: msg.payload.asker_id, variant: "ask", text: "Do you have this card?", card: { suit, rank } });
    }
    if (msg.type === "ask_pending") {
      set({ state: msg.payload.state, pendingAsk: msg.payload });
    }
    if (msg.type === "event" && msg.payload?.kind === "ask_no_card") {
      const s = msg.payload.state;
      set({ state: s, pendingAsk: null });
      const rank = msg.payload.ranks?.[0];
      const suit = msg.payload.suit;
      get().addMessage({ player_id: msg.payload.target_id, variant: "no", text: "No.", card: { suit, rank } });
    }
    if (msg.type === "ask_result") {
      const s = msg.payload.state;
      set({ state: s, phase: s.phase, pendingAsk: null });
      if (msg.payload.success) {
        const first = msg.payload.cards?.[0];
        const detail = { asker_id: msg.payload.asker_id, target_id: msg.payload.target_id, card: first ? { suit: first.suit, rank: first.rank } : null };
        get().addMessage({ player_id: msg.payload.target_id, variant: "yes", text: "Yes, I have.", card: first ? { suit: first.suit, rank: first.rank } : undefined });
        try { window.dispatchEvent(new CustomEvent("pass_anim", { detail })); } catch {}
      }
    }

    if (msg.type === "laydown_started") {
      const s = msg.payload.state;
      set({ state: s, pendingLay: msg.payload });
    }

    if (msg.type === "laydown_result") {
      const s = msg.payload.state;
      set({ state: s, phase: s.phase, pendingLay: null });
      if (msg.payload?.success && Array.isArray(msg.payload.contributors)) {
        try {
          window.dispatchEvent(new CustomEvent("lay_anim", { detail: { contributors: msg.payload.contributors, suit: msg.payload.suit, set_type: msg.payload.set_type } }));
        } catch {}
      }
      // show handoff prompt only to the declaimer
      if (msg.payload?.success && msg.payload.who_id === get().me?.id && (msg.payload.handoff_eligible || []).length) {
        set({ handoffFor: { who_id: msg.payload.who_id, eligible: msg.payload.handoff_eligible } });
      } else {
        set({ handoffFor: null });
      }
    }

    if (msg.type === "handoff_result") {
      set({ state: msg.payload.state, handoffFor: null });
    }
  },
}));
