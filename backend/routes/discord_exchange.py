from __future__ import annotations
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os
import httpx

router = APIRouter(prefix="/api/v1", tags=["token"])

DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token"

class ExchangeBody(BaseModel):
    code: str
    redirect_uri: str | None = None

@router.post("/discord/exchange")
async def discord_exchange(body: ExchangeBody):
    print("Discord exchange attempt")
    client_id = os.getenv("DISCORD_CLIENT_ID")
    client_secret = os.getenv("DISCORD_CLIENT_SECRET")
    if not client_id or not client_secret:
        print("Discord client credentials not configured")
        raise HTTPException(status_code=500, detail="Discord client credentials not configured")

    # For Embedded Apps, redirect_uri is not actually used, but Discord requires a value
    form = {
        "client_id": client_id,
        "client_secret": client_secret,
        "grant_type": "authorization_code",
        "code": body.code,
        # For embedded apps, Discord requires a value but ignores it.
        # For standard browser OAuth, this must match the authorize redirect_uri.
        "redirect_uri": body.redirect_uri or "https://discord.com",
    }

    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(DISCORD_TOKEN_URL, data=form, headers={"Content-Type": "application/x-www-form-urlencoded"})
        if r.status_code != 200:
            # Pass along Discord's error text for easier debugging
            print("Discord exchange failed")
            raise HTTPException(status_code=400, detail={"error": "token_exchange_failed", "discord": r.text})
        data = r.json()
        # Return only what the frontend needs
        print("Discord exchange successful")
        return {"access_token": data.get("access_token")}
