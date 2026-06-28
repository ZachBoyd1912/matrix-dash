import { syncGmailEmails, sendGmailEmail } from "@/lib/services/gmail";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    console.log("[gmail/api]", body.action);
    
    if (body.action === "sync") {
      console.log("[gmail/api] syncing with limit:", body.limit ?? 50);
      const count = await syncGmailEmails(body.limit ?? 50);
      console.log("[gmail/api] sync complete, imported:", count);
      return Response.json({ ok: true, imported: count });
    }
    
    if (body.action === "send") {
      const { to, subject, body: emailBody, cc, bcc } = body;
      if (!to || !subject || !emailBody) {
        return Response.json({ error: "to, subject, and body required" }, { status: 400 });
      }
      const result = await sendGmailEmail(to, subject, emailBody, { cc, bcc });
      return Response.json(result);
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Gmail API error" },
      { status: 500 }
    );
  }
}
