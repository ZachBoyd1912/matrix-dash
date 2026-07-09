"use client";

import { useEffect, useState } from "react";
import { Bot, ShieldAlert, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { toast } from "@/lib/stores/use-feedback";

type Settings = Record<string, string>;

/** A single row that persists a setting on change. */
function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 py-3 last:border-0">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {hint && <div className="text-text-muted text-xs">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function AgentSettingsPage() {
  const ref = useGsapEntrance();
  const [s, setS] = useState<Settings | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/settings");
      if (res.ok) setS((await res.json()) as Settings);
    })();
  }, []);

  async function save(key: string, value: string | boolean) {
    setS((cur) =>
      cur ? { ...cur, [key]: typeof value === "boolean" ? (value ? "1" : "0") : value } : cur
    );
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    });
  }

  if (!s) {
    return (
      <div className="text-text-muted flex items-center gap-2 p-8 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const num = (k: string) => s[k] ?? "";
  const bool = (k: string) => s[k] === "1";

  return (
    <div ref={ref} className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div>
        <h1 className="display flex items-center gap-2 text-2xl">
          <Bot className="h-6 w-6" /> Agent settings
        </h1>
        <p className="text-text-secondary mt-1 text-sm">
          Limits, budgets, and safety for autonomous runs.
        </p>
      </div>

      <Card className={`p-4 ${bool("agents_kill_switch") ? "border-rose-500/50" : ""}`}>
        <Row
          label="Global kill switch"
          hint="Pause all runs and hard-abort active ones immediately."
        >
          <Switch
            checked={bool("agents_kill_switch")}
            onCheckedChange={(v) => save("agents_kill_switch", v)}
          />
        </Row>
      </Card>

      <Card className="p-4">
        <p className="text-text-muted mb-1 text-xs tracking-wider uppercase">Limits</p>
        <Row label="Max concurrent runs" hint="Clamped to 1 on low-RAM hosts.">
          <Input
            className="w-24"
            type="number"
            value={num("agents_max_concurrent")}
            onChange={(e) => save("agents_max_concurrent", e.target.value)}
          />
        </Row>
        <Row label="Default max turns">
          <Input
            className="w-24"
            type="number"
            value={num("agents_default_max_turns")}
            onChange={(e) => save("agents_default_max_turns", e.target.value)}
          />
        </Row>
        <Row label="Run timeout (minutes)">
          <Input
            className="w-24"
            type="number"
            value={num("agents_run_timeout_min")}
            onChange={(e) => save("agents_run_timeout_min", e.target.value)}
          />
        </Row>
        <Row label="Max chain depth" hint="Deeper runtime chains require break-glass approval.">
          <Input
            className="w-24"
            type="number"
            value={num("agents_max_chain_depth")}
            onChange={(e) => save("agents_max_chain_depth", e.target.value)}
          />
        </Row>
        <Row label="Auto-disable after N failures">
          <Input
            className="w-24"
            type="number"
            value={num("agents_failure_disable_threshold")}
            onChange={(e) => save("agents_failure_disable_threshold", e.target.value)}
          />
        </Row>
      </Card>

      <Card className="p-4">
        <p className="text-text-muted mb-1 text-xs tracking-wider uppercase">Budgets (estimated)</p>
        <Row label="Daily cost budget (USD)" hint="Cost is notional under subscription auth.">
          <Input
            className="w-28"
            type="number"
            value={num("agents_daily_cost_budget_usd")}
            onChange={(e) => save("agents_daily_cost_budget_usd", e.target.value)}
          />
        </Row>
        <Row label="Daily token budget">
          <Input
            className="w-32"
            type="number"
            value={num("agents_daily_token_budget")}
            onChange={(e) => save("agents_daily_token_budget", e.target.value)}
          />
        </Row>
        <Row
          label="Usage-window buffer (%)"
          hint="Cron/webhook runs pause past this % of budget in a rolling 5h."
        >
          <Input
            className="w-24"
            type="number"
            value={num("agents_usage_buffer_pct")}
            onChange={(e) => save("agents_usage_buffer_pct", e.target.value)}
          />
        </Row>
      </Card>

      <Card className="p-4">
        <p className="text-text-muted mb-1 text-xs tracking-wider uppercase">
          Approvals & notifications
        </p>
        <Row label="Approval timeout (minutes)">
          <Input
            className="w-24"
            type="number"
            value={num("agents_approval_timeout_min")}
            onChange={(e) => save("agents_approval_timeout_min", e.target.value)}
          />
        </Row>
        <Row label="Notify email" hint="Failures, pending approvals, and the daily digest.">
          <Input
            className="w-56"
            type="email"
            value={num("agents_notify_email")}
            onChange={(e) => save("agents_notify_email", e.target.value)}
          />
        </Row>
        <Row label="Daily digest">
          <Switch
            checked={bool("agents_digest_enabled")}
            onCheckedChange={(v) => save("agents_digest_enabled", v)}
          />
        </Row>
        <Row
          label="Quiet hours start (HH:MM)"
          hint="Routine alerts silenced; urgent always breaks through."
        >
          <Input
            className="w-24"
            value={num("agents_quiet_hours_start")}
            onChange={(e) => save("agents_quiet_hours_start", e.target.value)}
            placeholder="23:00"
          />
        </Row>
        <Row label="Quiet hours end (HH:MM)">
          <Input
            className="w-24"
            value={num("agents_quiet_hours_end")}
            onChange={(e) => save("agents_quiet_hours_end", e.target.value)}
            placeholder="07:00"
          />
        </Row>
        <Row label="Stale PR reminder (days)">
          <Input
            className="w-24"
            type="number"
            value={num("agents_stale_pr_days")}
            onChange={(e) => save("agents_stale_pr_days", e.target.value)}
          />
        </Row>
      </Card>

      <Card className="p-4">
        <p className="text-text-muted mb-1 flex items-center gap-1.5 text-xs tracking-wider uppercase">
          <ShieldAlert className="h-3.5 w-3.5" /> Guardrails
        </p>
        <Row label="Snapshot retention (days)">
          <Input
            className="w-24"
            type="number"
            value={num("agents_snapshot_retention_days")}
            onChange={(e) => save("agents_snapshot_retention_days", e.target.value)}
          />
        </Row>
        <div className="pt-3">
          <div className="text-sm">Extra denylist</div>
          <div className="text-text-muted mb-2 text-xs">
            One rule per line — a path substring or a <code>/regex/</code> for bash. Matched
            paths/commands require break-glass approval.
          </div>
          <Textarea
            rows={4}
            defaultValue={parseList(s.agents_denylist_extra).join("\n")}
            onBlur={(e) => {
              const list = e.target.value
                .split("\n")
                .map((x) => x.trim())
                .filter(Boolean);
              void save("agents_denylist_extra", JSON.stringify(list));
              toast.info("Denylist saved");
            }}
            placeholder={"/secrets/\n/terraform\\s+destroy/"}
          />
        </div>
      </Card>

      <Card className="p-4">
        <p className="text-text-muted mb-1 text-xs tracking-wider uppercase">Voice (Jarvis)</p>
        <Row
          label="Enable voice"
          hint="Whisper STT + OpenAI TTS; off falls back to the browser engine."
        >
          <Switch
            checked={bool("voice_enabled")}
            onCheckedChange={(v) => save("voice_enabled", v)}
          />
        </Row>
        <Row label="TTS voice">
          <Input
            className="w-28"
            value={num("voice_tts_voice")}
            onChange={(e) => save("voice_tts_voice", e.target.value)}
            placeholder="onyx"
          />
        </Row>
        <Row label="Conversation mode" hint="Auto-reopen the mic after Jarvis speaks.">
          <Switch
            checked={bool("voice_conversation_mode")}
            onCheckedChange={(v) => save("voice_conversation_mode", v)}
          />
        </Row>
        <Row label="Morning briefing time (HH:MM)">
          <Input
            className="w-24"
            value={num("voice_morning_briefing_time")}
            onChange={(e) => save("voice_morning_briefing_time", e.target.value)}
            placeholder="08:00"
          />
        </Row>
      </Card>

      <Card className="p-4">
        <p className="text-text-muted mb-1 text-xs tracking-wider uppercase">Remote (iPhone)</p>
        <Row label="Telegram bot token" hint="From @BotFather. Starts the bridge immediately.">
          <Input
            className="w-56"
            type="password"
            value={num("telegram_bot_token")}
            onChange={(e) => save("telegram_bot_token", e.target.value)}
          />
        </Row>
        <Row label="Telegram chat id" hint="Your numeric chat id — the only chat the bot answers.">
          <Input
            className="w-40"
            value={num("telegram_chat_id")}
            onChange={(e) => save("telegram_chat_id", e.target.value)}
          />
        </Row>
      </Card>

      <p className="text-text-muted text-xs">
        Agents run on the Claude Agent SDK via your Claude subscription. On the production VM, run{" "}
        <code>claude setup-token</code> once so headless runs can authenticate. For iPhone access,
        see <code>deploy/JARVIS-REMOTE.md</code>.
      </p>
    </div>
  );
}

function parseList(raw: string | undefined): string[] {
  try {
    const p = JSON.parse(raw ?? "[]");
    return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
