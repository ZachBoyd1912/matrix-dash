"use client";

import { useEffect, useState } from "react";
import { BarChart3, Save, FlaskConical } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";

export default function AnalyticsSettingsPage() {
  const ref = useGsapEntrance();
  const [projectId, setProjectId] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "failure" | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: Record<string, string>) => {
        setProjectId(s.posthog_project_id ?? "");
      });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ posthog_project_id: projectId }),
      });
      toast.success("PostHog project ID saved");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/analytics?metric=trends");
      if (res.ok) {
        setTestResult("success");
        toast.success("PostHog connection successful");
      } else {
        setTestResult("failure");
        toast.error("PostHog connection failed");
      }
    } catch {
      setTestResult("failure");
      toast.error("PostHog connection error");
    } finally {
      setTesting(false);
    }
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
            <BarChart3 size={11} /> Analytics
          </span>
          <h2 className="display text-gradient mt-3 text-4xl md:text-5xl">Analytics</h2>
          <p className="text-text-secondary mt-3 max-w-xl text-sm">
            Configure PostHog analytics integration. Enter your project ID from PostHog project
            settings.
          </p>
        </div>
      </div>

      <Card interactive className="rounded-2xl">
        <div className="space-y-3">
          <div>
            <label className="text-text-muted mb-1 block text-[10px] uppercase">
              PostHog Project ID
            </label>
            <Input
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="e.g. 12345"
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-text-muted text-xs">
              {testResult === "success" && "✓ Connection verified"}
              {testResult === "failure" && "✗ Connection failed — check your project ID"}
              {!testResult && "Enter your PostHog project ID to enable analytics."}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={testConnection}
                disabled={testing || !projectId.trim()}
              >
                <FlaskConical size={13} />
                {testing ? "Testing…" : "Test Connection"}
              </Button>
              <Button variant="primary" onClick={save} disabled={saving}>
                <Save size={13} />
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
