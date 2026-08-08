"use client";

import { useCallback, useEffect, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import {
  Inbox,
  Send,
  FileEdit,
  Trash2,
  Star,
  PenSquare,
  Mail,
  ArchiveRestore,
  Reply,
  ReplyAll,
  Forward,
  Paperclip,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { toast, confirm } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { EmailBody } from "@/components/email/email-body";
import { EmailHeader } from "@/components/email/email-header";
import { EmailAttachments } from "@/components/email/email-attachments";
import { parseAddress, prefixSubject, quoteBody } from "@/lib/utils/email-address";
import { timeAgo } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";
import { EMAIL_FOLDERS, type Email, type EmailFolder } from "@/types/email";

const FOLDER_ICONS: Record<EmailFolder, React.ReactNode> = {
  inbox: <Inbox size={14} />,
  sent: <Send size={14} />,
  drafts: <FileEdit size={14} />,
  trash: <Trash2 size={14} />,
};

/**
 * Belt-and-braces for the list preview.
 *
 * `body` is plain text for everything the new sync writes, and the one-time
 * backfill converts older rows — but a row that arrives before the backfill
 * runs, or from some future import path, must still never render
 * `<!doctype html> <html xmlns=...` as its preview. A regex is enough here:
 * this is display-only truncated text, not a security boundary.
 */
function previewText(body: string): string {
  if (!body) return "";
  if (!body.includes("<")) return body;
  return body
    .replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export default function EmailPage() {
  const ref = useGsapEntrance();
  const [folder, setFolder] = useState<EmailFolder | "starred">("inbox");
  const [list, setList] = useState<Email[] | null>(null);
  const [selected, setSelected] = useState<Email | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  /** Prefilled fields when the composer is opened from Reply / Forward. */
  const [draft, setDraft] = useState<{ to: string; subject: string; body: string } | null>(null);
  /** True while an older message's HTML is being refetched from Gmail. */
  const [bodyLoading, setBodyLoading] = useState(false);
  const [gmailAddr, setGmailAddr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const query = folder === "starred" ? "starred=1" : `folder=${folder}`;
    const res = await fetch(`/api/emails?${query}`);
    const data = (await res.json()) as Email[];
    setList(data);
    // Re-sync the open message's metadata from the list, but keep bodyHtml:
    // the list response deliberately omits it (see LIST_COLUMNS), so spreading
    // the list row over the selection would blank the reading pane.
    setSelected((prev) => {
      if (!prev) return null;
      const fresh = data.find((e) => e.id === prev.id);
      return fresh ? { ...fresh, bodyHtml: prev.bodyHtml } : null;
    });
  }, [folder]);

  useEffect(() => {
    setList(null);
    setSelected(null);
    refresh();
  }, [refresh]);

  useEffect(() => {
    fetch("/api/gmail/connections")
      .then((r) => r.json())
      .then((conns) => {
        const active = conns.find((c: any) => c.isActive);
        if (active?.googleEmail) setGmailAddr(active.googleEmail);
      })
      .catch(() => {});
  }, []);

  const startReply = (email: Email, mode: "reply" | "replyAll" | "forward") => {
    const from = parseAddress(email.fromAddr);
    // Reply-all would also need Cc, which is not stored today — so it targets
    // the sender plus every other To recipient, and says so rather than
    // silently dropping people the original was copied to.
    const others =
      mode === "replyAll"
        ? email.toAddr
            .split(",")
            .map((a) => parseAddress(a).address)
            .filter((a) => a && a !== from.address)
        : [];
    setDraft({
      to: mode === "forward" ? "" : [from.address, ...others].filter(Boolean).join(", "),
      subject: prefixSubject(email.subject, mode === "forward" ? "Fwd" : "Re"),
      body: quoteBody(email.fromAddr, email.createdAt, email.body),
    });
    setComposeOpen(true);
  };

  const open = async (email: Email) => {
    // Show the list row immediately, then fill in the HTML body. The detail
    // route also repairs mail synced before HTML was stored, so this can take
    // a Gmail round-trip on first open of an old message.
    setSelected(email);
    setBodyLoading(true);
    fetch(`/api/emails/${email.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((full: Email | null) => {
        if (full) setSelected((prev) => (prev?.id === full.id ? full : prev));
      })
      .catch(() => {})
      .finally(() => setBodyLoading(false));
    if (!email.isRead) {
      await fetch(`/api/emails/${email.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isRead: true }),
      });
      refresh();
    }
  };

  const toggleStar = async (email: Email) => {
    await fetch(`/api/emails/${email.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isStarred: !email.isStarred }),
    });
    refresh();
  };

  const moveToTrash = async (email: Email) => {
    if (email.folder === "trash") {
      const ok = await confirm({
        title: "Delete forever?",
        description: "This message will be permanently removed.",
        confirmLabel: "Delete forever",
        danger: true,
      });
      if (!ok) return;
      await fetch(`/api/emails/${email.id}`, { method: "DELETE" });
      toast.success("Message deleted");
    } else {
      await fetch(`/api/emails/${email.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ folder: "trash" }),
      });
      toast.info("Moved to trash");
    }
    setSelected(null);
    refresh();
  };

  const restore = async (email: Email) => {
    await fetch(`/api/emails/${email.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folder: "inbox" }),
    });
    toast.success("Restored to inbox");
    refresh();
  };

  return (
    <div ref={ref} className="page-h grid grid-cols-1 md:grid-cols-[170px_minmax(240px,330px)_1fr]">
      {/* Folder rail */}
      <aside className="hidden flex-col gap-1 border-r border-white/5 bg-white/[0.01] p-3 md:flex">
        {gmailAddr && (
          <p className="text-text-muted truncate rounded-md bg-white/[0.03] px-2 py-1 text-center text-[10px]">
            {gmailAddr}
          </p>
        )}
        <Button
          variant="primary"
          size="sm"
          className="mb-3 rounded-full"
          onClick={() => setComposeOpen(true)}
        >
          <PenSquare size={13} /> Compose
        </Button>
        {EMAIL_FOLDERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFolder(f.value)}
            className={cn(
              "flex h-8 items-center gap-2 rounded-full border px-3 text-xs transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98]",
              folder === f.value
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300 shadow-[0_0_18px_-6px_rgba(52,211,153,0.6)]"
                : "text-text-secondary hover:text-text-primary border-transparent hover:bg-white/[0.04]"
            )}
          >
            {FOLDER_ICONS[f.value]}
            {f.label}
          </button>
        ))}
        <button
          onClick={() => setFolder("starred")}
          className={cn(
            "flex h-8 items-center gap-2 rounded-full border px-3 text-xs transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98]",
            folder === "starred"
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300 shadow-[0_0_18px_-6px_rgba(52,211,153,0.6)]"
              : "text-text-secondary hover:text-text-primary border-transparent hover:bg-white/[0.04]"
          )}
        >
          <Star size={14} />
          Starred
        </button>
      </aside>

      {/* Message list */}
      <section className="flex min-h-0 flex-col border-r border-white/5">
        <div className="flex items-center gap-1 overflow-x-auto border-b border-white/5 p-2 md:hidden">
          {[...EMAIL_FOLDERS.map((f) => f.value), "starred" as const].map((f) => (
            <button
              key={f}
              onClick={() => setFolder(f as EmailFolder | "starred")}
              className={cn(
                "h-7 shrink-0 rounded-full border px-3 text-[11px] capitalize transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98]",
                folder === f
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300 shadow-[0_0_18px_-6px_rgba(52,211,153,0.6)]"
                  : "text-text-muted hover:text-text-primary border-transparent"
              )}
            >
              {f}
            </button>
          ))}
          <Button
            variant="primary"
            size="sm"
            className="ml-auto shrink-0 rounded-full"
            onClick={() => setComposeOpen(true)}
            aria-label="Compose message"
          >
            <PenSquare size={12} />
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          {list === null ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<Mail size={16} />}
                title="Nothing here"
                description={
                  folder === "inbox" ? "Your inbox is clear." : `No messages in ${folder}.`
                }
              />
            </div>
          ) : (
            <Virtuoso
              style={{ height: "100%" }}
              data={list}
              itemContent={(_, email) => (
                <button
                  onClick={() => open(email)}
                  className={cn(
                    "w-full border-b border-l-2 border-white/5 px-4 py-3 text-left transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.99]",
                    selected?.id === email.id
                      ? "border-l-emerald-400/60 bg-emerald-400/[0.07] shadow-[inset_0_0_18px_-10px_rgba(52,211,153,0.7)]"
                      : "border-l-transparent hover:bg-white/[0.03]"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {!email.isRead && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                    )}
                    <span
                      className={cn(
                        "flex-1 truncate text-xs",
                        email.isRead ? "text-text-secondary" : "text-text-primary font-medium"
                      )}
                    >
                      {folder === "sent" || folder === "drafts"
                        ? parseAddress(email.toAddr).name || "(no recipient)"
                        : parseAddress(email.fromAddr).name}
                    </span>
                    {email.attachments && email.attachments.length > 0 && (
                      <Paperclip size={10} className="text-text-muted shrink-0" />
                    )}
                    {email.isStarred && (
                      <Star size={11} className="shrink-0 fill-amber-400 text-amber-400" />
                    )}
                    <span className="text-text-muted shrink-0 text-[10px]">
                      {timeAgo(email.createdAt)}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "mt-1 truncate text-xs",
                      email.isRead ? "text-text-muted" : "text-text-primary"
                    )}
                  >
                    {email.subject || "(no subject)"}
                  </p>
                  <p className="text-text-muted mt-0.5 truncate text-[11px]">
                    {previewText(email.body)}
                  </p>
                </button>
              )}
            />
          )}
        </div>
      </section>

      {/* Reading pane */}
      <section className="hidden min-h-0 flex-col md:flex">
        {selected ? (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-white/5 bg-white/[0.015] px-6 py-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-text-primary mb-3 text-base font-semibold tracking-tight">
                  {selected.subject || "(no subject)"}
                </h2>
                <EmailHeader
                  fromAddr={selected.fromAddr}
                  toAddr={selected.toAddr}
                  createdAt={selected.createdAt}
                />
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => startReply(selected, "reply")}
                  aria-label="Reply"
                  title="Reply"
                  className="transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.92]"
                >
                  <Reply size={14} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => startReply(selected, "replyAll")}
                  aria-label="Reply all"
                  title="Reply all"
                  className="transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.92]"
                >
                  <ReplyAll size={14} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => startReply(selected, "forward")}
                  aria-label="Forward"
                  title="Forward"
                  className="transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.92]"
                >
                  <Forward size={14} />
                </Button>
                <span className="mx-1 h-4 w-px bg-white/10" />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => toggleStar(selected)}
                  aria-label="Star"
                  className="transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-amber-400 active:scale-[0.92]"
                >
                  <Star
                    size={14}
                    className={selected.isStarred ? "fill-amber-400 text-amber-400" : ""}
                  />
                </Button>
                {selected.folder === "trash" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => restore(selected)}
                    aria-label="Restore"
                    className="transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-emerald-400/10 active:scale-[0.92]"
                  >
                    <ArchiveRestore size={14} className="text-emerald-400" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => moveToTrash(selected)}
                  aria-label="Trash"
                  className="transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-rose-400/10 active:scale-[0.92]"
                >
                  <Trash2 size={14} className="text-rose-400" />
                </Button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
              <EmailBody html={selected.bodyHtml} text={selected.body} loading={bodyLoading} />
              {selected.attachments && selected.attachments.length > 0 && (
                <EmailAttachments emailId={selected.id} attachments={selected.attachments} />
              )}
            </div>
          </>
        ) : (
          <div className="grid flex-1 place-items-center p-8">
            <EmptyState
              icon={<Mail size={16} />}
              title="No message selected"
              description="Pick a message from the list to read it here."
            />
          </div>
        )}
      </section>

      <ComposeDialog
        open={composeOpen}
        draft={draft}
        onClose={() => {
          setComposeOpen(false);
          setDraft(null);
        }}
        onDone={() => {
          setComposeOpen(false);
          setDraft(null);
          refresh();
        }}
      />
    </div>
  );
}

function ComposeDialog({
  open,
  draft,
  onClose,
  onDone,
}: {
  open: boolean;
  /** Prefill from Reply / Reply-all / Forward; null for a blank compose. */
  draft: { to: string; subject: string; body: string } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  // Applied when the dialog OPENS rather than on every draft change, so typing
  // over a quoted reply is never clobbered by a re-render.
  useEffect(() => {
    if (!open) return;
    setTo(draft?.to ?? "");
    setSubject(draft?.subject ?? "");
    setBody(draft?.body ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async (target: "sent" | "drafts") => {
    setBusy(true);
    try {
      const settingsRes = await fetch("/api/settings");
      const settings = await settingsRes.json();
      const signature = settings.emailSignature ? `\n\n${settings.emailSignature}` : "";
      await fetch("/api/emails", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          folder: target,
          fromAddr: settings.emailFrom || "you@dash.local",
          toAddr: to,
          subject,
          body: body + (target === "sent" ? signature : ""),
        }),
      });
      toast.success(target === "sent" ? "Saved to Sent" : "Draft saved");
      setTo("");
      setSubject("");
      setBody("");
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Compose"
      description="Messages are stored locally — connect a provider in Settings → Email to actually send."
    >
      <div className="space-y-3">
        <Input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="To"
          aria-label="To"
        />
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          aria-label="Subject"
        />
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          placeholder="Write your message…"
          aria-label="Message body"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => save("drafts")} disabled={busy}>
            Save draft
          </Button>
          <Button variant="primary" onClick={() => save("sent")} disabled={busy || !to.trim()}>
            <Send size={13} /> Send
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
