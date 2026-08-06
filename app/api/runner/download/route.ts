import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Serve the current Matrix Runner bundle. Public (the install script curls it
 * from a fresh device); the bundle contains no secrets — pairing supplies the
 * credential. The standalone-root path (deploy copies the bundle beside the
 * server — see deploy/setup-server.sh in P8) is checked FIRST and must stay
 * first: `next build`'s standalone file-tracer statically detects the literal
 * "runner/dist/matrix-runner.cjs" string in this file and copies whatever
 * happens to exist there at BUILD time into the standalone output too — which
 * is almost always older than the deploy's actual `pnpm build:runner` (that
 * runs after `next build`). If that trace-time snapshot were checked first,
 * every deploy would silently serve a stale bundle regardless of how fresh
 * the real one copied alongside server.js is. Only reached in local dev,
 * where the standalone-root copy doesn't exist.
 */
function bundlePath(): string | null {
  const candidates = [
    path.join(process.cwd(), "matrix-runner.cjs"),
    path.join(process.cwd(), "runner/dist/matrix-runner.cjs"),
    path.join(process.cwd(), "..", "..", "runner/dist/matrix-runner.cjs"),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}

export async function GET() {
  const p = bundlePath();
  if (!p) {
    return Response.json({ error: "Runner bundle not available on this server" }, { status: 503 });
  }
  const body = fs.readFileSync(p);
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "content-disposition": 'attachment; filename="matrix-runner.cjs"',
      "cache-control": "no-cache",
    },
  });
}
