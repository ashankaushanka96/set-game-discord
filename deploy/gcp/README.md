# Shared VM (GCP e2-micro `app-server`)

One always-free `e2-micro` VM hosts the Set Game backend and can host other projects.
App traffic reaches it through one Cloudflare Tunnel, so there is no nginx, no SSL certificate
and no open HTTP port; only SSH (port 22) is reachable, for you and the deploy workflows.

The first-time procedure is in [DEPLOYMENT.md](../../DEPLOYMENT.md) (steps 1–5).

| Script | Runs | Does |
|---|---|---|
| [create-vm.sh](create-vm.sh) | your Mac | creates the VM if missing, installs the deploy SSH key, prints the IP |
| [setup-vm.sh](setup-vm.sh) | on the VM, with sudo | everything in the table below; safe to re-run |

## What `setup-vm.sh` sets up

Shared by every project on the VM:

| Piece | Where |
|---|---|
| Python 3 + venv, 1 GB swap | system |
| Deploy user `ashan` | `/home/ashan` |
| `cloudflared` service (one tunnel for the VM) | installed from Cloudflare's apt repo |

Set Game specific:

| Piece | Where |
|---|---|
| App directory used by Ansible | `/home/ashan/app/discord/set-game-backend` |
| Discord secrets | `/etc/set-game/backend.env` (the backend deploy also writes `.env` in the app dir) |
| `set-game-backend` systemd service on `127.0.0.1:8001` | `/etc/systemd/system/set-game-backend.service` |
| sudo rule so `ashan` can restart only that service | `/etc/sudoers.d/set-game-backend` |

## Useful commands

```bash
gcloud compute ssh app-server --zone us-central1-a

systemctl status set-game-backend cloudflared
curl -s localhost:8001/api/v1/rooms/health
journalctl -u set-game-backend -f        # live backend logs
free -h                                  # memory: 1 GB is shared by every project
```

## Hosting other projects

1. Run the project on its own **localhost port** (not 8001), ideally as its own systemd service.
2. Cloudflare Zero Trust → Tunnels → `app-server` → **Public Hostname** → add e.g.
   `other-app.ashankaushanka.dev` → `HTTP localhost:<port>`. No new tunnel and no firewall change needed.
3. Keep an eye on memory: the e2-micro has 1 GB RAM (+1 GB swap). A couple of small Python/Node
   services fit; anything heavier needs a bigger (paid) machine type.

## Cost

e2-micro + 30 GB standard disk are always free in us-central1 / us-east1 / us-west1.
The previous VM cost about **$1/month** after free-tier savings (mostly the external IP).

If you stop and start the VM, its ephemeral external IP can change; update the GitHub `HOST` secret,
or reserve a static IP (`gcloud compute addresses create`) if that gets annoying.
