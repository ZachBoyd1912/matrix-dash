import { getCurrentUser } from "@/lib/auth/current-user";
import { countUsers } from "@/lib/db/users";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Current authenticated user, plus whether first-run owner setup is needed. */
export async function GET() {
  const user = await getCurrentUser();
  return Response.json({
    user: user
      ? { email: user.email, name: user.name, role: user.role, totpEnabled: !!user.totpEnabled }
      : null,
    needsBootstrap: countUsers() === 0,
  });
}
