from __future__ import annotations
import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from loguru import logger

from models import Player
from services.game_service import GameService

router = APIRouter(prefix="/rooms", tags=["rooms"])

class CreateRoomResp(BaseModel):
    room_id: str

class JoinReq(BaseModel):
    id: str
    name: str
    avatar: str

@router.get("/health")
def health_check():
    return {"status": "ok", "message": "Backend is running"}

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
    game = GameService.get_or_create_room(room_id)
    
    # Check if lobby is locked (game in progress)
    if game.state.lobby_locked:
        raise HTTPException(status_code=403, detail="Lobby is locked - game in progress")
    
    # Check if room is full
    if len(game.state.players) >= 6:
        raise HTTPException(status_code=403, detail="Room is full (6/6 players)")
    
    game.state.players[body.id] = Player(**body.model_dump())
    return game.state.model_dump()
