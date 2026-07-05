"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Trash2, Calendar, Globe, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty";
import { toast, confirm } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import type { Calendar as CalT } from "@/types/jarvis";

type ProviderType = "local" | "google";

export default function CalendarSettingsPage() {
  const ref = useGsapEntrance();
  const searchParams = useSearchParams();
  const [list, setList] = useState<CalT[]>([]);
  const [googleConns, setGoogleConns] = useState<Array<{ id: string; googleEmail: string; isActive: boolean | null }>>([]);
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<ProviderType>("local");
  const [name, setName] = useState("");
  const [caldavUrl, setCaldavUrl] = useState("");
  const [caldavUser, setCaldavUser] = useState("");
  const [caldavPass, setCaldavPass] = useState("");
  const [oauthError, setOauthError] = useState("");

  useEffect(() => {
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
  }, [searchParams]);

  const refresh = useCallback(async () => {
    const [cals, gc] = await Promise.all([
      fetch("/api/calendars").then((r) => r.json()),
      fetch("/api/google-calendar/connections").then((r) => r.json()).catch(() => []),
    ]);
    setList(Array.isArray(cals) ? cals : []);
    setGoogleConns(Array.isArray(gc) ? gc : []);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const create = async () => {
    if (!name.trim()) return;
    const body: Record<string, unknown> = { name: name.trim(), color: "#34d399" };
    if (provider === "local" && caldavUrl) {
      body.caldavUrl = caldavUrl;
      body.caldavUser = caldavUser || null;
      body.caldavPass = caldavPass || null;
    }
    const res = await fetch("/api/calendars", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) { toast.error("Failed to create calendar"); return; }
    toast.success("Calendar created");
    setName(""); setCaldavUrl(""); setCaldavUser(""); setCaldavPass(""); setProvider("local");
    setOpen(false);
    refresh();
  };

  const remove = async (cal: CalT) => {
    const ok = await confirm({ title: `Delete "${cal.name}"?`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    await fetch(`/api/calendars/${cal.id}`, { method: "DELETE" });
    toast.success("Calendar removed");
    refresh();
  };

  const disconnectGoogle = async (conn: typeof googleConns[number]) => {
    const ok = await confirm({
      title: `Disconnect ${conn.googleEmail} from Google Calendar?`,
      confirmLabel: "Disconnect",
      danger: true,
    });
    if (!ok) return;
    await fetch(`/api/google-calendar/connections?id=${conn.id}`, { method: "DELETE" });
    toast.success("Google Calendar disconnected");
    refresh();
  };

  const handleGoogleOAuth = () => {
    window.location.href = "/api/oauth/google-calendar/authorize?redirect_to=" +
      encodeURIComponent(window.location.pathname);
  };

  const activeGoogle = googleConns.find((c) => c.isActive);

  return (
    <div ref={ref} className="space-y-6">
      <div className="relative isolate py-10">
        <div className="orb -top-16 left-10 h-52 w-52 bg-pink-500/20" />
        <div className="orb top-0 left-40 h-40 w-40 bg-rose-500/15" style={{ animationDelay: "-6s" }} />
        <div className="relative">
          <span className="eyebrow"><Calendar size={11} /> Calendar</span>
          <h1 className="display text-gradient text-4xl md:text-5xl mt-3">Calendar</h1>
          <p className="text-text-secondary text-sm mt-3 max-w-xl">
            Manage personal calendars — local, CalDAV, or Google Calendar.
          </p>
          <Button variant="primary" className="mt-6" onClick={() => setOpen(true)}>
            <Plus size={14} /> Add calendar
          </Button>
        </div>
      </div>

      {/* Google Calendar connection card */}
      {activeGoogle && (
        <Card interactive className="rounded-2xl mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 grid place-items-center shrink-0">
                <Globe size={18} className="text-blue-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-text-primary">{activeGoogle.googleEmail}</p>
                  <Badge className="bg-emerald-400/10 border-emerald-400/20 text-emerald-400">● Connected</Badge>
                </div>
                <p className="text-[11px] text-text-muted mt-0.5">Google Calendar</p>
              </div>
            </div>
            <Button size="icon" variant="ghost" onClick={() => disconnectGoogle(activeGoogle)} aria-label="Disconnect">
              <Trash2 size={13} className="text-rose-400" />
            </Button>
          </div>
        </Card>
      )}

      {/* Google connect card */}
      {!activeGoogle && (
        <>
          {oauthError && (
            <Card className="rounded-2xl p-4 border-amber-400/20 bg-amber-400/5 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-400" />
                <p className="text-sm font-semibold text-amber-400">Configuration needed</p>
              </div>
              <p className="text-xs text-text-secondary">{oauthError}</p>
              <p className="text-[10px] text-text-muted">
                Add <code className="bg-white/5 px-1 rounded">GOOGLE_CLIENT_ID</code> and{" "}
                <code className="bg-white/5 px-1 rounded">GOOGLE_CLIENT_SECRET</code> to{" "}
                <code className="bg-white/5 px-1 rounded">.env.local</code> from your Google Cloud Console project
                with the Calendar API enabled.
              </p>
            </Card>
          )}
          <Card className="rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-blue-400" />
            <p className="text-sm font-semibold">Google Calendar</p>
          </div>
          <p className="text-xs text-text-secondary">
            Connect your Google account to sync calendars — meetings, reminders, and shared events from Gmail.
          </p>
          <Button variant="secondary" onClick={handleGoogleOAuth}>
            <Globe size={14} /> Connect Google Calendar
          </Button>
          <p className="text-[10px] text-text-muted">
            Requests calendar.readonly scope. Your events stay private to your machine.
          </p>
        </Card>
        </>
      )}

      {/* Local calendars list */}
      {list.length === 0 ? (
        <EmptyState
          icon={<Calendar size={16} />}
          title="No local calendars"
          description="Add your first calendar — local (stored here) or CalDAV (synced with Nextcloud, Fastmail, or iCloud)."
        />
      ) : (
        <div className="space-y-2">
          {list.map((cal) => (
            <Card key={cal.id} interactive className="flex items-center justify-between rounded-2xl gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: cal.color }} />
                <span className="text-sm font-medium text-text-primary">{cal.name}</span>
                {cal.caldavUrl && (
                  <Badge className="text-[10px] bg-white/5 border-white/10 text-text-muted">CalDAV</Badge>
                )}
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove(cal)} aria-label="Delete">
                <Trash2 size={13} className="text-rose-400" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="Add calendar">
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] uppercase text-text-muted mb-1">Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as ProviderType)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary"
            >
              <option value="local">Local (CalDAV / ICS)</option>
              <option value="google">Google Calendar</option>
            </select>
          </div>

          {provider === "local" && (
            <>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Calendar name" autoFocus />
              <p className="text-[10px] uppercase tracking-wider text-text-muted">CalDAV (optional)</p>
              <Input value={caldavUrl} onChange={(e) => setCaldavUrl(e.target.value)} placeholder="https://caldav.example.com/dav" />
              <Input value={caldavUser} onChange={(e) => setCaldavUser(e.target.value)} placeholder="Username" />
              <Input value={caldavPass} onChange={(e) => setCaldavPass(e.target.value)} type="password" placeholder="Password / app password" />
              <p className="text-[10px] text-text-muted">Leave blank to create a local-only calendar.</p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={create} disabled={!name.trim()}>Create</Button>
              </div>
            </>
          )}

          {provider === "google" && (
            <div className="space-y-3 py-2">
              <p className="text-xs text-text-secondary">
                Google Calendar connects via OAuth — once authorized, your Google calendars appear here and sync automatically.
              </p>
              {activeGoogle ? (
                <p className="text-xs text-emerald-400">✅ Already connected as {activeGoogle.googleEmail}</p>
              ) : (
                <Button variant="primary" onClick={handleGoogleOAuth}>
                  <Globe size={14} /> Connect with Google
                </Button>
              )}
              <div className="flex justify-end">
                <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
              </div>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}
