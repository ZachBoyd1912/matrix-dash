"use client";

import { useEffect, useState } from "react";
import { Server, Check, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";

const PLACEHOLDER = `{
  "context7": { "url": "https://mcp.context7.com/mcp" },
  "my-local-server": {
    "command": "npx",
    "args": ["-y", "@example/mcp-server"],
    "env": { "EXAMPLE_TOKEN": "..." }
  }
}`;

/**
 * MCP servers for Claude Code mode. Stored as JSON in the
 * `claude_code_mcp_servers` setting; each chat turn through the real CLI gets
 * it via --mcp-config, so these tools appear inside Claude Code exactly like
 * a terminal user's .mcp.json.
 */
export default function McpSettings() {
  const ref = useGsapEntrance();
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => setValue(s.claude_code_mcp_servers ?? ""))
      .catch(() => {});
  }, []);

  const validate = (raw: string): string | null => {
    if (!raw.trim()) return null; // empty = no servers, valid
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        return 'Must be a JSON object: { "server-name": { … } }';
      for (const [name, cfg] of Object.entries(parsed)) {
        if (!cfg || typeof cfg !== "object") return `"${name}" must be an object`;
        const c = cfg as Record<string, unknown>;
        if (!c.command && !c.url) return `"${name}" needs a "command" (stdio) or "url" (http/sse)`;
      }
      return null;
    } catch (e) {
      return `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`;
    }
  };

  const save = async () => {
    const err = validate(value);
    setError(err);
    if (err) return;
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ claude_code_mcp_servers: value.trim() }),
    }).catch(() => {});
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div ref={ref} className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="display flex items-center gap-2 text-2xl">
          <Server size={20} className="text-emerald-400" /> MCP Servers
        </h1>
        <p className="text-text-secondary mt-2 text-sm leading-relaxed">
          MCP servers available to <span className="text-text-primary">Claude Code mode</span> in
          chat. Same shape as a terminal <code className="font-mono text-xs">.mcp.json</code>
          &nbsp;— each entry is either a stdio server (
          <code className="font-mono text-xs">command</code>/
          <code className="font-mono text-xs">args</code>/
          <code className="font-mono text-xs">env</code>) or a remote one (
          <code className="font-mono text-xs">url</code>). Applied on the next turn.
        </p>
      </div>

      <Card>
        <textarea
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder={PLACEHOLDER}
          rows={14}
          spellCheck={false}
          className="glass-input text-text-primary placeholder:text-text-muted/50 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 font-mono text-xs leading-relaxed focus:border-emerald-400/30 focus:outline-none"
        />
        {error && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-rose-300">
            <AlertTriangle size={13} /> {error}
          </p>
        )}
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-emerald-400 px-4 text-xs font-semibold text-black transition-colors hover:bg-emerald-300"
          >
            {saved ? <Check size={14} /> : null}
            {saved ? "Saved" : "Save"}
          </button>
          <span className="text-text-muted text-[11px]">
            Secrets in <code className="font-mono">env</code> are stored in the settings table —
            prefer the Vault for anything sensitive and reference it from your server.
          </span>
        </div>
      </Card>
    </div>
  );
}
