import { API_BASE } from './config.js';

const BASE = API_BASE;

export async function apiCreateRoom() {
  const r = await fetch(`${BASE}/api/v1/rooms`, { method: "POST" });
  if (!r.ok) throw new Error("Failed to create room");
  return r.json(); // {room_id}
}

export async function apiGetState(roomId) {
  const r = await fetch(`${BASE}/api/v1/rooms/${roomId}/state`);
  if (!r.ok) throw new Error("Room not found");
  return r.json();
}

export async function apiJoinRoom(roomId, player) {
  const r = await fetch(`${BASE}/api/v1/rooms/${roomId}/players`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(player),
  });
  if (!r.ok) throw new Error("Join failed");
  return r.json(); // state
}
