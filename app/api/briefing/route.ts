import { withUser } from "@/lib/auth/with-user";
import { composeBriefing } from "@/lib/services/briefing";

export const dynamic = "force-dynamic";

export const GET = withUser(async () => {
  return Response.json(composeBriefing());
});
