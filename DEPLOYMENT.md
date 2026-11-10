# Deployment Guide

- **Frontend**: Cloudflare Pages (project `set-game`)
- **Backend**: one always-free GCP `e2-micro` VM, reached through a Cloudflare Tunnel
- **Everything is run by GitHub Actions**: creating the VM, deploying the backend, deploying the frontend

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
| **Provision GCP VM** | manually | creates the VM (if missing) and runs [deploy/gcp/setup-vm.sh](deploy/gcp/setup-vm.sh) on it |
| **Deploy Backend to GCP** | push to `main` touching `backend/` or `ansible/`, or manually | copies the backend to the VM with Ansible and restarts the service |
| **Deploy Frontend to Cloudflare Pages** | push to `main` touching `frontend/`, or manually | builds with Vite and runs `wrangler pages deploy` |

---

## First-time setup, step by step

Do these in order. Values you collect are marked **→ save as …** and all go into GitHub in step 5.

### 1. GCP billing and project

1. <https://console.cloud.google.com/billing>: the billing account must be **active with a valid
   payment method** (the old VM disappeared after billing stopped). The free tier needs a full
   billing account, not an expired trial.
2. Billing → **Budgets & alerts** → create a budget of **$5** with email alerts.
3. Pick or create a project (top bar → project picker). **→ save the Project ID as `GCP_PROJECT_ID`**
4. APIs & Services → Library → enable **Compute Engine API**.

### 2. GCP service account for GitHub Actions

IAM & Admin → **Service Accounts** → Create service account:

1. Name: `github-provisioner`
2. Role: **Compute Instance Admin (v1)**, nothing else.
3. Open it → **Keys** → Add key → Create new key → **JSON**. A `.json` file downloads.
   **→ save its whole contents as `GCP_SA_KEY`**, then delete the file from your Downloads.

> If key creation is blocked ("disableServiceAccountKeyCreation"), your account is under an
> organization policy; turn that policy off for this project or ask how to use Workload Identity instead.

### 3. Cloudflare

1. **Tunnel for the backend**: Zero Trust → Networks → Tunnels → Create a tunnel → *Cloudflared*
   - Name: `set-game-vm`
   - Skip the install command shown, but copy the token in it (the long `eyJ…` string).
     **→ save as `CLOUDFLARE_TUNNEL_TOKEN`**
   - Public hostname: subdomain `set-game-backend`, domain `ashankaushanka.dev`,
     service **HTTP** `localhost:8001`.
2. **Pages project** (on your Mac, once):
   ```bash
   cd frontend
   npx wrangler login
   npx wrangler pages project create set-game --production-branch main
   ```
   Its URL is `https://set-game.pages.dev` (Cloudflare may add a suffix if the name is taken;
   use whatever it prints).
3. **API token**: My Profile → API Tokens → Create Token → template **Edit Cloudflare Workers**.
   **→ save as `CLOUDFLARE_API_TOKEN`**
4. **Account ID**: Workers & Pages overview, right sidebar. **→ save as `CLOUDFLARE_ACCOUNT_ID`**
5. Optional: Pages project → Custom domains → add e.g. `play.ashankaushanka.dev`.

### 4. Deploy SSH key

On your Mac:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/set-game-deploy -N "" -C github-actions
cat ~/.ssh/set-game-deploy
```

**→ save the private key (the whole `-----BEGIN … END-----` block) as `SSH_PRIVATE_KEY`**.
The workflows derive the public key from it and install it on the VM.

### 5. GitHub secrets and variables

Repository → Settings → Secrets and variables → Actions.

**Secrets**

| Name | Value |
|---|---|
| `GCP_PROJECT_ID` | step 1 |
| `GCP_SA_KEY` | step 2 (whole JSON) |
| `CLOUDFLARE_TUNNEL_TOKEN` | step 3.1 |
| `CLOUDFLARE_API_TOKEN` | step 3.3 |
| `CLOUDFLARE_ACCOUNT_ID` | step 3.4 |
| `SSH_PRIVATE_KEY` | step 4 (replaces the old one) |
| `DISCORD_CLIENT_SECRET` | Discord Developer Portal → OAuth2 → Client Secret (32 characters, not the bot token) |
| `HOST` | set in step 7 |

**Variables**

| Name | Value |
|---|---|
| `DISCORD_CLIENT_ID` | Discord Application ID |
| `API_BASE` | your Pages URL, e.g. `https://set-game.pages.dev` |
| `TEST_MODE_ENABLE` | `false` (`true` allows AI bot players) |

### 6. Merge to `main`

Manual workflows only appear in the Actions tab once they are on the default branch.
Merge this branch into `main` and push.

The push also starts **Deploy Backend**; it fails until the VM exists and `HOST` is set.
That is expected and harmless.

### 7. Create the VM

Actions → **Provision GCP VM** → Run workflow (zone `us-central1-a`).
It takes about 3–5 minutes. The run summary shows the VM's IP.

**→ set the `HOST` secret to that IP.**

### 8. Deploy

Actions → **Deploy Backend to GCP** → Run workflow.
Actions → **Deploy Frontend to Cloudflare Pages** → Run workflow (if the push in step 6 didn't already).

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
- To rebuild the VM from scratch: delete it in the GCP console, run **Provision GCP VM**,
  update `HOST` if the IP changed, run **Deploy Backend to GCP**.
- Testing from your Mac inside Discord: run the backend (`backend/run.sh`), the frontend
  (`npm run dev`, or `npm run build && npm run preview` for phones) and `cloudflared tunnel run set-game`,
  then point the Discord `/` mapping at `set-game.ashankaushanka.dev`. Point it back at Pages when done.
- VM details and commands: [deploy/gcp/README.md](deploy/gcp/README.md).

## Troubleshooting

| Symptom | Check |
|---|---|
| Provision fails at "Create VM" | Compute Engine API enabled? Service account has *Compute Instance Admin (v1)*? Billing active? |
| Provision fails at "Wait for SSH" | VPC network → Firewall must have `default-allow-ssh` (port 22) |
| Backend deploy fails | `HOST` is the current VM IP; `SSH_PRIVATE_KEY` matches the key used when provisioning |
| `set-game-backend…/health` fails | on the VM: `systemctl status set-game-backend cloudflared`, `journalctl -u set-game-backend -f` |
| Pages loads but API fails | the first curl in step 9 works? If not, it's the VM/tunnel, not Pages |
| Discord login hangs | `DISCORD_CLIENT_SECRET` is the OAuth2 client secret, not the bot token |
