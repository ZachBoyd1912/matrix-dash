import { detectOllama, listOllamaModels, deleteOllamaModel } from "@/lib/services/ollama";
import si from "systeminformation";

export const dynamic = "force-dynamic";

export type Chip = "apple" | "nvidia" | "amd" | "intel" | "cpu";

export interface Hardware {
  totalRamGb: number | null;
  freeRamGb: number | null;
  cpu: string | null;
  cores: number | null;
  gpu: string | null;
  vramGb: number | null;
  unified: boolean;
  /** VRAM (GB) the fitting logic should target */
  usableVramGb: number;
  chip: Chip;
}

function detectChip(cpuManu: string | undefined, gpuModel: string): Chip {
  const g = gpuModel.toLowerCase();
  if ((cpuManu || "").toLowerCase().includes("apple") || g.includes("apple")) return "apple";
  if (g.includes("nvidia") || g.includes("geforce") || g.includes("rtx") || g.includes("quadro"))
    return "nvidia";
  if (g.includes("amd") || g.includes("radeon")) return "amd";
  if (g.includes("intel")) return "intel";
  return "cpu";
}

export async function GET() {
  const [status, models, mem, cpu, graphics] = await Promise.all([
    detectOllama(),
    listOllamaModels(),
    si.mem().catch(() => null),
    si.cpu().catch(() => null),
    si.graphics().catch(() => null),
  ]);

  const totalRamGb = mem ? Math.round((mem.total / 1024 / 1024 / 1024) * 10) / 10 : null;
  const freeRamGb = mem ? Math.round((mem.available / 1024 / 1024 / 1024) * 10) / 10 : null;

  // Pick the controller with the most dedicated VRAM.
  const controllers = graphics?.controllers ?? [];
  const best = controllers.reduce<{ model: string; vramMb: number }>(
    (acc, c) => {
      const vramMb = typeof c.vram === "number" ? c.vram : 0;
      return vramMb > acc.vramMb ? { model: c.model || acc.model, vramMb } : acc;
    },
    { model: controllers[0]?.model || "", vramMb: 0 }
  );

  const chip = detectChip(cpu?.manufacturer, best.model);
  const unified = chip === "apple";

  // Discrete VRAM if reported (and not the bogus 1.5 GB Apple integrated value).
  const discreteVramGb =
    !unified && best.vramMb > 0 ? Math.round((best.vramMb / 1024) * 10) / 10 : null;

  // Apple unified memory: the GPU can address ~70% of system RAM.
  // Discrete GPU: use detected VRAM. Pure CPU: treat free RAM as the budget.
  const usableVramGb = unified
    ? Math.round((totalRamGb ?? 8) * 0.7 * 10) / 10
    : (discreteVramGb ?? Math.round((freeRamGb ?? totalRamGb ?? 8) * 10) / 10);

  const hardware: Hardware = {
    totalRamGb,
    freeRamGb,
    cpu: cpu ? `${cpu.manufacturer} ${cpu.brand}` : null,
    cores: cpu?.cores ?? null,
    gpu: best.model || null,
    vramGb: discreteVramGb,
    unified,
    usableVramGb,
    chip,
  };

  return Response.json({ status, models, hardware });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name");
  if (!name) return Response.json({ error: "name required" }, { status: 400 });
  const ok = await deleteOllamaModel(name);
  return Response.json({ ok });
}
