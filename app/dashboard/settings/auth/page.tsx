"use client";

import { useEffect, useState } from "react";
import { Lock, Check, ShieldOff, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast, confirm } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";

export default function AuthPage() {
  const ref = useGsapEntrance();
  const [enabled, setEnabled] = useState(false);
  const [provisioning, setProvisioning] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");

  const refresh = () =>
    fetch("/api/auth/totp")
      .then((r) => r.json())
      .then((d) => setEnabled(!!d.enabled));

  useEffect(() => {
    refresh();
  }, []);

  const begin = async () => {
    const res = await fetch("/api/auth/totp", { method: "POST" });
    const data = await res.json();
    setProvisioning(data);
  };

  const verify = async () => {
    const res = await fetch("/api/auth/totp", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (data.ok) {
      toast.success("2FA enabled");
      setProvisioning(null);
      setCode("");
      refresh();
    } else {
      toast.error("Invalid code", data.error);
    }
  };

  const disable = async () => {
    const ok = await confirm({
      title: "Disable 2FA?",
      description: "Your account will no longer require a TOTP code.",
      confirmLabel: "Disable",
      danger: true,
    });
    if (!ok) return;
    await fetch("/api/auth/totp", { method: "DELETE" });
    toast.success("2FA disabled");
    refresh();
  };

  return (
    <div ref={ref} className="space-y-8">
      <div className="relative overflow-hidden py-10">
        <div className="orb -top-16 left-10 h-52 w-52 bg-emerald-500/20" />
        <div className="orb top-0 left-44 h-44 w-44 bg-sky-500/15" style={{ animationDelay: "-6s" }} />
        <div className="relative">
          <span className="eyebrow">
            <ShieldCheck size={11} /> Security
          </span>
          <h1 className="display text-gradient text-4xl md:text-5xl mt-3">
            Security (2FA)
          </h1>
          <p className="text-text-secondary text-sm mt-3 max-w-2xl">
            TOTP-based two-factor authentication. Pair with any authenticator app (Google, Authy, 1Password).
          </p>
        </div>
      </div>

      <Card interactive className="rounded-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock size={14} className="text-emerald-400" />
            <p className="text-sm font-medium text-text-primary">Two-factor authentication</p>
            {enabled && <Badge className="bg-emerald-400/10 border-emerald-400/20 text-emerald-400">Enabled</Badge>}
          </div>
          {enabled ? (
            <Button size="sm" variant="danger" onClick={disable}>
              <ShieldOff size={12} /> Disable
            </Button>
          ) : provisioning ? null : (
            <Button size="sm" variant="primary" onClick={begin}>Enable</Button>
          )}
        </div>
        {provisioning && (
          <div className="mt-4 space-y-3 pt-4 border-t border-white/5">
            <p className="text-xs text-text-secondary">
              1. Add this to your authenticator app. The provisioning URI:
            </p>
            <code className="block text-[10px] text-emerald-300 bg-white/[0.03] p-2 rounded-md break-all font-mono">
              {provisioning.uri}
            </code>
            <p className="text-xs text-text-secondary">2. Or enter the raw secret manually:</p>
            <code className="block text-xs text-text-primary bg-white/[0.03] p-2 rounded-md tracking-widest font-mono">
              {provisioning.secret}
            </code>
            <p className="text-xs text-text-secondary">3. Then enter the 6-digit code:</p>
            <div className="flex gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                className="text-center tracking-widest font-mono"
                maxLength={6}
              />
              <Button variant="primary" onClick={verify} disabled={code.length !== 6}>
                <Check size={13} /> Verify
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card interactive className="rounded-2xl">
        <p className="text-xs text-text-secondary">
          <strong className="text-text-primary">Note:</strong> Auth is currently informational — the local app binds
          to <code className="text-text-primary">localhost</code> by default and doesn&apos;t enforce login. Enable
          full auth only when exposing Matrix Dash to a LAN (Tailscale) or the internet.
        </p>
      </Card>
    </div>
  );
}
