#!/bin/bash

DIR="$( cd -P "$( dirname "$0" )" && pwd )"
cd "$DIR"

source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8001
