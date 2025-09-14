from __future__ import annotations
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from routes import rooms_router, websocket_router, discord_exchange_router
from services.websocket_service import WebSocketService
from config import setup_logging
from dotenv import load_dotenv

# Load .env file into environment
load_dotenv()

# Setup logging
setup_logging()
logger.info("Starting Set Game Backend")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://ashankaushanka96.github.io",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://set-game-test.ashankaushanka.com",
        "https://set-game.ashankaushanka.com",
        "*"  # Keep wildcard for development
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Include routers
app.include_router(rooms_router)
app.include_router(websocket_router)
app.include_router(discord_exchange_router)