import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Serve the current Matrix Runner bundle. Public (the install script curls it
 * from a fresh device); the bundle contains no secrets — pairing supplies the
 * credential. Candidate paths cover dev (repo root cwd) and the production
 * standalone build (cwd = .next/standalone; deploy copies the bundle beside
 * the server — see deploy/setup-server.sh in P8).
 */
function bundlePath(): string | null {
  const candidates = [
    path.join(process.cwd(), "runner/dist/matrix-runner.cjs"),
    path.join(process.cwd(), "matrix-runner.cjs"),
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
