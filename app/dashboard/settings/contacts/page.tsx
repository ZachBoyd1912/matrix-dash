"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Users, Contact as ContactIcon } from "lucide-react";
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
      <div className="relative overflow-hidden py-10">
        <div className="orb -top-16 left-10 h-52 w-52 bg-emerald-500/20" />
        <div
          className="orb top-0 right-16 h-44 w-44 bg-sky-500/15"
          style={{ animationDelay: "-6s" }}
        />
        <div className="relative">
          <span className="eyebrow">
            <ContactIcon size={11} /> Address Book
          </span>
          <h2 className="display text-gradient mt-3 text-4xl md:text-5xl">Contacts</h2>
          <p className="text-text-secondary mt-2 text-sm">
            A tiny address book the agent uses when you say &ldquo;email Alice&rdquo;.
          </p>
        </div>
      </div>

      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus size={14} /> New contact
      </Button>

      {list.length === 0 ? (
        <EmptyState icon={<Users size={16} />} title="No contacts" />
      ) : (
        <div className="space-y-3">
          {list.map((c) => (
            <Card
              key={c.id}
              interactive
              className="flex items-center justify-between gap-3 rounded-xl"
            >
              <div className="min-w-0">
                <p className="text-text-primary text-sm font-medium">{c.name}</p>
                <p className="text-text-muted text-[11px]">{c.email || "—"}</p>
                {c.notes && (
                  <p className="text-text-secondary mt-0.5 line-clamp-1 text-[11px]">{c.notes}</p>
                )}
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
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            autoFocus
          />
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
          />
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Notes (optional)"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={create} disabled={!name.trim()}>
              Create
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
