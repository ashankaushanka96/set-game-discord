#!/bin/bash
# Create the free-tier GCP VM for the Set Game backend.
# Run locally (needs the gcloud CLI, logged in):
#   ./deploy/gcp/create-vm.sh <gcp-project-id> [zone]
#
# Always-free tier: one e2-micro in us-central1 / us-east1 / us-west1
# with a standard persistent disk of 30 GB or less.
set -euo pipefail

PROJECT="${1:?usage: $0 <gcp-project-id> [zone]}"
ZONE="${2:-us-central1-a}"
NAME="set-game-backend"

case "$ZONE" in
  us-central1-*|us-east1-*|us-west1-*) ;;
  *) echo "Zone $ZONE is outside the e2-micro free tier (us-central1, us-east1, us-west1)." >&2; exit 1 ;;
esac

gcloud services enable compute.googleapis.com --project "$PROJECT"

gcloud compute instances create "$NAME" \
  --project "$PROJECT" \
  --zone "$ZONE" \
  --machine-type e2-micro \
  --image-family ubuntu-2404-lts-amd64 \
  --image-project ubuntu-os-cloud \
  --boot-disk-type pd-standard \
  --boot-disk-size 30GB \
  --labels app=set-game

# Only SSH (for you and the GitHub Actions deploy) needs to be reachable.
# App traffic arrives through the Cloudflare Tunnel, so no HTTP/HTTPS ports are opened.
gcloud compute instances describe "$NAME" --project "$PROJECT" --zone "$ZONE" \
  --format='value(networkInterfaces[0].accessConfigs[0].natIP)' \
  | xargs -I{} echo "VM created. External IP: {}  (use this for the GitHub HOST secret)"
