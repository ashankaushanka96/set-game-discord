import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { connectWS, send } from '../ws';
import { apiCreateRoom, apiGetState, apiJoinRoom } from '../api';

export default function Lobby(){
  const { me, setMe, roomId, setRoom, setWS, ws, state, applyServer } = useStore();
  const [joinRoom, setJoinRoom] = useState('');
  const [error, setError] = useState('');

  // When we have roomId and me (but no socket), do HTTP join then connect WS
  useEffect(()=>{
    (async ()=>{
      if (!roomId || !me) return;
      if (ws) return;

      try {
        // Ensure room exists
        await apiGetState(roomId).catch(async () => {
          setError("Room not found. Create a new room or check the ID.");
          throw new Error('room-missing');
        });

        // Register player (HTTP) so others see you in Waiting immediately
        await apiJoinRoom(roomId, me);

        // Connect WebSocket (state snapshot arrives on connect)
        const sock = connectWS(roomId, me.id, applyServer);
        setWS(sock);
      } catch (e) {
        if (e.message !== 'room-missing') setError(String(e.message || e));
      }
    })();
  }, [roomId, me, ws, setWS, applyServer]);

  const players = useMemo(()=>Object.values(state?.players||{}), [state]);
  const teamA   = useMemo(()=>players.filter(p=>p.team==='A'), [players]);
  const teamB   = useMemo(()=>players.filter(p=>p.team==='B'), [players]);
  const waiting = useMemo(()=>players.filter(p=>!p.team),     [players]);

  const handleQuickCreate = () => {
    // Each tab gets a unique id & default fox avatar — name varies with id
    const id = crypto.randomUUID();
    const meObj = { id, name: 'Player '+id.slice(0,4), avatar: '🦊' };
    // Store in sessionStorage via setMe (per-tab)
    setMe(meObj);
  };

  const handleCreateRoom = async () => {
    setError('');
    const { room_id } = await apiCreateRoom();
    setRoom(room_id);
  };

  const handleJoinRoom = async () => {
    setError('');
    if (!joinRoom) { setError('Enter a Room ID'); return; }
    setRoom(joinRoom.trim());
  };

  if(!me) return (
    <div className="p-6 space-y-3 max-w-xl mx-auto">
      <h2 className="text-xl font-bold">Step 1: Create Player (per-tab)</h2>
      <button className="bg-indigo-600 px-4 py-2 rounded" onClick={handleQuickCreate}>
        Quick Create (for testing tabs)
      </button>
    </div>
  );

  if(!roomId) return (
    <div className="p-6 space-y-3 max-w-xl mx-auto">
      <h2 className="text-xl font-bold">Step 2: Create / Join Room</h2>
      {error && <div className="bg-red-900/40 border border-red-600 px-3 py-2 rounded">{error}</div>}
      <div className="flex gap-2">
        <button className="bg-emerald-600 px-4 py-2 rounded" onClick={handleCreateRoom}>Create Room</button>
        <input className="flex-1 bg-zinc-800 px-3 py-2 rounded" placeholder="Enter Room ID" value={joinRoom} onChange={e=>setJoinRoom(e.target.value)} />
        <button className="bg-indigo-600 px-4 py-2 rounded" onClick={handleJoinRoom}>Join Room</button>
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div>Room: <span className="font-mono bg-zinc-800 px-2 py-1 rounded">{roomId}</span></div>
          <div className="opacity-70">Players: {players.length}/6</div>
        </div>
        <div>{me.avatar} {me.name}</div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Waiting column */}
        <div className="bg-zinc-800 rounded-2xl p-4 min-h-[300px]">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">Waiting</h3>
            <span className="text-sm opacity-60">{waiting.length}</span>
          </div>
          <div className="mt-3 space-y-2">
            {waiting.length === 0 && <div className="opacity-50">No one waiting</div>}
            {waiting.map(p=> (
              <div key={p.id} className="bg-zinc-900 rounded-xl px-3 py-2">{p.avatar} {p.name}</div>
            ))}
          </div>
        </div>

        {/* Team A */}
        <div className="bg-zinc-800 rounded-2xl p-4 min-h-[300px]">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">TEAM A</h3>
            <button
              className="bg-emerald-600 px-3 py-1 rounded"
              onClick={()=>send(useStore.getState().ws,'select_team',{ player_id: me.id, team: 'A' })}
            >
              Join
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {teamA.map(p=> (
              <div key={p.id} className="bg-zinc-900 rounded-xl px-3 py-2">
                {p.avatar} {p.name} {p.seat!==undefined?`(Seat ${p.seat+1})`:''}
              </div>
            ))}
          </div>
        </div>

        {/* Team B */}
        <div className="bg-zinc-800 rounded-2xl p-4 min-h-[300px]">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">TEAM B</h3>
            <button
              className="bg-indigo-600 px-3 py-1 rounded"
              onClick={()=>send(useStore.getState().ws,'select_team',{ player_id: me.id, team: 'B' })}
            >
              Join
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {teamB.map(p=> (
              <div key={p.id} className="bg-zinc-900 rounded-xl px-3 py-2">
                {p.avatar} {p.name} {p.seat!==undefined?`(Seat ${p.seat+1})`:''}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <button
          className="bg-white/10 px-4 py-2 rounded"
          onClick={()=>send(useStore.getState().ws,'start',{})}
        >
          Start Game
        </button>
        <button
          className="bg-zinc-700 px-3 py-2 rounded"
          onClick={()=>send(useStore.getState().ws,'sync',{})}
        >
          Sync
        </button>
      </div>

      {error && <div className="mt-3 bg-red-900/40 border border-red-600 px-3 py-2 rounded">{error}</div>}
    </div>
  );
}
