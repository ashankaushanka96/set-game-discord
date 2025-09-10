from __future__ import annotations
import json
from typing import Dict
from fastapi import WebSocket

class WebSocketService:
    connections: Dict[str, Dict[str, WebSocket]] = {}  # room_id -> {player_id: ws}
    
    @classmethod
    async def broadcast(cls, room_id: str, type_: str, payload: dict):
        if room_id not in cls.connections:
            return
        data = json.dumps({"type": type_, "payload": payload})
        dead = []
        for pid, ws in list(cls.connections[room_id].items()):
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(pid)
        for pid in dead:
            try:
                del cls.connections[room_id][pid]
            except Exception:
                pass
