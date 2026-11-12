from __future__ import annotations
import asyncio
import json
import time
from uuid import uuid4
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from loguru import logger

from models import WSMessage, Card
from services.game_service import GameService
from services.websocket_service import WebSocketService

router = APIRouter(prefix="/api/v1")

# Turn Play is a memory game: give people time to see who asked whom for what, and the answer.
# A bot waits this long before each move (asking or answering), unless a player taps "Continue".
BOT_WAIT_SECONDS = 10.0
# The shuffle-and-deal animation on players' screens runs for 31.2s (see dealTiming.js).
# Nothing may start until it has finished or the dealer has skipped it.
DEAL_ANIMATION_SECONDS = 31.5
# Pause between the steps of a bot's laydown (announce, set, own cards, each teammate).
BOT_LAY_STEP_SECONDS = 1.8


async def wait_for_players(game, room_id: str, bot_id: str, kind: str):
    """Hold a bot's move until any seated player acknowledges, or BOT_WAIT_SECONDS pass."""
    game.bot_go = asyncio.Event()
    await WebSocketService.broadcast(room_id, "bot_wait", {"bot_id": bot_id, "kind": kind, "seconds": BOT_WAIT_SECONDS})
    try:
        await asyncio.wait_for(game.bot_go.wait(), BOT_WAIT_SECONDS)
    except asyncio.TimeoutError:
        pass
    finally:
        game.bot_go = None
        await WebSocketService.broadcast(room_id, "bot_wait", {"bot_id": None})


async def broadcast_ask_result(room_id: str, game, res: dict):
    await WebSocketService.broadcast(room_id, "ask_result", {
        "asker_id": res["asker_id"],
        "target_id": res["target_id"],
        "cards": res.get("cards", []),
        "success": res.get("success", False),
        "reason": res.get("reason"),
        "suit": res.get("suit"),
        "ranks": res.get("ranks"),
        "transferred": res.get("transferred", []),
        "next_turn": res.get("next_turn"),
        "state": game.state.model_dump(),
    })


async def start_ask(room_id: str, game, asker_id: str, target_id: str, suit: str, set_type: str, ranks):
    """Turns mode: register the ask and tell everyone. Raises ValueError if it isn't allowed."""
    res = game.ask_card(asker_id, target_id, suit, set_type, ranks)
    if res.get("penalty"):
        await WebSocketService.broadcast(room_id, "ask_penalty", {**res, "state": game.state.model_dump()})
        return
    await WebSocketService.broadcast(room_id, "ask_started", {
        "asker_id": asker_id, "target_id": target_id,
        "suit": suit, "set_type": set_type, "ranks": game.state.pending_ask["ranks"],
        "state": game.state.model_dump(),
    })
    await WebSocketService.broadcast(room_id, "ask_pending", {**res, "state": game.state.model_dump()})


async def bot_laydown(game, room_id: str, bot_id: str, move: dict):
    """A bot declares a set the way a player does, one step at a time, so the table can
    follow: announce, name the set, show its own cards, then point at each teammate."""
    suit, set_type, helpers = move["suit"], move["set_type"], move["collaborators"]
    shown = [bot_id] + [c["player_id"] for c in helpers]

    async def bubble(pid: str, variant: str, pause: float, **data):
        b = {"player_id": pid, "variant": variant, **data}
        active_bubbles(game)[pid] = b
        await WebSocketService.broadcast(room_id, "clear_bubble_messages", {"player_id": pid})
        await WebSocketService.broadcast(room_id, "bubble_message", b)
        await asyncio.sleep(pause)

    async def clear():
        for pid in shown:
            active_bubbles(game).pop(pid, None)
            await WebSocketService.broadcast(room_id, "clear_bubble_messages", {"player_id": pid})

    ranks = game.ranks_for(set_type)
    mine = [{"suit": suit, "rank": c.rank} for c in game.state.players[bot_id].hand if c.suit == suit and c.rank in ranks]
    await bubble(bot_id, "laydown_start", BOT_LAY_STEP_SECONDS)
    await bubble(bot_id, "laydown_set", BOT_LAY_STEP_SECONDS, suit=suit, set_type=set_type)
    await bubble(bot_id, "laydown_cards", BOT_LAY_STEP_SECONDS + 0.5, cards=mine)
    for c in helpers:
        mate = game.state.players.get(c["player_id"])
        await bubble(c["player_id"], "laydown_teammate", BOT_LAY_STEP_SECONDS,
                     teammate_name=mate.name if mate else None, cards=[{"suit": suit, "rank": r} for r in c["ranks"]])

    if game.state.phase != "playing" or game.state.turn_player != bot_id or game.state.pending_ask:
        await clear()  # the round was stopped while it was declaring
        return
    await WebSocketService.broadcast(room_id, "laydown_started", {
        "who_id": bot_id, "suit": suit, "set_type": set_type,
        "collaborators": helpers, "state": game.state.model_dump(),
    })
    await asyncio.sleep(BOT_LAY_STEP_SECONDS)
    try:
        res = game.laydown(bot_id, suit, set_type, helpers)
    except ValueError:
        await clear()
        raise
    logger.info(f"Bot laydown {'SUCCESS' if res.get('success') else 'FAILED'}: {suit} {set_type} by {bot_id}")
    await WebSocketService.broadcast(room_id, "laydown_result", {**res, "state": game.state.model_dump()})
    await clear()


