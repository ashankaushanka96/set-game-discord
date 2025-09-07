from __future__ import annotations
import json, uuid
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict
from game import Game
from models import WSMessage, Player

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- In-memory rooms & sockets ---
rooms: Dict[str, Game] = {}
connections: Dict[str, Dict[str, WebSocket]] = {}  # room_id -> {player_id: ws}

def get_or_create_room(room_id: str) -> Game:
    if room_id not in rooms:
        rooms[room_id] = Game(room_id)
    if room_id not in connections:
        connections[room_id] = {}
    return rooms[room_id]

async def broadcast(room_id: str, type_: str, payload: dict):
    if room_id not in connections:
        return
    data = json.dumps({"type": type_, "payload": payload})
    for ws in list(connections[room_id].values()):
        await ws.send_text(data)

# --- HTTP models ---
class CreateRoomResp(BaseModel):
    room_id: str

class JoinReq(BaseModel):
    id: str
    name: str
    avatar: str

# --- HTTP endpoints ---

@app.post("/rooms", response_model=CreateRoomResp)
def create_room():
    rid = uuid.uuid4().hex[:6]
    get_or_create_room(rid)  # init
    return CreateRoomResp(room_id=rid)

@app.get("/rooms/{room_id}/state")
def get_state(room_id: str):
    if room_id not in rooms:
        raise HTTPException(status_code=404, detail="Room not found")
    return rooms[room_id].state.model_dump()

@app.post("/rooms/{room_id}/players")
def http_join_room(room_id: str, body: JoinReq):
    game = get_or_create_room(room_id)
    # Register player (no team/seat yet)
    game.state.players[body.id] = Player(**body.model_dump())
    # Broadcast to existing sockets so others see "Waiting" list update
    # (If no sockets yet, it's fine.)
    return game.state.model_dump()

# --- WebSocket endpoint ---

@app.websocket("/ws/{room_id}/{player_id}")
async def ws_endpoint(ws: WebSocket, room_id: str, player_id: str):
    await ws.accept()
    game = get_or_create_room(room_id)
    connections[room_id][player_id] = ws

    # Send snapshot to this client immediately
    await ws.send_text(json.dumps({"type": "state", "payload": game.state.model_dump()}))
    # Also notify everyone about current state (helps late joiners see you)
    await broadcast(room_id, "state", game.state.model_dump())

    try:
        while True:
            msg = await ws.receive_text()
            data = WSMessage.model_validate_json(msg)
            t = data.type
            p = data.payload

            if t == "select_team":
                game.assign_seat(p["player_id"], p["team"])
                await broadcast(room_id, "state", game.state.model_dump())

            elif t == "start":
                game.start()
                await broadcast(room_id, "state", game.state.model_dump())

            elif t == "shuffle_deal":
                game.build_deck()
                game.deal_all()
                await broadcast(room_id, "dealt", game.state.model_dump())

            elif t == "ask":
                res = game.ask(p["asker_id"], p["target_id"], p["suit"], p["set_type"], p["ranks"])
                await broadcast(room_id, "ask_result", {**res, "state": game.state.model_dump()})

            elif t == "laydown":
                res = game.laydown(p["who_id"], p["suit"], p["set_type"], p.get("collaborators"))
                await broadcast(room_id, "laydown_result", {**res, "state": game.state.model_dump()})

            elif t == "sync":
                await broadcast(room_id, "state", game.state.model_dump())

    except WebSocketDisconnect:
        try:
            del connections[room_id][player_id]
        except Exception:
            pass
