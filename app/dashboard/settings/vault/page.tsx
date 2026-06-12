"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Eye, EyeOff, Shield } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty";
import { toast, confirm } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import type { VaultEntryPublic } from "@/types/jarvis";

export default function VaultPage() {
  const ref = useGsapEntrance();
  const [list, setList] = useState<VaultEntryPublic[]>([]);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const res = await fetch("/api/vault");
    setList(await res.json());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = async () => {
    if (!label.trim() || !value.trim()) return;
    await fetch("/api/vault", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label, value }),
    });
    setLabel("");
    setValue("");
    setOpen(false);
    toast.success("Secret stored");
    refresh();
  };

  const reveal = async (id: string) => {
    if (revealed[id]) {
      setRevealed((r) => {
        const next = { ...r };
        delete next[id];
        return next;
      });
      return;
    }
    const res = await fetch(`/api/vault?reveal=${id}`);
    const data = await res.json();
    setRevealed((r) => ({ ...r, [id]: data.value }));
  };

  const remove = async (e: VaultEntryPublic) => {
    const ok = await confirm({ title: `Delete "${e.label}"?`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    await fetch(`/api/vault?id=${e.id}`, { method: "DELETE" });
    refresh();
  };

  return (
    <div ref={ref} className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Vault</h2>
        <p className="text-text-secondary text-sm mt-1">
          Encrypted local key-value store for secrets the agent or your scripts need. Same AES-256-GCM
          as API keys.
        </p>
      </div>

      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus size={14} /> New secret
      </Button>

      {list.length === 0 ? (
        <EmptyState icon={<Shield size={16} />} title="Vault is empty" description="Store API keys, passwords, anything." />
      ) : (
        <div className="space-y-2">
          {list.map((e) => (
            <Card key={e.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary">{e.label}</p>
                {revealed[e.id] ? (
                  <p className="text-[11px] text-emerald-300 font-mono mt-0.5 break-all">{revealed[e.id]}</p>
                ) : (
                  <p className="text-[11px] text-text-muted mt-0.5">••••••••••••</p>
                )}
              </div>
              <Button size="icon" variant="ghost" onClick={() => reveal(e.id)} aria-label="Reveal">
                {revealed[e.id] ? <EyeOff size={13} /> : <Eye size={13} />}
              </Button>
              <Button size="icon" variant="ghost" onClick={() => remove(e)} aria-label="Delete">
                <Trash2 size={13} className="text-rose-400" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="New secret">
        <div className="space-y-3">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Stripe key)" autoFocus />
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Secret value" type="password" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={create} disabled={!label.trim() || !value.trim()}>Store</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
