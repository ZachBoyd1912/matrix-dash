#!/usr/bin/env bash
# Runs ON THE VM. Swaps in a standalone build that CI already produced.
#
# Why not build here: the e2-micro (~955MB RAM) OOMs on `next build` and has to
# be resized up and back down, costing ~40 minutes per deploy. CI builds the
# identical output on a 16GB runner every push and used to throw it away.
#
# node_modules is still installed HERE rather than shipped from CI, so native
# modules (better-sqlite3) are built against this host's Node instead of the
# runner's. That install is ~25s, versus ~24 minutes for a full rebuild.
set -euo pipefail

APP_DIR="/opt/matrix-dash"
STANDALONE="$APP_DIR/.next/standalone"
ARTIFACT="/tmp/deploy-artifact.tar.gz"

[ -f "$ARTIFACT" ] || { echo "missing $ARTIFACT — did the upload step run?" >&2; exit 1; }

echo "=== extracting ==="
rm -rf /tmp/md-extract && mkdir -p /tmp/md-extract
tar -xzf "$ARTIFACT" -C /tmp/md-extract
[ -d /tmp/md-extract/standalone ] || { echo "artifact has no standalone/ dir" >&2; exit 1; }

# Fail before touching the live install if secrets aren't where we expect —
# a half-swapped standalone with no .env.production is a broken site.
[ -f "$APP_DIR/.env.production" ] || { echo "missing $APP_DIR/.env.production" >&2; exit 1; }

echo "=== stopping service ==="
sudo systemctl stop matrix-dash

echo "=== swapping standalone ==="
rm -rf "$STANDALONE"
mkdir -p "$APP_DIR/.next"
mv /tmp/md-extract/standalone "$STANDALONE"

# The standalone server runs with cwd=.next/standalone and reads its env from
# THERE, not the app root — miss this and OAuth secrets fall back to placeholders.
cp "$APP_DIR/.env.production" "$STANDALONE/.env.production"
chmod 600 "$STANDALONE/.env.production"
cp "$APP_DIR/package.json" "$APP_DIR/pnpm-lock.yaml" "$STANDALONE/"

echo "=== production install (native modules) ==="
cd "$STANDALONE"
CI=true pnpm install --frozen-lockfile --prod

echo "=== restarting ==="
sudo systemctl restart matrix-dash
sleep 4
sudo systemctl status matrix-dash --no-pager | head -5
curl -s -o /dev/null -w 'localhost:3000 -> %{http_code}\n' localhost:3000/
curl -s localhost:3000/api/runner/download | grep -a -o 'RUNNER_VERSION = "[0-9.]*"' | head -1
