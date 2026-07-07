"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Layers } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AiProviderPublic } from "@/types/ai-provider";

interface Props {
  providers: AiProviderPublic[];
}

/**
 * Ranks which providers the chat route's fallback cascade tries, in order,
 * if the requested/active provider's stream fails before any content arrives.
 * Stored as a JSON-encoded provider-id array under the generic settings table
 * (no schema/migration needed — same key-value store as every other setting).
 */
export function FallbackOrder({ providers }: Props) {
  const [order, setOrder] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data: Record<string, string>) => {
        if (cancelled) return;
        let ids: string[] = [];
        try {
          const parsed = JSON.parse(data.fallbackProviderIds || "[]");
          if (Array.isArray(parsed)) ids = parsed;
        } catch {
          ids = [];
        }
        setOrder(ids.filter((id) => providers.some((p) => p.id === id)));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
    // Only re-sync when the provider set itself changes (e.g. one gets removed).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers.map((p) => p.id).join(",")]);

  const persist = (next: string[]) => {
    setOrder(next);
    void fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fallbackProviderIds: JSON.stringify(next) }),
    });
  };

  const toggle = (id: string) => {
    persist(order.includes(id) ? order.filter((x) => x !== id) : [...order, id]);
  };

  const move = (id: string, dir: -1 | 1) => {
    const i = order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    persist(next);
  };

  if (!loaded || providers.length < 2) return null;

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <Layers size={14} className="text-text-muted" />
        <h3 className="text-text-primary text-sm font-medium">Fallback order</h3>
      </div>
      <p className="text-text-muted text-[11px]">
        If a chat request&apos;s provider fails before replying, these are tried next, in order,
        before giving up.
      </p>
      <div className="space-y-1.5">
        {providers.map((p) => {
          const idx = order.indexOf(p.id);
          const enabled = idx !== -1;
          return (
            <div
              key={p.id}
              className="flex items-center justify-between gap-2 rounded-md border border-white/10 px-2.5 py-1.5"
            >
              <label className="flex min-w-0 flex-1 items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => toggle(p.id)}
                  className="accent-emerald-500"
                />
                <span className="text-text-secondary truncate">{p.name}</span>
                {enabled && <Badge className="shrink-0">#{idx + 1}</Badge>}
              </label>
              {enabled && (
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => move(p.id, -1)}
                    disabled={idx === 0}
                    aria-label={`Move ${p.name} up`}
                  >
                    <ArrowUp size={12} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => move(p.id, 1)}
                    disabled={idx === order.length - 1}
                    aria-label={`Move ${p.name} down`}
                  >
                    <ArrowDown size={12} />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
