import { detectCodeServer, installCodeServer } from "@/lib/services/code-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return Response.json(await detectCodeServer());
}

export async function POST() {
  // No request body is required; running the installer is a long-lived,
  // best-effort operation that re-probes the binary when it finishes.
  return Response.json(await installCodeServer());
}
