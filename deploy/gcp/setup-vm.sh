#!/bin/bash
# One-time setup of a fresh Ubuntu VM for the Set Game backend.
# Copy to the VM and run with sudo:
#   sudo CLOUDFLARE_TUNNEL_TOKEN=... DISCORD_CLIENT_ID=... DISCORD_CLIENT_SECRET=... \
#        DEPLOY_USER=ashan DEPLOY_PUBKEY="ssh-ed25519 AAAA... github-actions" ./setup-vm.sh
#
# Safe to re-run: every step checks before changing anything.
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-ashan}"
APP_DIR="/home/$DEPLOY_USER/app/discord/set-game-backend"   # matches ansible/backend-deploy-playbook.yml
SERVICE="set-game-backend"
ENV_FILE="/etc/set-game/backend.env"   # kept outside APP_DIR: each deploy moves APP_DIR's files into a backup
PORT=8001

if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo." >&2; exit 1; fi

echo "==> Packages"
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y python3 python3-venv python3-pip curl ca-certificates

echo "==> Swap (1 GB RAM on e2-micro; pip installs can exceed it)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Deploy user $DEPLOY_USER"
id "$DEPLOY_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$DEPLOY_USER"
if [ -n "${DEPLOY_PUBKEY:-}" ]; then
  install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
  AUTH="/home/$DEPLOY_USER/.ssh/authorized_keys"
  touch "$AUTH"
  grep -qxF "$DEPLOY_PUBKEY" "$AUTH" || echo "$DEPLOY_PUBKEY" >> "$AUTH"
  chown "$DEPLOY_USER:$DEPLOY_USER" "$AUTH"
  chmod 600 "$AUTH"
fi
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/app" "/home/$DEPLOY_USER/app/discord" "$APP_DIR"

# The deploy user may only restart/stop/start this one service, nothing else as root.
cat > "/etc/sudoers.d/$SERVICE" <<EOF
$DEPLOY_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart $SERVICE, /usr/bin/systemctl start $SERVICE, /usr/bin/systemctl stop $SERVICE, /usr/bin/systemctl status $SERVICE
EOF
chmod 440 "/etc/sudoers.d/$SERVICE"
visudo -cf "/etc/sudoers.d/$SERVICE"

echo "==> Secrets in $ENV_FILE"
install -d -m 750 -o root -g "$DEPLOY_USER" /etc/set-game
if [ -n "${DISCORD_CLIENT_ID:-}" ] && [ -n "${DISCORD_CLIENT_SECRET:-}" ]; then
  umask 027
  printf 'DISCORD_CLIENT_ID=%s\nDISCORD_CLIENT_SECRET=%s\n' "$DISCORD_CLIENT_ID" "$DISCORD_CLIENT_SECRET" > "$ENV_FILE"
  chown root:"$DEPLOY_USER" "$ENV_FILE"
  chmod 640 "$ENV_FILE"
elif [ ! -f "$ENV_FILE" ]; then
  echo "WARNING: DISCORD_CLIENT_ID/DISCORD_CLIENT_SECRET not given; Discord login will fail until $ENV_FILE exists." >&2
fi

echo "==> systemd service $SERVICE"
cat > "/etc/systemd/system/$SERVICE.service" <<EOF
[Unit]
Description=Set Game backend (FastAPI)
After=network-online.target
Wants=network-online.target

[Service]
User=$DEPLOY_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=-$ENV_FILE
ExecStart=$APP_DIR/.venv/bin/uvicorn set-game-discord-main:app --host 127.0.0.1 --port $PORT
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
# Enabled now; it starts properly after the first GitHub Actions deploy creates the venv and code.
systemctl enable "$SERVICE"

echo "==> Cloudflare Tunnel"
if ! command -v cloudflared >/dev/null; then
  install -d -m 755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
    > /etc/apt/sources.list.d/cloudflared.list
  apt-get update -y
  apt-get install -y cloudflared
fi
if [ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]; then
  if systemctl list-unit-files cloudflared.service >/dev/null 2>&1 && systemctl is-enabled cloudflared >/dev/null 2>&1; then
    echo "cloudflared service already installed; skipping."
  else
    cloudflared service install "$CLOUDFLARE_TUNNEL_TOKEN"
  fi
else
  echo "WARNING: CLOUDFLARE_TUNNEL_TOKEN not given; run 'sudo cloudflared service install <token>' later." >&2
fi

echo
echo "Done. Next: point the GitHub HOST secret at this VM and push to main (or re-run the backend deploy)."
echo "Check with: systemctl status $SERVICE cloudflared ; curl -s localhost:$PORT/api/v1/rooms/health"
