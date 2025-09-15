from __future__ import annotations
import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from loguru import logger

from models import Player
from services.game_service import GameService

router = APIRouter(prefix="/api/v1/rooms", tags=["rooms"])

class CreateRoomResp(BaseModel):
    room_id: str

class JoinReq(BaseModel):
    id: str
    name: str
    avatar: str

@router.get("/health")
def health_check():
    from services.game_service import GameService
    stats = GameService.get_room_stats()
    return {
        "status": "ok", 
        "message": "Backend is running",
        "room_stats": stats
    }

@router.post("/cleanup")
def cleanup_rooms():
    """Manually trigger room cleanup and return statistics."""
    from services.game_service import GameService
    cleaned_count = GameService.cleanup_empty_rooms()
    stats = GameService.get_room_stats()
    return {
        "status": "ok",
        "message": f"Cleaned up {cleaned_count} empty rooms",
        "cleaned_count": cleaned_count,
        "room_stats": stats
    }

@router.post("/", response_model=CreateRoomResp)
def create_room():
    rid = uuid.uuid4().hex[:6]
    logger.info(f"Creating new room: {rid}")
    GameService.get_or_create_room(rid)
    return CreateRoomResp(room_id=rid)

@router.get("/{room_id}/state")
def get_state(room_id: str):
    if room_id not in GameService.rooms:
        raise HTTPException(status_code=404, detail="Room not found")
    return GameService.rooms[room_id].state.model_dump()

@router.post("/{room_id}/players")
def http_join_room(room_id: str, body: JoinReq):
    logger.info(f"Player {body.id} ({body.name}) joining room {room_id}")
    
    # Check if this looks like a Discord channel ID (long numeric string)
    is_discord_channel = room_id.isdigit() and len(room_id) > 10
    if is_discord_channel:
        logger.info(f"Auto-creating room from Discord channel ID: {room_id}")
    
    game = GameService.get_or_create_room(room_id)
    
    # Check if this is a reconnection (player already exists in game state)
    is_reconnection = body.id in game.state.players
    logger.info(f"Join request for player {body.id} in room {room_id}: is_reconnection={is_reconnection}, lobby_locked={game.state.lobby_locked}, phase={game.state.phase}")
    
    # Check if lobby is locked (game in progress)
    if game.state.lobby_locked and not is_reconnection:
        raise HTTPException(status_code=403, detail="Lobby is locked - game in progress")
    
    # Check if room is full (only for new players, not reconnections)
    if not is_reconnection and len(game.state.players) >= 6:
        raise HTTPException(status_code=403, detail="Room is full (6/6 players)")
    
    if is_reconnection:
        # Update existing player info (reconnection)
        existing_player = game.state.players[body.id]
        existing_player.name = body.name
        existing_player.avatar = body.avatar
        existing_player.connected = True  # Mark as connected
        logger.info(f"Player {body.id} reconnected to room {room_id} (existing player)")
    else:
        # Add new player
        game.state.players[body.id] = Player(**body.model_dump())
        logger.info(f"Player {body.id} successfully joined room {room_id}. Total players: {len(game.state.players)}")
    
    return game.state.model_dump()
