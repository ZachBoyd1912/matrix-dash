import http from "node:http";

const MEETING = new Set(["in-person", "zoom"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateSubmission(b) {
  if (typeof b !== "object" || b === null) return { ok: false, status: 400, error: "bad body" };
  const name = String(b.name ?? "").trim();
  const phone = String(b.phone ?? "").trim();
  const email = String(b.email ?? "").trim();
  const message = String(b.message ?? "").trim();
  const meeting = String(b.meeting ?? "").trim();

  if (name.length < 2 || name.length > 100) return { ok: false, status: 400, error: "name" };
  // Permissive on purpose: international formats, spaces, +, (), -.
  if (!/^[+\d][\d\s()\-]{6,24}$/.test(phone)) return { ok: false, status: 400, error: "phone" };
  if (email.length > 200 || !EMAIL_RE.test(email)) return { ok: false, status: 400, error: "email" };
  if (message.length < 20 || message.length > 4000) return { ok: false, status: 400, error: "message" };
  if (!MEETING.has(meeting)) return { ok: false, status: 400, error: "meeting" };

  return { ok: true, data: { name, phone, email, message, meeting } };
}

const PORT = Number(process.env.CONTACT_PORT || 3002);
const hits = new Map(); // ip -> number[] (timestamps)
let globalHits = [];

function rateLimited(ip) {
  const now = Date.now();
  globalHits = globalHits.filter((t) => now - t < 3600_000);
  if (globalHits.length >= 20) return true;
  const arr = (hits.get(ip) || []).filter((t) => now - t < 600_000);
  if (arr.length >= 3) {
    hits.set(ip, arr);
    return true;
  }
  arr.push(now);
  hits.set(ip, arr);
  globalHits.push(now);
  return false;
}

function clientIp(req) {
  return (
    req.headers["cf-connecting-ip"] ||
    String(req.headers["x-forwarded-for"] || "")
      .split(",")[0]
      .trim() ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

const json = (res, status, obj) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
};

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/api/contact/health") return json(res, 200, { ok: true });
  if (req.method !== "POST" || req.url !== "/api/contact") return json(res, 404, { ok: false });

  const ip = clientIp(req);
  if (rateLimited(ip)) return json(res, 429, { ok: false, error: "rate limited" });

  let size = 0;
  const chunks = [];
  req.on("data", (c) => {
    size += c.length;
    if (size > 16_384) {
      json(res, 413, { ok: false });
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on("end", async () => {
    if (res.writableEnded) return;
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return json(res, 400, { ok: false, error: "bad json" });
    }

    // Silent drops — respond 200 so bots learn nothing.
    if (String(body.website ?? "").trim() !== "") return json(res, 200, { ok: true });
    const ts = Number(body.ts);
    if (!Number.isFinite(ts) || Date.now() - ts < 3000) return json(res, 200, { ok: true });

    const v = validateSubmission(body);
    if (!v.ok) return json(res, v.status, { ok: false, error: v.error });

    try {
      await deliver(v.data); // Task 3
    } catch (err) {
      console.error("smtp failed:", err.message);
      return json(res, 502, { ok: false });
    }
    forwardLead(v.data).catch((e) => console.error("lead forward failed:", e.message)); // Task 5
    return json(res, 200, { ok: true });
  });
});

server.listen(PORT, "127.0.0.1", () => console.log(`contact-form listening on 127.0.0.1:${PORT}`));
