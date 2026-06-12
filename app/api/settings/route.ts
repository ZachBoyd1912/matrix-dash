import { z } from "zod";
import { getAllSettings, setSetting } from "@/lib/db/settings";

export const dynamic = "force-dynamic";

const patchSchema = z.record(z.string(), z.union([z.string(), z.boolean(), z.number()]));

export async function GET() {
  return Response.json(getAllSettings());
}

export async function PATCH(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  for (const [key, value] of Object.entries(parsed.data)) {
    let str: string;
    if (typeof value === "boolean") str = value ? "1" : "0";
    else if (typeof value === "number") str = String(value);
    else str = value;
    setSetting(key, str);
  }
  return Response.json(getAllSettings());
}
