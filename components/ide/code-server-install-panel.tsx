"use client";

import { useState } from "react";
import { CheckCircle2, Download, Loader2, ServerCog, Sparkles } from "lucide-react";
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
    <div className="bezel lift sheen space-y-5 rounded-2xl p-5">
      <div className="flex items-start gap-3">
        <div className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 shadow-[0_0_18px_-6px_rgba(52,211,153,0.6)]">
          <ServerCog size={18} className="text-emerald-300" />
        </div>
        <div className="min-w-0 space-y-1.5">
          <span className="eyebrow inline-flex items-center gap-1.5">
            <Sparkles size={11} className="text-emerald-300" />
            Embedded editor
          </span>
          <h3 className="text-text-primary text-sm font-semibold">VS Code server</h3>
          <p className="text-text-secondary text-xs leading-relaxed">
            Runs real VS Code (code-server) directly on your machine and embeds it here, so you get
            the full editor — extensions, terminal, and all — inside Matrix.
          </p>
        </div>
      </div>

      {installed ? (
        <div className="glass flex items-center gap-2.5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3.5 py-2.5 shadow-[0_0_18px_-6px_rgba(52,211,153,0.6)]">
          <CheckCircle2 size={15} className="shrink-0 text-emerald-300" />
          <p className="text-xs font-medium text-emerald-300">
            Installed{version ? ` — v${version}` : ""}.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <Button
            variant="primary"
            size="sm"
            onClick={install}
            disabled={installing}
            className="w-full justify-center rounded-full transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98]"
          >
            {installing ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            {installing ? "Installing…" : "Install automatically"}
          </Button>

          <div className="glass-input rounded-xl px-3.5 py-2.5">
            <p className="eyebrow mb-1.5">Manual install</p>
            <code className="text-text-primary font-mono text-xs">brew install code-server</code>
          </div>

          <p className="text-text-muted text-[10px] leading-relaxed">
            Installing downloads a few hundred MB and the running server uses extra RAM. The
            automatic install can take a few minutes — leave this tab open while it works.
          </p>
        </div>
      )}
    </div>
  );
}
