import { randomUUID } from "crypto";
import { verifyOAuthState } from "@/lib/services/oauth";
import { encrypt } from "@/lib/utils/crypto";
import { getDb } from "@/lib/db/client";
import { githubConnections } from "@/lib/db/schema";
import { getSiteUrl } from "@/lib/utils/site-url";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url, getSiteUrl(req));
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error || !code || !state) {
      return Response.redirect(
        "/dashboard/settings/integrations/github?error=oauth_denied"
      );
    }

    const redirectTo = verifyOAuthState(state, "github");
    if (!redirectTo) {
      return Response.redirect(
        "/dashboard/settings/integrations/github?error=invalid_state"
      );
    }

    // Exchange code for access token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    const data = await tokenRes.json();
    if (data.error) throw new Error(data.error_description || data.error);

    // Fetch user info
    const userRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    const user = await userRes.json();

    getDb()
      .insert(githubConnections)
      .values({
        id: randomUUID(),
        accessToken: encrypt(data.access_token),
        githubUser: user.login,
        avatarUrl: user.avatar_url,
        scopes: data.scope || "repo,user",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .run();

    return Response.redirect(
      `${redirectTo}?connected=github&user=${user.login}`
    );
  } catch (e) {
    console.error("[github/callback]", e);
    return Response.redirect(
      `/dashboard/settings/integrations/github?error=token_exchange_failed`
    );
  }
}
