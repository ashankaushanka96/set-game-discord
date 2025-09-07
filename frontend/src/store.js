import { create } from 'zustand';

// Use sessionStorage so each BROWSER TAB gets its own identity
function getMe() {
  try { return JSON.parse(sessionStorage.getItem('me') || 'null'); }
  catch { return null; }
}
function setMeInSession(me) {
  sessionStorage.setItem('me', JSON.stringify(me));
}

export const useStore = create((set) => ({
  me: getMe(),            // per-tab identity
  roomId: '',
  ws: null,
  state: null,
  phase: 'lobby',
  setMe: (me) => { setMeInSession(me); set({ me }); },
  setWS: (ws) => set({ ws }),
  setRoom: (roomId) => set({ roomId }),
  applyServer: (msg) => {
    if (msg.type === 'state' || msg.type === 'dealt') set({ state: msg.payload, phase: msg.payload.phase });
    if (msg.type === 'ask_result' || msg.type === 'laydown_result') set({ state: msg.payload.state, phase: msg.payload.state.phase });
  },
}));
