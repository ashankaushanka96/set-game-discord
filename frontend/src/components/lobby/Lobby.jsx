import { useMemo, useState } from "react";
import { useStore } from "../../store";
import { send } from "../../ws";
import { Toast } from "../ui";
import { ConfirmUnassignModal, ConfirmSpectatorStartModal } from "../modals";
import SeatSelector, { Lounge } from "./SeatSelector";
import GameModePicker, { isRoomAdmin } from "./GameModePicker";
import BotLevelPicker from "./BotLevelPicker";
import { TEST_MODE_ENABLED } from "../../config";
import useDiscordSession from "./useDiscordSession";

export default function Lobby() {
  const { me, roomId, state, speakingUsers } = useStore();
  const { profileLoaded, checkingReconnection, redirectingToGame, error } = useDiscordSession();
  const [unassignModal, setUnassignModal] = useState({ open: false, player: null });
  const [spectatorStart, setSpectatorStart] = useState({ open: false, players: [] });

  // Players (other than the admin) who are in the lobby but haven't picked a seat.
  const unseatedOthers = () => {
    const meId = useStore.getState().me?.id;
    return Object.values(state?.players || {}).filter(
      (p) => p.connected !== false && !p.is_spectator && p.seat == null && p.id !== meId
    );
  };

  const startGame = () => {
    const waiting = unseatedOthers();
    if (waiting.length > 0) {
      setSpectatorStart({ open: true, players: waiting });
      return;
    }
    doStartGame();
  };

  const doStartGame = () => {
    const meRef = useStore.getState().me;
    // Unseated players become spectators when the game starts, so only seated
    // players (plus the admin, who is auto-seated below) count toward the table.
    const connectedPlayers = Object.values(state?.players || {}).filter(
      (p) => p.connected !== false && !p.is_spectator && (p.seat != null || p.id === meRef?.id)
    );

    console.debug(`[Start Game] Starting with ${connectedPlayers.length} real players`);

    // Only allow AI fill in test mode
    if (TEST_MODE_ENABLED && connectedPlayers.length < 6) {
      const aiPlayersNeeded = 6 - connectedPlayers.length;
      console.debug(`[Start Game] Adding ${aiPlayersNeeded} AI players`);
      
      // Generate AI players
      const aiPlayers = [];
      // Friendly names, shuffled each game and never the same as someone already at the table.
      const taken = new Set(Object.values(state?.players || {}).map((p) => (p.name || "").trim().toLowerCase()));
      const aiNames = ["Aana", "Latta", "Benja", "Kajja", "Suwada", "Kachal", "Dado", "Wadda"]
        .filter((n) => !taken.has(n.toLowerCase()))
        .sort(() => Math.random() - 0.5);
      const aiAvatars = ["🦊", "🐼", "🦉", "🐯", "🐙", "🦁"].sort(() => Math.random() - 0.5);
      const botLevel = state?.bot_level || "medium";
      
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
          team: aiTeam,
          level: botLevel
        });
      }
      
      console.debug(`[Start Game] Added AI players:`, aiPlayers);
    }

    // In non-test mode, require exactly 6 connected players
    if (!TEST_MODE_ENABLED && connectedPlayers.length !== 6) {
      console.debug('[Start Game] Not allowed: need 6 real players when TEST_MODE is disabled');
      return;
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
  console.debug("[Lobby] Has seat in active game:", me && state?.players[me.id] && (typeof state.players[me.id].seat === 'number' && state.players[me.id].seat >= 0 || (state.players[me.id].is_spectator && !state.players[me.id].spectator_request_pending)) && (state?.phase === "ready" || state?.phase === "playing" || state?.phase === "ended"));

  // Early return: show only loading screen until profile retrieval completes
  if (!profileLoaded) {
    return (
      <div className="club-lobby club-loading min-h-screen bg-gradient-vibrant p-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-4">
            <h1 className="text-3xl font-bold bg-gradient-accent bg-clip-text text-transparent mb-1">
              Set Club
            </h1>
            <p className="text-text-muted">Loading...</p>
          </div>
          <div className="bg-dark-card/50 backdrop-blur-sm rounded-xl p-8 border border-accent-purple/20 text-center shadow-glow-purple">
            <div className="max-w-md mx-auto">
              <div className="text-6xl mb-4 animate-pulse">🔌</div>
              <h2 className="text-2xl font-bold text-accent-cyan mb-4">Loading Discord Profile</h2>
              <p className="text-text-secondary mb-6">
                Waiting for Discord authorization to finish…
              </p>
              <div className="bg-gradient-primary/20 border border-accent-blue/40 px-4 py-3 rounded-lg shadow-glow-blue">
                <p className="text-sm text-accent-blue">This may take a few seconds</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show loading screen while checking reconnection
  if (checkingReconnection) {
    return (
      <div className="club-lobby club-loading min-h-screen bg-gradient-vibrant p-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-4">
            <h1 className="text-3xl font-bold bg-gradient-accent bg-clip-text text-transparent mb-1">
              Set Club
            </h1>
            <p className="text-text-muted">Checking game status...</p>
          </div>
          <div className="bg-dark-card/50 backdrop-blur-sm rounded-xl p-8 border border-accent-purple/20 text-center shadow-glow-purple">
            <div className="max-w-md mx-auto">
              <div className="text-6xl mb-4 animate-pulse">🔄</div>
              <h2 className="text-2xl font-bold text-accent-amber mb-4">Reconnecting to Game</h2>
              <p className="text-text-secondary mb-6">
                Checking if you have an active game session...
              </p>
              <div className="bg-gradient-warm/20 border border-accent-amber/40 px-4 py-3 rounded-lg shadow-glow-amber">
                <p className="text-sm text-accent-amber">Please wait while we check your game status</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="club-lobby bg-gradient-vibrant">
      <div className="lobby-shell">
        <div className="lobby-header">
          <div className="club-brand"><span className="club-brand__mark" aria-hidden="true">♠</span><h1>Set Club</h1></div>
          <div className="lobby-connection"><i className={roomId ? 'status-dot' : 'status-dot status-dot--offline'} />{roomId ? `${players.length}/6 in room` : 'Connecting…'}</div>
          {state?.admin_player_id === me?.id && <span className="lobby-admin-badge">👑 Admin</span>}
        </div>

        {error && (
          <div className="mb-6 text-sm bg-gradient-secondary/20 border border-accent-rose/40 px-4 py-3 rounded-lg backdrop-blur-sm shadow-glow-rose">
            <div className="flex items-center gap-2">
              <span className="text-accent-rose">⚠️</span>
              <span className="text-text-primary">{error}</span>
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

        {/* Show lobby locked screen when game is in progress and player has no seat (but not for approved spectators) */}
        {profileLoaded && !checkingReconnection && !redirectingToGame && (state?.lobby_locked === true || (state?.phase && state?.phase !== "lobby")) && !(me && state?.players?.[me.id] && (typeof state.players[me.id].seat === 'number' && state.players[me.id].seat >= 0 || (state.players[me.id].is_spectator && !state.players[me.id].spectator_request_pending))) ? (
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
        ) : profileLoaded && !checkingReconnection && !redirectingToGame && !(me && state?.players[me.id] && (typeof state.players[me.id].seat === 'number' && state.players[me.id].seat >= 0 || (state.players[me.id].is_spectator && !state.players[me.id].spectator_request_pending)) && (state?.phase === "ready" || state?.phase === "playing" || state?.phase === "ended")) ? (
          <div className="lobby-content">
            <SeatSelector players={players} state={state} me={me} speakingUsers={speakingUsers} adminId={state?.admin_player_id} />

            <div className="lobby-settings">
              <GameModePicker state={state} me={me} />
              {TEST_MODE_ENABLED && state?.game_mode === "turns" && players.filter((p)=>p.connected!==false).length < 6 && <BotLevelPicker state={state} me={me} />}
            </div>

            <div className="lobby-bottom">
              <Lounge players={players} me={me} adminId={state?.admin_player_id} />
              {players.length >= 6 && players.filter((p) => p.team).length < 6 && (
                <div className="lobby-warning">⚠️ Some players still need a seat.</div>
              )}
              {isRoomAdmin(state, me) ? (
                <button
                  className="club-primary lobby-start"
                  onClick={startGame}
                  disabled={!roomId || (!TEST_MODE_ENABLED && players.filter((p)=>p.connected!==false && !p.is_spectator && (p.seat != null || p.id === me?.id)).length !== 6)}
                >
                  {!roomId
                    ? "No Room Connected"
                    : TEST_MODE_ENABLED && players.filter((p)=>p.connected!==false).length < 6
                      ? `Start Game · ${6 - players.filter((p)=>p.connected!==false).length} bot${6 - players.filter((p)=>p.connected!==false).length > 1 ? "s" : ""}`
                      : "Start Game"}
                </button>
              ) : (
                <div className="lobby-start lobby-start--waiting" role="status">
                  Waiting for {state?.players?.[state?.admin_player_id]?.name || "the admin"} to start
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* Toast Notifications */}
      <Toast />
      
      {/* Start with unseated players as spectators */}
      <ConfirmSpectatorStartModal
        open={spectatorStart.open}
        players={spectatorStart.players}
        onConfirm={() => {
          setSpectatorStart({ open: false, players: [] });
          doStartGame();
        }}
        onClose={() => setSpectatorStart({ open: false, players: [] })}
      />

      {/* Unassign Confirmation Modal */}
      <ConfirmUnassignModal
        open={unassignModal.open}
        playerName={unassignModal.player?.name}
        onConfirm={() => {
          if (unassignModal.player) {
            const currentWS = useStore.getState().ws;
            send(currentWS, "unassign_player", { 
              admin_player_id: me.id, 
              target_player_id: unassignModal.player.id 
            });
          }
          setUnassignModal({ open: false, player: null });
        }}
        onClose={() => setUnassignModal({ open: false, player: null })}
      />
    </div>
  );
}
