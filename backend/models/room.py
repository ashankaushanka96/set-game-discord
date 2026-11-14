from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Dict, List, Literal, Optional
from .card import Card, Suit, SetType
from .player import Player

class TableSet(BaseModel):
    suit: Suit
    set_type: SetType
    cards: List[Card]
    owner_team: str

class RoomState(BaseModel):
    room_id: str
    players: Dict[str, Player]
    seats: Dict[int, Optional[str]]
    team_scores: Dict[str, int]
    table_sets: List[TableSet]
    phase: Literal["lobby", "playing", "ended", "ready"]
    turn_player: Optional[str] = None
    ask_chain_from: Optional[str] = None
    deck_count: int = 0
    current_dealer: Optional[str] = None
    round_wins: Dict[str, int] = Field(default_factory=lambda: {"A": 0, "B": 0})
    completed_rounds: int = 0
    tied_rounds: int = 0
    round_result: Optional[dict] = None
    match_finished: bool = False
    abort_votes: Dict[str, bool] = Field(default_factory=dict)
    lobby_locked: bool = False  # True when game is active, prevents new players from joining
    back_to_lobby_votes: Dict[str, bool] = Field(default_factory=dict)  # Votes for returning to lobby
    admin_player_id: Optional[str] = None  # ID of the admin player (first player to join)
    spectator_requests: Dict[str, str] = Field(default_factory=dict)  # player_id -> player_name for pending spectator requests
    # "voice": players ask out loud and pass cards freely by dragging.
    # "turns": players ask through the game; the asked player answers with a button and turns are enforced.
    game_mode: Literal["voice", "turns"] = "voice"
    # Voice Play option: the game tracks turns. The turn player (blue spotlight) picks who they ask
    # (gold spotlight, voice_spot); only the asked player can then send cards, only to the asker.
    voice_turns: bool = False
    # Language of the table for everyone in the room, chosen by the admin in the lobby: "en" or "si"
    language: str = "en"
    voice_spot: Optional[dict] = None   # {"asker_id": ..., "target_id": ...}
    # Turns mode with bots filling empty seats: how clever they are. Set by the admin in the lobby.
    bot_level: Literal["easy", "medium", "hard", "expert"] = "medium"
    # Turns mode: the ask waiting for the target's answer (asker_id, target_id, suit, set_type, ranks, has_card)
    pending_ask: Optional[dict] = None
    # Turns mode: after a successful laydown where both helping teammates still have cards,
    # the declarer picks who gets the turn: {"who_id": ..., "options": [player ids]}
    pending_handoff: Optional[dict] = None
    # Turns mode: cards are dealt but play is held until a seated player presses Start,
    # so everyone has time to look at (and memorise) their hand.
    awaiting_start: bool = False
    # A seated player pressed Pause (to step away): the game holds like a disconnect pause
    # until someone presses Resume. Holds that player's id.
    paused_by: Optional[str] = None
