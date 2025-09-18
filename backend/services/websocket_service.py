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

    @classmethod
    async def send_to_player(cls, room_id: str, player_id: str, type_: str, payload: dict):
        """Send a message to a specific player in a room"""
        if room_id not in cls.connections:
            logger.warning(f"Room {room_id} not found in connections for send_to_player")
            return False
            
        if player_id not in cls.connections[room_id]:
            logger.warning(f"Player {player_id} not found in room {room_id} connections")
            return False
            
        try:
            data = json.dumps({"type": type_, "payload": payload})
            await cls.connections[room_id][player_id].send_text(data)
            logger.debug(f"Sent {type_} to player {player_id} in room {room_id}")
            return True
        except Exception as e:
            logger.warning(f"Failed to send message to player {player_id} in room {room_id}: {e}")
            # Remove dead connection
            try:
                del cls.connections[room_id][player_id]
                logger.info(f"Removed dead connection for player {player_id} in room {room_id}")
            except Exception as del_e:
                logger.error(f"Error removing dead connection for player {player_id}: {del_e}")
            return False