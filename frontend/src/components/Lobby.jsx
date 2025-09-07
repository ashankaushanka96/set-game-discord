import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { connectWS, send } from "../ws";

export default function Lobby() {
  const { me, setMe, setWS, setRoom, roomId, state, applyServer } = useStore();
  const [name, setName] = useState(me?.name || `Player ${Math.random().toString(16).slice(2,6)}`);
  const [avatar, setAvatar] = useState(me?.avatar || "🔥");
  const [roomInput, setRoomInput] = useState(roomId || "");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMe({ id: me?.id || crypto.randomUUID(), name, avatar });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const joinRoom = () => {
    const rid = roomInput.trim();
    if (!rid) return;
    setRoom(rid);
    const ws = connectWS(rid, useStore.getState().me.id, applyServer);
    setWS(ws);
    // Ask current state (in case server doesn't push immediately)
    setTimeout(() => send(ws, "sync", {}), 200);
  };

  const startGame = () => {
    send(useStore.getState().ws, "start", {});
  };

  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomInput);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };

  const players = useMemo(() => Object.values(state?.players || {}), [state]);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Card Set Collection – Lobby</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-zinc-900/50 rounded-xl p-4">
          <h2 className="font-semibold mb-2">Create Profile (per tab)</h2>
          <label className="block text-sm mb-1">Name</label>
          <input
            className="w-full bg-zinc-800 rounded px-3 py-2 mb-3"
            value={name}
            onChange={(e)=>{ setName(e.target.value); setMe({ ...useStore.getState().me, name: e.target.value }); }}
          />
          <label className="block text-sm mb-1">Avatar</label>
          <input
            className="w-full bg-zinc-800 rounded px-3 py-2"
            value={avatar}
            onChange={(e)=>{ setAvatar(e.target.value); setMe({ ...useStore.getState().me, avatar: e.target.value }); }}
          />
        </div>

        <div className="bg-zinc-900/50 rounded-xl p-4">
          <h2 className="font-semibold mb-2">Room</h2>
          <label className="block text-sm mb-1">Room ID</label>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-zinc-800 rounded px-3 py-2"
              value={roomInput}
              onChange={(e)=>setRoomInput(e.target.value)}
              placeholder="e.g., 04fa97"
            />
            <button
              className="bg-zinc-700 px-3 rounded hover:bg-zinc-600"
              onClick={copyRoomId}
              title="Copy Room ID"
            >
              📋
            </button>
          </div>
          {copied && <div className="text-xs mt-1 text-emerald-400">Copied!</div>}

          <div className="mt-3 flex gap-2">
            <button className="bg-indigo-600 px-4 py-2 rounded" onClick={joinRoom}>Join</button>
            <button className="bg-emerald-600 px-4 py-2 rounded" onClick={startGame}>Start</button>
          </div>
        </div>

        <div className="bg-zinc-900/50 rounded-xl p-4">
          <h2 className="font-semibold mb-2">Teams</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="inline-flex items-center gap-2 text-sm mb-2">
                <span className="inline-block h-2 w-2 rounded-full bg-blue-400"></span>
                <span>Team A</span>
              </div>
              <div className="space-y-2">
                {players.filter(p=>p.team==='A').map(p=>(
                  <div key={p.id} className="bg-blue-600/10 rounded px-3 py-2 text-sm">
                    {p.avatar} {p.name}
                  </div>
                ))}
              </div>
              <button
                className="mt-3 bg-blue-600/30 hover:bg-blue-600/40 px-3 py-1 rounded text-sm"
                onClick={()=>send(useStore.getState().ws,'select_team',{ player_id: useStore.getState().me.id, team:'A' })}
              >
                Join Team A
              </button>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 text-sm mb-2">
                <span className="inline-block h-2 w-2 rounded-full bg-rose-400"></span>
                <span>Team B</span>
              </div>
              <div className="space-y-2">
                {players.filter(p=>p.team==='B').map(p=>(
                  <div key={p.id} className="bg-rose-600/10 rounded px-3 py-2 text-sm">
                    {p.avatar} {p.name}
                  </div>
                ))}
              </div>
              <button
                className="mt-3 bg-rose-600/30 hover:bg-rose-600/40 px-3 py-1 rounded text-sm"
                onClick={()=>send(useStore.getState().ws,'select_team',{ player_id: useStore.getState().me.id, team:'B' })}
              >
                Join Team B
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Player list */}
      <div className="mt-6 bg-zinc-900/50 rounded-xl p-4">
        <h2 className="font-semibold mb-2">Players</h2>
        <div className="flex flex-wrap gap-2">
          {players.map(p=>(
            <div key={p.id} className="px-3 py-2 bg-zinc-800 rounded">
              {p.avatar} {p.name} <span className="opacity-60 text-xs">{p.team ? `(${p.team})` : ''}</span>
            </div>
          ))}
          {!players.length && <div className="opacity-60 text-sm">No one yet. Join the room to appear here.</div>}
        </div>
      </div>
    </div>
  );
}
