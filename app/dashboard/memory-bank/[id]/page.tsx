"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Brain } from "lucide-react";
import { MemoryDetail } from "@/components/memory-bank/memory-detail";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty";
import type { LinkedMemory, Memory } from "@/types/memory";

export default function MemoryDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<{ memory: Memory; links: LinkedMemory[] } | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/memories/${params.id}`);
    if (!res.ok) {
      setMissing(true);
      return;
    }
    setDetail(await res.json());
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="px-4 md:px-8 py-10 max-w-2xl mx-auto space-y-8">
      <div className="relative">
        <div className="orb -top-16 left-10 h-52 w-52 bg-emerald-500/20" />
        <div
          className="orb -top-10 right-8 h-44 w-44 bg-sky-500/15"
          style={{ animationDelay: "-6s" }}
        />
        <div className="relative space-y-4">
          <Link
            href="/dashboard/memory-bank"
            className="group inline-flex items-center gap-2 text-xs text-text-muted hover:text-text-primary transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
          >
            <ArrowLeft size={13} className="island-icon" /> Memory Bank
          </Link>
          <span className="eyebrow">
            <Brain size={11} /> Memory Detail
          </span>
          <h1 className="display text-gradient text-4xl md:text-5xl ">
            Memory
          </h1>
        </div>
      </div>
      {missing ? (
        <EmptyState title="Memory not found" description="It may have been deleted or merged by Tidy." />
      ) : detail ? (
        <MemoryDetail
          memory={detail.memory}
          links={detail.links}
          onChange={() => {
            // After delete the fetch 404s and we show the missing state.
            load();
          }}
          onSelectLinked={(id) => router.push(`/dashboard/memory-bank/${id}`)}
        />
      ) : (
        <Skeleton className="h-64" />
      )}
    </div>
  );
}
