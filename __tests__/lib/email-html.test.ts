import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db/client";
import { emails } from "@/lib/db/schema";
import {
  extractBodies,
  extractAttachments,
  bodiesToColumns,
  backfillEmailHtml,
} from "@/lib/services/gmail";
import {
  parseAddress,
  parseAddressList,
  prefixSubject,
  quoteBody,
} from "@/lib/utils/email-address";
import { classifyEmailPaint, buildDocumentCss } from "@/lib/utils/email-theme";
import { blockRemoteImages } from "@/components/email/email-body";
import { listEmails, PREVIEW_CHARS } from "@/lib/services/email-list";
import { htmlToText, looksLikeHtml, sanitizeEmailHtml } from "@/lib/utils/sanitize";

const b64 = (s: string) => Buffer.from(s, "utf-8").toString("base64url");

describe("extractBodies", () => {
  it("keeps BOTH alternatives from multipart/alternative", () => {
    // The original bug: it returned one string and preferred text/plain, so
    // every rich email was stored as its stripped-down text version.
    const out = extractBodies({
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: b64("plain version") } },
        { mimeType: "text/html", body: { data: b64("<p>rich version</p>") } },
      ],
    });
    expect(out.text).toBe("plain version");
    expect(out.html).toBe("<p>rich version</p>");
  });

  it("finds the HTML inside multipart/related wrapping multipart/alternative", () => {
    // The old recursion returned the first non-empty branch and discarded its
    // sibling, so this exact nesting lost one of the two bodies.
    const out = extractBodies({
      mimeType: "multipart/related",
      parts: [
        {
          mimeType: "multipart/alternative",
          parts: [
            { mimeType: "text/plain", body: { data: b64("text alt") } },
            { mimeType: "text/html", body: { data: b64("<h1>html alt</h1>") } },
          ],
        },
        { mimeType: "image/png", filename: "logo.png", body: { attachmentId: "x" } },
      ],
    });
    expect(out.text).toBe("text alt");
    expect(out.html).toBe("<h1>html alt</h1>");
  });

  it("ignores attachments, which are not the message body", () => {
    const out = extractBodies({
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "text/html", body: { data: b64("<p>real body</p>") } },
        { mimeType: "text/plain", filename: "notes.txt", body: { data: b64("ATTACHED FILE") } },
      ],
    });
    expect(out.html).toBe("<p>real body</p>");
    expect(out.text).toBeNull();
  });

  it("handles a single-part HTML message with no parts array", () => {
    const out = extractBodies({
      mimeType: "text/html",
      body: { data: b64("<div>solo</div>") },
    });
    expect(out.html).toBe("<div>solo</div>");
    expect(out.text).toBeNull();
  });

  it("handles a single-part plain message", () => {
    const out = extractBodies({ mimeType: "text/plain", body: { data: b64("just text") } });
    expect(out.text).toBe("just text");
    expect(out.html).toBeNull();
  });

  it("returns nulls for an empty payload rather than throwing", () => {
    expect(extractBodies(undefined)).toEqual({ html: null, text: null });
  });
});

describe("bodiesToColumns", () => {
  it("never puts markup in body — that is what leaked into the message list", () => {
    const cols = bodiesToColumns({ html: "<!doctype html><html><p>Hello</p></html>", text: null });
    expect(cols.bodyHtml).toContain("<p>Hello</p>");
    expect(cols.body).toBe("Hello");
    expect(cols.body).not.toContain("<");
  });

  it("prefers the sender's own plain text when there is one", () => {
    const cols = bodiesToColumns({ html: "<p>rich</p>", text: "sender's plain text" });
    expect(cols.body).toBe("sender's plain text");
    expect(cols.bodyHtml).toBe("<p>rich</p>");
  });

  it("leaves bodyHtml null for genuinely plain-text mail", () => {
    // The regression path: plain mail must keep rendering as pre-wrapped text,
    // not get routed into an empty iframe.
    const cols = bodiesToColumns({ html: null, text: "hello there" });
    expect(cols.bodyHtml).toBeNull();
    expect(cols.body).toBe("hello there");
  });

  it("treats whitespace-only HTML as absent", () => {
    expect(bodiesToColumns({ html: "   \n ", text: "x" }).bodyHtml).toBeNull();
  });
});

describe("htmlToText", () => {
  it("inserts breaks so table cells do not run together", () => {
    // stripHtml alone turns this into "AB" — an unreadable preview.
    expect(htmlToText("<table><tr><td>A</td><td>B</td></tr></table>")).toBe("A B");
  });

  it("drops style and script blocks entirely, not just their tags", () => {
    const out = htmlToText("<style>.x{color:red}</style><p>Real content</p>");
    expect(out).toBe("Real content");
    expect(out).not.toContain("color");
  });

  it("collapses runaway whitespace from pretty-printed markup", () => {
    expect(htmlToText("<p>one</p>\n\n\n\n<p>two</p>")).toBe("one\n\ntwo");
  });
});

