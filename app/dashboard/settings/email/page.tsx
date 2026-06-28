"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, RefreshCw, Trash2, Mail, Globe, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast, confirm } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { timeAgo } from "@/lib/utils/time";
import type { EmailAccountPublic } from "@/types/jarvis";

export default function EmailSettingsPage() {
  const ref = useGsapEntrance();
  const searchParams = useSearchParams();
  const [from, setFrom] = useState("");
  const [signature, setSignature] = useState("");
  const [accounts, setAccounts] = useState<EmailAccountPublic[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [gmailConns, setGmailConns] = useState<Array<{ id: string; googleEmail: string; isActive: boolean | null }>>([]);
  const [oauthError, setOauthError] = useState("");

  const refresh = useCallback(async () => {
    const [s, a, g] = await Promise.all([
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/email-accounts").then((r) => r.json()),
      fetch("/api/gmail/connections").then((r) => r.json()).catch(() => []),
    ]);
    setFrom(s.emailFrom ?? "");
    setSignature(s.emailSignature ?? "");
    setAccounts(Array.isArray(a) ? a : []);
    setGmailConns(Array.isArray(g) ? g : []);
  }, []);

  useEffect(() => {
    refresh();
    const err = searchParams.get("error");
    const msg = searchParams.get("msg");
    if (err) {
      const messages: Record<string, string> = {
        missing_env: msg ? decodeURIComponent(msg) : "GOOGLE_CLIENT_ID not set in .env.local",
        oauth_denied: "Authorization was denied. Check the OAuth consent screen permissions.",
        invalid_state: "Session expired. The OAuth state was invalid or already used — try again.",
        token_exchange_failed: "Failed to exchange the authorization code for a token. Check your GOOGLE_CLIENT_SECRET.",
      };
      setOauthError(messages[err] || `OAuth error: ${err}`);
    }
  }, [refresh, searchParams]);

  const saveDefaults = async () => {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emailFrom: from, emailSignature: signature }),
    });
    toast.success("Email settings saved");
  };

  const sync = async (id: string) => {
    setSyncing(id);
    try {
      const res = await fetch(`/api/email-accounts/${id}`, { method: "POST" });
      const data = await res.json();
      if (data.ok) toast.success(`Synced`, `${data.imported} new message(s)`);
      else toast.error("Sync failed", data.error);
      refresh();
    } finally {
      setSyncing(null);
    }
  };

  const toggleTriage = async (a: EmailAccountPublic) => {
    await fetch(`/api/email-accounts/${a.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ triageEnabled: !a.triageEnabled }),
    });
    refresh();
  };

  const remove = async (a: EmailAccountPublic) => {
    const ok = await confirm({ title: `Remove ${a.address}?`, confirmLabel: "Remove", danger: true });
    if (!ok) return;
    await fetch(`/api/email-accounts/${a.id}`, { method: "DELETE" });
    toast.success("Account removed");
    refresh();
  };

  const handleGmailOAuth = () => {
    window.location.href = "/api/oauth/gmail/authorize?redirect_to=" +
      encodeURIComponent(window.location.pathname);
  };

  const disconnectGmail = async (conn: typeof gmailConns[number]) => {
    const ok = await confirm({
      title: `Disconnect ${conn.googleEmail} from Gmail?`,
      confirmLabel: "Disconnect",
      danger: true,
    });
    if (!ok) return;
    await fetch(`/api/gmail/connections?id=${conn.id}`, { method: "DELETE" });
    toast.success("Gmail disconnected");
    refresh();
  };

  const syncGmail = async () => {
    try {
      const res = await fetch("/api/gmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync", limit: 99999 }),
      });
      const data = await res.json();
      if (data.ok) toast.success("Gmail synced", `${data.imported} new emails imported`);
      else toast.error("Sync failed", data.error);
      refresh();
    } catch {
      toast.error("Sync failed", "Could not reach Gmail API");
    }
  };

  const activeGmail = gmailConns.find((c) => c.isActive);

  return (
    <div ref={ref} className="space-y-8">
      <div className="relative isolate py-10">
        <div className="orb -top-16 left-10 h-52 w-52 bg-emerald-500/20" />
        <div className="orb top-0 left-40 h-40 w-40 bg-sky-500/15" style={{ animationDelay: "-6s" }} />
        <div className="relative">
          <span className="eyebrow">
            <Mail size={11} /> Email
          </span>
          <h1 className="display text-gradient text-4xl md:text-5xl font-extrabold mt-3">Email</h1>
          <p className="text-text-secondary text-sm mt-3 max-w-2xl">
            Connect a real IMAP/SMTP account for live sync, sending, and AI triage. Credentials are
            AES-256-GCM encrypted at rest.
          </p>
        </div>
      </div>

      {/* Gmail OAuth connection card */}
      {activeGmail ? (
        <Card interactive className="rounded-2xl mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 grid place-items-center shrink-0">
                <Globe size={18} className="text-red-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-text-primary">{activeGmail.googleEmail}</p>
                  <Badge className="bg-emerald-400/10 border-emerald-400/20 text-emerald-400">● Connected</Badge>
                </div>
                <p className="text-[11px] text-text-muted mt-0.5">Gmail OAuth — IMAP/SMTP with token auth</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="ghost" onClick={syncGmail} aria-label="Sync Gmail">
                <RefreshCw size={13} />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => disconnectGmail(activeGmail)} aria-label="Disconnect">
                <Trash2 size={13} className="text-rose-400" />
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          {oauthError && (
            <Card className="rounded-2xl p-4 border-amber-400/20 bg-amber-400/5 space-y-2 mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-400" />
                <p className="text-sm font-semibold text-amber-400">Configuration needed</p>
              </div>
              <p className="text-xs text-text-secondary">{oauthError}</p>
              <p className="text-[10px] text-text-muted">
                Add <code className="bg-white/5 px-1 rounded">GOOGLE_CLIENT_ID</code> and{" "}
                <code className="bg-white/5 px-1 rounded">GOOGLE_CLIENT_SECRET</code> to{" "}
                <code className="bg-white/5 px-1 rounded">.env.local</code> and add the redirect URI
                <code className="bg-white/5 px-1 rounded ml-1">http://localhost:3000/api/oauth/gmail/callback</code>{" "}
                in Google Cloud Console.
              </p>
            </Card>
          )}
          <Card className="rounded-2xl p-5 space-y-3 mb-4">
            <div className="flex items-center gap-2">
              <Globe size={16} className="text-red-400" />
              <p className="text-sm font-semibold">Gmail OAuth</p>
            </div>
            <p className="text-xs text-text-secondary">
              Connect Gmail with one click — no app password needed. Uses OAuth to access your inbox
              and send mail through Gmail's servers.
            </p>
            <Button variant="secondary" onClick={handleGmailOAuth}>
              <Globe size={14} /> Connect Gmail
            </Button>
            <p className="text-[10px] text-text-muted">
              Requests mail.google.com scope. Emails stay local — synced to ~/MatrixDash/matrix.db.
            </p>
          </Card>
        </>
      )}

      {accounts.length > 0 && (
        <div className="space-y-2">
          {accounts.map((a) => (
            <Card key={a.id} interactive className="flex items-center justify-between gap-3 rounded-2xl">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-emerald-400" />
                  <p className="text-sm font-medium text-text-primary">{a.address}</p>
                  {a.triageEnabled && (
                    <Badge className="bg-emerald-400/10 border-emerald-400/20 text-emerald-400">Triage</Badge>
                  )}
                </div>
                <p className="text-[11px] text-text-muted mt-0.5">
                  {a.imapHost} · {a.lastSyncAt ? `synced ${timeAgo(a.lastSyncAt)}` : "never synced"}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-text-muted">AI triage</span>
                <Switch checked={!!a.triageEnabled} onCheckedChange={() => toggleTriage(a)} label="Triage" />
                <Button size="icon" variant="ghost" onClick={() => sync(a.id)} disabled={syncing === a.id} aria-label="Sync">
                  <RefreshCw size={14} className={syncing === a.id ? "animate-spin" : ""} />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => remove(a)} aria-label="Remove">
                  <Trash2 size={14} className="text-rose-400" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <AccountForm onAdded={refresh} />

      <Card interactive className="rounded-2xl">
        <p className="text-sm font-medium mb-3">Compose defaults</p>
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] uppercase text-text-muted mb-1">From address</label>
            <Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="you@dash.local" />
          </div>
          <div>
            <label className="block text-[10px] uppercase text-text-muted mb-1">Signature</label>
            <Textarea value={signature} onChange={(e) => setSignature(e.target.value)} rows={3} placeholder="— Zach" />
          </div>
          <div className="flex justify-end">
            <Button variant="primary" onClick={saveDefaults}>Save</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function AccountForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    label: "",
    address: "",
    imapHost: "",
    imapPort: 993,
    smtpHost: "",
    smtpPort: 465,
    username: "",
    password: "",
    triageEnabled: false,
  });

  const set = (k: keyof typeof f, v: string | number | boolean) => setF((prev) => ({ ...prev, [k]: v }));

  const submit = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/email-accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...f, username: f.username || f.address, test: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error("Could not connect", typeof data.error === "string" ? data.error : "Check IMAP settings.");
        return;
      }
      toast.success("Account connected");
      setOpen(false);
      setF({ label: "", address: "", imapHost: "", imapPort: 993, smtpHost: "", smtpPort: 465, username: "", password: "", triageEnabled: false });
      onAdded();
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus size={14} /> Connect email account
      </Button>
    );
  }

  return (
    <Card className="space-y-3">
      <p className="text-sm font-medium">Connect account</p>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Label" value={f.label} onChange={(e) => set("label", e.target.value)} />
        <Input placeholder="you@gmail.com" value={f.address} onChange={(e) => set("address", e.target.value)} />
        <Input placeholder="imap.gmail.com" value={f.imapHost} onChange={(e) => set("imapHost", e.target.value)} />
        <Input placeholder="993" type="number" value={f.imapPort} onChange={(e) => set("imapPort", parseInt(e.target.value) || 993)} />
        <Input placeholder="smtp.gmail.com" value={f.smtpHost} onChange={(e) => set("smtpHost", e.target.value)} />
        <Input placeholder="465" type="number" value={f.smtpPort} onChange={(e) => set("smtpPort", parseInt(e.target.value) || 465)} />
        <Input placeholder="Username (optional)" value={f.username} onChange={(e) => set("username", e.target.value)} />
        <Input placeholder="Password / app password" type="password" value={f.password} onChange={(e) => set("password", e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-xs text-text-secondary">
        <input type="checkbox" checked={f.triageEnabled} onChange={(e) => set("triageEnabled", e.target.checked)} className="accent-emerald-400" />
        Enable AI triage (auto-tag, summarize, flag urgent)
      </label>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={busy || !f.address || !f.imapHost || !f.password}>
          {busy ? "Testing…" : "Test & connect"}
        </Button>
      </div>
      <p className="text-[10px] text-text-muted">
        Gmail/Outlook need an app password with IMAP enabled. The connection is tested before saving.
      </p>
    </Card>
  );
}
