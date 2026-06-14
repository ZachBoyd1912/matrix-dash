"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Webhook } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { toast, confirm } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import type { Webhook as WebhookT } from "@/types/jarvis";

const EVENTS = ["*", "task.reminder", "job.completed", "email.received", "memory.saved"];

export default function WebhooksPage() {
  const ref = useGsapEntrance();
  const [list, setList] = useState<WebhookT[]>([]);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [event, setEvent] = useState("*");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/webhooks");
    setList(await res.json());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = async () => {
    if (!label.trim() || !url.trim()) return;
    const res = await fetch("/api/webhooks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label, url, event }),
    });
    if (!res.ok) {
      toast.error("Invalid URL");
      return;
    }
    setLabel("");
    setUrl("");
    setOpen(false);
    refresh();
  };

  const toggle = async (w: WebhookT) => {
    await fetch(`/api/webhooks?id=${w.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isEnabled: !w.isEnabled }),
    });
    refresh();
  };

  const remove = async (w: WebhookT) => {
    const ok = await confirm({ title: `Delete "${w.label}"?`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    await fetch(`/api/webhooks?id=${w.id}`, { method: "DELETE" });
    refresh();
  };

  return (
    <div ref={ref} className="space-y-6">
      <div className="relative overflow-hidden py-10">
        <div className="orb -top-16 left-10 h-52 w-52 bg-emerald-500/20" />
        <div className="orb top-0 right-16 h-44 w-44 bg-sky-500/15" style={{ animationDelay: "-6s" }} />
        <div className="relative">
          <span className="eyebrow"><Webhook size={11} /> Integrations</span>
          <h1 className="display text-gradient text-4xl md:text-5xl font-extrabold mt-3">Webhooks</h1>
          <p className="text-text-secondary text-sm mt-3 max-w-xl">
            Outbound HTTP callbacks fired on events. Useful for Discord, Slack, IFTTT, n8n.
          </p>
          <div className="mt-6">
            <Button variant="primary" onClick={() => setOpen(true)}>
              <Plus size={14} /> New webhook
            </Button>
          </div>
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={<Webhook size={16} />} title="No webhooks" />
      ) : (
        <div className="space-y-3">
          {list.map((w) => (
            <Card key={w.id} interactive className="flex items-center justify-between gap-3 rounded-2xl">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-text-primary">{w.label}</p>
                  <Badge>{w.event}</Badge>
                </div>
                <p className="text-[11px] text-text-muted mt-0.5 truncate font-mono">{w.url}</p>
              </div>
              <Switch checked={!!w.isEnabled} onCheckedChange={() => toggle(w)} label="Enabled" />
              <Button size="icon" variant="ghost" onClick={() => remove(w)} aria-label="Delete">
                <Trash2 size={13} className="text-rose-400" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="New webhook">
        <div className="space-y-3">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Discord channel)" autoFocus />
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://discord.com/api/webhooks/…" />
          <div>
            <label className="block text-[10px] uppercase text-text-muted mb-1">Trigger event</label>
            <select value={event} onChange={(e) => setEvent(e.target.value)} className="glass-input h-9 px-2 rounded-md text-sm w-full">
              {EVENTS.map((e) => (<option key={e} value={e}>{e}</option>))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={create} disabled={!label.trim() || !url.trim()}>Create</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
