from __future__ import annotations
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import rooms_router, websocket_router
from services.websocket_service import WebSocketService

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://ashankaushanka96.github.io",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "*"  # Keep wildcard for development
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Include routers
app.include_router(rooms_router)
app.include_router(websocket_router)