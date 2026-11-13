"""Browser spectators: watch any room from outside Discord with a username and password.

The one login comes from SPECTATOR_USERNAME and SPECTATOR_PASSWORD. With either unset,
spectating is off. A login returns a signed token (SPECTATOR_SECRET, or a random
key per server start) that the room list and the watch socket need. Spectators are not players:
they are never in the game state, so nobody sees them and they don't affect pauses or votes.
Their only action is the testing tool that moves cards between any two players, with no rules.
"""
from __future__ import annotations
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException, WebSocket, WebSocketDisconnect
from loguru import logger
from pydantic import BaseModel

from models import Card
from services.game_service import GameService
from services.websocket_service import WebSocketService

router = APIRouter(prefix="/api/v1/spectate")

TOKEN_HOURS = 12
_fallback_secret = secrets.token_bytes(32)


def _users() -> dict:
    name, pw = (os.getenv("SPECTATOR_USERNAME") or "").strip(), os.getenv("SPECTATOR_PASSWORD") or ""
    return {name: pw} if name and pw else {}


def _secret() -> bytes:
    s = os.getenv("SPECTATOR_SECRET")
    return s.encode() if s else _fallback_secret


def _sign(body: str) -> str:
    return hmac.new(_secret(), body.encode(), hashlib.sha256).hexdigest()


def make_token(user: str) -> str:
    body = base64.urlsafe_b64encode(json.dumps({"u": user, "exp": int(time.time()) + TOKEN_HOURS * 3600}).encode()).decode()
    return f"{body}.{_sign(body)}"


def check_token(token: str | None) -> str | None:
    """The user name for a valid, unexpired token from a user who still exists, else None."""
    try:
        body, sig = (token or "").rsplit(".", 1)
        if not hmac.compare_digest(sig, _sign(body)):
            return None
        data = json.loads(base64.urlsafe_b64decode(body.encode()))
        if data["exp"] < time.time() or data["u"] not in _users():
            return None
        return data["u"]
    except Exception:
        return None


def _bearer(authorization: str | None) -> str:
    user = check_token((authorization or "").removeprefix("Bearer ").strip())
    if not user:
        raise HTTPException(status_code=401, detail="Please log in again")
    return user


class LoginReq(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(body: LoginReq):
    users = _users()
    if not users:
        raise HTTPException(status_code=503, detail="Spectating is not set up on this server")
    expected = users.get(body.username)
    # compare even for unknown names, so timing doesn't reveal which names exist
    ok = hmac.compare_digest((expected or "\0").encode(), body.password.encode()) and expected is not None
    if not ok:
        logger.warning("Spectator login failed")
        raise HTTPException(status_code=401, detail="Wrong username or password")
    logger.info(f"Spectator {body.username} logged in")
    return {"token": make_token(body.username), "user": body.username, "hours": TOKEN_HOURS}


@router.get("/rooms")
def rooms(authorization: str | None = Header(default=None)):
    _bearer(authorization)
    out = []
    for room_id, game in GameService.rooms.items():
        st = game.state
        seated = [p for p in st.players.values() if p.seat is not None and not p.is_spectator]
        out.append({
            "room_id": room_id, "phase": st.phase, "game_mode": st.game_mode,
            "players": [{"name": p.name, "team": p.team, "bot": game.is_bot(p.id), "connected": p.connected} for p in sorted(seated, key=lambda p: p.seat)],
            "scores": st.team_scores,
        })
    out.sort(key=lambda r: (r["phase"] != "playing", r["room_id"]))
    return {"rooms": out}


@router.websocket("/ws/{room_id}")
async def watch(ws: WebSocket, room_id: str, token: str = ""):
    user = check_token(token)
    await ws.accept()
    if not user:
        await ws.close(code=4401, reason="Please log in again")
        return
    game = GameService.rooms.get(room_id)
    if not game:
        await ws.close(code=4404, reason="That room has closed")
        return
    key = f"watch:{user}:{uuid4().hex[:8]}"   # broadcasts reach it like a player; never in the game state
    WebSocketService.connections.setdefault(room_id, {})[key] = ws
    logger.info(f"Spectator {user} watching room {room_id}")
    await ws.send_text(json.dumps({"type": "state", "payload": game.state.model_dump()}))
    try:
        while True:
            msg = json.loads(await ws.receive_text())
            if msg.get("type") != "spectator_pass_cards":
                continue
            p = msg.get("payload") or {}
            try:
                if GameService.rooms.get(room_id) is not game:
                    raise ValueError("That room has closed")
                src, dst = game.state.players.get(p.get("from_player_id")), game.state.players.get(p.get("to_player_id"))
                if not src or not dst:
                    raise ValueError("Player not found")
                cards = [Card(**c) for c in p.get("cards") or []]
                game.pass_cards(src.id, dst.id, cards, free=True)   # testing tool: no rules
                await WebSocketService.broadcast(room_id, "spectator_pass_cards_result", {
                    "success": True, "from_player_id": src.id, "from_name": src.name,
                    "to_player_id": dst.id, "to_name": dst.name,
                    "cards": [c.model_dump() for c in cards], "state": game.state.model_dump(),
                })
                await WebSocketService.broadcast(room_id, "state", game.state.model_dump())
            except (ValueError, TypeError) as e:
                await ws.send_text(json.dumps({"type": "spectator_pass_cards_result", "payload": {"success": False, "error": str(e)}}))
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        conns = WebSocketService.connections.get(room_id, {})
        if conns.get(key) is ws:
            del conns[key]
        logger.info(f"Spectator {user} stopped watching room {room_id}")
