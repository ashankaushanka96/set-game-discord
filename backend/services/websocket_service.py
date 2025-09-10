from __future__ import annotations
import json
from typing import Dict
from fastapi import WebSocket
from loguru import logger

class WebSocketService:
    connections: Dict[str, Dict[str, WebSocket]] = {}  # room_id -> {player_id: ws}
    
    @classmethod
    async def broadcast(cls, room_id: str, type_: str, payload: dict):
        if room_id not in cls.connections:
            logger.warning(f"Room {room_id} not found in connections for broadcast")
            return
        
        data = json.dumps({"type": type_, "payload": payload})
        dead = []
        connection_count = len(cls.connections[room_id])
        
        logger.debug(f"Broadcasting {type_} to {connection_count} players in room {room_id}")
        
        for pid, ws in list(cls.connections[room_id].items()):
            try:
                await ws.send_text(data)
            except Exception as e:
                logger.warning(f"Failed to send message to player {pid} in room {room_id}: {e}")
                dead.append(pid)
        
        for pid in dead:
            try:
                del cls.connections[room_id][pid]
                logger.info(f"Removed dead connection for player {pid} in room {room_id}")
            except Exception as e:
                logger.error(f"Error removing dead connection for player {pid}: {e}")
