#!/bin/bash
# Create the free-tier GCP VM for the Set Game backend (skips creation if it already exists).
# Used by .github/workflows/provision-gcp-vm.yml; can also be run locally with a logged-in gcloud:
#   SSH_PUBKEY="ssh-ed25519 AAAA..." ./deploy/gcp/create-vm.sh <gcp-project-id> [zone]
#
# Always-free tier: one e2-micro in us-central1 / us-east1 / us-west1
# with a standard persistent disk of 30 GB or less.
# SSH_PUBKEY (optional) is installed for DEPLOY_USER, who gets sudo via the GCE guest agent.
# Prints the VM's external IP as the last line.
set -euo pipefail

PROJECT="${1:?usage: $0 <gcp-project-id> [zone]}"
ZONE="${2:-us-central1-a}"
NAME="set-game-backend"
DEPLOY_USER="${DEPLOY_USER:-ashan}"

case "$ZONE" in
  us-central1-*|us-east1-*|us-west1-*) ;;
  *) echo "Zone $ZONE is outside the e2-micro free tier (us-central1, us-east1, us-west1)." >&2; exit 1 ;;
esac

if gcloud compute instances describe "$NAME" --project "$PROJECT" --zone "$ZONE" >/dev/null 2>&1; then
  echo "VM $NAME already exists in $ZONE; not creating it again." >&2
else
  # No service account: the VM needs no GCP API access, and creating it then
  # doesn't require the iam.serviceAccountUser role.
  # App traffic arrives through the Cloudflare Tunnel, so only the default SSH rule is needed.
  gcloud compute instances create "$NAME" \
    --project "$PROJECT" \
    --zone "$ZONE" \
    --machine-type e2-micro \
    --image-family ubuntu-2404-lts-amd64 \
    --image-project ubuntu-os-cloud \
    --boot-disk-type pd-standard \
    --boot-disk-size 30GB \
    --no-service-account --no-scopes \
    --labels app=set-game >&2
fi

if [ -n "${SSH_PUBKEY:-}" ]; then
  gcloud compute instances add-metadata "$NAME" --project "$PROJECT" --zone "$ZONE" \
    --metadata "ssh-keys=$DEPLOY_USER:$SSH_PUBKEY" >&2
fi

gcloud compute instances describe "$NAME" --project "$PROJECT" --zone "$ZONE" \
  --format='value(networkInterfaces[0].accessConfigs[0].natIP)'
