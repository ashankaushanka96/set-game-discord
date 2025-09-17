#!/bin/bash
DIR="$( cd -P "$( dirname "$0" )" && pwd )"
cd "$DIR"

LOGFILE="logs/nohup.out"

# Run run.sh with nohup in background
nohup bash run.sh > "$LOGFILE" 2>&1 &

PID=$!
echo "App started with PID $PID. Logs: $LOGFILE"
