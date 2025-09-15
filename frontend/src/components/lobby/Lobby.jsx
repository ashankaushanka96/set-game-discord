import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../../store";
import { connectWS, send } from "../../ws";
import { apiJoinRoom } from "../../api";
// Avatar selection removed; we always use Discord profile
import { Toast } from "../ui";
import { generateUUID } from "../../utils/uuid";
import { DiscordSDK }  from "@discord/embedded-app-sdk";
import { discordAvatarUrl } from "../../utils/discord";
import { getStoredDiscordToken, storeDiscordToken, clearStoredDiscordToken, fetchDiscordUser } from "../../utils/discordAuth";
import { isMobileDevice, getMobileInfo } from "../../utils/mobileDetection";

const API_BASE = import.meta.env.VITE_API_BASE ?? ""; // set in .env for prod; leave empty for Vite proxy in dev

export default function Lobby() {
  console.debug("[Lobby] Component loaded");
  const navigate = useNavigate();
  const { me, setMe, setWS, setRoom, roomId, state, applyServer } = useStore();

  const [usingDiscordProfile, setUsingDiscordProfile] = useState(false);
  const authRanRef = useRef(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [isDiscordEmbedded, setIsDiscordEmbedded] = useState(false);
  const [canBrowserOAuth, setCanBrowserOAuth] = useState(false);
  const [redirectingToGame, setRedirectingToGame] = useState(false);


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
      const displayName = meUser.global_name || meUser.username || '';
      const avatarUrl = discordAvatarUrl(meUser.id, meUser.avatar, 128);
      
      setUsingDiscordProfile(Boolean(avatarUrl));
      setName(displayName);
      setAvatar(avatarUrl);
      const cur = useStore.getState().me || {};
      // Use Discord user ID as player ID for consistent reconnection
      const updatedMe = { ...cur, id: meUser.id, name: displayName, avatar: avatarUrl };
      setMe(updatedMe);
      console.debug('[Discord] Updated profile from stored token with Discord ID:', updatedMe);
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
      const isEmbedded = combined.includes('discord.com') || combined.includes('ptb.discord.com') || combined.includes('canary.discord.com');
      if (isEmbedded) return; // handled by SDK flow below

      const url = new URL(window.location.href);
      const hasCode = url.searchParams.get('code');
      if (!hasCode) {
        const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
        if (!clientId) return;
        
        // Detect mobile device for better OAuth handling
        const mobileInfo = getMobileInfo();
        console.debug("[Discord] Browser OAuth - Mobile info:", mobileInfo);
        
        const redirectUri = encodeURIComponent(`${window.location.origin}${window.location.pathname}?from=discord`);
        const authUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&response_type=code&scope=identify&redirect_uri=${redirectUri}`;
        
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
          console.debug("[Discord] Discord auth already ran, skipping");
          setProfileLoaded(true);
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
        const discordSdk = new DiscordSDK(clientId);
        
        // Wait for Discord SDK to be ready
        console.debug("[Discord] Waiting for SDK to be ready...");
        await discordSdk.ready();
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
        
        // Add a delay to see if the test values appear in UI first
        console.debug("[Discord] Waiting 2 seconds before continuing with real Discord auth...");
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.debug("[Discord] Continuing with Discord auth after delay...");
        
        // No-op: don't override with placeholder values
        console.debug("[Discord] Continuing with Discord auth without placeholder overrides...");

        // Try different approaches to get user data
        let user = null;
        
        // First, let's see what methods are available
        console.debug("[Discord] Available commands:", Object.keys(discordSdk.commands));
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
              scope: ["identify"],
              prompt: "consent"
            });
            
            const { code } = await discordSdk.commands.authorize({
              client_id: clientId,
              response_type: "code",
              state: crypto.randomUUID(),
              scope: ["identify"],
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

            // Fetch the current user directly with the token and update UI immediately
            console.debug("[Discord] Fetching /users/@me with access token...");
            const meRes = await fetch('https://discord.com/api/users/@me', {
              headers: { Authorization: `Bearer ${access_token}` },
            });
            if (!meRes.ok) {
              const t = await meRes.text();
              throw new Error(`users/@me failed: ${t}`);
            }
            const meUser = await meRes.json();
            const displayName = meUser.global_name || meUser.username || '';
            const avatarUrl = discordAvatarUrl(meUser.id, meUser.avatar, 128);
            setUsingDiscordProfile(Boolean(avatarUrl));
            setName(displayName);
            setAvatar(avatarUrl);
            const cur = useStore.getState().me || {};
            // Use Discord user ID as player ID for consistent reconnection
            const updatedMe = { ...cur, id: meUser.id, name: displayName, avatar: avatarUrl };
            setMe(updatedMe);
            console.debug('[Discord] Updated profile from REST with Discord ID:', updatedMe);
            setProfileLoaded(true);

            // Also authenticate the SDK (optional, for other features)
            try {
              await discordSdk.commands.authenticate({ access_token });
              console.debug('[Discord] SDK authenticate succeeded');
            } catch (authErr) {
              console.warn('[Discord] SDK authenticate failed (non-fatal):', authErr);
            }

            // Auto-join Discord channel as room when embedded
            try {
              const channelId = discordSdk.channelId;
              if (channelId) {
                const rid = String(channelId);
                console.debug('[Discord] Auto-joining channel as room:', rid);
                setRoom(rid);
                await httpJoinRoom(rid);
                const ws = connectWS(rid, useStore.getState().me.id, applyServer);
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
        
        const displayName = user.global_name || user.username || `Player ${Math.random().toString(16).slice(2, 6)}`;
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
        const updatedMe = { ...cur, id: meUser.id, name: displayName, avatar: avatarUrl };
        setMe(updatedMe);
        console.debug("[Discord] Store updated with Discord ID:", updatedMe);

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

        setProfileLoaded(true);

        // Also auto-join if we have a channel id in SDK
        try {
          if (discordSdk.channelId) {
            const rid = String(discordSdk.channelId);
            console.debug('[Discord] Post-auth auto-joining channel as room:', rid);
            setRoom(rid);
            await httpJoinRoom(rid);
            const ws = connectWS(rid, useStore.getState().me.id, applyServer);
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

        const displayName = user.global_name || user.username || name;
        const avatarUrl = discordAvatarUrl(user.id, user.avatar, 128);
        setUsingDiscordProfile(Boolean(avatarUrl));
        setName(displayName);
        setAvatar(avatarUrl);
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
    if (profileLoaded && name && !roomId && isDiscordEmbedded) {
      console.debug("[Discord] Profile loaded, attempting auto-join with stored Discord channel ID...");
      // Try to get channel ID from Discord SDK if available
      const tryAutoJoin = async () => {
        try {
          const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
          if (clientId) {
            const discordSdk = new DiscordSDK(clientId);
            await discordSdk.ready();
            const channelId = discordSdk.channelId;
            if (channelId) {
              const rid = String(channelId);
              console.debug('[Discord] Fallback auto-join with channel ID:', rid);
              setRoom(rid);
              await httpJoinRoom(rid);
              const ws = connectWS(rid, useStore.getState().me.id, applyServer);
              setWS(ws);
              setTimeout(() => send(ws, 'sync', {}), 150);
              console.debug('[Discord] Successfully fallback auto-joined room:', rid);
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

        const discordSdk = new DiscordSDK(clientId);
        await discordSdk.ready();
        
        console.debug("[Discord] Direct auto-join - SDK ready, checking channel ID...");
        console.debug("[Discord] Direct auto-join - Channel ID:", discordSdk.channelId);
        console.debug("[Discord] Direct auto-join - Platform:", discordSdk.platform);
        console.debug("[Discord] Direct auto-join - Guild ID:", discordSdk.guildId);
        
        const channelId = discordSdk.channelId;
        if (channelId && !roomId) {
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

  const startGame = () => {
    const allPlayers = Object.values(state?.players || {});
    const connectedPlayers = allPlayers.filter((p) => p.connected !== false);
    const meRef = useStore.getState().me;

    console.debug(`[Start Game] Starting with ${connectedPlayers.length} real players`);

    // If we have fewer than 6 players, add AI players to fill up the seats
    if (connectedPlayers.length < 6) {
      const aiPlayersNeeded = 6 - connectedPlayers.length;
      console.debug(`[Start Game] Adding ${aiPlayersNeeded} AI players`);
      
      // Generate AI players
      const aiPlayers = [];
      const aiNames = ["Bot Alpha", "Bot Beta", "Bot Gamma", "Bot Delta", "Bot Epsilon", "Bot Zeta"];
      const aiAvatars = ["🤖", "👾", "🎮", "🎯", "⚡", "🔥"];
      
      // Calculate team distribution for AI players
      let teamACount = connectedPlayers.filter(p => p.team === "A").length;
      let teamBCount = connectedPlayers.filter(p => p.team === "B").length;
      
      for (let i = 0; i < aiPlayersNeeded; i++) {
        const aiId = `ai_${Date.now()}_${i}`;
        const aiName = aiNames[i] || `Bot ${i + 1}`;
        const aiAvatar = aiAvatars[i] || "🤖";
        
        // Assign teams to balance the teams (prefer smaller team)
        const aiTeam = teamACount <= teamBCount ? "A" : "B";
        
        // Update counts for next iteration
        if (aiTeam === "A") teamACount++;
        else teamBCount++;
        
        aiPlayers.push({
          id: aiId,
          name: aiName,
          avatar: aiAvatar,
          team: aiTeam,
          connected: true,
          isAI: true
        });
        
        // Add AI player to the game
        send(useStore.getState().ws, "add_ai_player", {
          player_id: aiId,
          name: aiName,
          avatar: aiAvatar,
          team: aiTeam
        });
      }
      
      console.debug(`[Start Game] Added AI players:`, aiPlayers);
    }

    // Auto-assign team for current player if not assigned
    const mePlayer = connectedPlayers.find((p) => p.id === meRef.id);
    if (mePlayer && !mePlayer.team) {
      // Auto-assign team A if no team selected
      send(useStore.getState().ws, "select_team", { player_id: meRef.id, team: "A" });
      setTimeout(() => {
        const playerData = useStore.getState().me;
        localStorage.setItem(`player_${playerData.id}`, JSON.stringify(playerData));
        send(useStore.getState().ws, "start", {});
      }, 200); // Slightly longer delay to ensure AI players are added
      return;
    }

    const playerData = useStore.getState().me;
    localStorage.setItem(`player_${playerData.id}`, JSON.stringify(playerData));
    send(useStore.getState().ws, "start", {});
  };


  const players = useMemo(() => {
    const allPlayers = Object.values(state?.players || {});
    if (state?.phase === "lobby") {
      return allPlayers.filter((p) => p.connected !== false);
    }
    return allPlayers;
  }, [state]);

  // Debug logging
  console.debug("[Lobby] State:", state);
  console.debug("[Lobby] Players:", players);
  console.debug("[Lobby] Lobby locked:", state?.lobby_locked);
  console.debug("[Lobby] Phase:", state?.phase);
  console.debug("[Lobby] Current player seat:", me ? state?.players[me.id]?.seat : "No me");
  console.debug("[Lobby] Has seat in active game:", me && state?.players[me.id]?.seat !== null && state?.players[me.id]?.seat !== undefined && (state?.phase === "ready" || state?.phase === "playing"));

  // Check if current player has a seat in an active game and redirect them
  useEffect(() => {
    if (profileLoaded && state && me && roomId) {
      const currentPlayer = state.players[me.id];
      const hasSeat = currentPlayer && currentPlayer.seat !== null && currentPlayer.seat !== undefined;
      const gameActive = state.phase === "ready" || state.phase === "playing";
      
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
      } else if (!gameActive) {
        console.debug("[Lobby] Game is not active - showing normal lobby");
      }
    }
  }, [profileLoaded, state, me, roomId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-transparent mb-2">
            Card Set Collection
          </h1>
          <p className="text-zinc-400 text-lg">Lobby</p>
        </div>

        {error && (
          <div className="mb-6 text-sm bg-rose-600/20 border border-rose-500/40 px-4 py-3 rounded-lg backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <span className="text-rose-400">⚠️</span>
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Loading Profile Screen */}
        {!profileLoaded && (
          <div className="bg-zinc-900/50 backdrop-blur-sm rounded-xl p-8 border border-zinc-700/50 text-center">
            <div className="max-w-md mx-auto">
              <div className="text-6xl mb-4 animate-pulse">🔄</div>
              <h2 className="text-2xl font-bold text-blue-400 mb-4">Loading Discord Profile</h2>
              <p className="text-zinc-300 mb-6">
                Please wait while we load your Discord profile information...
              </p>
              <div className="bg-blue-600/20 border border-blue-500/40 px-4 py-3 rounded-lg">
                <p className="text-sm text-blue-200">
                  This may take a few seconds
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Redirecting to Game Screen */}
        {redirectingToGame && (
          <div className="bg-zinc-900/50 backdrop-blur-sm rounded-xl p-8 border border-zinc-700/50 text-center">
            <div className="max-w-md mx-auto">
              <div className="text-6xl mb-4 animate-bounce">🎮</div>
              <h2 className="text-2xl font-bold text-green-400 mb-4">Rejoining Game</h2>
              <p className="text-zinc-300 mb-6">
                You have a seat in an active game. Redirecting you back to your game...
              </p>
              <div className="bg-green-600/20 border border-green-500/40 px-4 py-3 rounded-lg">
                <p className="text-sm text-green-200">
                  Please wait while we reconnect you to your game seat
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Lobby Locked Message */}
        {state?.lobby_locked && (
          <div className="mb-6 text-sm bg-amber-600/20 border border-amber-500/40 px-4 py-3 rounded-lg backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <span className="text-amber-400">🔒</span>
              <span>Lobby is locked - game in progress. New players cannot join until the game ends.</span>
            </div>
          </div>
        )}

        {/* Show lobby locked screen when game is in progress and player has no seat */}
        {profileLoaded && !redirectingToGame && (state?.lobby_locked === true || (state?.phase && state?.phase !== "lobby")) && !(me && state?.players[me.id]?.seat !== null && state?.players[me.id]?.seat !== undefined) ? (
          <div className="bg-zinc-900/50 backdrop-blur-sm rounded-xl p-8 border border-zinc-700/50 text-center">
            <div className="max-w-md mx-auto">
              <div className="text-6xl mb-4">🔒</div>
              <h2 className="text-2xl font-bold text-amber-400 mb-4">
                {state?.phase === "lobby" ? "Lobby Locked" : "Game In Progress"}
              </h2>
              <p className="text-zinc-300 mb-6">
                {state?.phase === "lobby" 
                  ? "A game is currently in progress in this room. New players cannot join until the current game ends."
                  : "A game is currently being played in this room. New players cannot join until the current game ends."
                }
              </p>
              <div className="bg-amber-600/20 border border-amber-500/40 px-4 py-3 rounded-lg">
                <p className="text-sm text-amber-200">
                  Please wait for the current game to finish, or join a different room.
                </p>
              </div>
            </div>
          </div>
        ) : profileLoaded && !redirectingToGame && !(me && state?.players[me.id]?.seat !== null && state?.players[me.id]?.seat !== undefined && (state?.phase === "ready" || state?.phase === "playing")) ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 relative">
            {/* Profile */}
            <div className="bg-zinc-900/50 backdrop-blur-sm rounded-xl p-6 border border-zinc-700/50 relative overflow-visible">
              <h2 className="font-semibold mb-4 text-lg flex items-center gap-2">
                <span className="text-emerald-400">👤</span>
                {!profileLoaded ? "Loading Discord Profile..." : "Discord Profile"}
              </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-2 text-zinc-300">Name</label>
                <input
                  className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  value={name}
                  readOnly
                  placeholder="Discord name"
                />
              </div>
              {!profileLoaded ? (
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full border border-zinc-600 bg-zinc-700 animate-pulse"></div>
                  <div className="text-sm text-zinc-400">Loading Discord avatar...</div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  {typeof avatar === "string" && avatar.startsWith("http") ? (
                    <img
                      src={avatar}
                      alt="Discord avatar"
                      className="h-10 w-10 rounded-full border border-zinc-600"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="text-2xl">{avatar || "🙂"}</span>
                  )}
                  <div className="text-sm text-zinc-400">Avatar from Discord</div>
                </div>
              )}
            </div>
          </div>


          {/* Teams */}
          <div className="bg-zinc-900/50 backdrop-blur-sm rounded-xl p-6 border border-zinc-700/50">
            <h2 className="font-semibold mb-4 text-lg flex items-center gap-2">
              <span className="text-purple-400">👥</span>
              Teams
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 text-sm font-medium">
                  <span className="inline-block h-3 w-3 rounded-full bg-blue-400"></span>
                  <span>Team A</span>
                  <span className="text-xs text-zinc-400">({players.filter((p) => p.team === "A").length}/3)</span>
                </div>
                <div className="space-y-2 min-h-[100px]">
                  {players.filter((p) => p.team === "A").map((p) => (
                    <div key={p.id} className="bg-blue-600/20 border border-blue-500/30 rounded-lg px-3 py-2 text-sm flex items-center gap-2">
                      {typeof p.avatar === "string" && p.avatar.startsWith("http") ? (
                        <img src={p.avatar} alt="" className="h-6 w-6 rounded-full border border-blue-500/30" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="text-lg">{p.avatar}</span>
                      )}
                      <span>{p.name}</span>
                    </div>
                  ))}
                  {players.filter((p) => p.team === "A").length === 0 && (
                    <div className="text-xs text-zinc-500 italic">No players yet</div>
                  )}
                </div>
                <button
                  className={`w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                    players.filter((p) => p.team === "A").length >= 3
                      ? "bg-zinc-600/30 border border-zinc-500/30 cursor-not-allowed opacity-50"
                      : "bg-blue-600/30 hover:bg-blue-600/40 border border-blue-500/30"
                  }`}
                  onClick={() => {
                    if (players.filter((p) => p.team === "A").length < 3) {
                      send(useStore.getState().ws, "select_team", { player_id: useStore.getState().me.id, team: "A" });
                    }
                  }}
                  disabled={players.filter((p) => p.team === "A").length >= 3}
                >
                  {players.filter((p) => p.team === "A").length >= 3 ? "Team A Full" : "Join Team A"}
                </button>
              </div>
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 text-sm font-medium">
                  <span className="inline-block h-3 w-3 rounded-full bg-rose-400"></span>
                  <span>Team B</span>
                  <span className="text-xs text-zinc-400">({players.filter((p) => p.team === "B").length}/3)</span>
                </div>
                <div className="space-y-2 min-h-[100px]">
                  {players.filter((p) => p.team === "B").map((p) => (
                    <div key={p.id} className="bg-rose-600/20 border border-rose-500/30 rounded-lg px-3 py-2 text-sm flex items-center gap-2">
                      {typeof p.avatar === "string" && p.avatar.startsWith("http") ? (
                        <img src={p.avatar} alt="" className="h-6 w-6 rounded-full border border-rose-500/30" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="text-lg">{p.avatar}</span>
                      )}
                      <span>{p.name}</span>
                    </div>
                  ))}
                  {players.filter((p) => p.team === "B").length === 0 && (
                    <div className="text-xs text-zinc-500 italic">No players yet</div>
                  )}
                </div>
                <button
                  className={`w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                    players.filter((p) => p.team === "B").length >= 3
                      ? "bg-zinc-600/30 border border-zinc-500/30 cursor-not-allowed opacity-50"
                      : "bg-rose-600/30 hover:bg-rose-600/40 border border-rose-500/30"
                  }`}
                  onClick={() => {
                    if (players.filter((p) => p.team === "B").length < 3) {
                      send(useStore.getState().ws, "select_team", { player_id: useStore.getState().me.id, team: "B" });
                    }
                  }}
                  disabled={players.filter((p) => p.team === "B").length >= 3}
                >
                  {players.filter((p) => p.team === "B").length >= 3 ? "Team B Full" : "Join Team B"}
                </button>
              </div>
            </div>

            {players.length >= 6 && players.filter((p) => p.team).length < 6 && (
              <div className="mt-4 p-3 bg-amber-600/20 border border-amber-500/40 rounded-lg">
                <div className="text-sm text-amber-300">
                  <span className="font-semibold">⚠️ Team Selection Required:</span> Some connected players need to select a team before starting the game.
                </div>
              </div>
            )}

            <button
              className={`w-full mt-4 px-4 py-3 rounded-lg transition-colors font-medium ${
                !roomId
                  ? "bg-zinc-600 cursor-not-allowed"
                  : "bg-amber-600 hover:bg-amber-500"
              }`}
              onClick={startGame}
              disabled={!roomId}
            >
              {!roomId 
                ? "No Room Connected"
                : players.length < 6
                ? `Start Game (${players.length} + ${6 - players.length} AI)`
                : `Start Game (${players.length} players)`}
            </button>

            {/* Testing Button */}
            <button
              className="w-full mt-2 px-4 py-2 rounded-lg transition-colors font-medium bg-purple-600 hover:bg-purple-500 text-white"
              onClick={() => {
                console.debug("[Testing] Current state:", state);
                console.debug("[Testing] Current player:", me);
                console.debug("[Testing] Room ID:", roomId);
                console.debug("[Testing] Players:", players);
                console.debug("[Testing] Profile loaded:", profileLoaded);
                console.debug("[Testing] Discord embedded:", isDiscordEmbedded);
                console.debug("[Testing] WebSocket:", useStore.getState().ws);
              }}
            >
              🧪 Debug Info
            </button>
          </div>
        </div>
        ) : null}

        {/* Player list - only show when lobby is not locked and profile is loaded */}
        {profileLoaded && !redirectingToGame && !(state?.lobby_locked === true || (state?.phase && state?.phase !== "lobby")) && !(me && state?.players[me.id]?.seat !== null && state?.players[me.id]?.seat !== undefined && (state?.phase === "ready" || state?.phase === "playing")) && (
        <div className="bg-zinc-900/50 backdrop-blur-sm rounded-xl p-6 border border-zinc-700/50">
          <h2 className="font-semibold mb-4 text-lg flex items-center gap-2">
            <span className="text-green-400">🎮</span>
            Players ({players.length}/6 connected)
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {players.map((p) => (
              <div key={p.id} className="px-4 py-3 bg-zinc-800/50 border border-zinc-600/50 rounded-lg flex flex-col items-center gap-2">
                {typeof p.avatar === "string" && p.avatar.startsWith("http") ? (
                  <img src={p.avatar} alt="" className="h-10 w-10 rounded-full border border-zinc-600/50" referrerPolicy="no-referrer" />
                ) : (
                  <span className="text-2xl">{p.avatar}</span>
                )}
                <span className="text-sm font-medium text-center">{p.name}</span>
                {p.team ? (
                  <span className={`text-xs px-2 py-1 rounded-full ${p.team === "A" ? "bg-blue-600/30 text-blue-300" : "bg-rose-600/30 text-rose-300"}`}>
                    Team {p.team}
                  </span>
                ) : (
                  <span className="text-xs px-2 py-1 rounded-full bg-amber-600/30 text-amber-300">No Team</span>
                )}
              </div>
            ))}
            {!players.length && (
              <div className="col-span-full text-center py-8">
                <div className="text-4xl mb-2">🎯</div>
                <div className="text-zinc-400">No players yet. Create or join a room to appear here.</div>
              </div>
            )}
          </div>
        </div>
        )}
      </div>

      {/* Toast Notifications */}
      <Toast />
    </div>
  );
}
