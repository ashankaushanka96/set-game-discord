from __future__ import annotations
import json, uuid
from typing import Dict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models import WSMessage, Player, Card
from game import Game

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
    dead = []
    for pid, ws in list(connections[room_id].items()):
        try:
            await ws.send_text(data)
        except Exception:
            dead.append(pid)
    for pid in dead:
        try:
            del connections[room_id][pid]
        except Exception:
            pass

# --- HTTP bootstrap ---
from pydantic import BaseModel

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

# --- WebSocket realtime ---
@app.websocket("/ws/{room_id}/{player_id}")
async def ws_endpoint(ws: WebSocket, room_id: str, player_id: str):
    await ws.accept()
    game = get_or_create_room(room_id)
    connections[room_id][player_id] = ws

    await ws.send_text(json.dumps({"type": "state", "payload": game.state.model_dump()}))
    await broadcast(room_id, "state", game.state.model_dump())

    try:
        while True:
            text = await ws.receive_text()
            data = WSMessage.model_validate_json(text)
            t = data.type
            p = data.payload or {}

            if t == "select_team":
                game.assign_seat(p["player_id"], p["team"])
                await broadcast(room_id, "state", game.state.model_dump())

            elif t == "start":
                game.start()
                await broadcast(room_id, "state", game.state.model_dump())
                await broadcast(room_id, "game_started", {
                    "message": "Game has started!",
                    "state": game.state.model_dump()
                })

            elif t == "shuffle_deal":
                # Only allow shuffle_deal when game is ready, ended, or in lobby
                if game.state.phase in ["ready", "ended", "lobby"]:
                    res = game.shuffle_deal_new_game(p.get("dealer_id", player_id))
                    await broadcast(room_id, "new_game_started", {**res, "state": game.state.model_dump()})
                else:
                    # Game in progress - send error
                    await broadcast(room_id, "shuffle_deal_error", {
                        "reason": "game_in_progress",
                        "message": "Cannot shuffle and deal during active game. Use abort game first."
                    })

            elif t == "ask":
                # announce start (for bubbles)
                await broadcast(room_id, "ask_started", {
                    "asker_id": p["asker_id"], "target_id": p["target_id"],
                    "suit": p["suit"], "set_type": p["set_type"], "ranks": p.get("ranks") or [],
                    "state": game.state.model_dump(),
                })
                res = game.prepare_ask(p["asker_id"], p["target_id"], p["suit"], p["set_type"], p.get("ranks") or [])
                # If target is empty-handed, respond immediately as a result (no pending modal)
                if res.get("reason") == "target_empty":
                    await broadcast(room_id, "ask_result", {
                        "asker_id": p["asker_id"],
                        "target_id": p["target_id"],
                        "success": False,
                        "reason": "target_empty",
                        "suit": p["suit"],
                        "ranks": p.get("ranks") or [],
                        "transferred": [],
                        "state": game.state.model_dump(),
                    })
                # If needs explicit "NO" confirmation, send ask_pending
                elif res.get("needs_no_confirm", False):
                    await broadcast(room_id, "ask_pending", {**res, "state": game.state.model_dump()})
                # Otherwise, target has cards; send ask_pending with those cards
                else:
                    await broadcast(room_id, "ask_pending", {**res, "state": game.state.model_dump()})

            elif t == "confirm_pass":
                cards = [Card(**c) for c in (p.get("cards") or [])]
                res = game.confirm_pass(p["asker_id"], p["target_id"], cards)
                await broadcast(room_id, "ask_result", {
                    "asker_id": p["asker_id"],
                    "target_id": p["target_id"],
                    "cards": [c.model_dump() for c in cards],
                    "success": res.get("success", False),
                    "reason": res.get("reason"),
                    "suit": p.get("suit"),
                    "ranks": p.get("ranks"),
                    "transferred": res.get("transferred", []),
                    "state": game.state.model_dump(),
                })

            elif t == "laydown":
                await broadcast(room_id, "laydown_started", {
                    "who_id": p["who_id"], "suit": p["suit"], "set_type": p["set_type"],
                    "collaborators": p.get("collaborators") or [],
                    "state": game.state.model_dump(),
                })
                try:
                    res = game.laydown(p["who_id"], p["suit"], p["set_type"], p.get("collaborators"))
                    await broadcast(room_id, "laydown_result", {**res, "state": game.state.model_dump()})
                except ValueError as e:
                    await broadcast(room_id, "laydown_error", {
                        "error": str(e),
                        "who_id": p["who_id"],
                        "suit": p["suit"],
                        "set_type": p["set_type"],
                        "state": game.state.model_dump()
                    })

            elif t == "pass_cards":
                try:
                    # Convert card dicts to Card objects
                    cards = [Card(**card) for card in p["cards"]]
                    res = game.pass_cards(p["from_player_id"], p["to_player_id"], cards)
                    await broadcast(room_id, "state", game.state.model_dump())
                    await broadcast(room_id, "cards_passed", {**res, "state": game.state.model_dump()})
                except ValueError as e:
                    await broadcast(room_id, "pass_cards_error", {
                        "error": str(e),
                        "from_player_id": p["from_player_id"],
                        "to_player_id": p["to_player_id"],
                        "state": game.state.model_dump()
                    })


            elif t == "handoff_after_laydown":
                res = game.handoff_after_laydown(p["who_id"], p["to_id"])
                await broadcast(room_id, "state", game.state.model_dump())
                await broadcast(room_id, "handoff_result", {**res, "state": game.state.model_dump(), "from_id": p["who_id"]})

            elif t == "request_abort":
                res = game.request_abort(p["requester_id"])
                await broadcast(room_id, "abort_requested", {**res, "state": game.state.model_dump()})

            elif t == "vote_abort":
                res = game.vote_abort(p["voter_id"], p["vote"])
                if res.get("abort_executed"):
                    await broadcast(room_id, "game_aborted", {**res, "state": game.state.model_dump()})
                elif res.get("voting_failed"):
                    await broadcast(room_id, "voting_failed", {**res, "state": game.state.model_dump()})
                else:
                    await broadcast(room_id, "abort_vote_cast", {**res, "state": game.state.model_dump()})

            elif t == "shuffle_deal_new_game":
                res = game.shuffle_deal_new_game(p["dealer_id"])
                await broadcast(room_id, "new_game_started", {**res, "state": game.state.model_dump()})

            elif t == "bubble_message":
                # Forward bubble message to all players
                await broadcast(room_id, "bubble_message", {
                    "player_id": p["player_id"],
                    "variant": p["variant"],
                    **{k: v for k, v in p.items() if k not in ["type", "player_id", "variant"]}
                })

            elif t == "clear_bubble_messages":
                # Clear bubble messages for a player
                await broadcast(room_id, "clear_bubble_messages", {
                    "player_id": p["player_id"]
                })

            elif t == "start_new_round":
                # Start a new round with dealer rotation
                res = game.start_new_round(p["player_id"])
                await broadcast(room_id, "new_round_started", {**res, "state": game.state.model_dump()})

            elif t == "sync":
                await broadcast(room_id, "state", game.state.model_dump())

    except WebSocketDisconnect:
        try:
            del connections[room_id][player_id]
        except Exception:
            pass
