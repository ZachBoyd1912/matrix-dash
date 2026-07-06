import { randomUUID } from "crypto";
import { verifyOAuthState } from "@/lib/services/oauth";
import { encrypt } from "@/lib/utils/crypto";
import { getDb } from "@/lib/db/client";
import { slackWorkspaces } from "@/lib/db/schema";
import { getSiteUrl } from "@/lib/utils/site-url";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url, getSiteUrl(req));
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error || !code || !state) {
      return Response.redirect("/dashboard/settings/integrations/slack?error=oauth_denied");
    }

    const redirectTo = verifyOAuthState(state, "slack");
    if (!redirectTo) {
      return Response.redirect("/dashboard/settings/integrations/slack?error=invalid_state");
    }

    const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.SLACK_CLIENT_ID,
        client_secret: process.env.SLACK_CLIENT_SECRET,
        code,
        redirect_uri: `${url.origin}/api/oauth/slack/callback`,
      }),
    });
    const data = await tokenRes.json();
    if (!data.ok) throw new Error(data.error || "Slack OAuth failed");

    getDb()
      .insert(slackWorkspaces)
      .values({
        id: randomUUID(),
        accessToken: encrypt(data.access_token),
        teamId: data.team.id,
        teamName: data.team.name,
        botUserId: data.bot_user_id,
        scopes: data.scope,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .run();

    return Response.redirect(`${redirectTo}?connected=slack&team=${data.team.name}`);
  } catch (e) {
    console.error("[slack/callback]", e);
    return Response.redirect("/dashboard/settings/integrations/slack?error=token_exchange_failed");
  }
}
