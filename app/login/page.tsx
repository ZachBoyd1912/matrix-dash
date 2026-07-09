"use client";

import { useEffect, useState } from "react";
import { Loader2, LogIn, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "loading" | "login" | "bootstrap";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("loading");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = (await res.json()) as { user: unknown; needsBootstrap: boolean };
        if (data.user) {
          window.location.href = "/dashboard";
          return;
        }
        setMode(data.needsBootstrap ? "bootstrap" : "login");
      } catch {
        setMode("login");
      }
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "bootstrap") {
        const res = await fetch("/api/auth/bootstrap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, name, password }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Setup failed");
        window.location.href = "/dashboard";
        return;
      }
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, code: code || undefined }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; mfaRequired?: boolean };
      if (data.mfaRequired && !data.error) {
        setMfaRequired(true);
        setError(null);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Login failed");
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

  const isBootstrap = mode === "bootstrap";

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 flex items-center gap-2">
          <span className="h-5 w-[3px] rounded-full bg-gradient-to-b from-emerald-400 to-sky-400" />
          <h1 className="display text-xl">{isBootstrap ? "Set up your account" : "Sign in"}</h1>
        </div>
        {isBootstrap && (
          <p className="text-text-secondary mb-4 text-xs">
            First run — create the owner account. Your existing data becomes this workspace.
          </p>
        )}

        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid gap-1.5">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          {isBootstrap && (
            <div className="grid gap-1.5">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Optional"
              />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isBootstrap ? "new-password" : "current-password"}
              required
            />
            {isBootstrap && (
              <span className="text-text-muted text-[11px]">At least 8 characters.</span>
            )}
          </div>
          {mfaRequired && (
            <div className="grid gap-1.5">
              <Label>2FA code</Label>
              <Input
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                autoFocus
                required
              />
            </div>
          )}

          {error && <div className="text-xs text-rose-400">{error}</div>}

          <Button type="submit" variant="primary" disabled={busy} className="mt-1">
            {busy ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : isBootstrap ? (
              <ShieldCheck className="mr-1.5 h-4 w-4" />
            ) : (
              <LogIn className="mr-1.5 h-4 w-4" />
            )}
            {isBootstrap ? "Create account" : mfaRequired ? "Verify" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
