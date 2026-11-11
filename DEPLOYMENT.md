# Deployment Guide

- **Frontend**: Cloudflare Pages (project `set-game`), deployed by GitHub Actions
- **Backend**: a shared always-free GCP `e2-micro` VM (`app-server`), reached through a Cloudflare Tunnel,
  deployed by GitHub Actions + Ansible
- The VM itself is created and set up **from your Mac** with `gcloud`, since it also hosts other projects

```
Discord Activity / browser
  └─► Cloudflare Pages (set-game)
        ├─ /        built frontend (frontend/dist)
        └─ /api/*   Pages Function (frontend/functions/api/[[path]].js)
                      └─► https://set-game-backend.ashankaushanka.dev ─ tunnel ─► VM uvicorn :8001
```

The frontend calls the backend with relative `/api/v1/...` paths (REST and WebSocket), and the
Pages Function forwards them to the VM, so Discord needs only one URL mapping (`/`).

| Workflow | Runs | Does |
|---|---|---|
| **Deploy Backend to GCP** | push to `main` touching `backend/` or `ansible/`, or manually | copies the backend to the VM with Ansible and restarts its service |
| **Deploy Frontend to Cloudflare Pages** | push to `main` touching `frontend/`, or manually | builds with Vite and runs `wrangler pages deploy` |

---

## First-time setup, step by step

Do these in order. Values marked **→ GitHub** go into GitHub in step 6.

### 1. GCP billing and project

1. <https://console.cloud.google.com/billing>: the billing account must be **active with a valid
   payment method** (the old VM disappeared after billing stopped). The free tier needs a full
   billing account, not an expired trial.
2. Billing → **Budgets & alerts** → create a budget of **$5** with email alerts.
3. Install and log in to the gcloud CLI, and pick your project:
   ```bash
   brew install --cask google-cloud-sdk
   gcloud auth login
   gcloud projects list
   gcloud config set project <PROJECT_ID>
   gcloud services enable compute.googleapis.com
   ```

### 2. Deploy SSH key (for GitHub Actions)

```bash
ssh-keygen -t ed25519 -f ~/.ssh/set-game-deploy -N "" -C github-actions
cat ~/.ssh/set-game-deploy
```

**→ GitHub secret `SSH_PRIVATE_KEY`**: the whole `-----BEGIN … END-----` block.

### 3. Create the VM (Terraform)

The VM is shared with other projects, so its Terraform lives in its own folder,
`/Users/ashanpathiranage/Projects/gcp-infra`:

```bash
cd ~/Projects/gcp-infra
gcloud auth application-default login            # credentials for Terraform
cp terraform.tfvars.example terraform.tfvars     # set project_id
terraform init
terraform plan
terraform apply
terraform output external_ip
```

It creates `app-server` (e2-micro, Ubuntu 24.04, 30 GB standard disk, zone `us-central1-a`) and
installs `~/.ssh/set-game-deploy.pub` for user `ashan`. It refuses zones and disk sizes outside
the free tier.

**→ GitHub secret `HOST`**: the `external_ip` output.

### 4. Cloudflare

1. **Tunnel for the VM**, with the script in `gcp-infra` (one tunnel, `app-server`, for the whole VM).
   Create a Cloudflare API token (My Profile → API Tokens → Create Custom Token) with
   *Account › Cloudflare Tunnel › Edit* and *Zone › DNS › Edit* for `ashankaushanka.dev`, then:
   ```bash
   cd ~/Projects/gcp-infra
   printf "Cloudflare API token: "; read -rs CLOUDFLARE_API_TOKEN; echo; export CLOUDFLARE_API_TOKEN
   ./cloudflare-tunnel.sh set-game-backend.ashankaushanka.dev=http://localhost:8001
   ```
   It creates the tunnel, the hostname and its DNS record, and saves the tunnel token to
   `~/.cloudflared/app-server.token` for step 5.
2. **Pages project** (once):
   ```bash
   cd frontend
   npx wrangler login
   npx wrangler pages project create set-game --production-branch main
   ```
   Its URL is `https://set-game.pages.dev` (use whatever it prints if the name was taken).
3. **API token**: My Profile → API Tokens → Create Token → template **Edit Cloudflare Workers**.
   **→ GitHub secret `CLOUDFLARE_API_TOKEN`**