describe("looksLikeHtml", () => {
  it("detects the doctype that was leaking into previews", () => {
    expect(looksLikeHtml('<!doctype html> <html xmlns="http://www.w3.org/1999/xhtml">')).toBe(true);
  });

  it("detects bare tag-based markup with no doctype", () => {
    expect(looksLikeHtml("<div><p>hi</p></div>")).toBe(true);
  });

  it("does not flag prose that merely mentions a tag name", () => {
    expect(looksLikeHtml("Use the p element for paragraphs, and table for data.")).toBe(false);
  });

  it("does not flag plain text", () => {
    expect(looksLikeHtml("Hi Zach,\n\nYour order shipped.")).toBe(false);
  });
});

describe("sanitizeEmailHtml", () => {
  it("keeps the layout and inline styles real mail depends on", () => {
    const out = sanitizeEmailHtml(
      '<table bgcolor="#fff"><tr><td style="padding:8px" align="center">' +
        '<a href="https://example.com">Verify Now</a></td></tr></table>'
    );
    expect(out).toContain("<table");
    expect(out).toContain('style="padding:8px"');
    expect(out).toContain('href="https://example.com"');
  });

  it("keeps images, which are most of what a marketing email is", () => {
    expect(sanitizeEmailHtml('<img src="https://cdn.example.com/a.png" alt="a">')).toContain(
      "<img"
    );
  });

  it("removes script tags", () => {
    const out = sanitizeEmailHtml('<p>hi</p><script>fetch("https://evil.test")</script>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("evil.test");
  });

  it("removes inline event handlers", () => {
    const out = sanitizeEmailHtml('<img src="https://a.test/x.png" onerror="alert(1)">');
    expect(out.toLowerCase()).not.toContain("onerror");
  });

  it("rejects javascript: URLs", () => {
    const out = sanitizeEmailHtml('<a href="javascript:alert(1)">click</a>');
    expect(out.toLowerCase()).not.toContain("javascript:");
  });

  it("removes nested iframes and forms — no phishing surface", () => {
    const out = sanitizeEmailHtml(
      '<iframe src="https://evil.test"></iframe><form action="https://evil.test"><input name="pw"></form>'
    );
    expect(out).not.toContain("<iframe");
    expect(out).not.toContain("<form");
    expect(out).not.toContain("<input");
  });
});

describe("backfillEmailHtml", () => {
  beforeEach(() => {
    getDb().delete(emails).run();
  });

  const insert = (body: string, bodyHtml: string | null = null) => {
    const id = randomUUID();
    getDb()
      .insert(emails)
      .values({ id, body, bodyHtml, createdAt: new Date().toISOString() })
      .run();
    return id;
  };

  it("moves markup out of body and leaves readable text behind", () => {
    const id = insert("<!doctype html><html><body><p>Your order shipped</p></body></html>");

    expect(backfillEmailHtml().repaired).toBe(1);
    const row = getDb().select().from(emails).all()[0];
    expect(row.id).toBe(id);
    expect(row.bodyHtml).toContain("<p>Your order shipped</p>");
    expect(row.body).toBe("Your order shipped");
  });

  it("leaves genuine plain-text mail completely alone", () => {
    insert("Hi Zach,\n\nThanks for signing up.");
    expect(backfillEmailHtml().repaired).toBe(0);
    const row = getDb().select().from(emails).all()[0];
    expect(row.bodyHtml).toBeNull();
    expect(row.body).toBe("Hi Zach,\n\nThanks for signing up.");
  });

  it("does not touch rows that already have HTML", () => {
    insert("already plain", "<p>already html</p>");
    expect(backfillEmailHtml().repaired).toBe(0);
  });

  it("is idempotent — a second run finds nothing left to do", () => {
    insert("<div>x</div>");
    expect(backfillEmailHtml().repaired).toBe(1);
    expect(backfillEmailHtml()).toMatchObject({ scanned: 0, repaired: 0 });
  });

  it("advances its cursor so a row it cannot repair never wedges the loop", () => {
    // A body that starts with "<" but is not markup passes the SQL filter and
    // fails looksLikeHtml, so it is never updated. Without the cursor every
    // batch would re-select it and the caller's while-loop would spin forever.
    insert("<3 from Jane");
    const first = backfillEmailHtml(10, "");
    expect(first.scanned).toBe(1);
    expect(first.repaired).toBe(0);
    expect(backfillEmailHtml(10, first.lastId).scanned).toBe(0);
  });

  it("does not promote HTML that the old 20,000-char cap cut in half", () => {
    // Rendering a document that stops mid-tag looks broken. Those messages keep
    // bodyHtml null so the on-open refetch can pull the complete version, while
    // the preview text is fixed immediately either way.
    const truncated = "<html><body><p>" + "x".repeat(20_000);
    insert(truncated);

    expect(backfillEmailHtml().repaired).toBe(1);
    const row = getDb().select().from(emails).all()[0];
    expect(row.bodyHtml).toBeNull();
    expect(row.body.startsWith("<")).toBe(false);
  });

  it("stays within its batch size", () => {
    for (let i = 0; i < 5; i++) insert(`<p>message ${i}</p>`);
    expect(backfillEmailHtml(2, "").scanned).toBe(2);
  });
});

describe("parseAddress", () => {
  it("splits a display name from the address", () => {
    // The list and reading pane previously printed this header verbatim.
    expect(parseAddress("PU Prime <noreply@puprime.com>")).toEqual({
      name: "PU Prime",
      address: "noreply@puprime.com",
    });
  });

  it("strips the quotes around a quoted name", () => {
    expect(parseAddress('"vercel[bot]" <notifications@github.com>')).toEqual({
      name: "vercel[bot]",
      address: "notifications@github.com",
    });
  });

  it("falls back to the local part when there is no name", () => {
    expect(parseAddress("peter@n.refurbed.com")).toEqual({
      name: "peter",
      address: "peter@n.refurbed.com",
    });
  });

  it("does not throw on an empty header", () => {
    expect(parseAddress("")).toEqual({ name: "", address: "" });
  });
});

describe("parseAddressList", () => {
  it("does not split on a comma inside a quoted name", () => {
    // "Boyd, Zachary" is one recipient, not two — the naive split that a
    // reply-all would otherwise do produces a garbage address.
    const list = parseAddressList('"Boyd, Zachary" <z@example.com>, other@example.com');
    expect(list.map((a) => a.address)).toEqual(["z@example.com", "other@example.com"]);
  });
});

describe("prefixSubject", () => {
  it("adds the prefix", () => {
    expect(prefixSubject("Invoice", "Re")).toBe("Re: Invoice");
  });

  it("does not stack duplicates the way concatenation would", () => {
    expect(prefixSubject("Re: Invoice", "Re")).toBe("Re: Invoice");
  });

  it("is case-insensitive about an existing prefix", () => {
    expect(prefixSubject("RE: Invoice", "Re")).toBe("RE: Invoice");
  });
});

describe("quoteBody", () => {
  it("prefixes every line, including blank ones", () => {
    const out = quoteBody("A <a@b.c>", "2026-08-08T00:00:00.000Z", "one\n\ntwo");
    expect(out).toContain("> one");
    expect(out).toContain("> two");
    expect(out).toContain("wrote:");
  });
});

describe("blockRemoteImages", () => {
  it("neutralises an image that would reach the network", () => {
    const { html, blocked } = blockRemoteImages('<img src="https://track.test/p.gif" width="1">');
    expect(blocked).toBe(1);
    expect(html).not.toContain("track.test");
    expect(html).toContain('width="1"');
  });

  it("leaves an inline data: image alone — it reaches nobody", () => {
    const src = '<img src="data:image/png;base64,iVBOR">';
    expect(blockRemoteImages(src)).toEqual({ html: src, blocked: 0 });
  });

  it("leaves a cid: reference alone", () => {
    const src = '<img src="cid:logo@1">';
    expect(blockRemoteImages(src).blocked).toBe(0);
  });

  it("counts every blocked image, so the banner can say how many", () => {
    const { blocked } = blockRemoteImages(
      '<img src="https://a.test/1.png"><img src="https://b.test/2.png">'
    );
    expect(blocked).toBe(2);
  });
});

describe("classifyEmailPaint", () => {
  it("leaves a designed template's own palette alone", () => {
    // Recolouring one of these is the classic dark-mode email failure.
    expect(classifyEmailPaint('<table bgcolor="#0b1020"><tr><td>Hi</td></tr></table>')).toBe(
      "own-background"
    );
  });

  it("gives a bare body the dashboard's theme", () => {
    expect(classifyEmailPaint("<div><p>Hi Zach,</p><p>See you then.</p></div>")).toBe("themed");
  });

  it("gives white to an email that sets text colour but no background", () => {
    // The dangerous case: dark text themed onto a dark surface is invisible.
    expect(classifyEmailPaint('<p style="color:#111">Hello</p>')).toBe("assumes-white");
  });

  it("detects a gradient background as the sender's own", () => {
    expect(classifyEmailPaint('<div style="background: linear-gradient(#000,#111)">x</div>')).toBe(
      "own-background"
    );
  });
});

describe("buildDocumentCss", () => {
  const tokens = {
    background: "#050505",
    text: "#e8e8e8",
    muted: "#555",
    link: "#38bdf8",
    border: "#333",
  };

  it("themes the surround of a designed email but not its content", () => {
    // The white frame around a dark email is exactly what "not themed" looks
    // like, and it is what the two-way split produced.
    const css = buildDocumentCss(tokens, "own-background");
    expect(css).toContain("html { margin: 0; padding: 0; background: #050505");
    expect(css).toContain("background: transparent");
    expect(css).not.toContain("color: #e8e8e8;");
  });

  it("keeps an assumes-white email on white regardless of the theme", () => {
    const css = buildDocumentCss(tokens, "assumes-white");
    expect(css).toContain("#ffffff");
    expect(css).not.toContain("#050505");
  });

  it("paints a themed email entirely in the theme's colours", () => {
    const css = buildDocumentCss(tokens, "themed");
    expect(css).toContain("#050505");
    expect(css).toContain("color: #e8e8e8;");
  });
});

describe("extractAttachments", () => {
  it("lists a real attachment", () => {
    const out = extractAttachments({
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "text/html", body: { data: b64("<p>see attached</p>") } },
        {
          mimeType: "application/pdf",
          filename: "invoice.pdf",
          body: { attachmentId: "att-1", size: 20480 },
        },
      ],
    });
    expect(out).toEqual([
      { attachmentId: "att-1", filename: "invoice.pdf", mimeType: "application/pdf", size: 20480 },
    ]);
  });

  it("skips inline images, which are part of the layout not the attachments", () => {
    const out = extractAttachments({
      mimeType: "multipart/related",
      parts: [
        {
          mimeType: "image/png",
          filename: "logo.png",
          headers: [{ name: "Content-Disposition", value: "inline; filename=logo.png" }],
          body: { attachmentId: "inline-1", size: 900 },
        },
      ],
    });
    expect(out).toEqual([]);
  });

  it("finds attachments nested below the top level", () => {
    const out = extractAttachments({
      parts: [{ parts: [{ filename: "deep.txt", body: { attachmentId: "d1", size: 5 } }] }],
    });
    expect(out.map((a) => a.filename)).toEqual(["deep.txt"]);
  });

  it("returns an empty list for a message with none", () => {
    expect(extractAttachments({ mimeType: "text/plain", body: { data: b64("hi") } })).toEqual([]);
  });
});

