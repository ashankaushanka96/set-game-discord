# Deployment Guide

- **Frontend**: Cloudflare Pages (project `set-game`), deployed by GitHub Actions
- **Backend**: free-tier GCP VM behind a Cloudflare Tunnel, deployed by GitHub Actions + Ansible

```
Discord Activity / browser
  └─► Cloudflare Pages (set-game)
        ├─ /        built frontend (frontend/dist)
        └─ /api/*   Pages Function (frontend/functions/api/[[path]].js)
                      └─► https://set-game-backend.ashankaushanka.dev ─ tunnel ─► VM :8001
```

The frontend calls the backend with relative `/api/v1/...` paths (REST and WebSocket), so the
Pages Function forwards them to the VM. Inside Discord only one URL mapping (`/`) is needed.

## Frontend: Cloudflare Pages

### One-time setup

1. Create the Pages project (once, from your Mac):
   ```bash
   cd frontend
   npx wrangler login
   npx wrangler pages project create set-game --production-branch main
   ```
2. Create an API token: Cloudflare dashboard → My Profile → API Tokens → Create Token →
   template **Edit Cloudflare Workers** (or a custom token with *Account → Cloudflare Pages → Edit*).
3. GitHub repository → Settings → Secrets and variables → Actions:

   | Kind | Name | Value |
   |---|---|---|
   | Secret | `CLOUDFLARE_API_TOKEN` | the token from step 2 |
   | Secret | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages → Account ID |
   | Variable | `API_BASE` | the public frontend URL, e.g. `https://set-game.pages.dev` |
   | Variable | `DISCORD_CLIENT_ID` | the Discord Application ID |
   | Variable | `TEST_MODE_ENABLE` | `false` (or `true` to allow AI bot players) |

4. Optional: Pages project → Custom domains → add e.g. `play.ashankaushanka.dev`.
5. Optional: Pages project → Settings → Variables → `BACKEND_ORIGIN` to point the `/api`
   proxy somewhere other than `https://set-game-backend.ashankaushanka.dev`.

### Deploys

[frontend-deploy.yml](.github/workflows/frontend-deploy.yml) runs on pushes to `main` that touch
`frontend/`: it builds with Vite and runs `wrangler pages deploy`.
Unknown paths fall back to `index.html` (Pages' default for apps without a `404.html`),
so React Router routes like `/room/...` work on refresh.

## Backend: GCP VM

See [deploy/gcp/README.md](deploy/gcp/README.md) for creating and setting up the VM.

[backend-deploy.yml](.github/workflows/backend-deploy.yml) runs on pushes to `main` that touch
`backend/` or `ansible/`. It copies the code to the VM with Ansible, rebuilds the venv and runs
`restart.sh`, which restarts the `set-game-backend` systemd service.

Secrets used: `HOST` (VM IP) and `SSH_PRIVATE_KEY`.

## Discord

Developer Portal → Activities → URL Mappings: `/` → `set-game.pages.dev` (or your custom domain).
OAuth2 → Redirects: add the same URL for logging in from a normal browser.

## Troubleshooting

- **Frontend**: Actions logs for the Pages deploy; Cloudflare dashboard → Workers & Pages → set-game → Deployments.
- **API calls fail on Pages**: `curl https://set-game-backend.ashankaushanka.dev/api/v1/rooms/health` —
  if that fails, the problem is the VM or its tunnel, not Pages.
- **Backend**: on the VM, `journalctl -u set-game-backend -f` and `systemctl status cloudflared`.
