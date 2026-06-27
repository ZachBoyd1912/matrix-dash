import { generateOAuthState } from "@/lib/services/oauth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const redirectTo =
    url.searchParams.get("redirect_to") || "/dashboard/settings/integrations/slack";

  const state = generateOAuthState("slack", redirectTo);

  const authorizeUrl = new URL("https://slack.com/oauth/v2/authorize");
  authorizeUrl.searchParams.set("client_id", process.env.SLACK_CLIENT_ID || "");
  authorizeUrl.searchParams.set("scope", "channels:read,chat:write,search:read,files:write");
  authorizeUrl.searchParams.set("redirect_uri", `${url.origin}/api/oauth/slack/callback`);
  authorizeUrl.searchParams.set("state", state);

  return Response.redirect(authorizeUrl.toString());
}
