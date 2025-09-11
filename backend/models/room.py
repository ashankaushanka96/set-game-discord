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
    abort_votes: Dict[str, bool] = Field(default_factory=dict)
    lobby_locked: bool = False  # True when game is active, prevents new players from joining
    back_to_lobby_votes: Dict[str, bool] = Field(default_factory=dict)  # Votes for returning to lobby
