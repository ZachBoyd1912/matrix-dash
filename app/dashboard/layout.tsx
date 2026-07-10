import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getCurrentUser } from "@/lib/auth/current-user";

// CRITICAL: this layout gates every dashboard route on the request's session.
// Without force-dynamic, Next statically prerenders the subtree at BUILD time —
// when the DB has 0 users — freezing redirect("/login") into a static response
// that ignores the runtime session cookie (an infinite login↔dashboard loop).
// Reading cookies() (via getCurrentUser) is itself a dynamic signal; force-dynamic
// makes it explicit and covers the whole /dashboard subtree.
export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: React.ReactNode }) {
  // Not signed in (including the first-run, no-users-yet case, which simply has
  // no session) → /login, which handles owner setup + login.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <DashboardShell>{children}</DashboardShell>;
}
