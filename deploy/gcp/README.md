# Backend VM (GCP e2-micro)

The backend runs on one always-free `e2-micro` VM. App traffic reaches it through a
Cloudflare Tunnel, so there is no nginx, no SSL certificate and no open HTTP port; only SSH
(port 22) is reachable, for you and the deploy workflow.

Normally you never run these scripts by hand: the **Provision GCP VM** workflow does it.
The full procedure is in [DEPLOYMENT.md](../../DEPLOYMENT.md).

| Script | Runs | Does |
|---|---|---|
| [create-vm.sh](create-vm.sh) | GitHub Actions (or your Mac) | creates the VM if missing, installs the deploy SSH key, prints the IP |
| [setup-vm.sh](setup-vm.sh) | on the VM, as root | everything in the table below; safe to re-run |

## What's on the VM

| Piece | Where |
|---|---|
| Python 3 + venv, 1 GB swap | system |
| Deploy user `ashan` (key from `SSH_PRIVATE_KEY`) | `/home/ashan/.ssh/authorized_keys` |
| App directory used by Ansible | `/home/ashan/app/discord/set-game-backend` |
| Discord secrets | `/etc/set-game/backend.env` (the backend deploy also writes `.env` in the app dir) |
| `set-game-backend` systemd service (starts on boot, restarts on crash) | `/etc/systemd/system/set-game-backend.service` |
| sudo rule so `ashan` can restart only that service | `/etc/sudoers.d/set-game-backend` |
| `cloudflared` service (tunnel token from `CLOUDFLARE_TUNNEL_TOKEN`) | installed from Cloudflare's apt repo |

## Useful commands on the VM

```bash
gcloud compute ssh set-game-backend --zone us-central1-a    # or: ssh -i ~/.ssh/set-game-deploy ashan@<HOST>

systemctl status set-game-backend cloudflared
curl -s localhost:8001/api/v1/rooms/health
journalctl -u set-game-backend -f        # live backend logs
```

## Without GitHub Actions

With the gcloud CLI logged in on your Mac (`brew install --cask google-cloud-sdk && gcloud auth login`):

```bash
SSH_PUBKEY="$(cat ~/.ssh/set-game-deploy.pub)" ./deploy/gcp/create-vm.sh <gcp-project-id>
scp -i ~/.ssh/set-game-deploy deploy/gcp/setup-vm.sh ashan@<ip>:
ssh -i ~/.ssh/set-game-deploy ashan@<ip>
sudo CLOUDFLARE_TUNNEL_TOKEN='eyJ...' DISCORD_CLIENT_ID='...' DISCORD_CLIENT_SECRET='...' \
     DEPLOY_PUBKEY="$(cat ~/.ssh/authorized_keys | head -1)" bash setup-vm.sh
```

## Cost

e2-micro + 30 GB standard disk are always free in us-central1 / us-east1 / us-west1.
The previous VM cost about **$1/month** after free-tier savings (mostly the external IP).
