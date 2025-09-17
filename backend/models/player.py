from __future__ import annotations
from pydantic import BaseModel, Field
from typing import List, Optional
from .card import Card

class Player(BaseModel):
    id: str
    name: str
    avatar: str
    team: Optional[str] = None  # "A" or "B"
    seat: Optional[int] = None  # 0..5
    hand: List[Card] = Field(default_factory=list)
    connected: bool = True  # Track connection status
    is_spectator: bool = False  # True if player is a spectator
    spectator_request_pending: bool = False  # True if spectator request is pending admin approval
