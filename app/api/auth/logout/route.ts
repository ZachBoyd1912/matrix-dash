import { cookies } from "next/headers";
import { destroySession, SESSION_COOKIE } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      destroySession(token);
    } catch {
      /* ignore */
    }
  }
  store.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
