import { z } from "zod";
import {
  builderStatus,
  startBuilder,
  stopBuilder,
  restartBuilder,
} from "@/lib/services/matrix-builder";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return Response.json(await builderStatus());
}

const Body = z.object({
  action: z.enum(["start", "stop", "restart"]),
});

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "action required" }, { status: 400 });

  const { action } = parsed.data;
  const result =
    action === "start"
      ? await startBuilder()
      : action === "stop"
        ? await stopBuilder()
        : await restartBuilder();

  // Let the process settle so the client's immediate refetch reflects reality.
  if (action !== "stop") await new Promise((r) => setTimeout(r, 600));
  const status = await builderStatus();
  return Response.json({ ok: result.ok, status, error: result.error });
}