async def run_bots(game, room_id: str):
    """Turns mode with bots: they answer asks made to them and play their own turns."""
    for _ in range(60):  # restarted after the next human action, so a long bot streak can't spin forever
        state = game.state
        if state.phase != "playing" or state.game_mode != "turns" or state.awaiting_start:
            return
        ask = state.pending_ask
        handoff = state.pending_handoff
        bot_answers = bool(ask) and game.is_bot(ask["target_id"])
        bot_hands_off = not ask and bool(handoff) and game.is_bot(handoff["who_id"])
        bot_plays = not ask and not handoff and bool(state.turn_player) and game.is_bot(state.turn_player)
        if not (bot_answers or bot_hands_off or bot_plays):
            return
        # Wait out the deal animation; checked in short steps so skipping it takes effect at once.
        while time.monotonic() < getattr(game, "deal_animation_until", 0):
            await asyncio.sleep(0.25)
        try:
            if bot_hands_off:
                await asyncio.sleep(1.5)
                if game.state.pending_handoff is not handoff:
                    continue
                import bot_ai
                to_id = bot_ai.choose_handoff(game, handoff["who_id"], handoff["options"]) or handoff["options"][0]
                res = game.handoff_after_laydown(handoff["who_id"], to_id)
                await WebSocketService.broadcast(room_id, "state", game.state.model_dump())
                await WebSocketService.broadcast(room_id, "handoff_result", {**res, "state": game.state.model_dump(), "from_id": handoff["who_id"]})
                continue

            bot_id = ask["target_id"] if bot_answers else state.turn_player
            kind = "answer"
            if bot_plays:
                if game.skip_empty_turn() != bot_id:
                    await WebSocketService.broadcast(room_id, "state", game.state.model_dump())
                    continue
                planned = game.bot_decide(bot_id)
                if not planned:
                    return
                kind = planned["action"]
            await wait_for_players(game, room_id, bot_id, kind)
            if game.state.pending_ask is not ask or game.state.phase != "playing":
                continue  # something changed while waiting
            if bot_answers:
                await broadcast_ask_result(room_id, game, game.answer_ask(ask["target_id"]))
                continue
            if game.state.turn_player != bot_id or game.state.pending_handoff:
                continue
            move = game.bot_decide(bot_id)
            if not move:
                return
            if move["action"] == "laydown":
                await bot_laydown(game, room_id, bot_id, move)
            else:
                await start_ask(room_id, game, bot_id, move["target_id"], move["suit"], move["set_type"], move.get("ranks") or move["rank"])
        except Exception as e:
            logger.error(f"Bot action failed in room {room_id}: {e}")
            return


def active_bubbles(game) -> dict:
    """Sticky seat bubbles (laydown in progress) by player, kept for players who reconnect."""
    if not hasattr(game, "bubbles"):
        game.bubbles = {}
    if game.state.phase != "playing":
        game.bubbles.clear()
    return game.bubbles


async def send_bubble_replay(ws: WebSocket, game):
    bubbles = list(active_bubbles(game).values())
    if bubbles or game.state.pending_ask:
        await ws.send_text(json.dumps({"type": "bubble_replay", "payload": {
            "bubbles": bubbles, "pending_ask": game.state.pending_ask,
        }}))


