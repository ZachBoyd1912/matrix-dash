import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getCurrentUser } from "@/lib/auth/current-user";
import { countUsers } from "@/lib/db/users";

export default async function Layout({ children }: { children: React.ReactNode }) {
  // Gate every dashboard page behind the app session. First run (no users yet)
  // and unauthenticated requests go to /login, which handles owner setup + login.
  if (countUsers() === 0) redirect("/login");
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <DashboardShell>{children}</DashboardShell>;
}
