#!/usr/bin/env bash
# Runs ON THE VM. Swaps in a standalone build that CI already produced.
#
# Why not build here: the e2-micro (~955MB RAM) OOMs on `next build` and has to
# be resized up and back down, costing ~40 minutes per deploy. CI builds the
# identical output on a 16GB runner every push and used to throw it away.
#
# node_modules is still installed HERE rather than shipped from CI, so native
# modules (better-sqlite3) are built against this host's Node rather than the
# runner's. That install is ~25s, versus ~24 minutes for a full rebuild.
#
# EVERYTHING under /opt/matrix-dash is root-owned, so every file operation
# needs sudo — an earlier version of this script only sudo'd the systemctl
# calls, which stopped the service and then failed every rm/mv, taking
# production down until it was restarted by hand.
set -euo pipefail

APP_DIR="/opt/matrix-dash"
STANDALONE="$APP_DIR/.next/standalone"
BACKUP="$APP_DIR/.next/standalone.prev"
ARTIFACT="/tmp/deploy-artifact.tar.gz"

[ -f "$ARTIFACT" ] || { echo "missing $ARTIFACT — did the upload step run?" >&2; exit 1; }

# Any failure after the service is stopped must put it back, or a partial
# deploy silently leaves the site down.
service_stopped=0
restore_on_failure() {
  local code=$?
  if [ "$code" -ne 0 ] && [ "$service_stopped" -eq 1 ]; then
    echo "!!! deploy failed (exit $code) — restoring previous build and restarting" >&2
    if [ -d "$BACKUP" ]; then
      sudo rm -rf "$STANDALONE"
      sudo mv "$BACKUP" "$STANDALONE"
    fi
    sudo systemctl start matrix-dash || true
    echo "!!! service restarted on the previous build; nothing was lost" >&2
  fi
  exit $code
}
trap restore_on_failure EXIT

echo "=== extracting ==="
sudo rm -rf /tmp/md-extract && sudo mkdir -p /tmp/md-extract
sudo tar -xzf "$ARTIFACT" -C /tmp/md-extract
[ -d /tmp/md-extract/standalone ] || { echo "artifact has no standalone/ dir" >&2; exit 1; }

# Fail before touching the live install if secrets aren't where we expect —
# a half-swapped standalone with no .env.production is a broken site.
[ -f "$APP_DIR/.env.production" ] || { echo "missing $APP_DIR/.env.production" >&2; exit 1; }

echo "=== stopping service ==="
sudo systemctl stop matrix-dash
service_stopped=1

echo "=== swapping standalone (keeping previous for rollback) ==="
sudo rm -rf "$BACKUP"
sudo mv "$STANDALONE" "$BACKUP"
sudo mkdir -p "$APP_DIR/.next"
sudo mv /tmp/md-extract/standalone "$STANDALONE"

# The standalone server runs with cwd=.next/standalone and reads its env from
# THERE, not the app root — miss this and OAuth secrets fall back to placeholders.
sudo cp "$APP_DIR/.env.production" "$STANDALONE/.env.production"
sudo chmod 600 "$STANDALONE/.env.production"
sudo cp "$APP_DIR/package.json" "$APP_DIR/pnpm-lock.yaml" "$STANDALONE/"

echo "=== production install (native modules) ==="
cd "$STANDALONE"
sudo env CI=true pnpm install --frozen-lockfile --prod

echo "=== restarting ==="
sudo systemctl restart matrix-dash
sleep 4
sudo systemctl status matrix-dash --no-pager | head -5

code=$(curl -s -o /dev/null -w '%{http_code}' localhost:3000/)
echo "localhost:3000 -> $code"
# 307 is the expected auth redirect; anything 5xx or 000 means a broken swap.
case "$code" in
  2*|3*) ;;
  *) echo "app did not come up healthy (got $code)" >&2; exit 1 ;;
esac

sudo curl -s localhost:3000/api/runner/download | grep -a -o 'RUNNER_VERSION = "[0-9.]*"' | head -1
service_stopped=0
echo "=== applied. previous build kept at $BACKUP ==="
