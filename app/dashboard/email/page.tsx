"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Inbox,
  Send,
  FileEdit,
  Trash2,
  Star,
  PenSquare,
  Mail,
  ArchiveRestore,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { toast, confirm } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { timeAgo } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";
import { EMAIL_FOLDERS, type Email, type EmailFolder } from "@/types/email";

const FOLDER_ICONS: Record<EmailFolder, React.ReactNode> = {
  inbox: <Inbox size={14} />,
  sent: <Send size={14} />,
  drafts: <FileEdit size={14} />,
  trash: <Trash2 size={14} />,
};

export default function EmailPage() {
  const ref = useGsapEntrance();
  const [folder, setFolder] = useState<EmailFolder | "starred">("inbox");
  const [list, setList] = useState<Email[] | null>(null);
  const [selected, setSelected] = useState<Email | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [gmailAddr, setGmailAddr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const query = folder === "starred" ? "starred=1" : `folder=${folder}`;
    console.log("[email-page] fetching:", `/api/emails?${query}`);
    const res = await fetch(`/api/emails?${query}`);
    const data = (await res.json()) as Email[];
    console.log("[email-page] result:", data.length, "emails");
    setList(data);
    setSelected((prev) => (prev ? data.find((e) => e.id === prev.id) ?? null : null));
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

  const open = async (email: Email) => {
    setSelected(email);
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
      <aside className="border-r border-white/5 p-3 bg-white/[0.01] hidden md:flex flex-col gap-1">
        {gmailAddr && (
          <p className="text-[10px] text-text-muted truncate px-2 py-1 rounded-md bg-white/[0.03] text-center">
            {gmailAddr}
          </p>
        )}
        <Button variant="primary" size="sm" className="mb-3 rounded-full" onClick={() => setComposeOpen(true)}>
          <PenSquare size={13} /> Compose
        </Button>
        {EMAIL_FOLDERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFolder(f.value)}
            className={cn(
              "flex items-center gap-2 px-3 h-8 rounded-full text-xs border transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98]",
              folder === f.value
                ? "bg-emerald-400/10 border-emerald-400/30 text-emerald-300 shadow-[0_0_18px_-6px_rgba(52,211,153,0.6)]"
                : "border-transparent text-text-secondary hover:bg-white/[0.04] hover:text-text-primary"
            )}
          >
            {FOLDER_ICONS[f.value]}
            {f.label}
          </button>
        ))}
        <button
          onClick={() => setFolder("starred")}
          className={cn(
            "flex items-center gap-2 px-3 h-8 rounded-full text-xs border transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98]",
            folder === "starred"
              ? "bg-emerald-400/10 border-emerald-400/30 text-emerald-300 shadow-[0_0_18px_-6px_rgba(52,211,153,0.6)]"
              : "border-transparent text-text-secondary hover:bg-white/[0.04] hover:text-text-primary"
          )}
        >
          <Star size={14} />
          Starred
        </button>
      </aside>

      {/* Message list */}
      <section className="border-r border-white/5 flex flex-col min-h-0">
        <div className="md:hidden p-2 border-b border-white/5 flex items-center gap-1 overflow-x-auto">
          {[...EMAIL_FOLDERS.map((f) => f.value), "starred" as const].map((f) => (
            <button
              key={f}
              onClick={() => setFolder(f as EmailFolder | "starred")}
              className={cn(
                "px-3 h-7 rounded-full text-[11px] capitalize shrink-0 border transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98]",
                folder === f
                  ? "bg-emerald-400/10 border-emerald-400/30 text-emerald-300 shadow-[0_0_18px_-6px_rgba(52,211,153,0.6)]"
                  : "border-transparent text-text-muted hover:text-text-primary"
              )}
            >
              {f}
            </button>
          ))}
          <Button variant="primary" size="sm" className="ml-auto shrink-0 rounded-full" onClick={() => setComposeOpen(true)}>
            <PenSquare size={12} />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {list === null ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<Mail size={16} />}
                title="Nothing here"
                description={folder === "inbox" ? "Your inbox is clear." : `No messages in ${folder}.`}
              />
            </div>
          ) : (
            list.map((email) => (
              <button
                key={email.id}
                onClick={() => open(email)}
                className={cn(
                  "w-full text-left px-4 py-3 border-b border-white/5 border-l-2 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.99]",
                  selected?.id === email.id
                    ? "bg-emerald-400/[0.07] border-l-emerald-400/60 shadow-[inset_0_0_18px_-10px_rgba(52,211,153,0.7)]"
                    : "border-l-transparent hover:bg-white/[0.03]"
                )}
              >
                <div className="flex items-center gap-2">
                  {!email.isRead && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />}
                  <span
                    className={cn(
                      "text-xs truncate flex-1",
                      email.isRead ? "text-text-secondary" : "text-text-primary font-medium"
                    )}
                  >
                    {folder === "sent" || folder === "drafts" ? email.toAddr || "(no recipient)" : email.fromAddr}
                  </span>
                  {email.isStarred && <Star size={11} className="text-amber-400 fill-amber-400 shrink-0" />}
                  <span className="text-[10px] text-text-muted shrink-0">{timeAgo(email.createdAt)}</span>
                </div>
                <p
                  className={cn(
                    "text-xs mt-1 truncate",
                    email.isRead ? "text-text-muted" : "text-text-primary"
                  )}
                >
                  {email.subject || "(no subject)"}
                </p>
                <p className="text-[11px] text-text-muted mt-0.5 truncate">{email.body}</p>
              </button>
            ))
          )}
        </div>
      </section>

      {/* Reading pane */}
      <section className="hidden md:flex flex-col min-h-0">
        {selected ? (
          <>
            <div className="px-6 py-4 border-b border-white/5 bg-white/[0.015] flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-text-primary tracking-tight">
                  {selected.subject || "(no subject)"}
                </h2>
                <p className="text-xs text-text-muted mt-1.5">
                  From <span className="text-text-secondary">{selected.fromAddr}</span> · To{" "}
                  <span className="text-text-secondary">{selected.toAddr}</span> ·{" "}
                  {timeAgo(selected.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => toggleStar(selected)}
                  aria-label="Star"
                  className="transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.92] hover:text-amber-400"
                >
                  <Star
                    size={14}
                    className={selected.isStarred ? "text-amber-400 fill-amber-400" : ""}
                  />
                </Button>
                {selected.folder === "trash" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => restore(selected)}
                    aria-label="Restore"
                    className="transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.92] hover:bg-emerald-400/10"
                  >
                    <ArchiveRestore size={14} className="text-emerald-400" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => moveToTrash(selected)}
                  aria-label="Trash"
                  className="transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.92] hover:bg-rose-400/10"
                >
                  <Trash2 size={14} className="text-rose-400" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <p className="text-sm text-text-primary/90 leading-7 whitespace-pre-wrap max-w-2xl">
                {selected.body}
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1 grid place-items-center p-8">
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
        onClose={() => setComposeOpen(false)}
        onDone={() => {
          setComposeOpen(false);
          refresh();
        }}
      />
    </div>
  );
}

function ComposeDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

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
    <Dialog open={open} onClose={onClose} title="Compose" description="Messages are stored locally — connect a provider in Settings → Email to actually send.">
      <div className="space-y-3">
        <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="To" />
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          placeholder="Write your message…"
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
