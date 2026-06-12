"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
    <div className="px-4 md:px-8 py-8 max-w-2xl mx-auto space-y-6">
      <Link
        href="/dashboard/memory-bank"
        className="inline-flex items-center gap-2 text-xs text-text-muted hover:text-text-primary"
      >
        <ArrowLeft size={13} /> Memory Bank
      </Link>
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
