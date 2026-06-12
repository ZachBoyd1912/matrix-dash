import { z } from "zod";
import {
  ollamaServeStatus,
  startOllama,
  stopOllama,
  restartOllama,
  psOllama,
} from "@/lib/services/ollama";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const [status, loaded] = await Promise.all([ollamaServeStatus(), psOllama()]);
  return Response.json({ status, loaded });
}

const Body = z.object({ action: z.enum(["start", "stop", "restart"]) });

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
      ? await startOllama()
      : action === "stop"
        ? await stopOllama()
        : await restartOllama();

  if (!result.ok) return Response.json(result, { status: 500 });

  // Give the daemon a moment to settle so the client's refetch reflects reality.
  if (action !== "stop") await new Promise((r) => setTimeout(r, 600));
  const status = await ollamaServeStatus();
  return Response.json({ ...result, status });
}
