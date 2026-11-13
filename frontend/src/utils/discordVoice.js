// Discord voice: who is talking. One place for the speaking subscriptions the lobby sets up.
import { Events } from "@discord/embedded-app-sdk";
import { useStore } from "../store";
import { watchVoiceState } from "./speaking";

/** The voice channel the Activity runs in (the SDK knows it on desktop; mobile needs getChannel). */
export async function resolveChannelId(discordSdk) {
  let channelId = discordSdk?.channelId;
  try {
    if (!channelId && discordSdk?.commands?.getChannel) {
      const ch = await discordSdk.commands.getChannel();
      channelId = ch?.id || channelId;
    }
  } catch { /* not available */ }
  return channelId || null;
}

const userOf = (e) => e?.user_id || e?.id || e?.user?.id;
// The same handler functions every time, so subscribing again doesn't stack duplicate listeners.
const onStart = (e) => { const uid = userOf(e); if (uid) useStore.getState().startSpeaking(String(uid)); };
const onStop = (e) => { const uid = userOf(e); if (uid) useStore.getState().stopSpeaking(String(uid)); };
const onVoiceState = (e) => { if (e && typeof e.speaking === "boolean") (e.speaking ? onStart : onStop)(e); };

/**
 * Subscribe to SPEAKING_START/STOP for the Activity's channel, plus the voice-state fallback some
 * platforms use, and the mute/unmute watcher. With strict, a failed speaking subscription throws
 * (so the caller can ask for the voice scope and try again); otherwise failures are ignored.
 */
export async function subscribeSpeaking(discordSdk, { strict = false } = {}) {
  if (typeof discordSdk?.subscribe !== "function") return;
  const channelId = await resolveChannelId(discordSdk);
  const subArgs = channelId ? [{ channel_id: channelId }] : [];
  for (const [ev, fn] of [[Events.SPEAKING_START, onStart], [Events.SPEAKING_STOP, onStop]]) {
    try { await discordSdk.subscribe(ev, fn, ...subArgs); }
    catch (e) { if (strict) throw e; }
  }
  try { await discordSdk.subscribe("VOICE_STATE_UPDATE", onVoiceState, ...subArgs); } catch { /* optional */ }
  watchVoiceState(discordSdk, Events, subArgs, onStart, onStop);
}
