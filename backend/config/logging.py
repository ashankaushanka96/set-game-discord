from __future__ import annotations
import sys
from pathlib import Path
from loguru import logger

def setup_logging():
    """Configure loguru logging for the application"""
    
    # Remove default handler
    logger.remove()
    
    # Create logs directory if it doesn't exist
    logs_dir = Path("logs")
    logs_dir.mkdir(exist_ok=True)
    
    # Console logging with colors
    logger.add(
        sys.stdout,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
        level="INFO",
        colorize=True
    )
    
    # File logging for all levels
    logger.add(
        logs_dir / "app.log",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}",
        level="DEBUG",
        rotation="10 MB",
        retention="7 days",
        compression="zip"
    )
    
    # Separate file for errors only
    logger.add(
        logs_dir / "errors.log",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}",
        level="ERROR",
        rotation="5 MB",
        retention="30 days",
        compression="zip"
    )
    
    # WebSocket specific logging
    logger.add(
        logs_dir / "websocket.log",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}",
        level="DEBUG",
        rotation="5 MB",
        retention="3 days",
        compression="zip",
        filter=lambda record: "websocket" in record["name"].lower() or "ws" in record["message"].lower()
    )
    
    # Game logic specific logging
    logger.add(
        logs_dir / "game.log",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}",
        level="DEBUG",
        rotation="5 MB",
        retention="7 days",
        compression="zip",
        filter=lambda record: "game" in record["name"].lower() or any(keyword in record["message"].lower() for keyword in ["laydown", "ask", "pass", "deal", "shuffle"])
    )
    
    logger.info("Logging configured successfully")
    return logger
