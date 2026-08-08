import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const home = os.homedir();
  const dirs = [
    home,
    path.join(home, "Desktop"),
    path.join(home, "Downloads"),
    path.join(home, "Documents"),
  ];

  const recent: { name: string; mtime: number }[] = [];
  for (const dir of dirs) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isFile()) continue;
        if (e.name.startsWith(".")) continue;
        try {
          const stat = fs.statSync(path.join(dir, e.name));
          recent.push({ name: e.name, mtime: stat.mtimeMs });
        } catch {
          /* skip */
        }
      }
    } catch {
      /* skip */
    }
  }

  recent.sort((a, b) => b.mtime - a.mtime);
  const top = recent.slice(0, 3);
  const items = top
    .map(
      (f) =>
        `<li style="padding:4px 0;font-size:12px;color:#e8e8e8;">📄 ${esc(f.name)} · <span style="color:#666;font-size:10px">${relTime(f.mtime)}</span></li>`
    )
    .join("");

  const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;font-family:-apple-system,system-ui,sans-serif;background:#0d0d0d;color:#e8e8e8;}h2{font-size:14px;font-weight:600;margin:0 0 8px;color:#888;}ul{list-style:none;padding:0;margin:0;}</style></head><body><h2>Files — Recent</h2><ul>${items}</ul>${top.length === 0 ? '<p style="font-size:12px;color:#666;">No recent files</p>' : ""}</body></html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html", "Cache-Control": "public, max-age=120" },
  });
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function relTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.round(diff / 3600_000)}h ago`;
  return `${Math.round(diff / 86400_000)}d ago`;
}
