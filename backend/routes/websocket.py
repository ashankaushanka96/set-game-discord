from __future__ import annotations
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from loguru import logger

from models import WSMessage, Card
from services.game_service import GameService
from services.websocket_service import WebSocketService

router = APIRouter()

@router.websocket("/ws/{room_id}/{player_id}")
async def ws_endpoint(ws: WebSocket, room_id: str, player_id: str):
    logger.info(f"WebSocket connection attempt: room={room_id}, player={player_id}")
    
    await ws.accept()
    game = GameService.get_or_create_room(room_id)
    
    # Check if this is a reconnection
    was_disconnected = player_id in game.state.players and not game.state.players[player_id].connected
    
    # Clean up any disconnected players' seats in lobby phase
    if game.state.phase == "lobby":
        cleaned_count = game.cleanup_disconnected_seats()
        if cleaned_count > 0:
            logger.info(f"Cleaned up {cleaned_count} disconnected seats when {player_id} connected")
        
        # Remove disconnected players entirely from lobby
        removed_count = game.remove_disconnected_players()
        if removed_count > 0:
            logger.info(f"Removed {removed_count} disconnected players when {player_id} connected")
    
    # Update connection status
    if player_id in game.state.players:
        game.state.players[player_id].connected = True
        logger.info(f"Player {player_id} connected to room {room_id} (reconnection: {was_disconnected})")
    else:
        logger.warning(f"Unknown player {player_id} connected to room {room_id}")
    
    # Ensure room_id exists in connections dictionary
    if room_id not in WebSocketService.connections:
        WebSocketService.connections[room_id] = {}
        logger.debug(f"Created new connection dictionary for room {room_id}")
    
    WebSocketService.connections[room_id][player_id] = ws

    await ws.send_text(json.dumps({"type": "state", "payload": game.state.model_dump()}))
    
    # Notify other players about reconnection
    if was_disconnected:
        await WebSocketService.broadcast(room_id, "player_reconnected", {
            "player_id": player_id,
            "player_name": game.state.players[player_id].name,
            "state": game.state.model_dump()
        })
    else:
        await WebSocketService.broadcast(room_id, "state", game.state.model_dump())

    try:
        while True:
            text = await ws.receive_text()
            data = WSMessage.model_validate_json(text)
            t = data.type
            p = data.payload or {}
            
            logger.debug(f"Received message from {player_id} in room {room_id}: type={t}")

            if t == "select_team":
                logger.info(f"Player {p['player_id']} selecting team {p['team']} in room {room_id}")
                game.assign_seat(p["player_id"], p["team"])
                await WebSocketService.broadcast(room_id, "state", game.state.model_dump())

            elif t == "start":
                logger.info(f"Game starting in room {room_id}")
                game.start()
                await WebSocketService.broadcast(room_id, "state", game.state.model_dump())
                await WebSocketService.broadcast(room_id, "game_started", {
                    "message": "Game has started!",
                    "state": game.state.model_dump()
                })

            elif t == "shuffle_deal":
                # Only allow shuffle_deal when game is ready, ended, or in lobby
                if game.state.phase in ["ready", "ended", "lobby"]:
                    res = game.shuffle_deal_new_game(p.get("dealer_id", player_id))
                    await WebSocketService.broadcast(room_id, "new_game_started", {**res, "state": game.state.model_dump()})
                else:
                    # Game in progress - send error
                    await WebSocketService.broadcast(room_id, "shuffle_deal_error", {
                        "reason": "game_in_progress",
                        "message": "Cannot shuffle and deal during active game. Use abort game first."
                    })

            elif t == "ask":
                # announce start (for bubbles)
                await WebSocketService.broadcast(room_id, "ask_started", {
                    "asker_id": p["asker_id"], "target_id": p["target_id"],
                    "suit": p["suit"], "set_type": p["set_type"], "ranks": p.get("ranks") or [],
                    "state": game.state.model_dump(),
                })
                res = game.prepare_ask(p["asker_id"], p["target_id"], p["suit"], p["set_type"], p.get("ranks") or [])
                # If target is empty-handed, respond immediately as a result (no pending modal)
                if res.get("reason") == "target_empty":
                    await WebSocketService.broadcast(room_id, "ask_result", {
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
                    await WebSocketService.broadcast(room_id, "ask_pending", {**res, "state": game.state.model_dump()})
                # Otherwise, target has cards; send ask_pending with those cards
                else:
                    await WebSocketService.broadcast(room_id, "ask_pending", {**res, "state": game.state.model_dump()})

            elif t == "confirm_pass":
                cards = [Card(**c) for c in (p.get("cards") or [])]
                res = game.confirm_pass(p["asker_id"], p["target_id"], cards)
                await WebSocketService.broadcast(room_id, "ask_result", {
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
                logger.info(f"Laydown attempt by {p['who_id']}: {p['suit']} {p['set_type']} in room {room_id}")
                await WebSocketService.broadcast(room_id, "laydown_started", {
                    "who_id": p["who_id"], "suit": p["suit"], "set_type": p["set_type"],
                    "collaborators": p.get("collaborators") or [],
                    "state": game.state.model_dump(),
                })
                try:
                    res = game.laydown(p["who_id"], p["suit"], p["set_type"], p.get("collaborators"))
                    success = res.get("success", False)
                    logger.info(f"Laydown result: {'SUCCESS' if success else 'FAILED'} - {p['suit']} {p['set_type']} by {p['who_id']}")
                    if res.get("game_end", {}).get("game_ended"):
                        logger.info(f"Game ended in room {room_id}: {res['game_end']}")
                    await WebSocketService.broadcast(room_id, "laydown_result", {**res, "state": game.state.model_dump()})
                except ValueError as e:
                    logger.error(f"Laydown error for {p['who_id']}: {e}")
                    await WebSocketService.broadcast(room_id, "laydown_error", {
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
                    await WebSocketService.broadcast(room_id, "state", game.state.model_dump())
                    await WebSocketService.broadcast(room_id, "cards_passed", {**res, "state": game.state.model_dump()})
                except ValueError as e:
                    await WebSocketService.broadcast(room_id, "pass_cards_error", {
                        "error": str(e),
                        "from_player_id": p["from_player_id"],
                        "to_player_id": p["to_player_id"],
                        "state": game.state.model_dump()
                    })

            elif t == "handoff_after_laydown":
                res = game.handoff_after_laydown(p["who_id"], p["to_id"])
                await WebSocketService.broadcast(room_id, "state", game.state.model_dump())
                await WebSocketService.broadcast(room_id, "handoff_result", {**res, "state": game.state.model_dump(), "from_id": p["who_id"]})

            elif t == "request_abort":
                res = game.request_abort(p["requester_id"])
                await WebSocketService.broadcast(room_id, "abort_requested", {**res, "state": game.state.model_dump()})

            elif t == "vote_abort":
                res = game.vote_abort(p["voter_id"], p["vote"])
                if res.get("abort_executed"):
                    await WebSocketService.broadcast(room_id, "game_aborted", {**res, "state": game.state.model_dump()})
                elif res.get("voting_failed"):
                    await WebSocketService.broadcast(room_id, "voting_failed", {**res, "state": game.state.model_dump()})
                else:
                    await WebSocketService.broadcast(room_id, "abort_vote_cast", {**res, "state": game.state.model_dump()})

            elif t == "shuffle_deal_new_game":
                res = game.shuffle_deal_new_game(p["dealer_id"])
                await WebSocketService.broadcast(room_id, "new_game_started", {**res, "state": game.state.model_dump()})

            elif t == "bubble_message":
                # Forward bubble message to all players
                await WebSocketService.broadcast(room_id, "bubble_message", {
                    "player_id": p["player_id"],
                    "variant": p["variant"],
                    **{k: v for k, v in p.items() if k not in ["type", "player_id", "variant"]}
                })

            elif t == "clear_bubble_messages":
                # Clear bubble messages for a player
                await WebSocketService.broadcast(room_id, "clear_bubble_messages", {
                    "player_id": p["player_id"]
                })

            elif t == "start_new_round":
                # Start a new round with dealer rotation
                res = game.start_new_round(p["player_id"])
                await WebSocketService.broadcast(room_id, "new_round_started", {**res, "state": game.state.model_dump()})

            elif t == "request_back_to_lobby":
                res = game.request_back_to_lobby(p["requester_id"])
                if res.get("success"):
                    await WebSocketService.broadcast(room_id, "back_to_lobby_success", {**res, "state": game.state.model_dump()})
                else:
                    await WebSocketService.broadcast(room_id, "back_to_lobby_requested", {**res, "state": game.state.model_dump()})

            elif t == "vote_back_to_lobby":
                res = game.vote_back_to_lobby(p["voter_id"], p["vote"])
                if res.get("success"):
                    await WebSocketService.broadcast(room_id, "back_to_lobby_success", {**res, "state": game.state.model_dump()})
                elif res.get("reason") == "voting_failed":
                    await WebSocketService.broadcast(room_id, "back_to_lobby_failed", {**res, "state": game.state.model_dump()})
                else:
                    await WebSocketService.broadcast(room_id, "back_to_lobby_vote_cast", {**res, "state": game.state.model_dump()})

            elif t == "sync":
                await WebSocketService.broadcast(room_id, "state", game.state.model_dump())

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: room={room_id}, player={player_id}")
        try:
            # Handle player disconnection based on game phase
            player_name = "Unknown"
            if player_id in game.state.players:
                player_name = game.state.players[player_id].name
                
                if game.state.phase == "lobby":
                    # In lobby phase, remove player entirely from the room
                    # Remove from any seat they might have first
                    for seat_num, seat_player_id in game.state.seats.items():
                        if seat_player_id == player_id:
                            game.state.seats[seat_num] = None
                            logger.info(f"Freed seat {seat_num} for disconnected player {player_id}")
                    
                    # Remove player from players dict
                    del game.state.players[player_id]
                    logger.info(f"Removed disconnected player {player_id} from lobby")
                else:
                    # In game phase, just mark as disconnected
                    game.state.players[player_id].connected = False
                    logger.info(f"Marked player {player_id} as disconnected in room {room_id}")
            
            # Remove from connections
            if room_id in WebSocketService.connections and player_id in WebSocketService.connections[room_id]:
                del WebSocketService.connections[room_id][player_id]
                logger.debug(f"Removed player {player_id} from connections in room {room_id}")
            
            # Notify other players about disconnection
            await WebSocketService.broadcast(room_id, "player_disconnected", {
                "player_id": player_id,
                "player_name": player_name,
                "state": game.state.model_dump()
            })
        except Exception as e:
            logger.error(f"Error handling WebSocket disconnect for player {player_id}: {e}")
