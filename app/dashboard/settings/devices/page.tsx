"use client";

import { useCallback, useEffect, useState } from "react";
import { MonitorSmartphone, Plus, Trash2, Star, Copy, Wifi, WifiOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast, confirm } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";

interface Device {
  id: string;
  name: string;
  platform: string;
  arch: string;
  appVersion: string;
  isDefault: boolean;
  online: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

const PLATFORM_LABEL: Record<string, string> = {
  darwin: "macOS",
  linux: "Linux",
  win32: "Windows",
};

export default function DevicesPage() {
  const ref = useGsapEntrance();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [minting, setMinting] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/runner/devices");
    if (res.ok) setDevices(await res.json());
  }, []);

  useEffect(() => {
    load();
    // Live-ish status: devices flip online/offline within the heartbeat window.
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  const mintCode = async () => {
    setMinting(true);
    try {
      const res = await fetch("/api/runner/pair-code", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error("Couldn't create pair code", data.error);
        return;
      }
      setPairCode(data.code);
    } finally {
      setMinting(false);
    }
  };

  const patch = async (id: string, body: Record<string, unknown>, okMsg: string) => {
    const res = await fetch(`/api/runner/devices/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast.error("Update failed", (await res.json()).error);
      return;
    }
    toast.success(okMsg);
    load();
  };

  const revoke = async (d: Device) => {
    const ok = await confirm({
      title: `Revoke ${d.name || "this device"}?`,
      description:
        "Its runner token stops working immediately — the device can no longer connect or receive jobs. Re-pair to restore it.",
      confirmLabel: "Revoke",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/runner/devices/${d.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Couldn't revoke", (await res.json()).error);
      return;
    }
    toast.success("Device revoked");
    load();
  };

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
            <MonitorSmartphone size={11} /> Matrix Runner
          </span>
          <h2 className="display text-gradient mt-3 text-4xl md:text-5xl">Devices</h2>
          <p className="text-text-secondary mt-3 max-w-xl text-sm">
            Your paired Matrix Runner devices. Agents and host features run on the device you choose
            — your machine, your files, your credentials.
          </p>
        </div>
      </div>

      <Card interactive className="rounded-2xl">
        <div className="mb-3 flex items-center gap-2">
          <Plus size={15} className="text-emerald-400" />
          <h3 className="text-text-primary text-sm font-medium">Pair a new device</h3>
        </div>
        {pairCode ? (
          <div className="space-y-3">
            <p className="text-text-secondary text-xs">
              On the device you want to pair, run the Matrix Runner installer with this one-time
              code (valid 10 minutes):
            </p>
            <div className="flex items-center gap-2">
              <code className="glass-input text-text-primary flex-1 truncate rounded-md px-3 py-2 font-mono text-xs">
                {pairCode}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(pairCode);
                  toast.success("Copied");
                }}
              >
                <Copy size={13} />
              </Button>
            </div>
            <p className="text-text-muted text-[11px]">
              The guided installer (download button + full walkthrough) arrives with the runner app
              phase — for now this code drives the CLI pairing flow.
            </p>
          </div>
        ) : (
          <Button onClick={mintCode} disabled={minting}>
            {minting ? "Creating…" : "Generate pair code"}
          </Button>
        )}
      </Card>

      <div className="space-y-3">
        {devices?.length === 0 && (
          <Card className="rounded-2xl p-8 text-center">
            <MonitorSmartphone className="text-text-muted mx-auto mb-3" size={28} />
            <p className="text-text-primary text-sm font-medium">No devices paired yet</p>
            <p className="text-text-muted mt-1 text-xs">
              Generate a pair code above and run the Matrix Runner on your machine.
            </p>
          </Card>
        )}
        {devices?.map((d) => (
          <Card key={d.id} className="rounded-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {d.online ? (
                    <Wifi size={14} className="text-emerald-400" aria-label="online" />
                  ) : (
                    <WifiOff size={14} className="text-text-muted" aria-label="offline" />
                  )}
                  <p className="text-text-primary truncate text-sm font-medium">
                    {d.name || "Unnamed device"}
                  </p>
                  <Badge>{PLATFORM_LABEL[d.platform] ?? d.platform ?? "unknown"}</Badge>
                  {d.isDefault && (
                    <Badge className="border-sky-400/20 bg-sky-400/10 text-sky-300">default</Badge>
                  )}
                </div>
                <p className="text-text-muted mt-0.5 truncate text-xs">
                  {d.online
                    ? "Online now"
                    : d.lastSeenAt
                      ? `Last seen ${new Date(d.lastSeenAt).toLocaleString()}`
                      : "Never connected"}
                  {d.appVersion ? ` · v${d.appVersion}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!d.isDefault && (
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Make default"
                    onClick={() => patch(d.id, { isDefault: true }, "Default device updated")}
                  >
                    <Star size={13} />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRenamingId(renamingId === d.id ? null : d.id);
                    setNewName(d.name);
                  }}
                >
                  Rename
                </Button>
                <Button variant="ghost" size="sm" onClick={() => revoke(d)}>
                  <Trash2 size={13} className="text-red-400" />
                </Button>
              </div>
            </div>
            {renamingId === d.id && (
              <div className="mt-3 flex items-center gap-2 border-t border-white/5 pt-3">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Device name"
                  className="max-w-xs"
                />
                <Button
                  size="sm"
                  onClick={async () => {
                    await patch(d.id, { name: newName }, "Renamed");
                    setRenamingId(null);
                  }}
                >
                  Save
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
