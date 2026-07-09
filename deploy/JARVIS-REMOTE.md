# Jarvis remote reachability (iPhone + MacBook)

This makes the Mac-hosted Jarvis reachable from your phone via a mobile PWA, a
Telegram bridge, and a "Hey Siri, ask Jarvis" Shortcut — all behind the same
Cloudflare Access email-OTP gate that already protects production.

## 1. Cloudflare Tunnel (expose the Mac safely)

The Mac's matrix-dash runs on `localhost:3000`. A Cloudflare Tunnel exposes it at
a public hostname without opening any home-network ports.

```bash
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create matrix-jarvis
# Route DNS (pick a subdomain on your zone):
cloudflared tunnel route dns matrix-jarvis jarvis.zbautomations.ie
```

Config at `~/.cloudflared/config.yml` (see `cloudflared-config.example.yml`):

```yaml
tunnel: <TUNNEL-UUID>
credentials-file: /Users/zach/.cloudflared/<TUNNEL-UUID>.json
ingress:
  - hostname: jarvis.zbautomations.ie
    service: http://localhost:3000
  - service: http_status:404
```

Run it as a launchd service so it survives reboots:

```bash
sudo cloudflared service install
```

## 2. Cloudflare Access

In the Cloudflare Zero Trust dashboard, add an Access application for
`jarvis.zbautomations.ie` with an email-OTP policy allowing only `zboyd712@gmail.com`
— identical to the production gate.

**Bypass rule for signed approval links:** add an Access policy that *bypasses*
authentication for exactly `jarvis.zbautomations.ie/api/hooks/approval/*`, so ntfy /
Telegram one-tap approve/deny action URLs work without a login round-trip. Those
URLs carry a single-use high-entropy token and are burned on use.

**Service Token for the Siri Shortcut:** create a Cloudflare Access *service token*
(client id + secret). The Shortcut sends it as `CF-Access-Client-Id` /
`CF-Access-Client-Secret` headers so it can reach the tunnel without an interactive login.

## 3. Mobile PWA

The dashboard is already a PWA (`app/manifest.ts`). On the iPhone, open
`https://jarvis.zbautomations.ie/dashboard` in Safari → Share → Add to Home Screen.
The voice orb (mic + audio playback) works in the installed PWA after the first tap.

## 4. Telegram bridge

1. Create a bot with @BotFather → get the token.
2. Send your bot a message, then find your numeric chat id (e.g. via @userinfobot).
3. In Settings → Agents (or via the API), set `telegram_bot_token` and
   `telegram_chat_id`. The bridge starts immediately and answers only that chat id.

Text and voice notes both work; voice notes are transcribed with Whisper and run
through the same Jarvis turn as the orb.

## 5. Siri Shortcut ("Hey Siri, ask Jarvis")

Build a Shortcut with these actions:

1. **Dictate Text** (or **Ask for Input**) → your spoken question.
2. **Get Contents of URL**:
   - URL: `https://jarvis.zbautomations.ie/api/voice/chat`
   - Method: `POST`
   - Headers: `Content-Type: application/json`,
     `CF-Access-Client-Id: <id>`, `CF-Access-Client-Secret: <secret>`
   - Request Body (JSON): `{ "text": "<Dictated Text>" }`
3. **Get Dictionary Value** `reply` from the response.
4. **Speak Text** → the reply.

Name it "Ask Jarvis" so "Hey Siri, Ask Jarvis" triggers it hands-free.

## Degradation

If the Mac is asleep/off, the tunnel drops and the PWA/Telegram show as
unreachable — an accepted limitation (local projects like bolt.new-custom are only
reachable when the Mac is on). The bridge and tunnel auto-restart via launchd when
the Mac wakes.
