"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, KeyRound, Copy, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty";
import { toast, confirm } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { timeAgo } from "@/lib/utils/time";
import type { ApiTokenPublic } from "@/types/jarvis";

export default function TokensPage() {
  const ref = useGsapEntrance();
  const [list, setList] = useState<ApiTokenPublic[]>([]);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/tokens");
    setList(await res.json());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = async () => {
    if (!label.trim()) return;
    const res = await fetch("/api/tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label }),
    });
    const data = await res.json();
    setCreated(data.token);
    setLabel("");
    refresh();
  };

  const remove = async (t: ApiTokenPublic) => {
    const ok = await confirm({ title: `Revoke "${t.label}"?`, confirmLabel: "Revoke", danger: true });
    if (!ok) return;
    await fetch(`/api/tokens?id=${t.id}`, { method: "DELETE" });
    refresh();
  };

  const copy = () => {
    if (!created) return;
    navigator.clipboard.writeText(created);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div ref={ref} className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">API Tokens</h2>
        <p className="text-text-secondary text-sm mt-1">
          Bearer tokens for the inbound webhook endpoint at{" "}
          <code className="text-emerald-300">/api/hooks/&lt;token&gt;</code>. Use them from Shortcuts, Home
          Assistant, or any script.
        </p>
      </div>

      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus size={14} /> New token
      </Button>

      {list.length === 0 ? (
        <EmptyState icon={<KeyRound size={16} />} title="No tokens yet" description="Create one to call Jarvis from outside." />
      ) : (
        <div className="space-y-2">
          {list.map((t) => (
            <Card key={t.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary">{t.label}</p>
                <p className="text-[11px] text-text-muted mt-0.5 font-mono">
                  {t.token} · {t.lastUsedAt ? `used ${timeAgo(t.lastUsedAt)}` : "never used"}
                </p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove(t)} aria-label="Revoke">
                <Trash2 size={13} className="text-rose-400" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => { setOpen(false); setCreated(null); }} title={created ? "Token created" : "New API token"} description={created ? "Copy this now — you won't see it again." : "Give your token a memorable label."}>
        {created ? (
          <div className="space-y-3">
            <code className="block text-xs text-emerald-300 bg-white/[0.03] p-3 rounded-md break-all font-mono">
              {created}
            </code>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={copy}>
                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
              </Button>
              <Button variant="primary" onClick={() => { setOpen(false); setCreated(null); }}>Done</Button>
            </div>
            <p className="text-[10px] text-text-muted">
              Try it:{" "}
              <code className="text-text-primary">
                {`curl -X POST /api/hooks/${created.slice(0, 12)}… -d '{"action":"notify","title":"hi"}'`}
              </code>
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Shortcuts on iPhone" autoFocus />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={create} disabled={!label.trim()}>Create</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
