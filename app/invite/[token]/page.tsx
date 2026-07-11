"use client";

import { useEffect, useState, use } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "loading" | "invalid" | "form";

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [mode, setMode] = useState<Mode>("loading");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/auth/accept-invite?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (data.valid) {
          setEmail(data.email);
          setName(data.name ?? "");
          setMode("form");
        } else {
          setMode("invalid");
        }
      } catch {
        setMode("invalid");
      }
    })();
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't accept invite");
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "loading") {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="text-text-muted h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (mode === "invalid") {
    return (
      <div className="grid min-h-screen place-items-center p-4">
        <Card className="w-full max-w-sm p-6 text-center">
          <h1 className="display mb-2 text-xl">Invite unavailable</h1>
          <p className="text-text-secondary text-sm">
            This invite link is invalid, already used, or expired. Ask the owner for a new one.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 flex items-center gap-2">
          <span className="h-5 w-[3px] rounded-full bg-gradient-to-b from-emerald-400 to-sky-400" />
          <h1 className="display text-xl">Set up your account</h1>
        </div>
        <p className="text-text-secondary mb-4 text-xs">
          Welcome to Matrix Dashboard. Choose a password for <strong>{email}</strong>.
        </p>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid gap-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
          </div>
          <div className="grid gap-1.5">
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            <span className="text-text-muted text-[11px]">At least 8 characters.</span>
          </div>
          {error && <div className="text-xs text-rose-400">{error}</div>}
          <Button type="submit" variant="primary" disabled={busy} className="mt-1">
            {busy ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="mr-1.5 h-4 w-4" />
            )}
            Create account & sign in
          </Button>
        </form>
      </Card>
    </div>
  );
}