def maybe_run_bots(game, room_id: str):
    task = getattr(game, "bot_task", None)
    if task and not task.done():
        return
    if game.state.game_mode == "turns" and game.state.phase == "playing":
        game.bot_task = asyncio.create_task(run_bots(game, room_id))


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
    await send_bubble_replay(ws, game)
    
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

            elif t == "select_seat":
                logger.info(f"Player {p['player_id']} selecting seat {p['seat']} for team {p['team']} in room {room_id}")
                success = game.select_seat(p["player_id"], p["seat"], p["team"])
                if success:
                    await WebSocketService.broadcast(room_id, "state", game.state.model_dump())
                else:
                    # Send error message back to the player
                    await WebSocketService.send_to_player(room_id, player_id, "error", {
                        "message": "Failed to select seat. Seat may be occupied or invalid."
                    })

            elif t == "leave_seat":
                logger.info(f"Player {p['player_id']} leaving their seat in room {room_id}")
                success = game.remove_from_seat(p["player_id"])
                if success:
                    await WebSocketService.broadcast(room_id, "state", game.state.model_dump())
                else:
                    # Send error message back to the player
                    await WebSocketService.send_to_player(room_id, player_id, "error", {
                        "message": "Failed to leave seat. You may not be able to leave during an active game."
                    })

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
                level = p.get("level")
                game.bot_levels[p["player_id"]] = level if level in ("easy", "medium", "hard", "expert") else "medium"
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
                    if res.get("success"):
                        game.deal_animation_id = uuid4().hex
                        game.deal_animation_dealer = res.get("original_dealer_id") or res.get("dealer_id") or game.state.current_dealer
                        game.deal_animation_until = time.monotonic() + DEAL_ANIMATION_SECONDS
                        await WebSocketService.broadcast(room_id, "new_game_started", {**res, "animation_id": game.deal_animation_id, "state": game.state.model_dump()})
                    else:
                        await ws.send_text(json.dumps({"type": "error", "payload": {"message": res["reason"]}}))
                else:
                    # Game in progress - send error
                    await WebSocketService.broadcast(room_id, "shuffle_deal_error", {
                        "reason": "game_in_progress",
                        "message": "Cannot shuffle and deal during active game. Use abort game first."
                    })

            elif t == "skip_deal_animation":
                if (player_id == getattr(game, "deal_animation_dealer", None)
                    and p.get("animation_id") == getattr(game, "deal_animation_id", None)
                    and time.monotonic() < getattr(game, "deal_animation_until", 0)):
                    game.deal_animation_until = 0
                    await WebSocketService.broadcast(room_id, "deal_animation_skipped", {
                        "animation_id": game.deal_animation_id
                    })
                else:
                    await ws.send_text(json.dumps({"type": "error", "payload": {
                        "message": "Only the dealer can skip the current shuffle and deal."
                    }}))

            elif t == "set_game_mode":
                res = game.set_game_mode(player_id, p.get("mode"))
                if res["success"]:
                    await WebSocketService.broadcast(room_id, "state", game.state.model_dump())
                else:
                    await WebSocketService.send_to_player(room_id, player_id, "error", {"message": res["message"]})

            elif t == "ask":
                # Turns mode: the turn player asks an opponent for one card
                try:
                    await start_ask(room_id, game, player_id, p["target_id"], p["suit"], p["set_type"], p.get("ranks") or [p.get("rank")])
                except (ValueError, KeyError, IndexError) as e:
                    await WebSocketService.send_to_player(room_id, player_id, "error", {"message": str(e)})

            elif t == "penalty_laydown":
                # Voice Play: the player who made a wrong ask hands the set to the other team
                try:
                    res = game.penalty_laydown(player_id, p["suit"], p["set_type"])
                    await WebSocketService.broadcast(room_id, "ask_penalty", {**res, "state": game.state.model_dump()})
                except (ValueError, KeyError) as e:
                    await WebSocketService.send_to_player(room_id, player_id, "error", {"message": str(e)})

            elif t == "begin_play":
                # Turn Play: hands have been looked at; any seated player starts the round
                if time.monotonic() < getattr(game, "deal_animation_until", 0):
                    pass  # cards are still being dealt on screen: too early to start
                elif game.begin_play(player_id):
                    await WebSocketService.broadcast(room_id, "state", game.state.model_dump())

            elif t == "bot_continue":
                # Any seated player can let a waiting bot make its move now
                me = game.state.players.get(player_id)
                go = getattr(game, "bot_go", None)
                if go and me and not getattr(me, "is_spectator", False):
                    go.set()

            elif t == "answer_ask":
                # Turns mode: the asked player hands the card over or says they don't have it
                try:
                    await broadcast_ask_result(room_id, game, game.answer_ask(player_id))
                except ValueError as e:
                    await WebSocketService.send_to_player(room_id, player_id, "error", {"message": str(e)})

            elif t == "laydown":
                logger.info(f"Laydown attempt by {p['who_id']}: {p['suit']} {p['set_type']} in room {room_id}")
                await WebSocketService.broadcast(room_id, "laydown_started", {
                    "who_id": p["who_id"], "suit": p["suit"], "set_type": p["set_type"],
                    "collaborators": p.get("collaborators") or [],
                    "state": game.state.model_dump(),
                })
                try:
                    res = game.laydown(p["who_id"], p["suit"], p["set_type"], p.get("collaborators"))
                    for c in [p["who_id"]] + [x.get("player_id") for x in (p.get("collaborators") or []) if isinstance(x, dict)]:
                        active_bubbles(game).pop(c, None)
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
                if res.get("success") and game._vote_passed(game.state.abort_votes):
                    # Every team with a human has voted (e.g. one human playing with bots)
                    res = game._execute_abort()
                    await WebSocketService.broadcast(room_id, "game_aborted", {**res, "state": game.state.model_dump()})
                else:
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
                if res.get("success"):
                    game.deal_animation_id = uuid4().hex
                    game.deal_animation_dealer = res.get("original_dealer_id") or res.get("dealer_id") or game.state.current_dealer
                    game.deal_animation_until = time.monotonic() + DEAL_ANIMATION_SECONDS
                    await WebSocketService.broadcast(room_id, "new_game_started", {**res, "animation_id": game.deal_animation_id, "state": game.state.model_dump()})
                else:
                    await ws.send_text(json.dumps({"type": "error", "payload": {"message": res["reason"]}}))

            elif t == "bubble_message":
                # Forward bubble message to all players
                bubble = {
                    "player_id": p["player_id"],
                    "variant": p["variant"],
                    **{k: v for k, v in p.items() if k not in ["type", "player_id", "variant"]}
                }
                # Remember sticky (non-chat) bubbles so a reconnecting player sees them again
                if bubble["variant"] != "chat":
                    active_bubbles(game)[bubble["player_id"]] = bubble
                await WebSocketService.broadcast(room_id, "bubble_message", bubble)

            elif t == "chat_message":
                text = str(p.get("text", "")).strip()[:100]
                if not text:
                    continue
                # Attribute chat to the player on this connection.
                await WebSocketService.broadcast(room_id, "bubble_message", {
                    "player_id": player_id,
                    "variant": "chat",
                    "text": text
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
                active_bubbles(game).pop(p["player_id"], None)
                await WebSocketService.broadcast(room_id, "clear_bubble_messages", {
                    "player_id": p["player_id"]
                })

            elif t == "start_new_round":
                # Start a new round with dealer rotation
                res = game.start_new_round(player_id)
                if res.get("success"):
                    await WebSocketService.broadcast(room_id, "new_round_started", {**res, "state": game.state.model_dump()})
                else:
                    await ws.send_text(json.dumps({"type": "error", "payload": {"message": res["reason"]}}))

            elif t == "finish_match":
                res = game.finish_match(player_id)
                if res.get("success"):
                    await WebSocketService.broadcast(room_id, "match_finished", {**res, "state": game.state.model_dump()})
                else:
                    await ws.send_text(json.dumps({"type": "error", "payload": {"message": res["reason"]}}))

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

            maybe_run_bots(game, room_id)

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: room={room_id}, player={player_id}")
        # A reconnect may already have replaced this socket; the stale socket's close
        # must not remove the player (or the new connection) from the room.
        if WebSocketService.connections.get(room_id, {}).get(player_id) is not ws:
            logger.info(f"Ignoring close of stale socket for {player_id} in room {room_id}")
            return
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

