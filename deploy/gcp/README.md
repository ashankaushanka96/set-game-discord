# Backend on a free-tier GCP VM

The backend runs on one always-free `e2-micro` VM. App traffic reaches it through a
Cloudflare Tunnel, so there is no nginx, no SSL certificate and no open HTTP port.
Deploys keep using the existing GitHub Actions + Ansible workflow.

```
Discord Activity ─► <client_id>.discordsays.com ─► Cloudflare Pages (set-game)
                                                     ├─ /       frontend files
                                                     └─ /api/*  Pages Function proxy
                                                                  └─► set-game-backend.ashankaushanka.dev
                                                                        └─ Cloudflare Tunnel ─► VM: uvicorn 127.0.0.1:8001
```

The frontend is on Cloudflare Pages (see [DEPLOYMENT.md](../../DEPLOYMENT.md)); the VM runs only the backend.

## 0. Billing (do this first)

- Billing → the billing account must be **active with a valid payment method**.
  The old VM disappeared after billing dropped to $0 around June 2025.
- Billing → Budgets & alerts → create a **$5 budget** with email alerts.

## 1. Create the VM (on your Mac)

```bash
brew install --cask google-cloud-sdk
gcloud auth login
./deploy/gcp/create-vm.sh <gcp-project-id>          # default zone us-central1-a
```

It prints the external IP. That IP goes in the GitHub `HOST` secret (step 4).

## 2. Create the Cloudflare Tunnel (dashboard)

Cloudflare dashboard → Zero Trust → Networks → Tunnels → **Create a tunnel** (Cloudflared):

- Name: `set-game-vm`
- Public hostname: `set-game-backend.ashankaushanka.dev` → Service `HTTP` `localhost:8001`
- Copy the **tunnel token** shown in the install command (the long `eyJ...` string).

## 3. Set up the VM

Create an SSH key for GitHub Actions (on your Mac), if you don't have one:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/set-game-deploy -N "" -C github-actions
```

Copy the script up and run it:

```bash
gcloud compute scp deploy/gcp/setup-vm.sh set-game-backend:~ --zone us-central1-a
gcloud compute ssh set-game-backend --zone us-central1-a
```

On the VM:

```bash
sudo CLOUDFLARE_TUNNEL_TOKEN='eyJ...' \
     DISCORD_CLIENT_ID='...' DISCORD_CLIENT_SECRET='...' \
     DEPLOY_USER=ashan DEPLOY_PUBKEY="$(cat <<'K'
ssh-ed25519 AAAA... github-actions
K
)" bash setup-vm.sh
```

What it sets up:

| Piece | Where |
|---|---|
| Python 3 + venv, 1 GB swap | system |
| Deploy user `ashan` with your public key | `/home/ashan/.ssh/authorized_keys` |
| App directory used by Ansible | `/home/ashan/app/discord/set-game-backend` |
| Discord secrets | `/etc/set-game/backend.env` (outside the app dir, so deploys don't wipe it) |
| `set-game-backend` systemd service (starts on boot, restarts on crash) | `/etc/systemd/system/set-game-backend.service` |
| sudo rule so `ashan` can restart only that service | `/etc/sudoers.d/set-game-backend` |
| `cloudflared` service | installed from Cloudflare's apt repo |

The script is safe to re-run.

## 4. Point GitHub Actions at the VM

Repository → Settings → Secrets and variables → Actions:

- `HOST` = the VM's external IP
- `SSH_PRIVATE_KEY` = contents of `~/.ssh/set-game-deploy` (the private key)

Then re-run the backend deploy workflow (or push a change under `backend/`).
Its last step runs `restart.sh`, which restarts the systemd service.

## 5. Discord URL mappings

Developer Portal → Activities → URL Mappings: a single root mapping is enough, because
the Pages Function forwards `/api/*` to the VM.

| Prefix | Target |
|---|---|
| `/` | `set-game.pages.dev` (or the custom domain attached to the Pages project) |

Remove the old `/api/v1` proxy mapping.

## Check it

On the VM:

```bash
systemctl status set-game-backend cloudflared
curl -s localhost:8001/api/v1/rooms/health
journalctl -u set-game-backend -f        # live logs
```

From anywhere:

```bash
curl -s https://set-game-backend.ashankaushanka.dev/api/v1/rooms/health
```

## Cost

e2-micro + 30 GB standard disk are always free in us-central1 / us-east1 / us-west1.
The previous VM cost about **$1/month** after free-tier savings (mostly the external IP).
