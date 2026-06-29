import { randomUUID } from "crypto";
import { verifyOAuthState } from "@/lib/services/oauth";
import { encrypt } from "@/lib/utils/crypto";
import { getDb } from "@/lib/db/client";
import { googleCalendarConnections } from "@/lib/db/schema";
import { getSiteUrl } from "@/lib/utils/site-url";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const base = getSiteUrl(req);
  try {
    const url = new URL(req.url, base);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error || !code || !state) {
      return Response.redirect(new URL("/dashboard/settings/calendar?error=oauth_denied", base));
    }

    const redirectTo = verifyOAuthState(state, "google-calendar");
    if (!redirectTo) {
      return Response.redirect(new URL("/dashboard/settings/calendar?error=invalid_state", base));
    }

    const body = new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: `${url.origin}/api/oauth/google-calendar/callback`,
      grant_type: "authorization_code",
    });

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const data = await tokenRes.json();
    if (data.error) throw new Error(data.error_description || data.error);

    let email = "unknown@google.com";
    try {
      const userRes = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        { headers: { Authorization: `Bearer ${data.access_token}` } }
      );
      if (userRes.ok) {
        const user = await userRes.json();
        email = user.email || email;
      }
    } catch {
      // Non-critical
    }

    const expiresIn = data.expires_in || 3600;
    const tokenExpires = new Date(Date.now() + expiresIn * 1000).toISOString();

    getDb()
      .insert(googleCalendarConnections)
      .values({
        id: randomUUID(),
        accessToken: encrypt(data.access_token),
        refreshToken: encrypt(data.refresh_token || ""),
        googleEmail: email,
        tokenExpires,
        createdAt: new Date().toISOString(),
      })
      .run();

    return Response.redirect(
      new URL(`${redirectTo}?connected=google-calendar&email=${encodeURIComponent(email)}`, base)
    );
  } catch (e) {
    console.error("[google-calendar/callback]", e);
    return Response.redirect(new URL("/dashboard/settings/calendar?error=token_exchange_failed", base));
  }
}
