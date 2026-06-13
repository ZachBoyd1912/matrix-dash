"use client";

import { useState } from "react";
import { Download, Loader2, ServerCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/stores/use-feedback";

interface InstallResponse {
  installed: boolean;
  manual?: boolean;
  instruction?: string;
  error?: string;
}

interface Props {
  installed: boolean;
  version?: string;
  /** Called after a successful install so the parent can re-check server state. */
  onInstalled: () => void;
}

/**
 * Card explaining the embedded VS Code server (code-server) and, when it is not
 * yet present, offering a one-click automatic install with an honest manual
 * fallback (`brew install code-server`).
 */
export function CodeServerInstallPanel({ installed, version, onInstalled }: Props) {
  const [installing, setInstalling] = useState(false);

  const install = async () => {
    setInstalling(true);
    try {
      const res = await fetch("/api/ide/server/install", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as InstallResponse;

      if (!res.ok || data.error) {
        toast.error("Install failed", data.error ?? "Could not install code-server.");
        return;
      }

      // The backend could not install automatically — surface the manual hint.
      if (data.manual) {
        toast.info(
          "Manual install needed",
          data.instruction ?? "Run brew install code-server in your terminal."
        );
        return;
      }

      if (data.installed) {
        toast.success("VS Code server installed");
        onInstalled();
      }
    } catch (err) {
      toast.error("Install failed", err instanceof Error ? err.message : String(err));
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="glass rounded-xl p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="inline-grid place-items-center h-10 w-10 rounded-xl bg-emerald-400/10 border border-emerald-400/20 shrink-0">
          <ServerCog size={18} className="text-emerald-400" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text-primary">VS Code server</h3>
          <p className="text-xs text-text-secondary mt-0.5">
            Runs real VS Code (code-server) directly on your machine and embeds it here, so
            you get the full editor — extensions, terminal, and all — inside Matrix.
          </p>
        </div>
      </div>

      {installed ? (
        <p className="text-xs text-emerald-400">
          Installed{version ? ` — v${version}` : ""}.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="glass-input rounded-md px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1">
              Manual install
            </p>
            <code className="text-xs font-mono text-text-primary">brew install code-server</code>
          </div>

          <Button variant="primary" size="sm" onClick={install} disabled={installing}>
            {installing ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            {installing ? "Installing…" : "Install automatically"}
          </Button>

          <p className="text-[10px] text-text-muted leading-relaxed">
            Installing downloads a few hundred MB and the running server uses extra RAM. The
            automatic install can take a few minutes — leave this tab open while it works.
          </p>
        </div>
      )}
    </div>
  );
}
