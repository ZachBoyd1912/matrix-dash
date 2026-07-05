#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Run this INSIDE the GCE VM (after SSH'ing in).
# Installs Node.js, Caddy, clones the repo, builds & starts.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="/opt/matrix-dash"
STANDALONE_DIR="$APP_DIR/.next/standalone"
LANDING_DIR="/var/www/landing"
REPO="https://github.com/ZachBoyd1912/matrix-dash.git"

echo "=== 1. Install Node.js 22 + pnpm ==="
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo corepack enable
corepack prepare pnpm@latest --activate

echo "=== 2. Install Caddy (automatic HTTPS) ==="
if ! command -v caddy &>/dev/null; then
  sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
  sudo apt-get update
  sudo apt-get install -y caddy
fi

echo "=== 3. Install system deps for better-sqlite3 build ==="
sudo apt-get install -y build-essential python3

echo "=== 4. Clone & build the app ==="
if [ -d "$APP_DIR" ]; then
  echo "  App directory exists, pulling latest..."
  cd "$APP_DIR"
  git pull
else
  sudo mkdir -p "$APP_DIR"
  sudo chown "$(whoami):$(whoami)" "$APP_DIR"
  git clone "$REPO" "$APP_DIR"
  cd "$APP_DIR"
fi

# Bootstrap .env.production from the placeholder template on FIRST setup only.
# Never overwrite an existing one — the real secrets get filled in by hand
# after bootstrap and must survive every subsequent redeploy.
if [ ! -f .env.production ] && [ -f deploy/.env.production ]; then
  cp deploy/.env.production .env.production
  echo "  Bootstrapped .env.production from placeholder template (fill in real secrets before going live)"
fi

pnpm install --frozen-lockfile

# The e2-micro's ~955MB RAM leads Node to auto-detect a heap ceiling around
# ~470-490MB, which OOMs during the build's type-checking pass. Raise it
# explicitly — the VM has 2GB swap to back it (confirmed via `free -h`).
NODE_OPTIONS="--max-old-space-size=2048" pnpm build

# The standalone output is at .next/standalone/. Copy static + public there.
cp -r .next/static "$STANDALONE_DIR/.next/static"
cp -r public "$STANDALONE_DIR/public"

# The standalone server runs with cwd=.next/standalone, so Next loads its
# .env.production from THERE — not the app root. Copy it across or OAuth
# secrets (GOOGLE/GITHUB/SLACK) silently fall back to placeholders.
if [ -f .env.production ]; then
  cp .env.production "$STANDALONE_DIR/.env.production"
  chmod 600 "$STANDALONE_DIR/.env.production"
fi

# Install production deps in standalone dir (for better-sqlite3)
cp package.json pnpm-lock.yaml "$STANDALONE_DIR/"
cd "$STANDALONE_DIR"
pnpm install --frozen-lockfile --prod

echo "=== 5. Create systemd service ==="
sudo tee /etc/systemd/system/matrix-dash.service > /dev/null <<EOF
[Unit]
Description=Matrix Dashboard
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$STANDALONE_DIR
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=$(which node) server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable matrix-dash

echo "=== 6. Set up landing page ==="
sudo mkdir -p "$LANDING_DIR"
if [ -d "$APP_DIR/deploy/landing" ]; then
  sudo rsync -a --delete "$APP_DIR/deploy/landing/" "$LANDING_DIR/"
else
  echo "  WARN: deploy/landing/ not found — writing minimal fallback"
  sudo tee "$LANDING_DIR/index.html" > /dev/null <<'HTML'
<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ZB Automations</title></head>
<body style="font-family:system-ui;max-width:640px;margin:80px auto;padding:0 24px;line-height:1.6">
<h1>ZB Automations</h1><p>AI-powered automation.</p><p><a href="https://matrix.zbautomations.ie">→ Matrix Dashboard</a></p>
</body></html>
HTML
fi

echo "=== 7. Set up Caddy ==="
cd "$APP_DIR"
if [ -f deploy/Caddyfile ]; then
  sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
else
  echo "  ERROR: deploy/Caddyfile not found!"
fi
sudo systemctl restart caddy
sudo systemctl enable caddy

echo "=== 8. Start Matrix Dashboard ==="
sudo systemctl start matrix-dash

echo ""
echo "=== Setup complete! ==="
echo "  Dashboard:  https://matrix.zbautomations.ie"
echo "  Landing:    https://zbautomations.ie"
echo "  Check logs: sudo journalctl -fu matrix-dash"
echo ""
echo "⚠️  Before OAuth works, update redirect URIs in:"
echo "   - Google Cloud Console:"
echo "     https://matrix.zbautomations.ie/api/oauth/gmail/callback"
echo "     https://matrix.zbautomations.ie/api/oauth/drive/callback"
echo "     https://matrix.zbautomations.ie/api/oauth/google-calendar/callback"
echo "   - GitHub App settings:"
echo "     https://matrix.zbautomations.ie/api/oauth/github/callback"
echo "   - Slack App settings:"
echo "     https://matrix.zbautomations.ie/api/oauth/slack/callback"
