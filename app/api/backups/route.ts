import fs from "fs";
import path from "path";
import { listBackups, writeBackup, getBackupDir } from "@/lib/services/backup";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(listBackups());
}

export async function POST() {
  const filepath = writeBackup();
  return Response.json({ ok: true, file: path.basename(filepath) });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name");
  if (!name || name.includes("/") || name.includes("..")) {
    return Response.json({ error: "invalid name" }, { status: 400 });
  }
  const filepath = path.join(getBackupDir(), name);
  if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  return Response.json({ ok: true });
}
