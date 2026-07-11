"use client";

import { useEffect, useState } from "react";
import {
  Users,
  UserPlus,
  ShieldCheck,
  Trash2,
  KeyRound,
  Info,
  Link as LinkIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast, confirm } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";

interface Account {
  id: string;
  email: string;
  name: string;
  role: "owner" | "member";
  isActive: boolean;
  totpEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export default function AccountsPage() {
  const ref = useGsapEntrance();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);

  // add-member form
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);

  // per-row password reset
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const load = async () => {
    const res = await fetch("/api/accounts");
    if (res.status === 403) {
      setForbidden(true);
      return;
    }
    if (res.ok) setAccounts(await res.json());
  };

  useEffect(() => {
    load();
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setMeId(d.user?.id ?? null))
      .catch(() => {});
  }, []);

  const createAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, name, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error("Couldn't create account", data.error);
        return;
      }
      toast.success(`Created ${data.email}`);
      setEmail("");
      setName("");
      setPassword("");
      load();
    } finally {
      setCreating(false);
    }
  };

  const patch = async (id: string, body: Record<string, unknown>, okMsg: string) => {
    const res = await fetch(`/api/accounts/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error("Update failed", data.error);
      return false;
    }
    toast.success(okMsg);
    load();
    return true;
  };

  const remove = async (a: Account) => {
    const ok = await confirm({
      title: `Remove ${a.email}?`,
      description:
        "Their account and sessions are deleted. Their isolated data file is left on disk.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/accounts/${a.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      toast.error("Couldn't remove", data.error);
      return;
    }
    toast.success("Account removed");
    load();
  };

  const invite = async (a: Account) => {
    const res = await fetch(`/api/accounts/${a.id}/invite`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      toast.error("Couldn't create invite", data.error);
      return;
    }
    const link = `${window.location.origin}${data.path}`;
    await navigator.clipboard.writeText(link).catch(() => {});
    toast.success("Invite link copied", `Send it to ${a.email} — valid 7 days, one use.`);
  };

  const submitReset = async (id: string) => {
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    const ok = await patch(id, { password: newPassword }, "Password reset");
    if (ok) {
      setResettingId(null);
      setNewPassword("");
    }
  };

  if (forbidden) {
    return (
      <div ref={ref} className="space-y-6">
        <Card className="rounded-2xl p-8 text-center">
          <ShieldCheck className="text-text-muted mx-auto mb-3" size={28} />
          <p className="text-text-primary text-sm font-medium">Owner access required</p>
          <p className="text-text-muted mt-1 text-xs">
            Only the instance owner can manage accounts.
          </p>
        </Card>
      </div>
    );
  }

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
            <Users size={11} /> Accounts
          </span>
          <h2 className="display text-gradient mt-3 text-4xl md:text-5xl">Accounts</h2>
          <p className="text-text-secondary mt-3 max-w-xl text-sm">
            Create and manage the people who have their own isolated workspace on this instance.
          </p>
        </div>
      </div>

      <Card className="rounded-2xl border-amber-400/20 bg-amber-400/5 p-4">
        <div className="flex gap-3">
          <Info className="mt-0.5 shrink-0 text-amber-400" size={16} />
          <p className="text-text-secondary text-xs leading-relaxed">
            <span className="text-text-primary font-medium">
              Member sign-in is not enabled yet.
            </span>{" "}
            You can set up member accounts now, but they can&apos;t sign in until per-member host
            isolation lands (a member session would otherwise share this machine&apos;s files and
            agent access). Owners sign in normally.
          </p>
        </div>
      </Card>

      <Card interactive className="rounded-2xl">
        <div className="mb-4 flex items-center gap-2">
          <UserPlus size={15} className="text-emerald-400" />
          <h3 className="text-text-primary text-sm font-medium">Add a member</h3>
        </div>
        <form onSubmit={createAccount} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-text-muted mb-1 block text-[10px] uppercase">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@example.com"
                required
              />
            </div>
            <div>
              <label className="text-text-muted mb-1 block text-[10px] uppercase">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          <div>
            <label className="text-text-muted mb-1 block text-[10px] uppercase">
              Temporary password (8+ chars)
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="They can change it later"
              required
            />
          </div>
          <Button type="submit" disabled={creating}>
            {creating ? "Creating…" : "Create account"}
          </Button>
        </form>
      </Card>

      <div className="space-y-3">
        {accounts?.map((a) => {
          const isSelf = a.id === meId;
          return (
            <Card key={a.id} className="rounded-2xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-text-primary truncate text-sm font-medium">
                      {a.name || a.email}
                    </p>
                    <Badge
                      className={
                        a.role === "owner"
                          ? "border-sky-400/20 bg-sky-400/10 text-sky-300"
                          : undefined
                      }
                    >
                      {a.role}
                    </Badge>
                    {isSelf && <span className="text-text-muted text-[10px]">(you)</span>}
                    {!a.isActive && (
                      <Badge className="border-rose-400/20 bg-rose-400/10 text-rose-300">
                        disabled
                      </Badge>
                    )}
                    {a.totpEnabled && (
                      <ShieldCheck size={13} className="text-emerald-400" aria-label="2FA on" />
                    )}
                  </div>
                  <p className="text-text-muted mt-0.5 truncate text-xs">
                    {a.email} ·{" "}
                    {a.lastLoginAt
                      ? `last in ${new Date(a.lastLoginAt).toLocaleDateString()}`
                      : "never signed in"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setResettingId(resettingId === a.id ? null : a.id);
                      setNewPassword("");
                    }}
                  >
                    <KeyRound size={13} />
                  </Button>
                  {!isSelf && a.role === "member" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Copy invite link"
                      onClick={() => invite(a)}
                    >
                      <LinkIcon size={13} />
                    </Button>
                  )}
                  {!isSelf && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          patch(
                            a.id,
                            { isActive: !a.isActive },
                            a.isActive ? "Account disabled" : "Account enabled"
                          )
                        }
                      >
                        {a.isActive ? "Disable" : "Enable"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => remove(a)}>
                        <Trash2 size={13} className="text-red-400" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {resettingId === a.id && (
                <div className="mt-3 flex items-center gap-2 border-t border-white/5 pt-3">
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password (8+ chars)"
                    className="max-w-xs"
                  />
                  <Button size="sm" onClick={() => submitReset(a.id)}>
                    Set password
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
