"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Calendar } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty";
import { toast, confirm } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import type { Calendar as CalT } from "@/types/jarvis";

export default function CalendarSettingsPage() {
  const ref = useGsapEntrance();
  const [list, setList] = useState<CalT[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [caldavUrl, setCaldavUrl] = useState("");
  const [caldavUser, setCaldavUser] = useState("");
  const [caldavPass, setCaldavPass] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/calendars");
    setList(await res.json());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const create = async () => {
    if (!name.trim()) return;
    const body: Record<string, unknown> = { name: name.trim(), color: "#34d399" };
    if (caldavUrl) { body.caldavUrl = caldavUrl; body.caldavUser = caldavUser || null; body.caldavPass = caldavPass || null; }
    const res = await fetch("/api/calendars", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) { toast.error("Failed to create calendar"); return; }
    toast.success("Calendar created");
    setName(""); setCaldavUrl(""); setCaldavUser(""); setCaldavPass("");
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

  return (
    <div ref={ref} className="space-y-6">
      <div className="relative isolate py-10">
        <div className="orb -top-16 left-10 h-52 w-52 bg-pink-500/20" />
        <div className="orb top-0 left-40 h-40 w-40 bg-rose-500/15" style={{ animationDelay: "-6s" }} />
        <div className="relative">
          <span className="eyebrow"><Calendar size={11} /> Calendar</span>
          <h1 className="display text-gradient text-4xl md:text-5xl font-extrabold mt-3">Calendar</h1>
          <p className="text-text-secondary text-sm mt-3 max-w-xl">
            Manage personal and subscribed calendars. Connect a CalDAV server to sync events across devices.
          </p>
          <Button variant="primary" className="mt-6" onClick={() => setOpen(true)}>
            <Plus size={14} /> Add calendar
          </Button>
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<Calendar size={16} />}
          title="No calendars"
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

      <Dialog open={open} onClose={() => setOpen(false)} title="New calendar">
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Calendar name" autoFocus />
          <p className="text-[10px] uppercase tracking-wider text-text-muted">CalDAV (optional)</p>
          <Input value={caldavUrl} onChange={(e) => setCaldavUrl(e.target.value)} placeholder="https://caldav.example.com/dav" />
          <Input value={caldavUser} onChange={(e) => setCaldavUser(e.target.value)} placeholder="Username" />
          <Input value={caldavPass} onChange={(e) => setCaldavPass(e.target.value)} type="password" placeholder="Password / app password" />
          <p className="text-[10px] text-text-muted">Leave blank to create a local calendar without sync.</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={create} disabled={!name.trim()}>Create</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
