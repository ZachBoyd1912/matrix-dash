import { generateOAuthState } from "@/lib/services/oauth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const redirectTo =
    url.searchParams.get("redirect_to") || "/dashboard/settings/email";

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return Response.redirect(
      `${redirectTo}?error=missing_env&msg=${encodeURIComponent("GOOGLE_CLIENT_ID not set in .env.local")}`
    );
  }

  const state = generateOAuthState("gmail", redirectTo);

  const authorizeUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set(
    "redirect_uri",
    `${url.origin}/api/oauth/gmail/callback`
  );
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set(
    "scope",
    "https://mail.google.com/"
  );
  authorizeUrl.searchParams.set("access_type", "offline");
  authorizeUrl.searchParams.set("prompt", "consent");
  authorizeUrl.searchParams.set("state", state);

  return Response.redirect(authorizeUrl.toString());
}
