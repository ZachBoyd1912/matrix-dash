import { getSiteUrl } from "@/lib/utils/site-url";
import { generateOAuthState } from "@/lib/services/oauth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const redirectTo =
    url.searchParams.get("redirect_to") || "/dashboard/settings/integrations/github";

  const state = generateOAuthState("github", redirectTo);

  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID || "");
  authorizeUrl.searchParams.set("redirect_uri", `${getSiteUrl(req)}/api/oauth/github/callback`);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("scope", "repo,user,notifications");

  return Response.redirect(authorizeUrl.toString());
}
