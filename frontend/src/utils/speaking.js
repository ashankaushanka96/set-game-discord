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

// Discord sometimes stops sending SPEAKING_START/STOP for a user after they mute and unmute
// mid-activity (a reload fixes it because it subscribes again). Watch voice state changes:
// when anyone mutes, clear their talking state; when they unmute, subscribe to speaking afresh.
let voiceWatch = null;
export async function watchVoiceState(discordSdk, Events, subArgs, onStart, onStop) {
  if (!discordSdk?.subscribe || voiceWatch) return;
  const muted = {};
  const resubscribe = async () => {
    for (const [ev, fn] of [[Events.SPEAKING_START, onStart], [Events.SPEAKING_STOP, onStop]]) {
      try { await discordSdk.unsubscribe?.(ev, fn, ...subArgs); } catch {}
      try { await discordSdk.subscribe(ev, fn, ...subArgs); } catch {}
    }
  };
  voiceWatch = async (e) => {
    const uid = e?.user?.id || e?.user_id;
    const vs = e?.voice_state || e;
    if (!uid || !vs) return;
    const isMuted = !!(vs.mute || vs.self_mute || vs.deaf || vs.self_deaf || vs.suppress);
    const was = muted[uid];
    muted[uid] = isMuted;
    if (isMuted) onStop({ user_id: uid });
    else if (was) resubscribe();
  };
  try { await discordSdk.subscribe(Events.VOICE_STATE_UPDATE || 'VOICE_STATE_UPDATE', voiceWatch, ...subArgs); }
  catch { voiceWatch = null; }
}
