#!/usr/bin/env bash
# Runs ON THE MAC. Downloads the build CI already made for a commit and applies
# it to the VM. No resize cycle — the e2-micro never builds anything.
#
#   ./deploy/deploy.sh            # deploy origin/main's current HEAD
#   ./deploy/deploy.sh <sha>      # deploy a specific commit
#
# Falls back to nothing: if the artifact is missing (CI still running, failed,
# or older than the 14-day retention), this exits rather than half-deploying.
# The resize procedure in the matrix-dash-deploy-verify skill is the break-glass
# path for that case.
set -euo pipefail

REPO="ZachBoyd1912/matrix-dash"
ZONE="us-east1-b"
PROJECT="matrix-dashboard-id"
SHA="${1:-$(git rev-parse origin/main)}"

echo "=== deploying $SHA ==="

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "=== downloading CI artifact ==="
if ! gh run download --repo "$REPO" --name "standalone-$SHA" --dir "$WORK" 2>/dev/null; then
  echo "No artifact 'standalone-$SHA'." >&2
  echo "CI may still be running, may have failed, or the artifact expired." >&2
  echo "Check: gh run list --repo $REPO --limit 5" >&2
  exit 1
fi

echo "=== uploading to VM ==="
gcloud compute scp "$WORK/deploy-artifact.tar.gz" \
  "matrix-dash:/tmp/deploy-artifact.tar.gz" --zone="$ZONE" --project="$PROJECT"

# reset --hard so the VM's checkout exactly matches the commit the artifact was
# built from — a drifted checkout is how a deploy silently ships mismatched
# source and build. .env.production is untracked there, so it survives.
echo "=== syncing source + applying ==="
gcloud compute ssh matrix-dash --zone="$ZONE" --project="$PROJECT" \
  --command="cd /opt/matrix-dash && sudo git fetch origin --quiet && sudo git reset --hard --quiet $SHA && bash deploy/apply-artifact.sh"

echo
echo "=== deployed. Verify externally (a 0 exit is not proof the site changed) ==="
for host in matrix.zbautomations.ie builder.zbautomations.ie zbautomations.ie; do
  printf '%-32s ' "$host"
  curl -s -o /dev/null -w '%{http_code}\n' "https://$host"
done
