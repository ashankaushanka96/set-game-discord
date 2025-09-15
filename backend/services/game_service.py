from __future__ import annotations
from typing import Dict
from loguru import logger
from game import Game

class GameService:
    rooms: Dict[str, Game] = {}
    
    @classmethod
    def get_or_create_room(cls, room_id: str) -> Game:
        if room_id not in cls.rooms:
            cls.rooms[room_id] = Game(room_id)
            logger.info(f"Created new game room: {room_id}")
        return cls.rooms[room_id]
    
    @classmethod
    def cleanup_empty_rooms(cls) -> int:
        """Clean up rooms with no connected players. Returns number of rooms cleaned up."""
        cleaned_count = 0
        rooms_to_remove = []
        
        for room_id, game in cls.rooms.items():
            # Check if room has any connected players
            connected_players = [
                player for player in game.state.players.values() 
                if player.connected
            ]
            
            if not connected_players:
                rooms_to_remove.append(room_id)
                logger.info(f"Marking room {room_id} for cleanup - no connected players")
        
        # Remove empty rooms
        for room_id in rooms_to_remove:
            del cls.rooms[room_id]
            cleaned_count += 1
            logger.info(f"Cleaned up empty room: {room_id}")
        
        if cleaned_count > 0:
            logger.info(f"Room cleanup completed: removed {cleaned_count} empty rooms")
        
        return cleaned_count
    
    @classmethod
    def get_room_stats(cls) -> Dict[str, int]:
        """Get statistics about current rooms."""
        total_rooms = len(cls.rooms)
        rooms_with_players = 0
        total_players = 0
        
        for game in cls.rooms.values():
            if game.state.players:
                rooms_with_players += 1
                total_players += len(game.state.players)
        
        return {
            "total_rooms": total_rooms,
            "rooms_with_players": rooms_with_players,
            "empty_rooms": total_rooms - rooms_with_players,
            "total_players": total_players
        }