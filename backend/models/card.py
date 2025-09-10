from __future__ import annotations
from pydantic import BaseModel
from typing import Literal

Suit = Literal["hearts", "diamonds", "clubs", "spades"]
SetType = Literal["lower", "upper"]

class Card(BaseModel):
    suit: Suit
    rank: str  # "2"–"10", "J", "Q", "K", "A"
