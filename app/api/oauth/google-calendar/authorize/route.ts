import { generateOAuthState } from "@/lib/services/oauth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const redirectTo =
    url.searchParams.get("redirect_to") || "/dashboard/settings/calendar";

  const state = generateOAuthState("google-calendar", redirectTo);

  const authorizeUrl = new URL("https://accounts.google.com/o/oauth/v2/auth");
  authorizeUrl.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID || "");
  authorizeUrl.searchParams.set(
    "redirect_uri",
    `${url.origin}/api/oauth/google-calendar/callback`
  );
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set(
    "scope",
    "https://www.googleapis.com/auth/calendar.readonly"
  );
  authorizeUrl.searchParams.set("access_type", "offline");
  authorizeUrl.searchParams.set("prompt", "consent");
  authorizeUrl.searchParams.set("state", state);

  return Response.redirect(authorizeUrl.toString());
}
