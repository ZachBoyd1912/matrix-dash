"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";

export default function EmailSettingsPage() {
  const ref = useGsapEntrance();
  const [from, setFrom] = useState("");
  const [signature, setSignature] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: Record<string, string>) => {
        setFrom(s.emailFrom ?? "");
        setSignature(s.emailSignature ?? "");
      });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emailFrom: from, emailSignature: signature }),
      });
      toast.success("Email settings saved");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={ref} className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Email</h2>
        <p className="text-text-secondary text-sm mt-1">
          The mailbox is fully local today — composing saves to Sent/Drafts in your database.
        </p>
      </div>
      <Card>
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] uppercase text-text-muted mb-1">From address</label>
            <Input
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="you@dash.local"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase text-text-muted mb-1">Signature</label>
            <Textarea
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              rows={3}
              placeholder="— Zach, sent from Matrix Dash"
            />
          </div>
          <div className="flex justify-end">
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </Card>
      <Card className="flex items-start gap-3">
        <Badge className="bg-amber-400/10 border-amber-400/20 text-amber-400 shrink-0 mt-0.5">Soon</Badge>
        <p className="text-xs text-text-secondary">
          SMTP / IMAP connection for real sending and receiving is planned — keys will be stored with
          the same AES-256-GCM encryption as AI providers.
        </p>
      </Card>
    </div>
  );
}
