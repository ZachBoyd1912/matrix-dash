export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Ctx {
  params: Promise<{ variant: string }>;
}

/**
 * Templated installers (decision 16: script-based, no signing, no Apple fee).
 * The dashboard's "install runner" step links these with a fresh one-time pair
 * code baked in; the script downloads the bundle, pairs, and installs the
 * OS service via the runner's own `install-service` command.
 *
 *   sh       →  curl -fsSL <url> | sh          (macOS/Linux one-liner)
 *   command  →  double-clickable macOS installer (Terminal opens .command files)
 *   bat      →  double-clickable Windows installer
 */

function selfOrigin(req: Request): string {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

function shScript(server: string, code: string, pauseAtEnd: boolean): string {
  return `#!/bin/sh
# Matrix Runner installer — downloads the runner, pairs this device, installs
# the login service. No admin rights needed; everything lives in ~/.matrix-runner.
set -e
SERVER="${server}"
CODE="${code}"
BIN="$HOME/.matrix-runner/bin"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required. Install it from https://nodejs.org and re-run this installer."
  ${pauseAtEnd ? "read -r _ 2>/dev/null || true; " : ""}exit 1
fi

echo "→ Downloading Matrix Runner..."
mkdir -p "$BIN"
curl -fsSL "$SERVER/api/runner/download" -o "$BIN/matrix-runner.cjs"

echo "→ Pairing this device..."
node "$BIN/matrix-runner.cjs" pair --url "$SERVER" --code "$CODE"

echo "→ Installing background service..."
node "$BIN/matrix-runner.cjs" install-service

echo ""
echo "✓ Matrix Runner is installed and running."
echo "  Check Settings → Devices in your dashboard — this device should be online."
${pauseAtEnd ? 'echo ""; echo "You can close this window."; read -r _ 2>/dev/null || true' : ""}
`;
}

function batScript(server: string, code: string): string {
  return `@echo off\r
rem Matrix Runner installer (Windows) — no admin rights needed.\r
set SERVER=${server}\r
set CODE=${code}\r
set BIN=%USERPROFILE%\\.matrix-runner\\bin\r
\r
where node >nul 2>nul\r
if errorlevel 1 (\r
  echo Node.js 20+ is required. Install it from https://nodejs.org and re-run this installer.\r
  pause\r
  exit /b 1\r
)\r
\r
echo Downloading Matrix Runner...\r
if not exist "%BIN%" mkdir "%BIN%"\r
curl -fsSL "%SERVER%/api/runner/download" -o "%BIN%\\matrix-runner.cjs"\r
\r
echo Pairing this device...\r
node "%BIN%\\matrix-runner.cjs" pair --url "%SERVER%" --code "%CODE%"\r
if errorlevel 1 ( pause & exit /b 1 )\r
\r
echo Installing background service...\r
node "%BIN%\\matrix-runner.cjs" install-service\r
\r
echo.\r
echo Matrix Runner is installed and running.\r
echo Check Settings - Devices in your dashboard - this device should be online.\r
pause\r
`;
}

export async function GET(req: Request, ctx: Ctx) {
  const { variant } = await ctx.params;
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? "";
  if (!code || code.length < 6) {
    return Response.json({ error: "A pair code is required (?code=...)" }, { status: 400 });
  }
  const server = selfOrigin(req);

  switch (variant) {
    case "sh":
      return new Response(shScript(server, code, false), {
        headers: {
          "content-type": "text/x-shellscript; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    case "command":
      return new Response(shScript(server, code, true), {
        headers: {
          "content-type": "application/x-sh; charset=utf-8",
          "content-disposition": 'attachment; filename="Install Matrix Runner.command"',
          "cache-control": "no-store",
        },
      });
    case "bat":
      return new Response(batScript(server, code), {
        headers: {
          "content-type": "application/x-bat; charset=utf-8",
          "content-disposition": 'attachment; filename="Install Matrix Runner.bat"',
          "cache-control": "no-store",
        },
      });
    default:
      return Response.json({ error: "Unknown installer variant" }, { status: 404 });
  }
}
