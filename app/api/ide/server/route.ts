import { z } from "zod";
import {
  codeServerStatus,
  startCodeServer,
  stopCodeServer,
  restartCodeServer,
} from "@/lib/services/code-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return Response.json(await codeServerStatus());
}

const Body = z.object({
  action: z.enum(["start", "stop", "restart"]),
  folder: z.string().max(500).optional(),
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

  const { action, folder } = parsed.data;
  const result =
    action === "start"
      ? await startCodeServer(folder)
      : action === "stop"
        ? await stopCodeServer()
        : await restartCodeServer(folder);

  // Give the server a moment to settle so the client's refetch reflects reality.
  if (action !== "stop") await new Promise((r) => setTimeout(r, 600));
  const status = await codeServerStatus();
  return Response.json({ ok: result.ok, status, error: result.error });
}
