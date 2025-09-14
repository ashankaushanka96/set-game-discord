import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../../store";
import { connectWS, send } from "../../ws";
import { apiCreateRoom, apiJoinRoom } from "../../api";
import { AvatarSelector } from "../";
import { Toast } from "../ui";
import { generateUUID } from "../../utils/uuid";
import { DiscordSDK }  from "@discord/embedded-app-sdk";
import { discordAvatarUrl } from "../../utils/discord";

const API_BASE = import.meta.env.VITE_API_BASE ?? ""; // set in .env for prod; leave empty for Vite proxy in dev

export default function Lobby() {
  console.debug("[Lobby] Component loaded");
  const navigate = useNavigate();
  const { me, setMe, setWS, setRoom, roomId, state, applyServer } = useStore();

  const [usingDiscordProfile, setUsingDiscordProfile] = useState(false);
  const authRanRef = useRef(false);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Load saved profile data from localStorage
  const getSavedProfile = () => {
    try {
      const saved = localStorage.getItem("player_profile");
      if (saved) {
        const profile = JSON.parse(saved);
        return {
          name: profile.name || `Player ${Math.random().toString(16).slice(2, 6)}`,
          avatar: profile.avatar || "🔥",
        };
      }
    } catch (error) {
      console.error("Failed to load saved profile:", error);
    }
    return {
      name: `Player ${Math.random().toString(16).slice(2, 6)}`,
      avatar: "🔥",
    };
  };

  const [name, setName] = useState(me?.name || getSavedProfile().name);
  const [avatar, setAvatar] = useState(me?.avatar || getSavedProfile().avatar);
  const [roomInput, setRoomInput] = useState(roomId || "");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Save profile data to localStorage
  const saveProfile = (nameValue, avatarValue) => {
    try {
      localStorage.setItem(
        "player_profile",
        JSON.stringify({ name: nameValue, avatar: avatarValue })
      );
    } catch (error) {
      console.error("Failed to save profile:", error);
    }
  };

  // ensure per-tab identity
  useEffect(() => {
    setMe({ id: me?.id || generateUUID(), name, avatar });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        
        // Test: Try to get user data immediately without OAuth
        console.debug("[Discord] Testing immediate user data retrieval...");
        try {
          // Check if we can get user data directly
          const testUser = await discordSdk.commands.getUser({ id: "826307641058918441" });
          console.debug("[Discord] Got test user data:", testUser);
          
          if (testUser) {
            const displayName = testUser.global_name || testUser.username || "Discord User";
            const avatarUrl = discordAvatarUrl(testUser.id, testUser.avatar, 128);
            
            console.debug("[Discord] Setting profile from test user:", { displayName, avatarUrl });
            setUsingDiscordProfile(true);
            setName(displayName);
            setAvatar(avatarUrl);
            saveProfile(displayName, avatarUrl);
            
            // Update store
            const cur = useStore.getState().me || {};
            const updatedMe = { ...cur, name: displayName, avatar: avatarUrl };
            setMe(updatedMe);
            
            setProfileLoaded(true);
            return;
          }
        } catch (testError) {
          console.debug("[Discord] Test user retrieval failed:", testError);
        }


        // Check if we're in Discord environment
        console.debug("[Discord] Platform:", discordSdk.platform);
        console.debug("[Discord] Guild ID:", discordSdk.guildId);
        console.debug("[Discord] Channel ID:", discordSdk.channelId);

        // Check if we're actually in Discord (any Discord platform is valid)
        const validDiscordPlatforms = ['web', 'desktop', 'canary', 'ptb'];
        if (!validDiscordPlatforms.includes(discordSdk.platform)) {
          console.warn("[Discord] Not running in Discord environment, platform:", discordSdk.platform);
          setProfileLoaded(true);
          return;
        }
        
        // Test: Set a test value to see if state updates work
        console.debug("[Discord] Testing state update with test values...");
        setUsingDiscordProfile(true);
        setName("Discord Test User");
        setAvatar("🎮");
        console.debug("[Discord] Test values set, checking if UI updates...");
        
        console.debug("[Discord] Running in Discord environment:", discordSdk.platform);
        
        // Add a delay to see if the test values appear in UI first
        console.debug("[Discord] Waiting 2 seconds before continuing with real Discord auth...");
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.debug("[Discord] Continuing with Discord auth after delay...");
        
        // Test: Update to a different test value to see if state updates work
        console.debug("[Discord] Testing state update with different test values...");
        setName("Discord Auth Test");
        setAvatar("🎯");
        console.debug("[Discord] Updated test values set");

        // Try different approaches to get user data
        let user = null;
        
        // First, let's see what methods are available
        console.debug("[Discord] Available commands:", Object.keys(discordSdk.commands));
        console.debug("[Discord] Starting user data retrieval...");
        
        // Let's try a simple test first - just try to get any user data
        console.debug("[Discord] Testing Discord SDK functionality...");
        try {
          // Try to get the current user ID from various sources
          console.debug("[Discord] SDK properties:", {
            userId: discordSdk.userId,
            user: discordSdk.user,
            instanceId: discordSdk.instanceId,
            platform: discordSdk.platform
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

            // Authenticate with Discord SDK
            await discordSdk.commands.authenticate({ access_token });
            console.debug("[Discord] SDK authentication successful");

            // Debug: Check what properties are available on the SDK after authentication
            console.debug("[Discord] SDK properties after auth:", {
              userId: discordSdk.userId,
              user: discordSdk.user,
              platform: discordSdk.platform,
              guildId: discordSdk.guildId,
              channelId: discordSdk.channelId,
              allProperties: Object.keys(discordSdk)
            });

            // Try to get user ID from various possible locations
            let currentUserId = discordSdk.userId || discordSdk.user?.id || discordSdk.instanceId;
            console.debug("[Discord] Current user ID after auth:", currentUserId);
            
            if (currentUserId) {
              console.debug("[Discord] Attempting getUser with ID:", currentUserId);
              try {
                user = await discordSdk.commands.getUser({ id: currentUserId });
                console.debug("[Discord] Got user from SDK after auth:", user);
              } catch (getUserError) {
                console.debug("[Discord] getUser with instance ID failed:", getUserError);
                // Fall through to direct API call
                currentUserId = null; // Force fallback
              }
            }
            
            if (!user) {
              // Try to get user info directly from the access token
              console.debug("[Discord] No user ID found, trying to get user info from access token...");
              console.debug("[Discord] Making API call to https://discord.com/api/users/@me");
              const userRes = await fetch("https://discord.com/api/users/@me", {
                headers: { Authorization: `Bearer ${access_token}` },
              });
              
              console.debug("[Discord] API response status:", userRes.status);
              if (userRes.ok) {
                user = await userRes.json();
                console.debug("[Discord] Got user from Discord API:", user);
                console.debug("[Discord] User username:", user.username);
                console.debug("[Discord] User global_name:", user.global_name);
              } else {
                const errorText = await userRes.text();
                console.error("[Discord] API call failed:", errorText);
                throw new Error("Still no user ID available after OAuth and API call failed");
              }
            }
          } catch (error3) {
            console.error("[Discord] OAuth flow also failed:", error3);
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
        
        setUsingDiscordProfile(true);
        setName(displayName);
        setAvatar(avatarUrl);
        saveProfile(displayName, avatarUrl);
        
        console.debug("[Discord] Profile state updated:", { 
          usingDiscordProfile: true, 
          name: displayName, 
          avatar: avatarUrl 
        });
        
        // Update store immediately
        const cur = useStore.getState().me || {};
        const updatedMe = { ...cur, name: displayName, avatar: avatarUrl };
        setMe(updatedMe);
        console.debug("[Discord] Store updated with:", updatedMe);

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
      } catch (e) {
        console.error("[Discord] Discord auth failed:", e);
        setProfileLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
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
    setMe({ ...useStore.getState().me, name, avatar });
    // Only save to localStorage if not using Discord profile (to avoid overriding Discord data)
    if (!usingDiscordProfile) {
      saveProfile(name, avatar);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, avatar, usingDiscordProfile]);

  async function httpJoinRoom(rid) {
    const player = {
      id: useStore.getState().me.id,
      name: useStore.getState().me.name,
      avatar: useStore.getState().me.avatar,
    };
    return await apiJoinRoom(rid, player);
  }

  const createRoom = async () => {
    setError("");
    setBusy(true);
    try {
      const data = await apiCreateRoom(); // {room_id}
      const rid = data.room_id;
      setRoomInput(rid);
      setRoom(rid);

      // Ensure latest profile is what server stores
      await httpJoinRoom(rid);

      const ws = connectWS(rid, useStore.getState().me.id, applyServer);
      setWS(ws);
      setTimeout(() => send(ws, "sync", {}), 150);
    } catch (e) {
      setError(e.message || "Failed to create room");
    } finally {
      setBusy(false);
    }
  };

  const joinRoom = async () => {
    const rid = roomInput.trim();
    if (!rid) {
      setError("Enter a Room ID or create one.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      setRoom(rid);

      // Ensure latest profile is what server stores
      await httpJoinRoom(rid);

      const ws = connectWS(rid, useStore.getState().me.id, applyServer);
      setWS(ws);
      setTimeout(() => send(ws, "sync", {}), 150);
    } catch (e) {
      setError(e.message || "Failed to join room");
    } finally {
      setBusy(false);
    }
  };

  const startGame = () => {
    const allPlayers = Object.values(state?.players || {});
    const connectedPlayers = allPlayers.filter((p) => p.connected !== false);
    const playersWithTeams = connectedPlayers.filter((p) => p.team);
    const meRef = useStore.getState().me;

    if (connectedPlayers.length < 6) {
      setError("Need 6 connected players to start the game");
      return;
    }

    const mePlayer = connectedPlayers.find((p) => p.id === meRef.id);
    if (mePlayer && !mePlayer.team) {
      send(useStore.getState().ws, "select_team", { player_id: meRef.id, team: "A" });
      setTimeout(() => {
        const updatedAllPlayers = Object.values(state?.players || {});
        const updatedConnectedPlayers = updatedAllPlayers.filter((p) => p.connected !== false);
        const updatedPlayersWithTeams = updatedConnectedPlayers.filter((p) => p.team);

        if (updatedPlayersWithTeams.length < 6) {
          setError("All connected players must select a team before starting");
          return;
        }

        const playerData = useStore.getState().me;
        localStorage.setItem(`player_${playerData.id}`, JSON.stringify(playerData));

        send(useStore.getState().ws, "start", {});
      }, 100);
      return;
    }

    if (playersWithTeams.length < 6) {
      setError("All players must select a team before starting");
      return;
    }

    const playerData = useStore.getState().me;
    localStorage.setItem(`player_${playerData.id}`, JSON.stringify(playerData));
    send(useStore.getState().ws, "start", {});
  };

  const copyRoomId = async () => {
    try {
      const roomIdToCopy = roomId || roomInput;
      if (!roomIdToCopy) {
        setError("No room ID to copy");
        return;
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(roomIdToCopy);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = roomIdToCopy;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand("copy");
        } catch (err) {
          throw new Error("Copy command failed");
        }
        document.body.removeChild(textArea);
      }

      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (error) {
      console.error("Failed to copy room ID:", error);
      setError("Failed to copy room ID - try selecting and copying manually");
    }
  };

  const players = useMemo(() => {
    const allPlayers = Object.values(state?.players || {});
    if (state?.phase === "lobby") {
      return allPlayers.filter((p) => p.connected !== false);
    }
    return allPlayers;
  }, [state]);

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

        {/* Lobby Locked Message */}
        {state?.lobby_locked && (
          <div className="mb-6 text-sm bg-amber-600/20 border border-amber-500/40 px-4 py-3 rounded-lg backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <span className="text-amber-400">🔒</span>
              <span>Lobby is locked - game in progress. New players cannot join until the game ends.</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 relative">
          {/* Profile */}
          <div className="bg-zinc-900/50 backdrop-blur-sm rounded-xl p-6 border border-zinc-700/50 relative overflow-visible">
            <h2 className="font-semibold mb-4 text-lg flex items-center gap-2">
              <span className="text-emerald-400">👤</span>
              {!profileLoaded ? "Loading Discord Profile..." : usingDiscordProfile ? "Discord Profile" : "Create Profile (per tab)"}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-2 text-zinc-300">Name</label>
                <input
                  className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  readOnly={usingDiscordProfile}
                />
              </div>
              {!profileLoaded ? (
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full border border-zinc-600 bg-zinc-700 animate-pulse"></div>
                  <div className="text-sm text-zinc-400">Loading Discord avatar...</div>
                </div>
              ) : !usingDiscordProfile ? (
                <AvatarSelector selectedAvatar={avatar} onAvatarSelect={setAvatar} />
              ) : (
                <div className="flex items-center gap-3">
                  <img
                    src={avatar}
                    alt="Discord avatar"
                    className="h-10 w-10 rounded-full border border-zinc-600"
                    referrerPolicy="no-referrer"
                  />
                  <div className="text-sm text-zinc-400">Avatar from Discord</div>
                </div>
              )}
            </div>
          </div>

          {/* Room controls */}
          <div className="bg-zinc-900/50 backdrop-blur-sm rounded-xl p-6 border border-zinc-700/50">
            <h2 className="font-semibold mb-4 text-lg flex items-center gap-2">
              <span className="text-blue-400">🏠</span>
              Room
            </h2>

            <div className="space-y-4">
              <button
                className="w-full bg-emerald-600 hover:bg-emerald-500 px-4 py-3 rounded-lg disabled:opacity-50 transition-colors font-medium"
                onClick={createRoom}
                disabled={busy || !profileLoaded}
                title={!profileLoaded ? "Loading Discord profile..." : "Create a new room"}
              >
                {busy ? "Creating..." : "Create Room"}
              </button>

              <div>
                <label className="block text-sm mb-2 text-zinc-300">Room ID</label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    value={roomInput}
                    onChange={(e) => setRoomInput(e.target.value)}
                    placeholder="e.g., 04fa97"
                  />
                  <button
                    className={`px-3 py-2 rounded-lg transition-colors ${
                      copied ? "bg-emerald-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
                    }`}
                    onClick={copyRoomId}
                    title="Copy Room ID"
                    disabled={!roomId && !roomInput}
                  >
                    {copied ? "✓" : "📋"}
                  </button>
                </div>
                {copied && <div className="text-xs mt-1 text-emerald-400">Copied!</div>}
              </div>

              <div className="flex gap-2">
                <button
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
                  onClick={joinRoom}
                  disabled={busy || state?.lobby_locked || !profileLoaded}
                >
                  {busy ? "Joining..." : state?.lobby_locked ? "Lobby Locked" : !profileLoaded ? "Loading profile..." : "Join"}
                </button>
                <button
                  className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                    players.length >= 6 && players.filter((p) => p.team).length >= 6
                      ? "bg-amber-600 hover:bg-amber-500"
                      : "bg-zinc-600 cursor-not-allowed"
                  }`}
                  onClick={startGame}
                  disabled={players.length < 6 || players.filter((p) => p.team).length < 6}
                >
                  {players.length < 6
                    ? `Start (${players.length}/6 connected players)`
                    : players.filter((p) => p.team).length < 6
                    ? `Start (${players.filter((p) => p.team).length}/6 teams)`
                    : "Start Game"}
                </button>
              </div>
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
          </div>
        </div>



        {/* Player list */}
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
      </div>

      {/* Toast Notifications */}
      <Toast />
    </div>
  );
}
