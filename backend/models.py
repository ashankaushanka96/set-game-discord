from __future__ import annotations
from pydantic import BaseModel, Field
from typing import List, Dict, Literal, Optional

Suit = Literal["hearts", "diamonds", "clubs", "spades"]
SetType = Literal["lower", "upper"]

class Card(BaseModel):
    suit: Suit
    rank: str  # "2"–"10", "J", "Q", "K", "A"

class Player(BaseModel):
    id: str
    name: str
    avatar: str
    team: Optional[str] = None  # "A" or "B"
    seat: Optional[int] = None  # 0..5
    hand: List[Card] = Field(default_factory=list)

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

class WSMessage(BaseModel):
    type: str
    payload: dict
