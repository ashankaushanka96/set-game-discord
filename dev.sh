#!/bin/bash
# Run the backend and frontend together for local testing. Ctrl+C stops both.
#
#   ./dev.sh             # backend (auto-reload) + Vite dev server (hot reload)
#   ./dev.sh --preview   # backend + production build served by `vite preview` (use for iPhone)
#
# Open http://localhost:5173 in a browser, or the Dev Discord Activity
# (https://set-game.ashankaushanka.dev through the cloudflared tunnel).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

MODE=dev
[ "${1:-}" = "--preview" ] && MODE=preview

for port in 8001 5173; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $port is already in use (another backend/frontend running?):" >&2
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >&2
    exit 1
  fi
done

[ -x "$ROOT/backend/.venv/bin/uvicorn" ] || { echo "Missing backend/.venv. Run: cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt" >&2; exit 1; }
[ -d "$ROOT/frontend/node_modules" ] || (cd "$ROOT/frontend" && npm install)

if ! pgrep -f "cloudflared.*tunnel run" >/dev/null; then
  echo "Note: the cloudflared tunnel isn't running, so only http://localhost:5173 works (not Discord)."
fi

pids=()
cleanup() {
  trap - INT TERM EXIT
  echo; echo "Stopping..."
  kill "${pids[@]}" 2>/dev/null || true
  # $! is the sed at the end of each pipeline; stop the servers themselves too.
  pkill -f "uvicorn set-game-discord-main:app --host 127.0.0.1 --port 8001" 2>/dev/null || true
  lsof -t -iTCP:5173 -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

# Prefix each line so the two logs can be told apart.
(cd "$ROOT/backend" && exec .venv/bin/uvicorn set-game-discord-main:app --host 127.0.0.1 --port 8001 --reload 2>&1) \
  | sed -u 's/^/[backend]  /' &
pids+=($!)

if [ "$MODE" = preview ]; then
  (cd "$ROOT/frontend" && npm run build && exec npm run preview -- --port 5173 2>&1) | sed -u 's/^/[frontend] /' &
else
  (cd "$ROOT/frontend" && exec npm run dev -- --port 5173 2>&1) | sed -u 's/^/[frontend] /' &
fi
pids+=($!)

echo "Backend:  http://localhost:8001/api/v1/rooms/health"
echo "Frontend: http://localhost:5173  ($MODE)   Discord: https://set-game.ashankaushanka.dev"
echo "Ctrl+C to stop both."
wait
