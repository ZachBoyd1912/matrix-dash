"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DomainDetail } from "@/components/sites/domain-detail";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";

interface Props {
  params: Promise<{ domain: string }>;
}

export default function SiteDetailPage({ params }: Props) {
  const { domain } = use(params);
  const ref = useGsapEntrance();
  const decodedDomain = decodeURIComponent(domain);

  return (
    <div ref={ref} className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-8">
      <Link
        href="/dashboard/sites"
        className="text-text-muted hover:text-text-primary flex items-center gap-1 text-xs transition-colors"
      >
        <ArrowLeft size={13} /> Back to Sites
      </Link>

      <DomainDetail domain={decodedDomain} />
    </div>
  );
}
