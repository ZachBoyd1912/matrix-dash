import { syncGmailEmails, sendGmailEmail } from "@/lib/services/gmail";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    if (body.action === "sync") {
      const count = await syncGmailEmails(body.limit ?? 50);
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
