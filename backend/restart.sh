#!/bin/bash
DIR="$( cd -P "$( dirname "$0" )" && pwd )"
cd "$DIR"

# Stop the currently running bot process
pkill -f main.py

# Start the bot again
./start.sh 
