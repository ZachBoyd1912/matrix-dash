"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty";
import { confirm } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import type { Contact } from "@/types/jarvis";

export default function ContactsPage() {
  const ref = useGsapEntrance();
  const [list, setList] = useState<Contact[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/contacts");
    setList(await res.json());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = async () => {
    if (!name.trim()) return;
    await fetch("/api/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, notes }),
    });
    setName("");
    setEmail("");
    setNotes("");
    setOpen(false);
    refresh();
  };

  const remove = async (c: Contact) => {
    const ok = await confirm({ title: `Delete ${c.name}?`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    await fetch(`/api/contacts?id=${c.id}`, { method: "DELETE" });
    refresh();
  };

  return (
    <div ref={ref} className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Contacts</h2>
        <p className="text-text-secondary text-sm mt-1">
          A tiny address book the agent uses when you say &ldquo;email Alice&rdquo;.
        </p>
      </div>

      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus size={14} /> New contact
      </Button>

      {list.length === 0 ? (
        <EmptyState icon={<Users size={16} />} title="No contacts" />
      ) : (
        <div className="space-y-2">
          {list.map((c) => (
            <Card key={c.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary">{c.name}</p>
                <p className="text-[11px] text-text-muted">{c.email || "—"}</p>
                {c.notes && <p className="text-[11px] text-text-secondary mt-0.5 line-clamp-1">{c.notes}</p>}
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove(c)} aria-label="Delete">
                <Trash2 size={13} className="text-rose-400" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="New contact">
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoFocus />
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes (optional)" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={create} disabled={!name.trim()}>Create</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
