#!/bin/bash
DIR="$( cd -P "$( dirname "$0" )" && pwd )"
cd "$DIR"

# Stop the currently running bot process
pkill -f set-game-discord-main.py

# Start the bot again
./start.sh 
