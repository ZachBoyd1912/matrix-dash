"use client";

import { useCallback, useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export default function SearchSettingsPage() {
  const ref = useGsapEntrance();
  const [tavilyKey, setTavilyKey] = useState("");
  const [searxngUrl, setSearxngUrl] = useState("");
  const [provider, setProvider] = useState("tavily");
  const [testQuery, setTestQuery] = useState("");
  const [testResults, setTestResults] = useState<SearchResult[] | null>(null);
  const [testing, setTesting] = useState(false);
  const [tavilyOk, setTavilyOk] = useState(false);

  const refresh = useCallback(async () => {
    const s = await fetch("/api/settings").then((r) => r.json());
    setTavilyKey(s.tavilyKey || "");
    setSearxngUrl(s.searxngUrl || "");
    setProvider(s.searchProvider || "tavily");
    setTavilyOk(!!s.tavilyKey);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = async () => {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tavilyKey,
        searxngUrl,
        searchProvider: provider,
      }),
    });
    setTavilyOk(!!tavilyKey);
    toast.success("Search settings saved");
  };

  const runTest = async () => {
    if (!testQuery.trim()) return;
    setTesting(true);
    setTestResults(null);
    try {
      const res = await fetch("/api/search/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: testQuery, tavilyKey, searxngUrl }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestResults(data.results || []);
        toast.success("Search works!", `Found ${data.results?.length || 0} results`);
      } else {
        toast.error("Search test failed", data.error);
      }
    } finally {
      setTesting(false);
    }
  };

  return (
    <div ref={ref} className="space-y-8">
      <div className="relative isolate py-10">
        <div className="orb -top-16 left-10 h-52 w-52 bg-sky-500/20" />
        <div
          className="orb top-0 left-40 h-40 w-40 bg-indigo-500/15"
          style={{ animationDelay: "-6s" }}
        />
        <div className="relative">
          <span className="eyebrow">
            <Globe size={11} /> Web Search
          </span>
          <h1 className="display text-gradient mt-3 text-4xl md:text-5xl">Web Search</h1>
          <p className="text-text-secondary mt-3 max-w-2xl text-sm">
            Give chat live search grounding. Configure your search provider and test connectivity
            before enabling agent tools.
          </p>
        </div>
      </div>

      <Card interactive className="rounded-2xl">
        <p className="mb-3 text-sm font-medium">Search Provider</p>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="text-text-primary mb-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
        >
          <option value="tavily">Tavily (recommended)</option>
          <option value="searxng">SearXNG (self-hosted)</option>
          <option value="auto">Auto (cascade fallback)</option>
        </select>
        <p className="text-text-muted text-[10px]">
          Auto mode tries Tavily first, falls back to SearXNG, then DuckDuckGo as a last resort.
        </p>
      </Card>

      <Card interactive className="rounded-2xl">
        <div className="mb-3 flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${tavilyOk ? "bg-emerald-400 shadow-[0_0_8px_rgba(110,231,183,.6)]" : "bg-zinc-600"}`}
          />
          <p className="text-sm font-medium">Tavily API</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="password"
            value={tavilyKey}
            onChange={(e) => setTavilyKey(e.target.value)}
            placeholder="tvly-..."
            className="font-mono text-xs"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTavilyKey(tavilyKey ? "" : tavilyKey)}
          >
            {tavilyKey ? "Show" : "Hide"}
          </Button>
        </div>
        <p className="text-text-muted mt-3 text-[10px]">
          Free tier: 1000 queries/month. Sign up at <span className="text-sky-400">tavily.com</span>
        </p>
      </Card>

      <Card interactive className="rounded-2xl">
        <div className="mb-3 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-zinc-600" />
          <p className="text-sm font-medium">Self-hosted SearXNG (fallback)</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={searxngUrl}
            onChange={(e) => setSearxngUrl(e.target.value)}
            placeholder="http://localhost:8080"
            className="text-xs"
          />
          <Button variant="ghost" size="sm" onClick={save}>
            Save
          </Button>
        </div>
        <p className="text-text-muted mt-2 text-[10px]">
          Quick start:{" "}
          <code className="rounded bg-white/5 px-1.5 py-0.5 text-[10px]">
            docker run -p 8080:8080 searxng/searxng
          </code>
        </p>
      </Card>

      <Card interactive className="rounded-2xl">
        <p className="mb-3 text-sm font-medium">Try a Search</p>
        <div className="mb-3 flex items-center gap-2">
          <Input
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
            placeholder="What's new in React 19?"
            className="text-xs"
            onKeyDown={(e) => e.key === "Enter" && runTest()}
          />
          <Button variant="primary" size="sm" onClick={runTest} disabled={testing}>
            {testing ? "Searching…" : "Search"}
          </Button>
        </div>

        {testResults && testResults.length > 0 && (
          <div className="mt-2 space-y-2">
            {testResults.map((r, i) => (
              <div key={i} className="rounded-lg border border-white/5 bg-white/[0.015] p-2.5">
                <p className="truncate text-[10px] text-sky-400">{r.url}</p>
                <p className="text-text-primary mt-0.5 text-xs font-medium">{r.title}</p>
                <p className="text-text-muted mt-0.5 line-clamp-2 text-[10px]">{r.snippet}</p>
              </div>
            ))}
          </div>
        )}

        {testResults && testResults.length === 0 && (
          <p className="text-text-muted py-4 text-center text-xs">
            No results found. Check your API key.
          </p>
        )}
      </Card>

      <div className="flex justify-end">
        <Button variant="primary" onClick={save}>
          Save Settings
        </Button>
      </div>
    </div>
  );
}
