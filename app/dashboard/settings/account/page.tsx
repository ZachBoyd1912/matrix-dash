"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";

export default function AccountPage() {
  const ref = useGsapEntrance();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: Record<string, string>) => {
        setName(s.userName ?? "");
        setEmail(s.userEmail ?? "");
        setRole(s.userRole ?? "");
      });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userName: name, userEmail: email, userRole: role }),
      });
      toast.success("Account updated");
    } finally {
      setSaving(false);
    }
  };

  const initial = (name || "M").trim().charAt(0).toUpperCase();

  return (
    <div ref={ref} className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Account</h2>
        <p className="text-text-secondary text-sm mt-1">
          Local profile — used in memory context and email defaults. Nothing leaves this machine.
        </p>
      </div>
      <Card>
        <div className="flex items-center gap-4 mb-5">
          <div className="h-14 w-14 rounded-full grid place-items-center text-lg font-bold bg-gradient-to-br from-emerald-400/30 to-sky-400/30 border border-white/10 text-text-primary">
            {initial}
          </div>
          <div>
            <p className="text-sm font-medium text-text-primary">{name || "Unnamed"}</p>
            <p className="text-xs text-text-muted">{email || "no email set"}</p>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] uppercase text-text-muted mb-1">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Zach" />
          </div>
          <div>
            <label className="block text-[10px] uppercase text-text-muted mb-1">Email</label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div>
            <label className="block text-[10px] uppercase text-text-muted mb-1">Role / context</label>
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Indie developer building AI tools"
            />
          </div>
          <div className="flex justify-end">
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save profile"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
