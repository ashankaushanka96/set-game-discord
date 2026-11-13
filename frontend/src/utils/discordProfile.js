// Discord profile helpers: the player's server nickname (falls back to their Discord name).
import { readyDiscordSDK } from "./discordSdkSingleton";
import { getStoredDiscordToken } from "./discordAuth";

export const guildNicknameCache = new Map();
export const guildNicknameRetryTimers = new Map();


export async function resolveDisplayNameWithGuildNickname(userId, fallbackName, discordSdk) {
  if (!userId) return fallbackName;
  const cached = guildNicknameCache.get(userId);

  try {
    let sdk = discordSdk;
    if (!sdk) {
      const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID || '1416307116918181931';
      if (!clientId) return cached || fallbackName;
      sdk = await readyDiscordSDK(clientId);
    }

    const tokenData = getStoredDiscordToken();
    const accessToken = tokenData?.access_token;
    if (accessToken) {
      try {
        await sdk.commands.authenticate({ access_token: accessToken });
      } catch (authError) {
        console.warn('[Discord] SDK authenticate for nickname lookup failed', authError);
      }
    }

    const canGetChannel = typeof sdk?.commands?.getChannel === 'function';
    const channelId = sdk?.channelId;
    console.log('[Discord] Resolving guild nickname', {
      userId,
      providedSdk: Boolean(discordSdk),
      readySdk: Boolean(sdk),
      canGetChannel,
      guildId: sdk?.guildId,
      channelId,
      cachedNickname: cached,
      hadToken: Boolean(accessToken),
    });
    let channelInfo = null;
    if (canGetChannel) {
      try {
        channelInfo = await sdk.commands.getChannel(channelId ? { channel_id: channelId } : undefined);
      } catch (channelErr) {
        console.warn('[Discord] getChannel for nickname lookup failed', channelErr);
      }
    }

    const voiceStates = channelInfo?.voice_states || [];
    if (voiceStates.length || channelInfo) {
      console.log('[Discord] Voice states for nickname check', {
        count: voiceStates.length,
        ids: voiceStates.map((vs) => vs?.user?.id).filter(Boolean),
      });
    }

    const meState = voiceStates.find((vs) => vs?.user?.id === userId);
    if (meState?.nick) {
      console.info('[Discord] Using guild nickname for player', {
        userId,
        nickname: meState.nick,
      });
      guildNicknameCache.set(userId, meState.nick);
      return meState.nick;
    }
    if (channelInfo?.member?.user?.id === userId && channelInfo.member.nick) {
      console.info('[Discord] Using guild nickname from channel member record', {
        userId,
        nickname: channelInfo.member.nick,
      });
      guildNicknameCache.set(userId, channelInfo.member.nick);
      return channelInfo.member.nick;
    }

    let guildIdForRest = channelInfo?.guild_id || sdk?.guildId;
    if (!guildIdForRest && channelInfo?.id && typeof sdk?.commands?.getChannel === 'function') {
      try {
        const channelDetails = await sdk.commands.getChannel({ channel_id: channelInfo.id });
        guildIdForRest = channelDetails?.guild_id || guildIdForRest;
      } catch (restChannelErr) {
        console.warn('[Discord] getChannel guild lookup failed', restChannelErr);
      }
    }

    if (guildIdForRest && accessToken) {
      try {
        const memberRes = await fetch(`https://discord.com/api/v10/users/@me/guilds/${guildIdForRest}/member`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (memberRes.ok) {
          const member = await memberRes.json();
          const restNickname = member?.nick || member?.user?.global_name || member?.user?.username;
          if (restNickname) {
            console.info('[Discord] Using guild nickname from REST member lookup', {
              userId,
              guildId: guildIdForRest,
              nickname: restNickname,
            });
            guildNicknameCache.set(userId, restNickname);
            return restNickname;
          }
        } else {
          console.warn('[Discord] Guild member REST lookup failed', {
            status: memberRes.status,
            guildId: guildIdForRest,
          });
        }
      } catch (restError) {
        console.error('[Discord] Guild member REST lookup threw', restError);
      }
    }

    if (cached) {
      console.log('[Discord] Reusing cached guild nickname', { userId, nickname: cached });
      return cached;
    }
    console.log('[Discord] Guild nickname not found in voice state; falling back to default name', { userId });
  } catch (err) {
    console.error('[Discord] Guild nickname lookup failed', {
      code: err?.code,
      message: err?.message,
      data: err?.data,
      name: err?.name,
    });
    if (cached) {
      console.log('[Discord] Returning cached guild nickname after error', { userId, nickname: cached });
      return cached;
    }
  }
  return fallbackName;
}



export function scheduleGuildNicknameRetry({ userId, fallbackName, discordSdk, guard, apply, delay = 1200, retries = 2 }) {
  if (typeof window === 'undefined') return;
  if (!userId) return;
  if (guildNicknameCache.has(userId)) return;
  if (guildNicknameRetryTimers.has(userId)) return;
  const timer = window.setTimeout(async () => {
    guildNicknameRetryTimers.delete(userId);
    if (guard?.()) return;
    const resolved = await resolveDisplayNameWithGuildNickname(userId, fallbackName, discordSdk);
    if (guard?.()) return;
    if (resolved && resolved !== fallbackName) {
      apply?.(resolved);
    } else if (!guildNicknameCache.has(userId) && retries > 0) {
      scheduleGuildNicknameRetry({ userId, fallbackName, discordSdk, guard, apply, delay, retries: retries - 1 });
    }
  }, delay);
  guildNicknameRetryTimers.set(userId, timer);
}
