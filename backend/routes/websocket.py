from __future__ import annotations
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from loguru import logger

from models import WSMessage, Card
from services.game_service import GameService
from services.websocket_service import WebSocketService

router = APIRouter(prefix="/api/v1")

async def cleanup_room_immediately(room_id: str):
    """Immediately clean up a room when the last WebSocket connection is removed."""
    try:
        logger.info(f"Starting immediate cleanup of room {room_id}")
        
        # Remove from GameService
        if room_id in GameService.rooms:
            del GameService.rooms[room_id]
            logger.info(f"Removed room {room_id} from GameService")
        else:
            logger.debug(f"Room {room_id} not found in GameService")
        
        # Remove from WebSocketService connections (should already be empty)
        if room_id in WebSocketService.connections:
            del WebSocketService.connections[room_id]
            logger.info(f"Removed room {room_id} from WebSocketService connections")
        else:
            logger.debug(f"Room {room_id} not found in WebSocketService connections")
        
        logger.info(f"Successfully completed immediate cleanup of room {room_id}")
        
    except Exception as e:
        logger.error(f"Error during immediate room cleanup for {room_id}: {e}")

async def check_and_cleanup_empty_room(room_id: str):
    """Check if a room has no connected players and clean it up if so."""
    try:
        # Check if there are any WebSocket connections for this room
        has_connections = (
            room_id in WebSocketService.connections and 
            len(WebSocketService.connections[room_id]) > 0
        )
        
        if not has_connections:
            # No WebSocket connections, check if room exists in GameService
            if room_id in GameService.rooms:
                game = GameService.rooms[room_id]
                
                # Check if there are any connected players in the game state
                connected_players = [
                    player for player in game.state.players.values() 
                    if player.connected
                ]
                
                if not connected_players:
                    # No connected players, clean up the room
                    logger.info(f"Cleaning up empty room {room_id} - no connected players")
                    
                    # Remove from GameService
                    del GameService.rooms[room_id]
                    
                    # Remove from WebSocketService connections (should already be empty)
                    if room_id in WebSocketService.connections:
                        del WebSocketService.connections[room_id]
                    
                    logger.info(f"Successfully cleaned up room {room_id}")
                else:
                    logger.debug(f"Room {room_id} still has {len(connected_players)} connected players, not cleaning up")
            else:
                logger.debug(f"Room {room_id} not found in GameService, nothing to clean up")
        else:
            logger.debug(f"Room {room_id} still has WebSocket connections, not cleaning up")
            
    except Exception as e:
        logger.error(f"Error during room cleanup for {room_id}: {e}")

