from __future__ import annotations
from typing import Dict
from game import Game

class GameService:
    rooms: Dict[str, Game] = {}
    
    @classmethod
    def get_or_create_room(cls, room_id: str) -> Game:
        if room_id not in cls.rooms:
            cls.rooms[room_id] = Game(room_id)
        return cls.rooms[room_id]
