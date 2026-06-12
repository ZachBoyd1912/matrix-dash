import { detectOllama, listOllamaModels, deleteOllamaModel } from "@/lib/services/ollama";
import si from "systeminformation";

export const dynamic = "force-dynamic";

export async function GET() {
  const [status, models, mem, cpu] = await Promise.all([
    detectOllama(),
    listOllamaModels(),
    si.mem().catch(() => null),
    si.cpu().catch(() => null),
  ]);
  return Response.json({
    status,
    models,
    hardware: {
      totalRamGb: mem ? Math.round((mem.total / 1024 / 1024 / 1024) * 10) / 10 : null,
      freeRamGb: mem ? Math.round((mem.available / 1024 / 1024 / 1024) * 10) / 10 : null,
      cpu: cpu ? `${cpu.manufacturer} ${cpu.brand}` : null,
      cores: cpu?.cores ?? null,
    },
  });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name");
  if (!name) return Response.json({ error: "name required" }, { status: 400 });
  const ok = await deleteOllamaModel(name);
  return Response.json({ ok });
}
