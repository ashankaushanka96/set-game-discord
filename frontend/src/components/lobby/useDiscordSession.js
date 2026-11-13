import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../../store";
import { connectWS, send } from "../../ws";
import { apiJoinRoom } from "../../api";
import { generateUUID } from "../../utils/uuid";
import { readyDiscordSDK } from "../../utils/discordSdkSingleton";
import { subscribeSpeaking, resolveChannelId } from "../../utils/discordVoice";
import { discordAvatarUrl } from "../../utils/discord";
import { getStoredDiscordToken, storeDiscordToken, clearStoredDiscordToken, fetchDiscordUser } from "../../utils/discordAuth";
import { getMobileInfo } from "../../utils/mobileDetection";
import { guildNicknameCache, guildNicknameRetryTimers, resolveDisplayNameWithGuildNickname, scheduleGuildNicknameRetry } from "../../utils/discordProfile";

// Everything Discord in the lobby: signing in (Activity SDK or browser OAuth), the player's profile,
// voice (who is talking), joining the channel's room, and sending a player with a seat back to their game.
export default function useDiscordSession() {
  const navigate = useNavigate();
  const { me, setMe, setWS, setRoom, roomId, state, applyServer } = useStore();

  const [usingDiscordProfile, setUsingDiscordProfile] = useState(false);
  const authRanRef = useRef(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [isDiscordEmbedded, setIsDiscordEmbedded] = useState(false);
  const [canBrowserOAuth, setCanBrowserOAuth] = useState(false);
  const [redirectingToGame, setRedirectingToGame] = useState(false);
  const [checkingReconnection, setCheckingReconnection] = useState(true);
  const autoJoinGuardRef = useRef(false);
  const isDiscordUA = /Discord/i.test(navigator.userAgent || "");

  useEffect(() => {
    return () => {
      guildNicknameRetryTimers.forEach((timer) => clearTimeout(timer));
      guildNicknameRetryTimers.clear();
    };
  }, []);

  // Ensure we have voice scope and subscribe to speaking events once profile is loaded
  useEffect(() => {
    if (!profileLoaded) return;
    let cancelled = false;

    const ensureVoiceSubscriptions = async () => {
      try {
        const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID || "1416307116918181931";
        const discordSdk = await readyDiscordSDK(clientId);
        if (!discordSdk) return;

        // Authenticate SDK with any stored token first
        try {
          const t = getStoredDiscordToken();
          if (t?.access_token) {
            await discordSdk.commands.authenticate({ access_token: t.access_token });
          }
        } catch {}

        // Try to subscribe; if it fails (likely missing scope), upgrade token then retry
        const trySubscribe = () => subscribeSpeaking(discordSdk, { strict: true });

        try {
          await trySubscribe();
          if (!cancelled) console.debug('[Discord] Speaking subscriptions active');
          return;
        } catch (subErr) {
          console.debug('[Discord] Speaking subscribe failed, attempting re-auth with rpc.voice.read:', subErr);
        }

        // Re-authorize with rpc.voice.read and retry
        try {
          const { code } = await discordSdk.commands.authorize({
            client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
            response_type: 'code',
            state: crypto.randomUUID(),
            scope: ['identify', 'rpc.voice.read', 'guilds.members.read'],
            prompt: 'consent',
          });
          const tokenRes = await fetch(`/api/v1/discord/exchange`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code })
          });
          if (tokenRes.ok) {
            const { access_token } = await tokenRes.json();
            storeDiscordToken(access_token);
            await discordSdk.commands.authenticate({ access_token });
            await trySubscribe();
              if (!cancelled) console.debug('[Discord] Speaking subscriptions active after re-auth');
          } else {
            console.warn('[Discord] Voice re-auth token exchange failed');
          }
        } catch (e) {
          console.debug('[Discord] Voice re-auth not available:', e);
        }
      } catch {}
    };

    ensureVoiceSubscriptions();
    return () => { cancelled = true; };
  }, [profileLoaded]);

  const fetchUserWithToken = async (accessToken) => {
    try {
      console.debug("[Discord] Fetching user data with stored token...");
      const result = await fetchDiscordUser(accessToken);
      
      if (result.error) {
        if (result.error === 'TOKEN_EXPIRED') {
          console.debug("[Discord] Token expired, clearing stored token");
          clearStoredDiscordToken();
          return false;
        }
        throw new Error(result.error);
      }
      
      const meUser = result;
      const fallbackDisplayName = meUser.global_name || meUser.username || '';
      let displayName = fallbackDisplayName;
      displayName = await resolveDisplayNameWithGuildNickname(meUser.id, displayName);
      const avatarUrl = discordAvatarUrl(meUser.id, meUser.avatar, 128);
      
      setUsingDiscordProfile(Boolean(avatarUrl));
      setName(displayName);
      setAvatar(avatarUrl);
      const cur = useStore.getState().me || {};
      // Use Discord user ID as player ID for consistent reconnection
      const updatedMe = { ...cur, id: meUser.id, name: displayName, avatar: avatarUrl };
      setMe(updatedMe);
      console.debug('[Discord] Updated profile from stored token with Discord ID:', updatedMe);
      if (displayName === fallbackDisplayName && !guildNicknameCache.has(meUser.id)) {
        scheduleGuildNicknameRetry({
          userId: meUser.id,
          fallbackName: fallbackDisplayName,
          discordSdk: undefined,
          apply: (nickname) => {
            setName(nickname);
            const current = useStore.getState().me || {};
            setMe({ ...current, name: nickname, avatar: avatarUrl });
          },
        });
      }
      return true;
    } catch (error) {
      console.error("[Discord] Failed to fetch user with stored token:", error);
      clearStoredDiscordToken();
      return false;
    }
  };

  // We always use Discord for profile; start empty until loaded
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [error, setError] = useState("");

  // ensure per-tab identity - use Discord user ID if available
  useEffect(() => {
    try { localStorage.removeItem('player_profile'); } catch {}
    // Use Discord user ID as player ID for consistent reconnection
    const playerId = me?.id || generateUUID();
    setMe({ id: playerId, name, avatar });
    console.debug("[Lobby] Player ID set:", playerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If not embedded in Discord and no OAuth code, auto-redirect to Discord authorize
  useEffect(() => {
    try {
      const ref = (document.referrer || '').toLowerCase();
      const ao = window.location.ancestorOrigins;
      const ancestors = ao && ao.length ? Array.from(ao).join(' ').toLowerCase() : '';
      const combined = `${ref} ${ancestors}`;
      // Discord mobile clients don't expose discord.com as referrer/ancestor, so also
      // detect the Activity proxy host and the frame_id query param Discord always adds.
      const isActivity = window.location.hostname.endsWith('discordsays.com') || new URLSearchParams(window.location.search).has('frame_id');
      const isEmbedded = isActivity || combined.includes('discord.com') || combined.includes('ptb.discord.com') || combined.includes('canary.discord.com');
      if (isEmbedded || isDiscordUA) return; // handled by SDK flow below

      const url = new URL(window.location.href);
      const hasCode = url.searchParams.get('code');
      if (!hasCode) {
        const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
        if (!clientId) return;
        
        // Detect mobile device for better OAuth handling
        const mobileInfo = getMobileInfo();
        console.debug("[Discord] Browser OAuth - Mobile info:", mobileInfo);
        
        const redirectUri = encodeURIComponent(`${window.location.origin}${window.location.pathname}?from=discord`);
        const scopes = encodeURIComponent('identify rpc.voice.read guilds.members.read');
        const authUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&response_type=code&scope=${scopes}&redirect_uri=${redirectUri}`;
        
        if (mobileInfo.isMobile) {
          console.debug("[Discord] Mobile browser OAuth redirect to:", authUrl);
        }
        
        window.location.href = authUrl;
      }
    } catch (_) {
      // ignore
    }
  }, []);

  // Initialize Discord SDK and get user info via OAuth
  useEffect(() => {
    console.debug("[Lobby] Discord useEffect called");
    let cancelled = false;
    (async () => {
      try {
        console.debug("[Discord] Discord auth useEffect triggered");
        console.debug("[Discord] Current state:", { name, avatar, usingDiscordProfile, profileLoaded });
        if (authRanRef.current) {
          console.debug("[Discord] Discord auth already in progress, skipping duplicate run");
          return;
        }
        authRanRef.current = true;
        console.debug("[Discord] Starting Discord auth flow...");

        // First, check if we have a valid stored token
        const storedToken = getStoredDiscordToken();
        if (storedToken) {
          console.debug("[Discord] Found stored token, attempting to use it...");
          const success = await fetchUserWithToken(storedToken.access_token);
          if (success) {
            console.debug("[Discord] Successfully loaded profile from stored token");
            setProfileLoaded(true);
            return;
          }
          console.debug("[Discord] Stored token failed, proceeding with fresh auth...");
        }

        const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID || "1416307116918181931";
        console.debug("[Discord] Client ID:", clientId);
        if (!clientId) {
          console.warn("[Discord] VITE_DISCORD_CLIENT_ID missing");
          setProfileLoaded(true);
          return;
        }

        console.debug("[Discord] Initializing Discord SDK with clientId:", clientId);
        const discordSdk = await readyDiscordSDK(clientId);
        if (!discordSdk) throw new Error("Discord SDK not available");
        console.debug("[Discord] SDK ready");
        // Determine embed state
        try {
          const ref = (document.referrer || '').toLowerCase();
          const ao = window.location.ancestorOrigins;
          const ancestors = ao && ao.length ? Array.from(ao).join(' ').toLowerCase() : '';
          const combined = `${ref} ${ancestors}`;
          const embedded = combined.includes('discord.com') || combined.includes('ptb.discord.com') || combined.includes('canary.discord.com');
          setIsDiscordEmbedded(embedded || Boolean(discordSdk.channelId));
        } catch (_) {}
        
        // Removed: ad-hoc test user fetch. We only update the UI
        // when we have authenticated, real Discord user data.

        // Check if we're in Discord environment
        console.debug("[Discord] Platform:", discordSdk.platform);
        console.debug("[Discord] Guild ID:", discordSdk.guildId);
        console.debug("[Discord] Channel ID:", discordSdk.channelId);

        // Check if we're actually in Discord (any Discord platform is valid)
        // Include mobile platforms: iOS, Android, and other potential mobile identifiers
        const validDiscordPlatforms = ['web', 'desktop', 'canary', 'ptb', 'ios', 'android', 'mobile'];
        console.debug("[Discord] Platform validation - Current platform:", discordSdk.platform);
        console.debug("[Discord] Valid platforms:", validDiscordPlatforms);
        
        // Detect if we're on a mobile device
        const mobileInfo2 = getMobileInfo();
        console.debug("[Discord] Mobile device info:", mobileInfo2);
        
        if (!validDiscordPlatforms.includes(discordSdk.platform)) {
          console.warn("[Discord] Not running in Discord environment, platform:", discordSdk.platform);
          if (mobileInfo2.isMobile) {
            console.warn("[Discord] Mobile device detected with unknown platform. This might be a mobile Discord app.");
            console.warn("[Discord] Proceeding with authentication flow...");
          } else {
            console.warn("[Discord] This might be a mobile platform not yet recognized. Proceeding with auth anyway...");
          }
          // Don't return early - try to proceed with authentication even on unknown platforms
          // This handles cases where Discord adds new platform identifiers
        }
        
        // Skip setting any temporary values; wait for real Discord data
        console.debug("[Discord] Skipping temporary test values; awaiting real Discord profile...");
        
        console.debug("[Discord] Running in Discord environment:", discordSdk.platform);
        
        console.debug("[Discord] Continuing with Discord auth...");

        // Try different approaches to get user data
        let user = null;
        
        // First, let's see what methods are available
        try { console.debug("[Discord] Available commands:", Object.keys(discordSdk.commands)); } catch {}

        // If we have a stored token, authenticate the SDK so voice events are permitted
        try {
          const t = getStoredDiscordToken();
          if (t?.access_token) {
            await discordSdk.commands.authenticate({ access_token: t.access_token });
            console.debug('[Discord] SDK authenticated with stored token');
          }
        } catch (e) { console.debug('[Discord] SDK authenticate with stored token failed (non-fatal):', e); }

        // Subscribe to speaking events when available
        try { await subscribeSpeaking(discordSdk); } catch (e) { console.debug('[Discord] Speaking subscriptions unavailable:', e); }
        console.debug("[Discord] Starting user data retrieval...");
        const mobileInfo3 = getMobileInfo();
        console.debug("[Discord] Mobile detection info:", mobileInfo3);
        
        // Let's try a simple test first - just try to get any user data
        console.debug("[Discord] Testing Discord SDK functionality...");
        try {
          // Try to get the current user ID from various sources
          console.debug("[Discord] SDK properties:", {
            userId: discordSdk.userId,
            user: discordSdk.user,
            instanceId: discordSdk.instanceId,
            platform: discordSdk.platform,
            channelId: discordSdk.channelId,
            guildId: discordSdk.guildId
          });
          
          // Try to get user ID from the SDK instance
          const currentUserId = discordSdk.userId || discordSdk.user?.id || discordSdk.instanceId;
          console.debug("[Discord] Current user ID from SDK:", currentUserId);
          
          if (currentUserId) {
            console.debug("[Discord] Trying getUser with ID:", currentUserId);
            user = await discordSdk.commands.getUser({ id: currentUserId });
            console.debug("[Discord] Got user with ID:", user);
          } else {
            console.debug("[Discord] No user ID available from SDK context, will try OAuth");
            throw new Error("No user ID available from SDK context");
          }
        } catch (error) {
          console.debug("[Discord] Direct getUser with ID failed:", error);
          
          // Try OAuth flow as last resort
          try {
            console.debug("[Discord] Starting OAuth flow...");
            console.debug("[Discord] Calling discordSdk.commands.authorize...");
            console.debug("[Discord] OAuth parameters:", {
              client_id: clientId,
              response_type: "code",
              scope: ["identify", "rpc.voice.read", "guilds.members.read"],
              prompt: "consent"
            });
            
            const { code } = await discordSdk.commands.authorize({
              client_id: clientId,
              response_type: "code",
              state: crypto.randomUUID(),
              scope: ["identify", "rpc.voice.read", "guilds.members.read"],
              prompt: "consent",
            });
            console.debug("[Discord] OAuth authorization successful, got code:", code);

            // Exchange code for access token
            console.debug("[Discord] Exchanging code for access token...");
            const tokenRes = await fetch(`/api/v1/discord/exchange`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code }),
            });
            
            if (!tokenRes.ok) {
              const errorText = await tokenRes.text();
              throw new Error(`Discord token exchange failed: ${errorText}`);
            }
            
            const { access_token } = await tokenRes.json();
            console.debug("[Discord] Token exchange successful");

            // Store the token for future use
            storeDiscordToken(access_token);

            // Authenticate SDK first so we can try SDK-based user fetch
            try { 
              await discordSdk.commands.authenticate({ access_token }); 
              console.debug('[Discord] SDK authenticate succeeded after token exchange'); 
            } catch (e) { 
              console.debug('[Discord] SDK authenticate failed (will try REST users/@me fallback):', e); 
            }

            // Prefer SDK getUser with the authenticated context
            let meUser = null;
            try {
              const sdkUserId = discordSdk.userId || discordSdk.user?.id;
              if (sdkUserId) {
                console.debug('[Discord] Trying SDK getUser with id:', sdkUserId);
                meUser = await discordSdk.commands.getUser({ id: sdkUserId });
                console.debug('[Discord] SDK getUser succeeded');
              }
            } catch (e) {
              console.debug('[Discord] SDK getUser failed after auth, will try REST users/@me:', e);
            }

            // Fallback to REST users/@me if SDK path failed
            if (!meUser) {
              console.debug("[Discord] Fetching /users/@me with access token as fallback...");
              const meRes = await fetch('https://discord.com/api/users/@me', {
                headers: { Authorization: `Bearer ${access_token}` },
              });
              if (!meRes.ok) {
                const t = await meRes.text();
                throw new Error(`users/@me failed: ${t}`);
              }
              meUser = await meRes.json();
            }
            const fallbackDisplayName = meUser.global_name || meUser.username || '';
            let displayName = fallbackDisplayName;
            displayName = await resolveDisplayNameWithGuildNickname(meUser.id, displayName, discordSdk);
            const avatarUrl = discordAvatarUrl(meUser.id, meUser.avatar, 128);
            setUsingDiscordProfile(Boolean(avatarUrl));
            setName(displayName);
            setAvatar(avatarUrl);
            const cur = useStore.getState().me || {};
            // Use Discord user ID as player ID for consistent reconnection
            const updatedMe = { ...cur, id: meUser.id, name: displayName, avatar: avatarUrl };
            setMe(updatedMe);
            console.debug('[Discord] Updated profile from REST with Discord ID:', updatedMe);
            if (!cancelled && displayName === fallbackDisplayName && !guildNicknameCache.has(meUser.id)) {
              scheduleGuildNicknameRetry({
                userId: meUser.id,
                fallbackName: fallbackDisplayName,
                discordSdk,
                guard: () => cancelled,
                apply: (nickname) => {
                  if (cancelled) return;
                  setName(nickname);
                  const current = useStore.getState().me || {};
                  setMe({ ...current, name: nickname, avatar: avatarUrl });
                },
              });
            }

            // SDK is already authenticated above (best-effort). Proceed to subscriptions.

            // After authenticate, (re)subscribe to speaking events with channel context
            try { await subscribeSpeaking(discordSdk); } catch (e) { console.debug('[Discord] Speaking subscribe post-auth failed (non-fatal):', e); }

            // Auto-join Discord channel as room when embedded
            try {
              // Resolve channel id via SDK or getChannel()
              let channelId = await resolveChannelId(discordSdk);
              if (channelId) {
                const rid = String(channelId);
                console.debug('[Discord] Auto-joining channel as room:', rid);
                setRoom(rid);
                await httpJoinRoom(rid);
                const playerIdNow = useStore.getState().me?.id || updatedMe.id;
                const ws = connectWS(rid, playerIdNow, applyServer);
                setWS(ws);
                setTimeout(() => send(ws, 'sync', {}), 150);
                console.debug('[Discord] Successfully auto-joined room:', rid);
              } else {
                console.debug('[Discord] No channel ID available for auto-join');
              }
            } catch (joinErr) {
              console.error('[Discord] Auto-join channel as room failed:', joinErr);
              setError(`Failed to auto-join room: ${joinErr.message}`);
            }

            // Done; skip the rest of the older code path
            setProfileLoaded(true);
            return;
          } catch (error3) {
            console.error("[Discord] OAuth flow also failed:", error3);
            
            // If we're on mobile and Discord SDK OAuth failed, try browser OAuth as fallback
            if (mobileInfo2.isMobile) {
              console.warn("[Discord] Mobile Discord SDK OAuth failed, attempting browser OAuth fallback...");
              setCanBrowserOAuth(true);
              setProfileLoaded(true);
              return;
            }
            
            throw error3;
          }
        }

        if (cancelled) return;

        if (!user) {
          console.error("[Discord] No user data received from Discord SDK");
          setProfileLoaded(true);
          return;
        }

        // Use Discord user data
        console.debug("[Discord] Raw user data:", user);
        console.debug("[Discord] User properties:", {
          id: user.id,
          username: user.username,
          global_name: user.global_name,
          avatar: user.avatar,
          discriminator: user.discriminator
        });
        
        const fallbackDisplayName = user.global_name || user.username || `Player ${Math.random().toString(16).slice(2, 6)}`;
        let displayName = fallbackDisplayName;
        displayName = await resolveDisplayNameWithGuildNickname(user.id, displayName, discordSdk);
        const avatarUrl = discordAvatarUrl(user.id, user.avatar, 128);

        console.debug("[Discord] Setting profile:", { displayName, avatarUrl });
        console.debug("[Discord] Final display name:", displayName);
        console.debug("[Discord] Final avatar URL:", avatarUrl);

        console.debug("[Discord] About to update state with:", { displayName, avatarUrl });
        
        // Only mark as using Discord profile if we have a URL/avatar
        setUsingDiscordProfile(Boolean(avatarUrl));
        setName(displayName);
        setAvatar(avatarUrl);
        
        console.debug("[Discord] Profile state updated:", { 
          usingDiscordProfile: true, 
          name: displayName, 
          avatar: avatarUrl 
        });
        
        // Update store immediately
        const cur = useStore.getState().me || {};
        // Use Discord user ID as player ID for consistent reconnection
        // When using Discord SDK getUser(), the variable is `user` (not `meUser`).
        const updatedMe = { ...cur, id: user.id, name: displayName, avatar: avatarUrl };
        setMe(updatedMe);
        console.debug("[Discord] Store updated with Discord ID:", updatedMe);
        if (!cancelled && displayName === fallbackDisplayName && !guildNicknameCache.has(user.id)) {
          scheduleGuildNicknameRetry({
            userId: user.id,
            fallbackName: fallbackDisplayName,
            discordSdk,
            guard: () => cancelled,
            apply: (nickname) => {
              if (cancelled) return;
              setName(nickname);
              const current = useStore.getState().me || {};
              setMe({ ...current, name: nickname, avatar: avatarUrl });
            },
          });
        }

        // If already in a room, upsert profile on server and optionally via WS
        try {
          const ridNow = useStore.getState().roomId;
          if (ridNow) {
            console.debug("[Discord] Upserting profile to server for room", ridNow);
            await apiJoinRoom(ridNow, {
              id: updatedMe.id,
              name: displayName,
              avatar: avatarUrl,
            });
            const wsNow = useStore.getState().ws;
            if (wsNow) {
              send(wsNow, "update_player", {
                player_id: updatedMe.id,
                name: displayName,
                avatar: avatarUrl,
              });
            }
          }
        } catch (e) {
          console.warn("[Discord] Upsert to server failed (ignore if not joined yet):", e);
        }

        // Also auto-join if we have a channel id in SDK
        try {
          // Resolve channel id via SDK or getChannel()
          let channelId = await resolveChannelId(discordSdk);
          if (channelId) {
            const rid = String(channelId);
            console.debug('[Discord] Post-auth auto-joining channel as room:', rid);
            setRoom(rid);
            await httpJoinRoom(rid);
            const playerIdNow2 = useStore.getState().me?.id || updatedMe.id;
            const ws = connectWS(rid, playerIdNow2, applyServer);
            setWS(ws);
            setTimeout(() => send(ws, 'sync', {}), 150);
            console.debug('[Discord] Successfully post-auth auto-joined room:', rid);
          } else {
            console.debug('[Discord] No channel ID available for post-auth auto-join');
          }
        } catch (e) {
          console.error('[Discord] Post-auth auto-join failed:', e);
          setError(`Failed to auto-join room: ${e.message}`);
        }
        // Mark profile as loaded after auto-join attempt completes
        setProfileLoaded(true);
      } catch (e) {
        console.error("[Discord] Discord auth failed:", e);
        setUsingDiscordProfile(false);
        setProfileLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Browser (non-embedded) OAuth fallback
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID || "";
    if (!clientId) return;
    if (!code) return;

    let cancelled = false;
    (async () => {
      try {
        // Exchange code with backend
        const redirectUriRaw = window.location.origin + window.location.pathname + '?from=discord';
        const tokenRes = await fetch(`/api/v1/discord/exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, redirect_uri: redirectUriRaw }),
        });
        if (!tokenRes.ok) {
          console.error('[Discord] Browser OAuth: token exchange failed', await tokenRes.text());
          return;
        }
        const { access_token } = await tokenRes.json();
        
        // Store the token for future use
        storeDiscordToken(access_token);
        
        // Fetch user
        const userRes = await fetch('https://discord.com/api/users/@me', {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        if (!userRes.ok) {
          console.error('[Discord] Browser OAuth: user fetch failed', await userRes.text());
          return;
        }
        const user = await userRes.json();
        if (cancelled) return;

        const fallbackDisplayName = user.global_name || user.username || name;
        let displayName = fallbackDisplayName;
        displayName = await resolveDisplayNameWithGuildNickname(user.id, displayName);
        const avatarUrl = discordAvatarUrl(user.id, user.avatar, 128);
        setUsingDiscordProfile(Boolean(avatarUrl));
        setName(displayName);
        setAvatar(avatarUrl);
        if (!cancelled && displayName === fallbackDisplayName && !guildNicknameCache.has(user.id)) {
          scheduleGuildNicknameRetry({
            userId: user.id,
            fallbackName: fallbackDisplayName,
            discordSdk: undefined,
            guard: () => cancelled,
            apply: (nickname) => {
              if (cancelled) return;
              setName(nickname);
              const current = useStore.getState().me || {};
              setMe({ ...current, name: nickname, avatar: avatarUrl });
            },
          });
        }
        setProfileLoaded(true);

        // Clean the URL
        url.searchParams.delete('code');
        url.searchParams.delete('from');
        window.history.replaceState({}, '', url.toString());
      } catch (err) {
        console.error('[Discord] Browser OAuth failed', err);
      }
    })();
    return () => { cancelled = true };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for navigation events from the store
  useEffect(() => {
    const handleNavigateToGame = (event) => {
      const { roomId, playerId } = event.detail;
      if (roomId && playerId) {
        navigate(`/room/${roomId}/${playerId}`);
      }
    };

    window.addEventListener("navigate-to-game", handleNavigateToGame);
    return () => {
      window.removeEventListener("navigate-to-game", handleNavigateToGame);
    };
  }, [navigate]);

  useEffect(() => {
    console.debug("[State] Name/avatar changed:", { name, avatar, usingDiscordProfile });
    const currentMe = useStore.getState().me;
    // Preserve the Discord user ID when updating name/avatar
    setMe({ ...currentMe, name, avatar });
    // No local persistence: always use Discord values
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, avatar, usingDiscordProfile]);

  // Auto-join room when profile is loaded and we have a Discord channel ID
  useEffect(() => {
    if (autoJoinGuardRef.current) return;
    if (profileLoaded && name && !roomId && isDiscordEmbedded) {
      console.debug("[Discord] Profile loaded, attempting auto-join with stored Discord channel ID...");
      // Try to get channel ID from Discord SDK if available
      const tryAutoJoin = async () => {
        try {
          const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
          if (clientId) {
            const discordSdk = await readyDiscordSDK(clientId);
            // Get channel via SDK or getChannel()
            let channelId = await resolveChannelId(discordSdk);
            if (channelId) {
              const rid = String(channelId);
              console.debug('[Discord] Fallback auto-join with channel ID:', rid);
              setRoom(rid);
              await httpJoinRoom(rid);
              const playerIdNow3 = useStore.getState().me?.id;
              const ws = connectWS(rid, playerIdNow3, applyServer);
              setWS(ws);
              setTimeout(() => send(ws, 'sync', {}), 150);
              console.debug('[Discord] Successfully fallback auto-joined room:', rid);
              autoJoinGuardRef.current = true;
            }
          }
        } catch (e) {
          console.warn('[Discord] Fallback auto-join failed:', e);
        }
      };
      tryAutoJoin();
    }
  }, [profileLoaded, name, roomId, isDiscordEmbedded]);

  // Direct auto-join attempt when component mounts (for debugging)
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 5;
    
    const attemptDirectAutoJoin = async () => {
      try {
        console.debug(`[Discord] Direct auto-join attempt #${retryCount + 1} on component mount...`);
        const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
        if (!clientId) {
          console.debug("[Discord] No client ID available for direct auto-join");
          return;
        }

        const discordSdk = await readyDiscordSDK(clientId);
        
        console.debug("[Discord] Direct auto-join - SDK ready, checking channel ID...");
        console.debug("[Discord] Direct auto-join - Channel ID:", discordSdk.channelId);
        console.debug("[Discord] Direct auto-join - Platform:", discordSdk.platform);
        console.debug("[Discord] Direct auto-join - Guild ID:", discordSdk.guildId);
        
        // Resolve channel id via SDK or getChannel()
        let channelId = await resolveChannelId(discordSdk);
        if (!autoJoinGuardRef.current && channelId && !roomId) {
          const rid = String(channelId);
          console.debug('[Discord] Direct auto-join with channel ID:', rid);
          
          // Check if we have profile data
          const currentMe = useStore.getState().me;
          if (currentMe && currentMe.name) {
            console.debug('[Discord] Direct auto-join - Profile available:', currentMe);
            setRoom(rid);
            await httpJoinRoom(rid);
            const ws = connectWS(rid, currentMe.id, applyServer);
            setWS(ws);
            setTimeout(() => send(ws, 'sync', {}), 150);
            console.debug('[Discord] Successfully direct auto-joined room:', rid);
            autoJoinGuardRef.current = true;
            return; // Success, no need to retry
          } else {
            console.debug('[Discord] Direct auto-join - No profile available yet, will retry later');
          }
        } else if (!channelId) {
          console.debug('[Discord] Direct auto-join - No channel ID available');
        } else if (roomId) {
          console.debug('[Discord] Direct auto-join - Already in room:', roomId);
          return; // Already in room, no need to retry
        }
        
        // If we get here and haven't succeeded, retry if we haven't exceeded max retries
        retryCount++;
        if (retryCount < maxRetries) {
          console.debug(`[Discord] Direct auto-join retry #${retryCount + 1} in 2 seconds...`);
          setTimeout(attemptDirectAutoJoin, 2000);
        } else {
          console.warn('[Discord] Direct auto-join failed after maximum retries');
        }
      } catch (e) {
        console.error('[Discord] Direct auto-join failed:', e);
        retryCount++;
        if (retryCount < maxRetries) {
          console.debug(`[Discord] Direct auto-join retry #${retryCount + 1} in 2 seconds after error...`);
          setTimeout(attemptDirectAutoJoin, 2000);
        }
      }
    };

    // Try direct auto-join after a short delay to ensure everything is initialized
    const timer = setTimeout(attemptDirectAutoJoin, 1000);
    return () => clearTimeout(timer);
  }, []); // Run once on mount

  async function httpJoinRoom(rid) {
    const player = {
      id: useStore.getState().me.id,
      name: useStore.getState().me.name,
      avatar: useStore.getState().me.avatar,
    };
    return await apiJoinRoom(rid, player);
  }

  // Check if current player has a seat in an active game and redirect them
  useEffect(() => {
    if (profileLoaded && state && me && roomId) {
      const currentPlayer = state.players[me.id];
      const hasSeat = currentPlayer && (typeof currentPlayer.seat === 'number' && currentPlayer.seat >= 0 || (currentPlayer.is_spectator && !currentPlayer.spectator_request_pending));
      const gameActive = state.phase === "ready" || state.phase === "playing" || state.phase === "ended";
      
      console.debug("[Lobby] Reconnection check:", {
        profileLoaded,
        hasState: !!state,
        hasMe: !!me,
        hasRoomId: !!roomId,
        meId: me?.id,
        currentPlayer: currentPlayer,
        hasSeat,
        gameActive,
        playerSeat: currentPlayer?.seat,
        playerTeam: currentPlayer?.team,
        phase: state.phase,
        allPlayers: Object.keys(state.players || {}),
        seats: state.seats,
        lobbyLocked: state?.lobby_locked
      });
      
      if (hasSeat && gameActive) {
        console.debug("[Lobby] Player has seat in active game, redirecting to game room");
        setRedirectingToGame(true);
        setCheckingReconnection(false);
        // Add a delay to ensure WebSocket is connected and state is synced
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('navigate-to-game', {
            detail: { roomId: state.room_id, playerId: me.id }
          }));
        }, 500); // Increased delay to ensure sync
      } else if (gameActive && !hasSeat) {
        console.debug("[Lobby] Game is active but player has no seat - showing lobby locked");
        console.debug("[Lobby] Player details:", {
          id: currentPlayer?.id,
          seat: currentPlayer?.seat,
          team: currentPlayer?.team,
          connected: currentPlayer?.connected
        });
        setCheckingReconnection(false);
      } else if (!gameActive) {
        console.debug("[Lobby] Game is not active - showing normal lobby");
        setCheckingReconnection(false);
      }
    }
  }, [profileLoaded, state, me, roomId]);

  return { profileLoaded, checkingReconnection, redirectingToGame, error, setError, name, avatar, isDiscordEmbedded, canBrowserOAuth, usingDiscordProfile };
}
