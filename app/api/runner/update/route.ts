import { RUNNER_VERSION } from "@/runner/src/version";
import { PROTOCOL_VERSION } from "@/lib/runner/protocol";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Update manifest for the auto-updater. The server's bundled runner version is
 * the source of truth: a runner comparing its own version against this decides
 * to download /api/runner/download and swap itself.
 */
export async function GET() {
  return Response.json({
    version: RUNNER_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    downloadPath: "/api/runner/download",
  });
}
