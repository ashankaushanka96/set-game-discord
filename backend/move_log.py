"""Records the moves players make in Turn Play (humans and bots), as training data for the bots.

Each line of the log (JSON) is one human move with only what that player could see at the time:
their own hand, every player's card count and team, the sets already laid down and the public
history of asks. Player ids are replaced by seat numbers, and names are never written.

Bot moves carry "bot": their level, so they can be told apart or left out. At the end of each
game one {"result": ...} line gives the scores, so moves can be weighed by who won.

Set MOVE_LOG_PATH to change the file (default data/moves.jsonl; deploys keep data/); MOVE_LOG=off turns it off.
"""
from __future__ import annotations

import json
import os
import time
from typing import Optional

from loguru import logger


def _enabled() -> bool:
    return (os.getenv("MOVE_LOG") or "on").lower() not in ("off", "0", "false", "no")


def _path() -> str:
    return os.getenv("MOVE_LOG_PATH") or os.path.join(os.path.dirname(__file__), "data", "moves.jsonl")


def view(game, player_id: str) -> Optional[dict]:
    """What this player can see right now, with seats in place of ids."""
    st = game.state
    me = st.players.get(player_id)
    if not me or me.seat is None:
        return None
    seat = {pid: p.seat for pid, p in st.players.items() if p.seat is not None}
    s = lambda pid: seat.get(pid)
    return {
        "seat": me.seat, "team": me.team,
        "hand": sorted(f"{c.rank}{c.suit[0]}" for c in me.hand),
        "players": {str(p.seat): {"team": p.team, "cards": len(p.hand), "bot": game.is_bot(pid)}
                    for pid, p in st.players.items() if p.seat is not None},
        "laid": [{"suit": t.suit, "set_type": t.set_type, "team": t.owner_team} for t in st.table_sets],
        "scores": dict(st.team_scores),
        "history": [{"asker": s(e["asker_id"]), "target": s(e["target_id"]), "suit": e["suit"],
                     "set_type": e["set_type"], "ranks": e["ranks"], "success": e["success"]}
                    for e in getattr(game, "public_log", [])],
    }


def record(game, player_id: str, before: Optional[dict], move: dict):
    """Append one move (taken with the view from just before it)."""
    if not _enabled() or not before or game.state.game_mode != "turns":
        return
    seat = {pid: p.seat for pid, p in game.state.players.items() if p.seat is not None}
    move = dict(move)
    for k in ("target_id", "to_id"):
        if k in move:
            move[k.replace("_id", "")] = seat.get(move.pop(k))
    if "collaborators" in move:
        move["collaborators"] = [{"seat": seat.get(c.get("player_id")), "ranks": c.get("ranks")}
                                 for c in move["collaborators"] or [] if isinstance(c, dict)]
    line = {"t": round(time.time()), "room": game.state.room_id, "deal": getattr(game, "deal_seed", None),
            "view": before, "move": move}
    if game.is_bot(player_id):
        line["bot"] = getattr(game, "bot_levels", {}).get(player_id, "medium")
    _write(line)


def record_result(game, result: dict):
    """One line per finished game: the final scores, so moves can be weighed by the outcome."""
    if not _enabled() or game.state.game_mode != "turns":
        return
    _write({"t": round(time.time()), "room": game.state.room_id, "deal": getattr(game, "deal_seed", None),
            "result": {"winner": result.get("winner"), "scores": {"A": result.get("team_a_score"), "B": result.get("team_b_score")},
                       "bots": {str(p.seat): getattr(game, "bot_levels", {}).get(pid) for pid, p in game.state.players.items()
                                if p.seat is not None and game.is_bot(pid)}}})


def _write(line: dict):
    try:
        path = _path()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "a") as f:
            f.write(json.dumps(line, separators=(",", ":")) + "\n")
    except OSError as e:
        logger.warning(f"Could not record a move: {e}")
