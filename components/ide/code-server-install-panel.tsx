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
    <div className="bezel lift sheen rounded-2xl p-5 space-y-5">
      <div className="flex items-start gap-3">
        <div className="inline-grid place-items-center h-11 w-11 rounded-xl bg-emerald-400/10 border border-emerald-400/30 shrink-0 shadow-[0_0_18px_-6px_rgba(52,211,153,0.6)]">
          <ServerCog size={18} className="text-emerald-300" />
        </div>
        <div className="min-w-0 space-y-1.5">
          <span className="eyebrow inline-flex items-center gap-1.5">
            <Sparkles size={11} className="text-emerald-300" />
            Embedded editor
          </span>
          <h3 className="text-sm font-semibold text-text-primary">VS Code server</h3>
          <p className="text-xs text-text-secondary leading-relaxed">
            Runs real VS Code (code-server) directly on your machine and embeds it here, so
            you get the full editor — extensions, terminal, and all — inside Matrix.
          </p>
        </div>
      </div>

      {installed ? (
        <div className="glass rounded-xl px-3.5 py-2.5 flex items-center gap-2.5 border border-emerald-400/30 bg-emerald-400/10 shadow-[0_0_18px_-6px_rgba(52,211,153,0.6)]">
          <CheckCircle2 size={15} className="text-emerald-300 shrink-0" />
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
            className="w-full justify-center rounded-full active:scale-[0.98] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
          >
            {installing ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            {installing ? "Installing…" : "Install automatically"}
          </Button>

          <div className="glass-input rounded-xl px-3.5 py-2.5">
            <p className="eyebrow mb-1.5">Manual install</p>
            <code className="text-xs font-mono text-text-primary">brew install code-server</code>
          </div>

          <p className="text-[10px] text-text-muted leading-relaxed">
            Installing downloads a few hundred MB and the running server uses extra RAM. The
            automatic install can take a few minutes — leave this tab open while it works.
          </p>
        </div>
      )}
    </div>
  );
}
