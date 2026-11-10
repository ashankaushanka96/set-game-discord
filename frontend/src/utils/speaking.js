// Discord emits start/stop transitions, not a heartbeat while someone speaks.
// Keep the indicator active until an explicit stop or disconnect arrives.
export function createSpeakingActions(set) {
  return {
    startSpeaking(userId) {
      if (!userId) return;
      const id = String(userId);
      set(state => state.speakingUsers[id] ? state : {
        speakingUsers: { ...state.speakingUsers, [id]: true },
      });
    },
    stopSpeaking(userId) {
      if (!userId) return;
      const id = String(userId);
      set(state => {
        if (!state.speakingUsers[id]) return state;
        const next = { ...state.speakingUsers };
        delete next[id];
        return { speakingUsers: next };
      });
    },
  };
}
