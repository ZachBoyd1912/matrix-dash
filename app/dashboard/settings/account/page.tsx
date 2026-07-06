"use client";

import { useEffect, useState } from "react";
import { UserCircle } from "lucide-react";
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
    <div ref={ref} className="space-y-8">
      <div className="relative overflow-hidden py-10">
        <div className="orb -top-16 left-10 h-52 w-52 bg-emerald-500/20" />
        <div
          className="orb -top-8 left-48 h-44 w-44 bg-sky-500/15"
          style={{ animationDelay: "-6s" }}
        />
        <div className="relative">
          <span className="eyebrow">
            <UserCircle size={11} /> Profile
          </span>
          <h2 className="display text-gradient mt-3 text-4xl md:text-5xl">Account</h2>
          <p className="text-text-secondary mt-3 max-w-xl text-sm">
            Local profile — used in memory context and email defaults. Nothing leaves this machine.
          </p>
        </div>
      </div>
      <Card interactive className="rounded-2xl">
        <div className="mb-5 flex items-center gap-4">
          <div className="text-text-primary grid h-14 w-14 place-items-center rounded-full border border-white/10 bg-gradient-to-br from-emerald-400/30 to-sky-400/30 text-lg font-bold">
            {initial}
          </div>
          <div>
            <p className="text-text-primary text-sm font-medium">{name || "Unnamed"}</p>
            <p className="text-text-muted text-xs">{email || "no email set"}</p>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-text-muted mb-1 block text-[10px] uppercase">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Zach" />
          </div>
          <div>
            <label className="text-text-muted mb-1 block text-[10px] uppercase">Email</label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="text-text-muted mb-1 block text-[10px] uppercase">
              Role / context
            </label>
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
