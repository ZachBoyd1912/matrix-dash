#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# GCE VM setup for Matrix Dashboard on matrix.zbautomations.ie
# Project: matrix-dashboard-id (project #522999215738)
# Run once — creates e2-micro VM, static IP, firewall rules.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT="matrix-dashboard-id"
ZONE="europe-west1-b"
VM_NAME="matrix-dash"
STATIC_IP_NAME="matrix-dash-ip"

echo "=== 1. Reserve static external IP ==="
if gcloud compute addresses describe "$STATIC_IP_NAME" --region=europe-west1 --project="$PROJECT" &>/dev/null; then
  echo "  Static IP '$STATIC_IP_NAME' already exists."
else
  gcloud compute addresses create "$STATIC_IP_NAME" \
    --region=europe-west1 \
    --project="$PROJECT"
  echo "  Created static IP '$STATIC_IP_NAME'."
fi
IP=$(gcloud compute addresses describe "$STATIC_IP_NAME" --region=europe-west1 --project="$PROJECT" --format="value(address)")
echo "  Static IP: $IP"

echo ""
echo "=== 2. Create e2-micro VM (free tier) ==="
if gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --project="$PROJECT" &>/dev/null; then
  echo "  VM '$VM_NAME' already exists."
else
  gcloud compute instances create "$VM_NAME" \
    --zone="$ZONE" \
    --machine-type=e2-micro \
    --boot-disk-size=10GB \
    --boot-disk-type=pd-standard \
    --image-family=ubuntu-2404-lts-amd64 \
    --image-project=ubuntu-os-cloud \
    --address="$IP" \
    --tags=http-server,https-server \
    --project="$PROJECT"
  echo "  Created VM '$VM_NAME'."
fi

echo ""
echo "=== 3. Create firewall rules (HTTP/HTTPS) ==="
if gcloud compute firewall-rules describe "allow-http" --project="$PROJECT" &>/dev/null; then
  echo "  Firewall rule 'allow-http' already exists."
else
  gcloud compute firewall-rules create "allow-http" \
    --direction=INGRESS \
    --priority=1000 \
    --network=default \
    --action=ALLOW \
    --rules=tcp:80 \
    --source-ranges=0.0.0.0/0 \
    --target-tags=http-server \
    --project="$PROJECT"
fi
if gcloud compute firewall-rules describe "allow-https" --project="$PROJECT" &>/dev/null; then
  echo "  Firewall rule 'allow-https' already exists."
else
  gcloud compute firewall-rules create "allow-https" \
    --direction=INGRESS \
    --priority=1000 \
    --network=default \
    --action=ALLOW \
    --rules=tcp:443 \
    --source-ranges=0.0.0.0/0 \
    --target-tags=https-server \
    --project="$PROJECT"
fi

echo ""
echo "=== 4. SSH into the VM to run setup-server.sh ==="
echo "    gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT"
echo ""
echo "=== Done! DNS records to set at letshost.ie ==="
echo "    zbautomations.ie       → A record → $IP"
echo "    matrix.zbautomations.ie → A record → $IP"
