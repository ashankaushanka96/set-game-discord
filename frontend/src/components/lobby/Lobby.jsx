import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../../store";
import { connectWS, send } from "../../ws";
import { apiCreateRoom, apiJoinRoom } from "../../api";
import { AvatarSelector } from "../";
import { Toast, WakeLock } from "../ui";
import { generateUUID } from "../../utils/uuid";
import { useWakeLock } from "../../hooks/useWakeLock";

export default function Lobby() {
  const navigate = useNavigate();
  const { me, setMe, setWS, setRoom, roomId, state, applyServer } = useStore();
  const { isLocked, isSupported, error: wakeLockError, toggle } = useWakeLock();
  
  // Load saved profile data from localStorage
  const getSavedProfile = () => {
    try {
      const saved = localStorage.getItem('player_profile');
      if (saved) {
        const profile = JSON.parse(saved);
        return {
          name: profile.name || `Player ${Math.random().toString(16).slice(2,6)}`,
          avatar: profile.avatar || "🔥"
        };
      }
    } catch (error) {
      console.error('Failed to load saved profile:', error);
    }
    return {
      name: `Player ${Math.random().toString(16).slice(2,6)}`,
      avatar: "🔥"
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
      localStorage.setItem('player_profile', JSON.stringify({
        name: nameValue,
        avatar: avatarValue
      }));
    } catch (error) {
      console.error('Failed to save profile:', error);
    }
  };

  // ensure per-tab identity
  useEffect(() => {
    setMe({ id: me?.id || generateUUID(), name, avatar });
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

    window.addEventListener('navigate-to-game', handleNavigateToGame);
    
    return () => {
      window.removeEventListener('navigate-to-game', handleNavigateToGame);
    };
  }, [navigate]);

  useEffect(() => {
    setMe({ ...useStore.getState().me, name, avatar });
    // Save to localStorage whenever name or avatar changes
    saveProfile(name, avatar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, avatar]);

  async function httpJoinRoom(rid) {
    // add this player to the room via HTTP before WebSocket
    const player = {
      id: useStore.getState().me.id,
      name: useStore.getState().me.name,
      avatar: useStore.getState().me.avatar,
    };
    return await apiJoinRoom(rid, player);
  }

  const createRoom = async () => {
    setError(""); setBusy(true);
    try {
      const data = await apiCreateRoom(); // {room_id}
      const rid = data.room_id;
      setRoomInput(rid);
      setRoom(rid);

      // Add this player (HTTP) then connect WebSocket
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
    if (!rid) { setError("Enter a Room ID or create one."); return; }
    setError(""); setBusy(true);
    try {
      setRoom(rid);
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
    // Only count connected players for game start
    const connectedPlayers = allPlayers.filter(p => p.connected !== false);
    const playersWithTeams = connectedPlayers.filter(p => p.team);
    const me = useStore.getState().me;
    
    if (connectedPlayers.length < 6) {
      setError("Need 6 connected players to start the game");
      return;
    }
    
    // Auto-assign room creator to Team A if they haven't selected a team
    const mePlayer = connectedPlayers.find(p => p.id === me.id);
    if (mePlayer && !mePlayer.team) {
      send(useStore.getState().ws, 'select_team', { player_id: me.id, team: 'A' });
      // Wait a moment for the team selection to process
      setTimeout(() => {
        const updatedAllPlayers = Object.values(state?.players || {});
        const updatedConnectedPlayers = updatedAllPlayers.filter(p => p.connected !== false);
        const updatedPlayersWithTeams = updatedConnectedPlayers.filter(p => p.team);
        
        if (updatedPlayersWithTeams.length < 6) {
          setError("All connected players must select a team before starting");
          return;
        }
        
        // Save player data to localStorage for persistence
        const playerData = useStore.getState().me;
        localStorage.setItem(`player_${playerData.id}`, JSON.stringify(playerData));
        
        // Send start command - navigation will be handled by the store
        send(useStore.getState().ws, "start", {});
      }, 100);
      return;
    }
    
    if (playersWithTeams.length < 6) {
      setError("All players must select a team before starting");
      return;
    }
    
    // Save player data to localStorage for persistence
    const playerData = useStore.getState().me;
    localStorage.setItem(`player_${playerData.id}`, JSON.stringify(playerData));
    
    // Send start command - navigation will be handled by the store
    send(useStore.getState().ws, "start", {});
  };

  const copyRoomId = async () => {
    try {
      const roomIdToCopy = roomId || roomInput;
      if (!roomIdToCopy) {
        setError("No room ID to copy");
        return;
      }

      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(roomIdToCopy);
      } else {
        // Fallback for older browsers or non-HTTPS environments
        const textArea = document.createElement('textarea');
        textArea.value = roomIdToCopy;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
          document.execCommand('copy');
        } catch (err) {
          throw new Error('Copy command failed');
        }
        
        document.body.removeChild(textArea);
      }
      
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (error) {
      console.error('Failed to copy room ID:', error);
      setError("Failed to copy room ID - try selecting and copying manually");
    }
  };

  const players = useMemo(() => {
    const allPlayers = Object.values(state?.players || {});
    // In lobby phase, filter out disconnected players
    if (state?.phase === 'lobby') {
      return allPlayers.filter(p => p.connected !== false);
    }
    // In game phases, show all players (including disconnected ones)
    return allPlayers;
  }, [state]);

  return (
    <WakeLock isActive={!!state && state.players && Object.keys(state.players).length > 0}>
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
              Create Profile (per tab)
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-2 text-zinc-300">Name</label>
                <input
                  className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  value={name}
                  onChange={(e)=>setName(e.target.value)}
                  placeholder="Enter your name"
                />
              </div>
              <AvatarSelector
                selectedAvatar={avatar}
                onAvatarSelect={setAvatar}
              />
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
                disabled={busy}
                title="Create a new room"
              >
                {busy ? "Creating..." : "Create Room"}
              </button>

              <div>
                <label className="block text-sm mb-2 text-zinc-300">Room ID</label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    value={roomInput}
                    onChange={(e)=>setRoomInput(e.target.value)}
                    placeholder="e.g., 04fa97"
                  />
                  <button
                    className={`px-3 py-2 rounded-lg transition-colors ${
                      copied 
                        ? 'bg-emerald-600 text-white' 
                        : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
                    }`}
                    onClick={copyRoomId}
                    title="Copy Room ID"
                    disabled={!roomId && !roomInput}
                  >
                    {copied ? '✓' : '📋'}
                  </button>
                </div>
                {copied && <div className="text-xs mt-1 text-emerald-400">Copied!</div>}
              </div>

              <div className="flex gap-2">
                <button
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
                  onClick={joinRoom}
                  disabled={busy || state?.lobby_locked}
                >
                  {busy ? "Joining..." : state?.lobby_locked ? "Lobby Locked" : "Join"}
                </button>
                <button 
                  className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                    players.length >= 6 && players.filter(p => p.team).length >= 6 
                      ? 'bg-amber-600 hover:bg-amber-500' 
                      : 'bg-zinc-600 cursor-not-allowed'
                  }`}
                  onClick={startGame}
                  disabled={players.length < 6 || players.filter(p => p.team).length < 6}
                >
                  {players.length < 6 
                    ? `Start (${players.length}/6 connected players)` 
                    : players.filter(p => p.team).length < 6
                      ? `Start (${players.filter(p => p.team).length}/6 teams)`
                      : 'Start Game'
                  }
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
                  <span className="text-xs text-zinc-400">({players.filter(p=>p.team==='A').length}/3)</span>
                </div>
                <div className="space-y-2 min-h-[100px]">
                  {players.filter(p=>p.team==='A').map(p=>(
                    <div key={p.id} className="bg-blue-600/20 border border-blue-500/30 rounded-lg px-3 py-2 text-sm flex items-center gap-2">
                      <span className="text-lg">{p.avatar}</span>
                      <span>{p.name}</span>
                    </div>
                  ))}
                  {players.filter(p=>p.team==='A').length === 0 && (
                    <div className="text-xs text-zinc-500 italic">No players yet</div>
                  )}
                </div>
                <button
                  className={`w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                    players.filter(p=>p.team==='A').length >= 3 
                      ? 'bg-zinc-600/30 border border-zinc-500/30 cursor-not-allowed opacity-50' 
                      : 'bg-blue-600/30 hover:bg-blue-600/40 border border-blue-500/30'
                  }`}
                  onClick={()=>{
                    if (players.filter(p=>p.team==='A').length < 3) {
                      send(useStore.getState().ws,'select_team',{ player_id: useStore.getState().me.id, team:'A' });
                    }
                  }}
                  disabled={players.filter(p=>p.team==='A').length >= 3}
                >
                  {players.filter(p=>p.team==='A').length >= 3 ? 'Team A Full' : 'Join Team A'}
                </button>
              </div>
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 text-sm font-medium">
                  <span className="inline-block h-3 w-3 rounded-full bg-rose-400"></span>
                  <span>Team B</span>
                  <span className="text-xs text-zinc-400">({players.filter(p=>p.team==='B').length}/3)</span>
                </div>
                <div className="space-y-2 min-h-[100px]">
                  {players.filter(p=>p.team==='B').map(p=>(
                    <div key={p.id} className="bg-rose-600/20 border border-rose-500/30 rounded-lg px-3 py-2 text-sm flex items-center gap-2">
                      <span className="text-lg">{p.avatar}</span>
                      <span>{p.name}</span>
                    </div>
                  ))}
                  {players.filter(p=>p.team==='B').length === 0 && (
                    <div className="text-xs text-zinc-500 italic">No players yet</div>
                  )}
                </div>
                <button
                  className={`w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                    players.filter(p=>p.team==='B').length >= 3 
                      ? 'bg-zinc-600/30 border border-zinc-500/30 cursor-not-allowed opacity-50' 
                      : 'bg-rose-600/30 hover:bg-rose-600/40 border border-rose-500/30'
                  }`}
                  onClick={()=>{
                    if (players.filter(p=>p.team==='B').length < 3) {
                      send(useStore.getState().ws,'select_team',{ player_id: useStore.getState().me.id, team:'B' });
                    }
                  }}
                  disabled={players.filter(p=>p.team==='B').length >= 3}
                >
                  {players.filter(p=>p.team==='B').length >= 3 ? 'Team B Full' : 'Join Team B'}
                </button>
              </div>
            </div>
            
            {/* Team Status Message */}
            {players.length >= 6 && players.filter(p => p.team).length < 6 && (
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
            {players.map(p=>(
              <div key={p.id} className="px-4 py-3 bg-zinc-800/50 border border-zinc-600/50 rounded-lg flex flex-col items-center gap-2">
                <span className="text-2xl">{p.avatar}</span>
                <span className="text-sm font-medium text-center">{p.name}</span>
                {p.team ? (
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    p.team === 'A' ? 'bg-blue-600/30 text-blue-300' : 'bg-rose-600/30 text-rose-300'
                  }`}>
                    Team {p.team}
                  </span>
                ) : (
                  <span className="text-xs px-2 py-1 rounded-full bg-amber-600/30 text-amber-300">
                    No Team
                  </span>
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
      
      {/* Wake Lock Toggle Button - Floating in bottom right */}
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={() => void toggle()}
          className={`
            px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200
            ${isLocked 
              ? 'bg-green-600 hover:bg-green-700 text-white' 
              : 'bg-red-500 hover:bg-red-600 text-white'
            }
            shadow-lg border border-gray-500
          `}
          title={isLocked ? "Screen awake (click to disable)" : "Screen will sleep (click to keep awake)"}
        >
          {isLocked ? "🔒" : "🔓"}
        </button>
        
        {/* Error message if wake lock fails */}
        {wakeLockError && (
          <div className="absolute bottom-12 right-0 bg-red-600 text-white text-xs px-2 py-1 rounded shadow-lg max-w-48">
            Wake lock failed: {String(wakeLockError?.message || wakeLockError)}
          </div>
        )}
        
        {/* Platform info tooltip */}
        <div className="absolute bottom-12 right-0 bg-gray-800 text-white text-xs px-2 py-1 rounded shadow-lg opacity-0 hover:opacity-100 transition-opacity">
          {isSupported ? "Native Wake Lock" : "iOS Fallback"}
        </div>
      </div>
      </div>
    </WakeLock>
  );
}