4. **Account ID**: Workers & Pages overview, right sidebar. **→ GitHub secret `CLOUDFLARE_ACCOUNT_ID`**
5. Optional: Pages project → Custom domains → add e.g. `play.ashankaushanka.dev`.

### 5. Set up the VM

Copy the setup script up and log in:

```bash
gcloud compute scp deploy/gcp/setup-vm.sh app-server:~ --zone us-central1-a
gcloud compute ssh app-server --zone us-central1-a
```

On the VM (the `read -s` prompts keep the secrets out of your shell history):

```bash
read -rsp "Cloudflare tunnel token: " TUNNEL_TOKEN; echo
read -rsp "Discord client secret: " DISCORD_SECRET; echo
sudo CLOUDFLARE_TUNNEL_TOKEN="$TUNNEL_TOKEN" \
     DISCORD_CLIENT_ID=<discord-application-id> \
     DISCORD_CLIENT_SECRET="$DISCORD_SECRET" \
     bash setup-vm.sh
```

It installs Python, swap, `cloudflared` (as a service, using the token) and the
`set-game-backend` systemd service. Details: [deploy/gcp/README.md](deploy/gcp/README.md).
The service won't run yet; the first backend deploy (step 8) installs the code.

### 6. GitHub secrets and variables

Repository → Settings → Secrets and variables → Actions.

**Secrets**

| Name | Value |
|---|---|
| `HOST` | VM IP from step 3 |
| `SSH_PRIVATE_KEY` | step 2 (replaces the old one) |
| `CLOUDFLARE_API_TOKEN` | step 4.3 |
| `CLOUDFLARE_ACCOUNT_ID` | step 4.4 |
| `DISCORD_CLIENT_SECRET` | Discord Developer Portal → OAuth2 → Client Secret (32 characters, not the bot token) |

**Variables**

| Name | Value |
|---|---|
| `DISCORD_CLIENT_ID` | Discord Application ID |
| `API_BASE` | your Pages URL, e.g. `https://set-game.pages.dev` |
| `TEST_MODE_ENABLE` | `false` (`true` allows AI bot players) |

### 7. Merge to `main`

Merge this branch into `main` and push. The push deploys the backend and the frontend.

### 8. Deploy (if the push didn't, or to redeploy)

Actions → **Deploy Backend to GCP** → Run workflow.
Actions → **Deploy Frontend to Cloudflare Pages** → Run workflow.

### 9. Check

```bash
curl -s https://set-game-backend.ashankaushanka.dev/api/v1/rooms/health   # backend via tunnel
curl -s https://set-game.pages.dev/api/v1/rooms/health                    # backend via Pages proxy
```

Both should return `{"status":"ok", ...}`. Then open the Pages URL in a browser.

### 10. Discord

Developer Portal → your application:

- **Activities → URL Mappings**: `/` → `set-game.pages.dev` (or your custom domain).
  Remove any other mappings.
- **OAuth2 → Redirects**: add `https://set-game.pages.dev` (for logging in from a normal browser).

Launch the Activity in a voice channel, on desktop and on a phone.

---

## Day to day

- Push to `main` → the changed part (frontend or backend) deploys automatically.
- Testing from your Mac inside Discord: run the backend (`backend/run.sh`), the frontend
  (`npm run dev`, or `npm run build && npm run preview` for phones) and `cloudflared tunnel run set-game`,
  then point the Discord `/` mapping at `set-game.ashankaushanka.dev`. Point it back at Pages when done.
- Other projects on the same VM: [deploy/gcp/README.md](deploy/gcp/README.md#hosting-other-projects).

## Troubleshooting

| Symptom | Check |
|---|---|
| `terraform apply` fails | billing active? ran `gcloud auth application-default login`? `~/.ssh/set-game-deploy.pub` exists? |
| Backend deploy fails to connect | `HOST` is the current VM IP; `SSH_PRIVATE_KEY` is the private half of the key in Terraform's `ssh_keys` |
| `set-game-backend…/health` fails | on the VM: `systemctl status set-game-backend cloudflared`, `journalctl -u set-game-backend -f` |
| Pages loads but API fails | the first curl in step 9 works? If not, it's the VM/tunnel, not Pages |
| Discord login hangs | `DISCORD_CLIENT_SECRET` is the OAuth2 client secret, not the bot token |
