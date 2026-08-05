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