describe("listEmails payload", () => {
  beforeEach(() => {
    getDb().delete(emails).run();
  });

  const insert = (over: Partial<typeof emails.$inferInsert> = {}) => {
    const id = randomUUID();
    getDb()
      .insert(emails)
      .values({ id, folder: "inbox", body: "", createdAt: new Date().toISOString(), ...over })
      .run();
    return id;
  };

  it("truncates the body so a folder listing cannot exhaust the heap", () => {
    // The regression that killed production: a ~12,000-message inbox at up to
    // 20,000 characters per body is ~240MB of strings on a 955MB VM.
    insert({ body: "x".repeat(20_000) });
    const [row] = listEmails({ folder: "inbox" });
    expect(row.body.length).toBe(PREVIEW_CHARS);
  });

  it("keeps a short body intact", () => {
    insert({ body: "Your order shipped" });
    expect(listEmails({ folder: "inbox" })[0].body).toBe("Your order shipped");
  });

  it("never ships the HTML body in a listing", () => {
    insert({ body: "text", bodyHtml: "<p>" + "y".repeat(50_000) + "</p>" });
    const [row] = listEmails({ folder: "inbox" });
    expect(row.bodyHtml).toBeUndefined();
    expect(JSON.stringify(row).length).toBeLessThan(1_000);
  });

  it("reports attachment presence without shipping the metadata", () => {
    insert({
      attachments: JSON.stringify([
        { attachmentId: "a", filename: "invoice.pdf", mimeType: "application/pdf", size: 1 },
      ]),
    });
    const [row] = listEmails({ folder: "inbox" });
    expect(row.hasAttachments).toBe(true);
    expect(row.attachments).toBeUndefined();
  });

  it("leaves hasAttachments unset for a message with none", () => {
    insert({});
    expect(listEmails({ folder: "inbox" })[0].hasAttachments).toBeUndefined();
  });

  it("filters by folder and by starred", () => {
    insert({ folder: "inbox", subject: "in" });
    insert({ folder: "sent", subject: "out" });
    insert({ folder: "inbox", subject: "fav", isStarred: true });
    expect(listEmails({ folder: "sent" }).map((r) => r.subject)).toEqual(["out"]);
    expect(listEmails({ starred: true }).map((r) => r.subject)).toEqual(["fav"]);
  });
});
