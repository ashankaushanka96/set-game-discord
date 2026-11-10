#!/bin/bash
DIR="$( cd -P "$( dirname "$0" )" && pwd )"
cd "$DIR"

# On servers set up with deploy/gcp/setup-vm.sh the app runs as a systemd service
if systemctl cat set-game-backend >/dev/null 2>&1; then
  sudo -n systemctl restart set-game-backend
  exit $?
fi

# Stop the currently running bot process (uvicorn runs it as set-game-discord-main:app)
pkill -f "set-game-discord-main:app"

# Start the bot again
./start.sh
