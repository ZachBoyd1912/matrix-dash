"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Eye, EyeOff, Shield, Lock } from "lucide-react";
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
    const ok = await confirm({
      title: `Delete "${e.label}"?`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await fetch(`/api/vault?id=${e.id}`, { method: "DELETE" });
    refresh();
  };

  return (
    <div ref={ref} className="space-y-6">
      <div className="relative overflow-hidden py-10">
        <div className="orb -top-16 left-10 h-52 w-52 bg-emerald-500/20" />
        <div
          className="orb top-0 right-16 h-44 w-44 bg-sky-500/15"
          style={{ animationDelay: "-6s" }}
        />
        <div className="relative">
          <span className="eyebrow">
            <Lock size={11} /> Secrets
          </span>
          <h1 className="display text-gradient mt-3 text-4xl md:text-5xl">Vault</h1>
          <p className="text-text-secondary mt-3 max-w-xl text-sm">
            Encrypted local key-value store for secrets the agent or your scripts need. Same
            AES-256-GCM as API keys.
          </p>
        </div>
      </div>

      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus size={14} /> New secret
      </Button>

      {list.length === 0 ? (
        <EmptyState
          icon={<Shield size={16} />}
          title="Vault is empty"
          description="Store API keys, passwords, anything."
        />
      ) : (
        <div className="space-y-3">
          {list.map((e) => (
            <Card
              key={e.id}
              interactive
              className="flex items-center justify-between gap-3 rounded-xl"
            >
              <div className="min-w-0 flex-1">
                <p className="text-text-primary text-sm font-medium">{e.label}</p>
                {revealed[e.id] ? (
                  <p className="mt-0.5 font-mono text-[11px] break-all text-emerald-300">
                    {revealed[e.id]}
                  </p>
                ) : (
                  <p className="text-text-muted mt-0.5 text-[11px]">••••••••••••</p>
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
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (e.g. Stripe key)"
            autoFocus
          />
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Secret value"
            type="password"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={create} disabled={!label.trim() || !value.trim()}>
              Store
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
