from __future__ import annotations
import json, uuid
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict
from game import Game
from models import WSMessage, Player, Card

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

@app.post("/rooms", response_model=CreateRoomResp)
def create_room():
    rid = uuid.uuid4().hex[:6]
    get_or_create_room(rid)
    return CreateRoomResp(room_id=rid)

@app.get("/rooms/{room_id}/state")
def get_state(room_id: str):
    if room_id not in rooms:
        raise HTTPException(status_code=404, detail="Room not found")
    return rooms[room_id].state.model_dump()

@app.post("/rooms/{room_id}/players")
def http_join_room(room_id: str, body: JoinReq):
    game = get_or_create_room(room_id)
    game.state.players[body.id] = Player(**body.model_dump())
    return game.state.model_dump()

@app.websocket("/ws/{room_id}/{player_id}")
async def ws_endpoint(ws: WebSocket, room_id: str, player_id: str):
    await ws.accept()
    game = get_or_create_room(room_id)
    connections[room_id][player_id] = ws

    # Snapshot to newcomer + broadcast presence
    await ws.send_text(json.dumps({"type": "state", "payload": game.state.model_dump()}))
    await broadcast(room_id, "state", game.state.model_dump())

    try:
        while True:
            msg_text = await ws.receive_text()
            data = WSMessage.model_validate_json(msg_text)
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
                # NEW: announce ask immediately so UI shows the asker's bubble
                await broadcast(room_id, "ask_started", {
                    "asker_id": p["asker_id"],
                    "target_id": p["target_id"],
                    "suit": p["suit"], "set_type": p["set_type"], "ranks": p["ranks"],
                    "state": game.state.model_dump(),
                })

                # Then prepare ask (check if target has the card)
                res = game.prepare_ask(p["asker_id"], p["target_id"], p["suit"], p["set_type"], p["ranks"])
                if not res["success"]:
                    await broadcast(room_id, "event", {
                        "kind": "ask_no_card",
                        "asker_id": p["asker_id"],
                        "target_id": p["target_id"],
                        "suit": p["suit"], "set_type": p["set_type"], "ranks": p["ranks"],
                        "state": game.state.model_dump(),
                    })
                else:
                    await broadcast(room_id, "ask_pending", {
                        "asker_id": p["asker_id"],
                        "target_id": p["target_id"],
                        "suit": p["suit"], "set_type": p["set_type"], "ranks": p["ranks"],
                        "pending_cards": res["pending_cards"],
                        "state": game.state.model_dump(),
                    })

            elif t == "confirm_pass":
                cards = [Card(**c) for c in p["cards"]]
                res = game.confirm_pass(p["asker_id"], p["target_id"], cards)
                await broadcast(room_id, "ask_result", {
                    "asker_id": p["asker_id"], "target_id": p["target_id"],
                    "cards": [c.model_dump() for c in cards],
                    "success": res["success"],
                    "state": game.state.model_dump(),
                })

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
