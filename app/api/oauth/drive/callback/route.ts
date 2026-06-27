import { randomUUID } from "crypto";
import { verifyOAuthState } from "@/lib/services/oauth";
import { encrypt } from "@/lib/utils/crypto";
import { getDb } from "@/lib/db/client";
import { driveConnections } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url, "http://localhost:3000");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error || !code || !state) {
      return Response.redirect(
        "/dashboard/settings/integrations/drive?error=oauth_denied"
      );
    }

    const redirectTo = verifyOAuthState(state, "google");
    if (!redirectTo) {
      return Response.redirect(
        "/dashboard/settings/integrations/drive?error=invalid_state"
      );
    }

    const body = new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: `${url.origin}/api/oauth/drive/callback`,
      grant_type: "authorization_code",
    });

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const data = await tokenRes.json();
    if (data.error) throw new Error(data.error_description || data.error);

    // Fetch user email to identify the connection
    let email = "unknown@google.com";
    try {
      const userRes = await fetch(
        "https://www.googleapis.com/oauth2/v1/userinfo?alt=json",
        { headers: { Authorization: `Bearer ${data.access_token}` } }
      );
      if (userRes.ok) {
        const user = await userRes.json();
        email = user.email || email;
      }
    } catch {
      // Non-critical — continue without email
    }

    const now = new Date().toISOString();
    const expiresIn = data.expires_in || 3600;
    const tokenExpires = new Date(
      Date.now() + expiresIn * 1000
    ).toISOString();

    getDb()
      .insert(driveConnections)
      .values({
        id: randomUUID(),
        accessToken: encrypt(data.access_token),
        refreshToken: encrypt(data.refresh_token || ""),
        googleEmail: email,
        scopes: data.scope || "https://www.googleapis.com/auth/drive.readonly",
        tokenExpires,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return Response.redirect(
      `${redirectTo}?connected=drive&email=${encodeURIComponent(email)}`
    );
  } catch (e) {
    console.error("[drive/callback]", e);
    return Response.redirect(
      "/dashboard/settings/integrations/drive?error=token_exchange_failed"
    );
  }
}