@router.websocket("/ws/{room_id}/{player_id}")
async def ws_endpoint(ws: WebSocket, room_id: str, player_id: str):
    logger.info(f"WebSocket connection attempt: room={room_id}, player={player_id}")
    
    await ws.accept()
    game = GameService.get_or_create_room(room_id)
    
    # Check if this is a reconnection
    was_disconnected = player_id in game.state.players and not game.state.players[player_id].connected
    # Also check if player has a seat (indicates they were in an active game)
    has_seat = player_id in game.state.players and game.state.players[player_id].seat is not None
    is_reconnection = was_disconnected or (has_seat and game.state.phase in ["ready", "playing"])
    
    connected_status = game.state.players[player_id].connected if player_id in game.state.players else 'N/A'
    logger.info(f"WebSocket connection for {player_id}: was_disconnected={was_disconnected}, has_seat={has_seat}, is_reconnection={is_reconnection}, player_exists={player_id in game.state.players}, connected={connected_status}")
    
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
        
        # If this was a reconnection, notify other players
        if is_reconnection:
            player_name = game.state.players[player_id].name
            logger.info(f"Sending player_reconnected message for {player_id} ({player_name})")
            await WebSocketService.broadcast(room_id, "player_reconnected", {
                "player_id": player_id,
                "player_name": player_name,
                "state": game.state.model_dump()
            })
            logger.info(f"Successfully notified other players that {player_id} ({player_name}) reconnected")
        else:
            logger.info(f"Not sending reconnection notification for {player_id} - is_reconnection={is_reconnection}")
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

            elif t == "add_ai_player":
                logger.info(f"Adding AI player {p['player_id']} ({p['name']}) to team {p['team']} in room {room_id}")
                from models import Player
                ai_player = Player(
                    id=p["player_id"],
                    name=p["name"],
                    avatar=p["avatar"],
                    team=p["team"],
                    connected=True
                )
                game.state.players[p["player_id"]] = ai_player
                game.assign_seat(p["player_id"], p["team"])
                await WebSocketService.broadcast(room_id, "state", game.state.model_dump())
                logger.info(f"AI player {p['player_id']} added successfully. Total players: {len(game.state.players)}")

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

            elif t == "chat_message":
                # Forward chat message to all players
                await WebSocketService.broadcast(room_id, "bubble_message", {
                    "player_id": p["player_id"],
                    "variant": "chat",
                    "text": p["text"]
                })

            elif t == "emoji_throw":
                # Forward emoji throw animation to all players
                await WebSocketService.broadcast(room_id, "emoji_animation", {
                    "from_player_id": p["from_player_id"],
                    "to_player_id": p["to_player_id"],
                    "emoji": p["emoji"],
                    "emoji_name": p["emoji_name"],
                    "category": p["category"]
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

            elif t == "unassign_player":
                res = game.unassign_player(p["admin_player_id"], p["target_player_id"])
                if res.get("success"):
                    await WebSocketService.broadcast(room_id, "player_unassigned", {**res, "state": game.state.model_dump()})
                else:
                    await WebSocketService.broadcast(room_id, "unassign_failed", {**res, "state": game.state.model_dump()})

            elif t == "approve_spectator":
                # Admin approves or rejects spectator request
                spectator_id = p["spectator_id"]
                approved = p["approved"]
                
                if spectator_id not in game.state.players:
                    await ws.send_text(json.dumps({
                        "type": "spectator_approval_error",
                        "payload": {"error": "Spectator not found"}
                    }))
                    continue
                
                spectator = game.state.players[spectator_id]
                if not spectator.is_spectator or not spectator.spectator_request_pending:
                    await ws.send_text(json.dumps({
                        "type": "spectator_approval_error", 
                        "payload": {"error": "No pending spectator request"}
                    }))
                    continue
                
                if approved:
                    # Approve spectator request
                    spectator.spectator_request_pending = False
                    if spectator_id in game.state.spectator_requests:
                        del game.state.spectator_requests[spectator_id]
                    logger.info(f"Spectator {spectator_id} ({spectator.name}) approved in room {room_id}")
                    
                    await WebSocketService.broadcast(room_id, "spectator_approved", {
                        "spectator_id": spectator_id,
                        "spectator_name": spectator.name,
                        "state": game.state.model_dump()
                    })
                else:
                    # Reject spectator request - remove player from room
                    spectator_name = spectator.name
                    del game.state.players[spectator_id]
                    if spectator_id in game.state.spectator_requests:
                        del game.state.spectator_requests[spectator_id]
                    logger.info(f"Spectator {spectator_id} ({spectator_name}) rejected and removed from room {room_id}")
                    
                    await WebSocketService.broadcast(room_id, "spectator_rejected", {
                        "spectator_id": spectator_id,
                        "spectator_name": spectator_name,
                        "state": game.state.model_dump()
                    })

            elif t == "spectator_pass_cards":
                # Spectator passes cards from one player to another (test mode only)
                from_player_id = p["from_player_id"]
                to_player_id = p["to_player_id"]
                cards = [Card(**card) for card in p["cards"]]
                
                # Validate source player
                from_player = game.state.players.get(from_player_id)
                if not from_player:
                    await ws.send_text(json.dumps({
                        "type": "spectator_pass_cards_result",
                        "payload": {"success": False, "error": "Source player not found"}
                    }))
                    continue
                
                # Validate target player
                target_player = game.state.players.get(to_player_id)
                if not target_player:
                    await ws.send_text(json.dumps({
                        "type": "spectator_pass_cards_result",
                        "payload": {"success": False, "error": "Target player not found"}
                    }))
                    continue
                
                # Validate that target is an opponent
                if target_player.team == from_player.team:
                    await ws.send_text(json.dumps({
                        "type": "spectator_pass_cards_result",
                        "payload": {"success": False, "error": "Cannot pass cards to teammate"}
                    }))
                    continue
                
                try:
                    # Use the existing pass_cards logic
                    res = game.pass_cards(from_player_id, target_player.id, cards)
                    
                    # Broadcast the result
                    await WebSocketService.broadcast(room_id, "spectator_pass_cards_result", {
                        "success": True,
                        "from_player_id": from_player_id,
                        "from_name": from_player.name,
                        "to_player_id": target_player.id,
                        "to_name": target_player.name,
                        "cards": [c.model_dump() for c in cards],
                        "state": game.state.model_dump()
                    })
                    
                    # Also broadcast the normal cards_passed event for consistency
                    await WebSocketService.broadcast(room_id, "cards_passed", {**res, "state": game.state.model_dump()})
                    
                except ValueError as e:
                    await WebSocketService.broadcast(room_id, "spectator_pass_cards_result", {
                        "success": False,
                        "error": str(e),
                        "from_player_id": from_player_id,
                        "to_player_id": target_player.id,
                        "state": game.state.model_dump()
                    })

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
                
                # Check if this was the last WebSocket connection
                remaining_connections = len(WebSocketService.connections.get(room_id, {}))
                logger.info(f"Room {room_id} now has {remaining_connections} WebSocket connections")
                
                if remaining_connections == 0:
                    # Last player disconnected, clean up the room immediately
                    logger.info(f"Last player disconnected from room {room_id}, cleaning up room")
                    await cleanup_room_immediately(room_id)
                    return  # Exit early since room is being cleaned up
            
            # Notify other players about disconnection
            await WebSocketService.broadcast(room_id, "player_disconnected", {
                "player_id": player_id,
                "player_name": player_name,
                "state": game.state.model_dump()
            })
            
        except Exception as e:
            logger.error(f"Error handling WebSocket disconnect for player {player_id}: {e}")

