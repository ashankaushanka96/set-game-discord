from __future__ import annotations
from pydantic import BaseModel

class WSMessage(BaseModel):
    type: str
    payload: dict
